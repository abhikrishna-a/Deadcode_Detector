import json
from uuid import UUID
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.auth import get_current_user
from app.services.chunker import chunk_code, detect_language
from app.services.embedder import embed_texts
from app.services.analyzer import analyze_code_with_grok

router = APIRouter()

SUPPORTED_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".txt", ".md"}


@router.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    analysis_json: str = Form(default=None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    try:
        ext = f".{file.filename.rsplit('.', 1)[-1].lower()}" if "." in (file.filename or "") else ""
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
            )

        raw_bytes = await file.read()
        try:
            source = raw_bytes.decode("utf-8")
        except UnicodeDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File must be UTF-8 text. Decode failed near byte {e.start}.",
            )

        language = detect_language(file.filename)

        if analysis_json and analysis_json.strip() not in ("", "null", "{}"):
            try:
                analysis_data = json.loads(analysis_json)
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="analysis_json must be valid JSON",
                )
        else:
            try:
                analysis_data = await analyze_code_with_grok(source, file.filename, language)
            except RuntimeError as e:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=str(e),
                )
            except ValueError as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Analysis parsing error: {str(e)}",
                )
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Grok analysis failed: {str(e)}",
                )

        chunks = chunk_code(source, file.filename)
        if not chunks:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to chunk file",
            )

        try:
            embeddings = await embed_texts([c.content for c in chunks])
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Embedding failed: {str(e)}",
            )

        if len(embeddings) != len(chunks):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Embedding count mismatch",
            )

        try:
            result = await db.execute(
                text("""
                    INSERT INTO rag_documents (user_id, filename, language, analysis)
                    VALUES (:user_id, :filename, :language, CAST(:analysis AS jsonb))
                    RETURNING id
                """),
                {
                    "user_id": user["user_id"],
                    "filename": file.filename,
                    "language": language,
                    "analysis": json.dumps(analysis_data),
                },
            )
            document_id = result.scalar_one()

            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                await db.execute(
                    text("""
                        INSERT INTO rag_chunks (document_id, chunk_index, content, metadata, embedding)
                        VALUES (:doc_id, :idx, :content, CAST(:metadata AS jsonb), CAST(:embedding AS vector))
                    """),
                    {
                        "doc_id": document_id,
                        "idx": i,
                        "content": chunk.content,
                        "metadata": json.dumps(chunk.metadata),
                        "embedding": str(embedding),
                    },
                )

            await db.commit()
        except HTTPException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database write failed: {str(e)}",
            )

        return {
            "document_id": str(document_id),
            "chunk_count": len(chunks),
            "filename": file.filename,
            "analysis": analysis_data,
            "auto_analyzed": analysis_json is None or analysis_json.strip() in ("", "null", "{}"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected analyze failure: {str(e)}",
        )


@router.post("/analyze-only")
async def analyze_only(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    ext = f".{file.filename.rsplit('.', 1)[-1].lower()}" if "." in (file.filename or "") else ""
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    raw_bytes = await file.read()
    try:
        source = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File must be UTF-8 text. Decode failed near byte {e.start}.",
        )
    language = detect_language(file.filename)

    try:
        analysis_data = await analyze_code_with_grok(source, file.filename, language)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Analysis parsing error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Grok analysis failed: {str(e)}")

    return {
        "filename": file.filename,
        "language": language,
        "analysis": analysis_data,
    }


@router.get("/documents/{document_id}/analysis")
async def get_document_analysis(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT user_id, filename, language, analysis FROM rag_documents WHERE id = :id"),
        {"id": str(document_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if row[0] != user["user_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    return {
        "document_id": str(document_id),
        "filename": row[1],
        "language": row[2],
        "analysis": row[3],
    }


@router.get("/documents")
async def list_documents(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        text("""
            SELECT d.id, d.user_id, d.filename, d.language, d.created_at,
                   COUNT(c.id) AS chunk_count
            FROM rag_documents d
            LEFT JOIN rag_chunks c ON c.document_id = d.id
            WHERE d.user_id = :uid
            GROUP BY d.id, d.user_id, d.filename, d.language, d.created_at
            ORDER BY d.created_at DESC
        """),
        {"uid": user["user_id"]},
    )
    rows = result.fetchall()
    return [
        {
            "id": str(row[0]),
            "user_id": row[1],
            "filename": row[2],
            "language": row[3],
            "created_at": row[4].isoformat(),
            "chunk_count": row[5],
        }
        for row in rows
    ]


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT user_id FROM rag_documents WHERE id = :id"),
        {"id": str(document_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if row[0] != user["user_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this document")

    await db.execute(text("DELETE FROM rag_documents WHERE id = :id"), {"id": str(document_id)})
    await db.commit()
    return {"message": "Document deleted"}

import hashlib
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db, IS_SQLITE
from app.auth import get_current_user
from app.services.chunker import chunk_code, chunk_issues, detect_language
from app.services.embedder import embed_texts
from app.services.analyzer import analyze_code_with_grok
from app.services.storage import store_analysis, get_history, get_document, delete_document, check_hash

logger = logging.getLogger("ghostcode-rag.analysis")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

router = APIRouter()

MAX_FILE_BYTES = 10 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".txt", ".md"}


@router.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    analysis_json: str = Form(default=None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    try:
        if not file.filename:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename is required.")

        ext = f".{file.filename.rsplit('.', 1)[-1].lower()}" if "." in file.filename else ""
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
            )

        raw_bytes = await file.read()
        if len(raw_bytes) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large ({len(raw_bytes)} bytes). Maximum is {MAX_FILE_BYTES} bytes.",
            )

        try:
            source = raw_bytes.decode("utf-8")
        except UnicodeDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File must be UTF-8 text. Decode failed near byte {e.start}.",
            )

        if not source.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty.")

        language = detect_language(file.filename)

        # --- hash-based cache check ---
        file_hash = hashlib.sha256(source.encode()).hexdigest()
        cached = await check_hash(db, user["user_id"], file_hash)
        if cached and analysis_json is None:
            return {
                "document_id": cached["analysis_id"],
                "chunk_count": 0,
                "filename": cached["filename"],
                "analysis": cached["analysis"],
                "auto_analyzed": True,
                "cached": True,
            }

        # --- analysis ---
        if analysis_json and analysis_json.strip() not in ("", "null", "{}"):
            try:
                analysis_data = json.loads(analysis_json)
            except json.JSONDecodeError:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="analysis_json must be valid JSON")
            if not isinstance(analysis_data, dict):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="analysis_json must be a JSON object")
        else:
            try:
                analysis_data = await analyze_code_with_grok(source, file.filename, language)
            except RuntimeError as e:
                logger.error("Groq API unavailable: %s", e)
                raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
            except Exception as e:
                logger.error("Grok analysis failed: %s", e, exc_info=True)
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Analysis failed: {str(e)}")

        # --- chunking ---
        source_chunks = chunk_code(source, file.filename)
        issue_chunks = chunk_issues(analysis_data, file.filename)
        all_chunk_texts = [c.content for c in source_chunks] + issue_chunks
        all_chunks = source_chunks + [json.dumps({"content": ic, "metadata": {"chunk_type": "issue", "filename": file.filename}}) for ic in issue_chunks]

        if not all_chunks:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to chunk file")

        # --- embedding ---
        try:
            embeddings = await embed_texts(all_chunk_texts)
        except Exception as e:
            logger.error("Embedding failed: %s", e, exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Embedding failed: {str(e)}")

        if len(embeddings) != len(all_chunks):
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Embedding count mismatch")

        # --- storage ---
        try:
            document_id = await store_analysis(
                db=db,
                user_id=user["user_id"],
                filename=file.filename,
                language=language,
                source=source,
                analysis_json=analysis_data,
                chunks=all_chunks,
                embeddings=embeddings,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Database write failed: %s", e, exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database write failed: {str(e)}")

        auto_analyzed = analysis_json is None or analysis_json.strip() in ("", "null", "{}")
        return {
            "document_id": document_id,
            "chunk_count": len(all_chunks),
            "filename": file.filename,
            "analysis": analysis_data,
            "auto_analyzed": auto_analyzed,
            "cached": False,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected analyze failure: %s", e, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Unexpected error: {str(e)}")


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

    return {"filename": file.filename, "language": language, "analysis": analysis_data}


@router.get("/documents/{document_id}/analysis")
async def get_document_analysis(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    doc = await get_document(db, document_id, user["user_id"])
    if not doc:
        if IS_SQLITE:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
        result = await db.execute(
            text("SELECT user_id, filename, language, analysis FROM rag_documents WHERE id = CAST(:id AS uuid)"),
            {"id": document_id},
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        if row[0] != user["user_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        return {"document_id": document_id, "filename": row[1], "language": row[2], "analysis": row[3]}

    return {
        "document_id": doc["analysis_id"],
        "filename": doc["filename"],
        "language": doc["language"],
        "analysis": doc["analysis"],
    }


@router.get("/documents")
async def list_documents(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    items = await get_history(db, user["user_id"], limit=100, offset=0)
    if IS_SQLITE:
        return [
            {"id": item["analysis_id"], "filename": item["filename"],
             "language": item["language"], "created_at": item["created_at"],
             "chunk_count": 0}
            for item in items
        ]
    else:
        result = await db.execute(
            text("""
                SELECT d.id, d.filename, d.language, d.created_at,
                       COUNT(c.id) AS chunk_count
                FROM rag_documents d
                LEFT JOIN rag_chunks c ON c.document_id = d.id
                WHERE d.user_id = :uid
                GROUP BY d.id
                ORDER BY d.created_at DESC
            """),
            {"uid": user["user_id"]},
        )
        rows = result.fetchall()
        return [
            {"id": str(r[0]), "filename": r[1], "language": r[2],
             "created_at": r[3].isoformat(), "chunk_count": r[4]}
            for r in rows
        ]


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if IS_SQLITE:
        doc = await get_document(db, document_id, user["user_id"])
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
        await delete_document(db, document_id, user["user_id"])
    else:
        result = await db.execute(
            text("SELECT user_id FROM rag_documents WHERE id = CAST(:id AS uuid)"),
            {"id": document_id},
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        if row[0] != user["user_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        await db.execute(text("DELETE FROM rag_documents WHERE id = CAST(:id AS uuid)"), {"id": document_id})
        await db.commit()

    return {"message": "Document deleted"}


# --- New-style endpoints (single-file API shape) ---

@router.get("/analysis/{analysis_id}")
async def rag_get_analysis(
    analysis_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await get_document(db, analysis_id, user["user_id"])
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return {
        "analysis_id": doc["analysis_id"],
        "filename": doc["filename"],
        "language": doc["language"],
        "analysis": doc["analysis"],
        "cached": True,
    }


@router.delete("/analysis/{analysis_id}", status_code=204)
async def rag_delete_analysis(
    analysis_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await get_document(db, analysis_id, user["user_id"])
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    await delete_document(db, analysis_id, user["user_id"])


@router.get("/history")
async def rag_history(
    limit: int = 20,
    offset: int = 0,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = await get_history(db, user["user_id"], limit=limit, offset=offset)
    return {"items": items, "total": len(items)}

import asyncio
from asyncio import Semaphore
import hashlib
import json
import logging
from typing import List
from uuid import UUID
import uuid as uuid_mod

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db, IS_SQLITE, AsyncSessionLocal
from app.auth import get_current_user
from app.services.chunker import chunk_code, chunk_issues, detect_language
from app.services.embedder import embed_texts
from app.services.analyzer import analyze_code_with_grok, analyze_file as _analyze_file_direct
from app.services.cross_reference import batch_check_references
from app.services.storage import store_analysis, get_history, get_document, delete_document, check_hash, cleanup_stale_documents, count_history
from app.models.schemas import BatchAnalyzeRequest, BatchAnalyzeResponse, BatchFileResult

logger = logging.getLogger("ghostcode-rag.analysis")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

router = APIRouter()

MAX_FILE_BYTES = 10 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".txt", ".md"}

_bg_semaphore = Semaphore(3)


async def _background_finalize(
    source: str, filename: str,
    cross_ref_result: dict, llm_task,
    user_id: int, scan_folder: str, scan_type: str,
    document_id: str,
):
    async with _bg_semaphore:
        async with AsyncSessionLocal() as db:
            try:
                if llm_task is not None:
                    final_analysis = await llm_task
                else:
                    final_analysis = cross_ref_result

                source_chunks = chunk_code(source, filename)
                issue_texts = chunk_issues(final_analysis, filename)
                all_chunk_texts = [c.content for c in source_chunks] + issue_texts
                all_chunks = source_chunks + [
                    json.dumps({"content": ic, "metadata": {"chunk_type": "issue", "filename": filename}})
                    for ic in issue_texts
                ]

                embeddings = await embed_texts(all_chunk_texts)

                if IS_SQLITE:
                    await db.execute(
                        text("DELETE FROM embeddings WHERE document_id = :id"),
                        {"id": document_id},
                    )
                    await db.execute(
                        text("DELETE FROM rag_chunks WHERE document_id = :id"),
                        {"id": document_id},
                    )
                    await db.execute(
                        text("UPDATE analyses SET analysis_json = :json WHERE id = :id"),
                        {"json": json.dumps(final_analysis), "id": document_id},
                    )
                    for idx, (chunk, emb) in enumerate(zip(all_chunks, embeddings)):
                        await db.execute(
                            text("""
                                INSERT INTO embeddings (id, analysis_id, chunk_index, chunk_text, embedding, token_count)
                                VALUES (:id, :aid, :idx, :text, :emb, :tokens)
                            """),
                            {
                                "id": str(uuid_mod.uuid4()), "aid": document_id,
                                "idx": idx,
                                "text": chunk if isinstance(chunk, str) else chunk.content if hasattr(chunk, 'content') else json.dumps(chunk),
                                "emb": json.dumps(emb),
                                "tokens": len((chunk if isinstance(chunk, str) else chunk.content if hasattr(chunk, 'content') else json.dumps(chunk)).split()),
                            },
                        )
                else:
                    await db.execute(
                        text("DELETE FROM rag_chunks WHERE document_id = CAST(:id AS uuid)"),
                        {"id": document_id},
                    )
                    await db.execute(
                        text("DELETE FROM embeddings WHERE document_id = CAST(:id AS uuid)"),
                        {"id": document_id},
                    )
                    await db.execute(
                        text("UPDATE rag_documents SET analysis = CAST(:json AS jsonb) WHERE id = CAST(:id AS uuid)"),
                        {"json": json.dumps(final_analysis), "id": document_id},
                    )
                    for idx, (chunk, emb) in enumerate(zip(all_chunks, embeddings)):
                        content = chunk if isinstance(chunk, str) else (chunk.content if hasattr(chunk, 'content') else json.dumps(chunk))
                        metadata = {"chunk_type": "issue", "filename": filename} if isinstance(chunk, str) and '"issue"' in chunk else (chunk.metadata if hasattr(chunk, 'metadata') else {})
                        await db.execute(
                            text("""
                                INSERT INTO rag_chunks (document_id, chunk_index, content, metadata, embedding)
                                VALUES (CAST(:doc_id AS uuid), :idx, :content, CAST(:metadata AS jsonb), CAST(:embedding AS vector))
                            """),
                            {
                                "doc_id": document_id, "idx": idx,
                                "content": content,
                                "metadata": json.dumps(metadata),
                                "embedding": str(emb),
                            },
                        )

                await db.commit()
                logger.info("Background finalize completed for %s (doc %s)", filename, document_id)
            except Exception as e:
                logger.error("Background finalize failed for %s: %s", filename, e, exc_info=True)


@router.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    analysis_json: str = Form(default=None),
    store_for_rag: bool = Form(default=True),
    scan_folder: str = Form(default=""),
    scan_type: str = Form(default="single"),
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
            # Empty files are valid - return clean analysis
            language = detect_language(file.filename)
            clean_analysis = {
                "summary": {"total_issues": 0, "severity_counts": {}, "categories": {},
                            "overall_health": "clean", "health_score": 100},
                "issues": [],
                "metrics": {"total_lines": 0, "code_lines": 0, "comment_lines": 0,
                            "blank_lines": 0, "dead_lines_estimate": 0, "dead_code_percentage": 0},
            }
            try:
                doc_id = await store_analysis(
                    db=db, user_id=user["user_id"], filename=file.filename,
                    language=language, source=source, scan_folder=scan_folder,
                    scan_type=scan_type, analysis_json=clean_analysis,
                )
            except Exception:
                doc_id = None
            return {
                "document_id": doc_id,
                "chunk_count": 0,
                "filename": file.filename,
                "analysis": clean_analysis,
                "auto_analyzed": True,
                "cached": False,
                "scan_folder": scan_folder,
                "scan_type": scan_type,
            }

        language = detect_language(file.filename)

        # --- hash-based duplicate removal: delete old analysis in current transaction ---
        file_hash = hashlib.sha256(source.encode()).hexdigest()
        existing = await check_hash(db, user["user_id"], file_hash)
        if existing and analysis_json is None:
            try:
                if IS_SQLITE:
                    await db.execute(
                        text("DELETE FROM analyses WHERE id = :id AND user_id = :uid"),
                        {"id": existing["analysis_id"], "uid": user["user_id"]},
                    )
                else:
                    await db.execute(
                        text("DELETE FROM rag_documents WHERE id = CAST(:id AS uuid) AND user_id = :uid"),
                        {"id": existing["analysis_id"], "uid": user["user_id"]},
                    )
                logger.info("Removed existing analysis for hash %s (file: %s)", file_hash, file.filename)
            except Exception as e:
                logger.warning("Failed to remove old analysis for hash %s: %s", file_hash, e)

        # --- analysis ---
        if analysis_json and analysis_json.strip() not in ("", "null", "{}"):
            try:
                analysis_data = json.loads(analysis_json)
            except json.JSONDecodeError:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="analysis_json must be valid JSON")
            if not isinstance(analysis_data, dict):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="analysis_json must be a JSON object")

            # chunk & embed for provided JSON
            if store_for_rag:
                source_chunks = chunk_code(source, file.filename)
                issue_chunks = chunk_issues(analysis_data, file.filename)
                all_chunk_texts = [c.content for c in source_chunks] + issue_chunks
                all_chunks = source_chunks + [json.dumps({"content": ic, "metadata": {"chunk_type": "issue", "filename": file.filename}}) for ic in issue_chunks]
                if not all_chunks:
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to chunk file")
                try:
                    embeddings = await embed_texts(all_chunk_texts)
                except Exception as e:
                    logger.error("Embedding failed: %s", e, exc_info=True)
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Embedding failed: {str(e)}")
                if len(embeddings) != len(all_chunks):
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Embedding count mismatch")
            else:
                all_chunks = None
                embeddings = None

            document_id = await store_analysis(
                db=db, user_id=user["user_id"], filename=file.filename,
                language=language, source=source, scan_folder=scan_folder,
                scan_type=scan_type, analysis_json=analysis_data,
                chunks=all_chunks, embeddings=embeddings,
            )

            return {
                "document_id": document_id,
                "chunk_count": len(all_chunks) if all_chunks else 0,
                "filename": file.filename,
                "analysis": analysis_data,
                "auto_analyzed": False,
                "cached": False,
                "scan_folder": scan_folder,
                "scan_type": scan_type,
            }

        # --- cross-ref first (fast), LLM refines in background ---
        try:
            cross_ref_result, llm_task = await _analyze_file_direct(
                source, file.filename, db=db, user_id=user["user_id"],
            )
        except Exception as e:
            logger.error("Cross-ref analysis failed: %s", e, exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Cross-ref analysis failed: {str(e)}")

        # If no LLM needed, store with chunks normally
        if llm_task is None:
            if store_for_rag:
                source_chunks = chunk_code(source, file.filename)
                issue_chunks = chunk_issues(cross_ref_result, file.filename)
                all_chunk_texts = [c.content for c in source_chunks] + issue_chunks
                all_chunks = source_chunks + [json.dumps({"content": ic, "metadata": {"chunk_type": "issue", "filename": file.filename}}) for ic in issue_chunks]
                if not all_chunks:
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to chunk file")
                try:
                    embeddings = await embed_texts(all_chunk_texts)
                except Exception as e:
                    logger.error("Embedding failed: %s", e, exc_info=True)
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Embedding failed: {str(e)}")
                if len(embeddings) != len(all_chunks):
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Embedding count mismatch")
            else:
                all_chunks = None
                embeddings = None

            document_id = await store_analysis(
                db=db, user_id=user["user_id"], filename=file.filename,
                language=language, source=source, scan_folder=scan_folder,
                scan_type=scan_type, analysis_json=cross_ref_result,
                chunks=all_chunks, embeddings=embeddings,
            )
        else:
            # LLM pending — store cross-ref result without chunks, launch background finalize
            document_id = await store_analysis(
                db=db, user_id=user["user_id"], filename=file.filename,
                language=language, source=source, scan_folder=scan_folder,
                scan_type=scan_type, analysis_json=cross_ref_result,
                chunks=None, embeddings=None,
            )
            asyncio.create_task(_background_finalize(
                source=source, filename=file.filename,
                cross_ref_result=cross_ref_result, llm_task=llm_task,
                user_id=user["user_id"], scan_folder=scan_folder,
                scan_type=scan_type, document_id=document_id,
            ))

        return {
            "document_id": document_id,
            "chunk_count": 0 if llm_task is not None else (len(all_chunks) if store_for_rag else 0),
            "filename": file.filename,
            "analysis": cross_ref_result,
            "auto_analyzed": True,
            "cached": False,
            "scan_folder": scan_folder,
            "scan_type": scan_type,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected analyze failure: %s", e, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Unexpected error: {str(e)}")


@router.post("/batch-analyze")
async def batch_analyze(
    req: BatchAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Fast batch analysis using AST+grep cross-referencing across ALL files at once.
    No LLM calls — pure symbol-level dead code detection.
    Results are stored to the database with code chunks for RAG-enabled chat.
    """
    start = asyncio.get_event_loop().time()

    # Filter to supported extensions
    filtered = [
        (f.name, f.content)
        for f in req.files
        if f.name and ("." in f.name and f".{f.name.rsplit('.', 1)[-1].lower()}" in SUPPORTED_EXTENSIONS)
    ]

    if not filtered:
        return BatchAnalyzeResponse(results=[], total_time_ms=0)

    # Run sync batch cross-reference in thread pool
    loop = asyncio.get_event_loop()
    per_file_results = await loop.run_in_executor(None, batch_check_references, filtered)

    file_map = {f.name: f.content for f in req.files if f.name}

    # Collect all chunk texts across all files for batched embedding
    all_chunk_batches = []  # list of (filename, source, analysis, chunks)
    all_chunk_texts = []
    for filename, analysis in per_file_results.items():
        source = file_map.get(filename, "")
        if source.strip():
            source_chunks = chunk_code(source, filename)
            issue_texts = chunk_issues(analysis, filename)
            chunks = source_chunks + [json.dumps({"content": ic, "metadata": {"chunk_type": "issue", "filename": filename}}) for ic in issue_texts]
            if chunks:
                chunk_texts = [c.content for c in source_chunks] + issue_texts
                all_chunk_batches.append((filename, source, analysis, chunks))
                all_chunk_texts.extend(chunk_texts)
            else:
                all_chunk_batches.append((filename, source, analysis, None))
        else:
            all_chunk_batches.append((filename, source, analysis, None))

    # Batch embed all chunk texts at once
    if all_chunk_texts:
        try:
            all_embeddings = await embed_texts(all_chunk_texts)
        except Exception as e:
            logger.error("Batch embedding failed: %s", e, exc_info=True)
            all_embeddings = None
    else:
        all_embeddings = None

    # Distribute embeddings back to each file
    embedding_idx = 0
    results = []
    for filename, source, analysis, chunks in all_chunk_batches:
        language = detect_language(filename)
        file_embeddings = None
        if chunks and all_embeddings is not None:
            n_chunks = len(chunks)
            file_embeddings = all_embeddings[embedding_idx:embedding_idx + n_chunks]
            embedding_idx += n_chunks
        doc_id = await store_analysis(
            db, user["user_id"], filename, language, source, analysis,
            scan_folder=req.scan_folder, scan_type=req.scan_type,
            chunks=chunks, embeddings=file_embeddings,
        )
        results.append(BatchFileResult(
            filename=filename,
            analysis=analysis,
            document_id=doc_id,
            error=None,
        ))

    await db.commit()
    elapsed = int((asyncio.get_event_loop().time() - start) * 1000)
    logger.info("Batch analyzed and stored %d files in %d ms", len(filtered), elapsed)

    return BatchAnalyzeResponse(results=results, total_time_ms=elapsed)


@router.post("/cleanup")
async def cleanup_analyses(
    req: BatchAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Delete analysis data for files that no longer exist.
    Send the current active file paths; anything in the DB not
    matching those paths is removed. Returns count of deleted entries.
    """
    active = [f.name for f in req.files if f.name]
    deleted = await cleanup_stale_documents(db, user["user_id"], active)
    logger.info("Cleanup: removed %d stale document(s) for user %d", deleted, user["user_id"])
    return {"deleted": deleted, "active_count": len(active)}


@router.post("/analyze-only")
async def analyze_only(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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
        analysis_data = await analyze_code_with_grok(source, file.filename, db=db, user_id=user["user_id"])
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


@router.delete("/analysis/{analysis_id}")
async def rag_delete_analysis(
    analysis_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        doc = await get_document(db, analysis_id, user["user_id"])
        if not doc:
            raise HTTPException(status_code=404, detail="Analysis not found.")
        deleted = await delete_document(db, analysis_id, user["user_id"])
        if not deleted:
            logger.warning("Delete returned 0 rows for analysis %s (user %s)", analysis_id, user["user_id"])
        return {"message": "Analysis deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Delete failed for analysis %s: %s", analysis_id, str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete analysis: {str(e)}")


@router.get("/history")
async def rag_history(
    limit: int = 20,
    offset: int = 0,
    search: str = "",
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = await get_history(db, user["user_id"], limit=limit, offset=offset, search=search)
    total = await count_history(db, user["user_id"], search=search)
    return {"items": items, "total": total}


# ── Analyzer alias endpoints (replaces services/analyzer entirely) ──────────
# These routes mirror the old ghostcode-analyzer service API so the browser
# extension and any existing clients continue to work without changes.

MAX_ANALYZER_FILE_SIZE = 500 * 1024
ANALYZER_ACCEPTED_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".txt", ".md"}


def _validate_analyzer_file(file: UploadFile) -> str:
    ext = (
        "." + file.filename.rsplit(".", 1)[-1].lower()
        if "." in (file.filename or "")
        else ""
    )
    if ext not in ANALYZER_ACCEPTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{ext}' not supported. Accepted: {', '.join(sorted(ANALYZER_ACCEPTED_EXTENSIONS))}",
        )
    if file.size and file.size > MAX_ANALYZER_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds 500 KB limit ({file.size} bytes).",
        )
    return ext


async def _read_analyzer_file(file: UploadFile) -> str:
    try:
        content = await file.read()
        return content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to decode file as UTF-8 (byte offset: {exc.start})",
        )


@router.post("/analyzer/analyze")
async def analyzer_analyze(
    file: UploadFile,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Drop-in replacement for the old ghostcode-analyzer POST /analyzer/analyze.
    Returns { filename, language, analysis } — identical response shape.
    """
    _validate_analyzer_file(file)
    source = await _read_analyzer_file(file)
    language = detect_language(file.filename)
    analysis = await _analyze_file_direct(source, file.filename, db=db, user_id=user["user_id"])
    return {"filename": file.filename, "language": language, "analysis": analysis}


@router.post("/analyzer/analyze-batch")
async def analyzer_analyze_batch(
    files: List[UploadFile],
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Drop-in replacement for the old ghostcode-analyzer POST /analyzer/analyze-batch.
    Returns { results: [{ filename, analysis, error }] }.
    """
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maximum 10 files per batch, got {len(files)}.",
        )

    async def process_one(file: UploadFile) -> dict:
        try:
            _validate_analyzer_file(file)
            source = await _read_analyzer_file(file)
            analysis = await _analyze_file_direct(source, file.filename, db=db, user_id=user["user_id"])
            return {"filename": file.filename, "analysis": analysis, "error": None}
        except HTTPException as exc:
            return {"filename": file.filename, "analysis": None, "error": exc.detail}
        except Exception as exc:
            return {"filename": file.filename, "analysis": None, "error": str(exc)}

    results = await asyncio.gather(*(process_one(f) for f in files))
    return {"results": list(results)}


# ── Diagnostic endpoint ─────────────────────────────────────────────────

DIAGNOSE_SYSTEM_PROMPT = (
    "You are a code analysis diagnostic expert. "
    "Given the batch analysis run context, identify why the scan stopped and provide a root cause and fix suggestion. "
    "Be concise and technical. Return JSON with keys: diagnosis, root_cause, suggestion."
)


@router.post("/diagnose")
async def diagnose_stop(
    context: dict,
    user: dict = Depends(get_current_user),
):
    from app.services.grok_client import call_groq_json

    prompt = (
        f"A batch code analysis scan stopped with the following context:\n"
        f"- Total files: {context.get('total_files', 0)}\n"
        f"- Completed: {context.get('completed', 0)}\n"
        f"- Failed: {context.get('failed', 0)}\n"
        f"- Total tokens consumed: {context.get('total_tokens', 0)}\n"
        f"- Stop reason: {context.get('stop_reason', 'Unknown')}\n\n"
        f"Analyze why the scan stopped and provide a root cause and fix suggestion. "
        f"Return JSON with keys: diagnosis (short summary), root_cause (what caused the stop), suggestion (actionable fix)."
    )

    try:
        result, _ = await call_groq_json(prompt=prompt, system=DIAGNOSE_SYSTEM_PROMPT)
        return {
            "diagnosis": result.get("diagnosis", "No diagnosis available."),
            "root_cause": result.get("root_cause", "Unable to determine root cause."),
            "suggestion": result.get("suggestion", "Check the analyzer logs for details."),
        }
    except Exception as e:
        logger.error("Diagnosis failed: %s", e, exc_info=True)
        return {
            "diagnosis": "Diagnosis unavailable (LLM call failed).",
            "root_cause": f"The analysis stopped at file {context.get('completed', 0) + context.get('failed', 0)} of {context.get('total_files', 0)}. This typically indicates a timeout or rate limit on the analysis API.",
            "suggestion": "Reduce batch size, increase timeout, or check the API key rate limits. For large files, consider splitting them before analysis.",
        }

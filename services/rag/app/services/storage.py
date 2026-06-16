import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import IS_SQLITE, cosine_similarity

logger = logging.getLogger("ghostcode-rag.storage")


def _chunk_content(chunk):
    if isinstance(chunk, str):
        return chunk
    if hasattr(chunk, 'content'):
        return chunk.content
    if isinstance(chunk, dict):
        return chunk.get('content', '')
    return ''


def _chunk_metadata(chunk):
    if hasattr(chunk, 'metadata'):
        return chunk.metadata
    if isinstance(chunk, dict):
        return chunk.get('metadata', {})
    return {}


async def store_analysis(
    db: AsyncSession,
    user_id: int,
    filename: str,
    language: str,
    source: str,
    analysis_json: dict,
    scan_folder: str = "",
    scan_type: str = "single",
    chunks: list[Any] | None = None,
    embeddings: list[list[float]] | None = None,
) -> str:
    file_hash = hashlib.sha256(source.encode()).hexdigest()
    health_score = analysis_json.get("summary", {}).get("health_score", 0)
    total_issues = analysis_json.get("summary", {}).get("total_issues", 0)

    if IS_SQLITE:
        analysis_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            text("""
                INSERT INTO analyses (id, user_id, filename, language, file_hash, scan_folder, scan_type, analysis_json, health_score, total_issues, created_at)
                VALUES (:id, :uid, :fn, :lang, :hash, :folder, :stype, :json, :health, :issues, :now)
            """),
            {
                "id": analysis_id, "uid": user_id, "fn": filename,
                "lang": language, "hash": file_hash, "folder": scan_folder,
                "stype": scan_type,
                "json": json.dumps(analysis_json),
                "health": health_score, "issues": total_issues, "now": now,
            },
        )
        if chunks and embeddings:
            rows = [
                {
                    "id": str(uuid.uuid4()), "aid": analysis_id,
                    "idx": idx,
                    "text": _chunk_content(chunk),
                    "emb": json.dumps(emb),
                    "tokens": len(_chunk_content(chunk).split()),
                }
                for idx, (chunk, emb) in enumerate(zip(chunks, embeddings))
            ]
            await db.execute(
                text("""
                    INSERT INTO embeddings (id, analysis_id, chunk_index, chunk_text, embedding, token_count)
                    VALUES (:id, :aid, :idx, :text, :emb, :tokens)
                """),
                rows,
            )
        await db.commit()
        return analysis_id
    else:
        result = await db.execute(
            text("""
                INSERT INTO rag_documents (user_id, filename, language, file_hash, scan_folder, scan_type, analysis)
                VALUES (:uid, :fn, :lang, :hash, :folder, :stype, CAST(:json AS jsonb))
                RETURNING id
            """),
            {
                "uid": user_id, "fn": filename, "lang": language,
                "hash": file_hash, "folder": scan_folder,
                "stype": scan_type,
                "json": json.dumps(analysis_json),
            },
        )
        document_id = result.scalar_one()

        if chunks and embeddings:
            rows = [
                {
                    "doc_id": document_id, "idx": i,
                    "content": _chunk_content(chunk),
                    "metadata": json.dumps(_chunk_metadata(chunk)),
                    "embedding": str(embedding),
                }
                for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
            ]
            await db.execute(
                text("""
                    INSERT INTO rag_chunks (document_id, chunk_index, content, metadata, embedding)
                    VALUES (:doc_id, :idx, :content, CAST(:metadata AS jsonb), CAST(:embedding AS vector))
                """),
                rows,
            )

        await db.commit()
        return str(document_id)


async def find_similar(
    db: AsyncSession,
    user_id: int,
    query_vec: list[float],
    top_k: int = 5,
    document_id: str | None = None,
) -> list[dict]:
    if IS_SQLITE:
        rows = (await db.execute(
            text("""
                SELECT e.id, e.chunk_text, e.embedding, e.analysis_id, a.filename
                FROM embeddings e
                JOIN analyses a ON a.id = e.analysis_id
                WHERE a.user_id = :uid
            """),
            {"uid": user_id},
        )).fetchall()

        scored = []
        for row in rows:
            emb = json.loads(row[2])
            score = cosine_similarity(query_vec, emb)
            scored.append({
                "score": score,
                "chunk_text": row[1],
                "analysis_id": row[3],
                "filename": row[4],
            })
        scored.sort(key=lambda x: x["score"], reverse=True)
        if document_id:
            scored = [s for s in scored if s["analysis_id"] == document_id]
        return scored[:top_k]
    else:
        extra_where = "AND d.id = :doc_id" if document_id else ""
        params = {"query": str(query_vec), "uid": user_id, "top_k": top_k}
        if document_id:
            params["doc_id"] = document_id

        rows = (await db.execute(
            text(f"""
                SELECT c.content, c.metadata, 1 - (c.embedding <=> CAST(:query AS vector)) AS score,
                       d.id AS analysis_id, d.filename
                FROM rag_chunks c
                JOIN rag_documents d ON d.id = c.document_id
                WHERE d.user_id = :uid {extra_where}
                ORDER BY c.embedding <=> CAST(:query AS vector)
                LIMIT :top_k
            """),
            params,
        )).fetchall()

        return [
            {
                "chunk_text": row[0],
                "metadata": row[1],
                "score": float(row[2]),
                "analysis_id": str(row[3]),
                "filename": row[4],
            }
            for row in rows
        ]


async def get_history(
    db: AsyncSession,
    user_id: int,
    limit: int = 20,
    offset: int = 0,
    search: str = "",
) -> list[dict]:
    if IS_SQLITE:
        where = "WHERE user_id = :uid"
        params = {"uid": user_id, "lim": limit, "off": offset}
        if search:
            where = "WHERE user_id = :uid AND (filename LIKE :search OR scan_folder LIKE :search)"
            params["search"] = f"%{search}%"
        rows = (await db.execute(
            text(f"""
                SELECT id, filename, language, health_score, total_issues, created_at, scan_folder, scan_type
                FROM analyses
                {where}
                ORDER BY created_at DESC
                LIMIT :lim OFFSET :off
            """),
            params,
        )).fetchall()
        return [
            {"analysis_id": r[0], "filename": r[1], "language": r[2],
             "health_score": r[3], "total_issues": r[4], "created_at": r[5],
             "scan_folder": r[6], "scan_type": r[7]}
            for r in rows
        ]
    else:
        where = "WHERE d.user_id = :uid"
        params = {"uid": user_id, "lim": limit, "off": offset}
        if search:
            where = "WHERE d.user_id = :uid AND (d.filename ILIKE :search OR d.scan_folder ILIKE :search)"
            params["search"] = f"%{search}%"
        rows = (await db.execute(
            text(f"""
                SELECT d.id, d.filename, d.language,
                       COALESCE((d.analysis->'summary'->>'health_score')::int, 0) AS health_score,
                       COALESCE((d.analysis->'summary'->>'total_issues')::int, 0) AS total_issues,
                       d.created_at,
                       d.scan_folder,
                       d.scan_type,
                       COUNT(c.id) AS chunk_count
                FROM rag_documents d
                LEFT JOIN rag_chunks c ON c.document_id = d.id
                {where}
                GROUP BY d.id
                ORDER BY d.created_at DESC
                LIMIT :lim OFFSET :off
            """),
            params,
        )).fetchall()
        return [
            {"analysis_id": str(r[0]), "filename": r[1], "language": r[2],
             "health_score": r[3], "total_issues": r[4],
             "created_at": r[5].isoformat(), "scan_folder": r[6],
             "scan_type": r[7]}
            for r in rows
        ]


async def count_history(
    db: AsyncSession,
    user_id: int,
    search: str = "",
) -> int:
    if IS_SQLITE:
        where = "WHERE user_id = :uid"
        params = {"uid": user_id}
        if search:
            where = "WHERE user_id = :uid AND (filename LIKE :search OR scan_folder LIKE :search)"
            params["search"] = f"%{search}%"
        row = (await db.execute(
            text(f"SELECT COUNT(*) FROM analyses {where}"), params
        )).scalar()
        return row or 0
    else:
        where = "WHERE d.user_id = :uid"
        params = {"uid": user_id}
        if search:
            where = "WHERE d.user_id = :uid AND (d.filename ILIKE :search OR d.scan_folder ILIKE :search)"
            params["search"] = f"%{search}%"
        row = (await db.execute(
            text(f"SELECT COUNT(*) FROM rag_documents d {where}"), params
        )).scalar()
        return row or 0


async def get_document(
    db: AsyncSession,
    document_id: str,
    user_id: int,
) -> dict | None:
    if IS_SQLITE:
        row = (await db.execute(
            text("SELECT id, filename, language, analysis_json FROM analyses WHERE id = :id AND user_id = :uid"),
            {"id": document_id, "uid": user_id},
        )).fetchone()
        if not row:
            return None
        try:
            analysis = json.loads(row[3])
        except (json.JSONDecodeError, TypeError) as e:
            logger.error("Failed to parse analysis_json for %s: %s", document_id, e)
            analysis = {"summary": {"total_issues": 0, "overall_health": "unknown"}, "issues": [], "metrics": {}}
        return {
            "analysis_id": row[0],
            "filename": row[1],
            "language": row[2],
            "analysis": analysis,
        }
    else:
        row = (await db.execute(
            text("SELECT id, filename, language, analysis FROM rag_documents WHERE id = :id AND user_id = :uid"),
            {"id": document_id, "uid": user_id},
        )).fetchone()
        if not row:
            return None
        return {
            "analysis_id": str(row[0]),
            "filename": row[1],
            "language": row[2],
            "analysis": row[3],
        }


async def get_documents_by_scan_folder(
    db: AsyncSession,
    user_id: int,
    scan_folder: str,
) -> list[dict]:
    if IS_SQLITE:
        rows = (await db.execute(
            text("""
                SELECT id, filename, language, analysis_json, health_score, total_issues, created_at
                FROM analyses
                WHERE user_id = :uid AND scan_folder = :folder
                ORDER BY filename
            """),
            {"uid": user_id, "folder": scan_folder},
        )).fetchall()
        return [
            {
                "analysis_id": r[0], "filename": r[1], "language": r[2],
                "analysis": json.loads(r[3]) if isinstance(r[3], str) else r[3],
                "health_score": r[4], "total_issues": r[5], "created_at": r[6],
            }
            for r in rows
        ]
    else:
        rows = (await db.execute(
            text("""
                SELECT id, filename, language, analysis, created_at,
                       COALESCE((analysis->'summary'->>'health_score')::int, 0) AS health_score,
                       COALESCE((analysis->'summary'->>'total_issues')::int, 0) AS total_issues
                FROM rag_documents
                WHERE user_id = :uid AND scan_folder = :folder
                ORDER BY filename
            """),
            {"uid": user_id, "folder": scan_folder},
        )).fetchall()
        return [
            {
                "analysis_id": str(r[0]), "filename": r[1], "language": r[2],
                "analysis": r[3], "created_at": r[4].isoformat(),
                "health_score": r[5], "total_issues": r[6],
            }
            for r in rows
        ]


async def check_hash(
    db: AsyncSession,
    user_id: int,
    file_hash: str,
) -> dict | None:
    if IS_SQLITE:
        row = (await db.execute(
            text("SELECT id, filename, language, analysis_json FROM analyses WHERE user_id = :uid AND file_hash = :hash"),
            {"uid": user_id, "hash": file_hash},
        )).fetchone()
        if not row:
            return None
        return {
            "analysis_id": row[0],
            "filename": row[1],
            "language": row[2],
            "analysis": json.loads(row[3]),
        }
    else:
        row = (await db.execute(
            text("SELECT id, filename, language, analysis FROM rag_documents WHERE user_id = :uid AND file_hash = :hash"),
            {"uid": user_id, "hash": file_hash},
        )).fetchone()
        if not row:
            return None
        return {
            "analysis_id": str(row[0]),
            "filename": row[1],
            "language": row[2],
            "analysis": row[3],
        }


async def delete_document(
    db: AsyncSession,
    document_id: str,
    user_id: int,
) -> bool:
    if IS_SQLITE:
        result = await db.execute(
            text("DELETE FROM analyses WHERE id = :id AND user_id = :uid"),
            {"id": document_id, "uid": user_id},
        )
    else:
        result = await db.execute(
            text("DELETE FROM rag_documents WHERE id = CAST(:id AS uuid) AND user_id = :uid"),
            {"id": document_id, "uid": user_id},
        )
    await db.commit()
    return result.rowcount > 0


async def cleanup_stale_documents(
    db: AsyncSession,
    user_id: int,
    active_filenames: list[str],
) -> int:
    deleted = 0
    if IS_SQLITE:
        rows = (await db.execute(
            text("SELECT id, filename FROM analyses WHERE user_id = :uid"),
            {"uid": user_id},
        )).fetchall()
        for row in rows:
            if row[1] not in active_filenames:
                await db.execute(
                    text("DELETE FROM embeddings WHERE analysis_id = :id"),
                    {"id": row[0]},
                )
                await db.execute(
                    text("DELETE FROM analyses WHERE id = :id"),
                    {"id": row[0]},
                )
                deleted += 1
    else:
        rows = (await db.execute(
            text("SELECT id, filename FROM rag_documents WHERE user_id = :uid"),
            {"uid": user_id},
        )).fetchall()
        for row in rows:
            if row[1] not in active_filenames:
                await db.execute(
                    text("DELETE FROM rag_chunks WHERE document_id = CAST(:id AS uuid)"),
                    {"id": row[0]},
                )
                await db.execute(
                    text("DELETE FROM rag_documents WHERE id = CAST(:id AS uuid)"),
                    {"id": row[0]},
                )
                deleted += 1

    await db.commit()
    return deleted

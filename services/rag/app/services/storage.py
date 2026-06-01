import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import IS_SQLITE, cosine_similarity


async def store_analysis(
    db: AsyncSession,
    user_id: int,
    filename: str,
    language: str,
    source: str,
    analysis_json: dict,
    chunks: list[Any],
    embeddings: list[list[float]],
) -> str:
    file_hash = hashlib.sha256(source.encode()).hexdigest()
    health_score = analysis_json.get("summary", {}).get("health_score", 0)
    total_issues = analysis_json.get("summary", {}).get("total_issues", 0)

    if IS_SQLITE:
        analysis_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            text("""
                INSERT INTO analyses (id, user_id, filename, language, file_hash, analysis_json, health_score, total_issues, created_at)
                VALUES (:id, :uid, :fn, :lang, :hash, :json, :health, :issues, :now)
            """),
            {
                "id": analysis_id, "uid": user_id, "fn": filename,
                "lang": language, "hash": file_hash, "json": json.dumps(analysis_json),
                "health": health_score, "issues": total_issues, "now": now,
            },
        )
        for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            await db.execute(
                text("""
                    INSERT INTO embeddings (id, analysis_id, chunk_index, chunk_text, embedding, token_count)
                    VALUES (:id, :aid, :idx, :text, :emb, :tokens)
                """),
                {
                    "id": str(uuid.uuid4()), "aid": analysis_id,
                    "idx": idx, "text": chunk if isinstance(chunk, str) else chunk.content if hasattr(chunk, 'content') else chunk.get('content', ''),
                    "emb": json.dumps(emb), "tokens": len((chunk if isinstance(chunk, str) else chunk.content if hasattr(chunk, 'content') else chunk.get('content', '')).split()),
                },
            )
        await db.commit()
        return analysis_id
    else:
        result = await db.execute(
            text("""
                INSERT INTO rag_documents (user_id, filename, language, file_hash, analysis)
                VALUES (:uid, :fn, :lang, :hash, CAST(:json AS jsonb))
                RETURNING id
            """),
            {
                "uid": user_id, "fn": filename, "lang": language,
                "hash": file_hash, "json": json.dumps(analysis_json),
            },
        )
        document_id = result.scalar_one()

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            metadata = {}
            if hasattr(chunk, 'metadata'):
                metadata = chunk.metadata
            elif isinstance(chunk, dict):
                metadata = chunk.get('metadata', {})
            content = chunk.content if hasattr(chunk, 'content') else (chunk if isinstance(chunk, str) else chunk.get('content', ''))

            await db.execute(
                text("""
                    INSERT INTO rag_chunks (document_id, chunk_index, content, metadata, embedding)
                    VALUES (:doc_id, :idx, :content, CAST(:metadata AS jsonb), CAST(:embedding AS vector))
                """),
                {
                    "doc_id": document_id, "idx": i,
                    "content": content,
                    "metadata": json.dumps(metadata),
                    "embedding": str(embedding),
                },
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
) -> list[dict]:
    if IS_SQLITE:
        rows = (await db.execute(
            text("""
                SELECT id, filename, language, health_score, total_issues, created_at
                FROM analyses
                WHERE user_id = :uid
                ORDER BY created_at DESC
                LIMIT :lim OFFSET :off
            """),
            {"uid": user_id, "lim": limit, "off": offset},
        )).fetchall()
        return [
            {"analysis_id": r[0], "filename": r[1], "language": r[2],
             "health_score": r[3], "total_issues": r[4], "created_at": r[5]}
            for r in rows
        ]
    else:
        rows = (await db.execute(
            text("""
                SELECT d.id, d.filename, d.language,
                       COALESCE((d.analysis->'summary'->>'health_score')::int, 0) AS health_score,
                       COALESCE((d.analysis->'summary'->>'total_issues')::int, 0) AS total_issues,
                       d.created_at,
                       COUNT(c.id) AS chunk_count
                FROM rag_documents d
                LEFT JOIN rag_chunks c ON c.document_id = d.id
                WHERE d.user_id = :uid
                GROUP BY d.id
                ORDER BY d.created_at DESC
                LIMIT :lim OFFSET :off
            """),
            {"uid": user_id, "lim": limit, "off": offset},
        )).fetchall()
        return [
            {"analysis_id": str(r[0]), "filename": r[1], "language": r[2],
             "health_score": r[3], "total_issues": r[4],
             "created_at": r[5].isoformat()}
            for r in rows
        ]


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
        return {
            "analysis_id": row[0],
            "filename": row[1],
            "language": row[2],
            "analysis": json.loads(row[3]),
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

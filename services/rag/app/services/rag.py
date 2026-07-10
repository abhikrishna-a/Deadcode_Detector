import asyncio
import json
import os
from collections.abc import AsyncGenerator

from openai import APIError, AsyncOpenAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import IS_SQLITE, cosine_similarity
from app.services.embedder import embed_texts
from app.services.grok_client import gemini_key_manager, get_gemini_client, groq_key_manager
from app.services.storage import find_similar


def _get_groq_model() -> str:
    return os.getenv("GROQ_MODEL", "gpt-oss-120b")


def _get_gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


TOP_K = 3


def _get_groq_client() -> AsyncOpenAI:
    return groq_key_manager.get_client()


async def retrieve(document_id: str, question: str, db: AsyncSession) -> list[dict]:
    question_embeddings = await embed_texts([question])
    query_vector = question_embeddings[0]
    result = await db.execute(
        text("""
            SELECT content, metadata, 1 - (embedding <=> CAST(:query AS vector)) AS score
            FROM rag_chunks
            WHERE document_id = :doc_id
            ORDER BY embedding <=> CAST(:query AS vector)
            LIMIT :top_k
        """),
        {"query": str(query_vector), "doc_id": document_id, "top_k": TOP_K},
    )
    rows = result.fetchall()
    return [{"content": row[0], "metadata": row[1], "score": float(row[2])} for row in rows]


async def retrieve_by_folder(
    db: AsyncSession,
    user_id: int,
    scan_folder: str,
    question: str,
) -> list[dict]:
    question_embeddings = await embed_texts([question])
    query_vector = question_embeddings[0]
    if IS_SQLITE:
        result = await db.execute(
            text("""
                SELECT e.chunk_text, e.embedding, e.analysis_id, a.filename
                FROM embeddings e
                JOIN analyses a ON a.id = e.analysis_id
                WHERE a.user_id = :uid AND a.scan_folder = :folder
            """),
            {"uid": user_id, "folder": scan_folder},
        )
        rows = result.fetchall()
        scored = []
        for row in rows:
            emb = json.loads(row[1])
            score = cosine_similarity(query_vector, emb)
            scored.append({"content": row[0], "filename": row[3], "analysis_id": row[2], "score": score})
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:TOP_K]
    else:
        result = await db.execute(
            text("""
                SELECT c.content, c.metadata, 1 - (c.embedding <=> CAST(:query AS vector)) AS score,
                       d.id AS analysis_id, d.filename
                FROM rag_chunks c
                JOIN rag_documents d ON d.id = c.document_id
                WHERE d.user_id = :uid AND d.scan_folder = :folder
                ORDER BY c.embedding <=> CAST(:query AS vector)
                LIMIT :top_k
            """),
            {"query": str(query_vector), "uid": user_id, "folder": scan_folder, "top_k": TOP_K * 3},
        )
        rows = result.fetchall()
        return [
            {
                "content": row[0],
                "metadata": row[1],
                "score": float(row[2]),
                "analysis_id": str(row[3]),
                "filename": row[4],
            }
            for row in rows
        ]


async def retrieve_similar(
    db: AsyncSession,
    user_id: int,
    query: str,
    top_k: int = 5,
    analysis_id: str | None = None,
) -> list[dict]:
    query_vec = (await embed_texts([query]))[0]
    return await find_similar(db, user_id, query_vec, top_k=top_k, document_id=analysis_id)


def build_prompt(question: str, context_chunks: list[dict], analysis_json: str) -> list[dict]:
    system = (
        "You are GhostCode Assistant. You have access to a code file and its static analysis results.\n"
        f"The analysis found the following dead code issues: {analysis_json}\n"
        "Answer questions about WHY specific code is dead, cite exact line numbers, and suggest fixes.\n"
        "Base your answers only on the provided code context."
    )
    context_parts = []
    for i, chunk in enumerate(context_chunks):
        meta = chunk.get("metadata", {})
        header = f"[Chunk {i + 1}] {meta.get('chunk_type', 'block')}"
        if meta.get("name"):
            header += f" - {meta['name']}"
        header += f" (lines {meta.get('line_start', '?')}-{meta.get('line_end', '?')})"
        context_parts.append(f"{header}\n```\n{chunk.get('content', chunk.get('chunk_text', ''))}\n```")
    context = "\n\n".join(context_parts)
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Here is the code context:\n\n{context}"},
        {
            "role": "assistant",
            "content": "Understood. I have reviewed the code context and analysis. Ask me anything about it.",
        },
        {"role": "user", "content": question},
    ]


def build_folder_prompt(question: str, context_chunks: list[dict]) -> list[dict]:
    context_parts = []
    for i, chunk in enumerate(context_chunks):
        filename = chunk.get("filename", "unknown")
        meta = chunk.get("metadata", {})
        header = f"[File: {filename}, Chunk {i + 1}]"
        if meta.get("chunk_type"):
            header += f" {meta['chunk_type']}"
        if meta.get("name"):
            header += f" - {meta['name']}"
        if meta.get("line_start") is not None:
            header += f" (line {meta['line_start']})"
        text = chunk.get("content", chunk.get("chunk_text", ""))
        context_parts.append(f"{header}\n```\n{text}\n```")
    context = "\n\n".join(context_parts)
    return [
        {
            "role": "system",
            "content": (
                "You are GhostCode Assistant — a code quality expert. "
                "You have access to code files from a project folder. "
                "Answer the user's question using ONLY the provided code context. "
                "If the answer is not in the context, say so honestly. "
                "Be concise, technical, and actionable. "
                "Cite specific filenames and approximate line numbers when possible."
            ),
        },
        {"role": "user", "content": f"Here is the code context for the folder:\n\n{context}"},
        {
            "role": "assistant",
            "content": "Understood. I have reviewed the code context from all files in this folder. Ask me anything about it.",
        },
        {"role": "user", "content": question},
    ]


def format_chunks_as_context(context_chunks: list[dict]) -> str:
    parts = []
    for i, chunk in enumerate(context_chunks):
        meta = chunk.get("metadata", {})
        header = f"[Chunk {i + 1}] {meta.get('chunk_type', 'block')}"
        if meta.get("name"):
            header += f" - {meta['name']}"
        header += f" (lines {meta.get('line_start', '?')}-{meta.get('line_end', '?')})"
        parts.append(f"{header}\n```\n{chunk.get('content', '')}\n```")
    return "\n\n".join(parts)


def format_history(history: list[dict]) -> str:
    lines = []
    for msg in history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


def build_chat_context_prompt(question: str, sources: list[dict]) -> list[dict]:
    context = "\n\n---\n\n".join(f"[{s['filename']}]\n{s['chunk_text']}" for s in sources)
    return [
        {
            "role": "system",
            "content": (
                "You are GhostCode Assistant — a code quality expert. "
                "Answer the user's question using ONLY the provided code context. "
                "If the answer is not in the context, say so honestly. "
                "Be concise, technical, and actionable.\n\n"
                f"## Code Context\n{context}"
            ),
        },
        {"role": "user", "content": question},
    ]


async def stream_answer(messages: list[dict], context_chunks: list[dict]) -> AsyncGenerator[str]:
    groq_model = _get_groq_model()
    gemini_model = _get_gemini_model()
    last_error = None
    max_attempts = len(groq_key_manager._keys) if groq_key_manager.has_keys else 1
    stream = None
    for attempt in range(max_attempts):
        try:
            client = _get_groq_client()
            stream = await client.chat.completions.create(
                model=groq_model,
                messages=messages,
                stream=True,
                temperature=0.3,
                max_tokens=1024,
            )
            last_error = None
            break
        except (APIError, Exception) as e:
            last_error = e
            groq_key_manager.rotate()
            if attempt < max_attempts - 1:
                await asyncio.sleep(0.5)
                continue

    # Fall back to Gemini
    if last_error and gemini_key_manager.has_keys:
        try:
            client = get_gemini_client()
            stream = await client.chat.completions.create(
                model=gemini_model,
                messages=messages,
                stream=True,
                temperature=0.3,
                max_tokens=1024,
            )
            last_error = None
        except Exception as e:
            raise RuntimeError(f"Groq + Gemini both failed. Groq: {last_error}, Gemini: {e}")

    if last_error:
        raise RuntimeError(f"Groq streaming failed after {max_attempts} key(s): {last_error}")
    if stream is None:
        raise RuntimeError("Chat stream could not be created.")

    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else ""
        if delta:
            yield json.dumps({"delta": delta, "done": False})

    sources = [
        {
            "line_start": chunk["metadata"].get("line_start"),
            "line_end": chunk["metadata"].get("line_end"),
            "chunk_type": chunk["metadata"].get("chunk_type"),
            "name": chunk["metadata"].get("name"),
            "score": round(chunk["score"], 4),
        }
        for chunk in context_chunks
    ]
    yield json.dumps({"delta": "", "done": True, "sources": sources})


async def answer_question(messages: list[dict]) -> str:
    groq_model = _get_groq_model()
    gemini_model = _get_gemini_model()
    last_error = None
    max_attempts = len(groq_key_manager._keys) if groq_key_manager.has_keys else 1

    for attempt in range(max_attempts):
        try:
            client = _get_groq_client()
            response = await client.chat.completions.create(
                model=groq_model,
                messages=messages,
                temperature=0.3,
                max_tokens=1024,
            )
            last_error = None
            break
        except (APIError, Exception) as e:
            last_error = e
            groq_key_manager.rotate()
            if attempt < max_attempts - 1:
                continue

    # Fall back to Gemini
    if last_error and gemini_key_manager.has_keys:
        try:
            client = get_gemini_client()
            response = await client.chat.completions.create(
                model=gemini_model,
                messages=messages,
                temperature=0.3,
                max_tokens=1024,
            )
            last_error = None
        except Exception as e:
            raise RuntimeError(f"Groq + Gemini both failed. Groq: {last_error}, Gemini: {e}")

    if last_error:
        raise RuntimeError(f"Groq API call failed after {max_attempts} key(s): {last_error}")

    return response.choices[0].message.content or ""

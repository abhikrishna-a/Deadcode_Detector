import json
import os
from typing import List, AsyncGenerator

from openai import AsyncOpenAI, APIError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embedder import embed_texts
from app.services.grok_client import groq_key_manager, gemini_key_manager, get_gemini_client
from app.services.storage import find_similar


def _get_groq_model() -> str:
    return os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def _get_gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


TOP_K = 6


def _get_groq_client() -> AsyncOpenAI:
    return groq_key_manager.get_client()


async def retrieve(document_id: str, question: str, db: AsyncSession) -> List[dict]:
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
    return [
        {"content": row[0], "metadata": row[1], "score": float(row[2])}
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


def build_prompt(question: str, context_chunks: List[dict], analysis_json: str) -> List[dict]:
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
        {"role": "assistant", "content": "Understood. I have reviewed the code context and analysis. Ask me anything about it."},
        {"role": "user", "content": question},
    ]


def build_chat_context_prompt(question: str, sources: list[dict]) -> List[dict]:
    context = "\n\n---\n\n".join(
        f"[{s['filename']}]\n{s['chunk_text']}" for s in sources
    )
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


async def stream_answer(
    messages: List[dict], context_chunks: List[dict]
) -> AsyncGenerator[str, None]:
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
                max_tokens=2048,
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
            stream = await client.chat.completions.create(
                model=gemini_model,
                messages=messages,
                stream=True,
                temperature=0.3,
                max_tokens=2048,
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


async def answer_question(messages: List[dict]) -> str:
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
                max_tokens=2048,
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
                max_tokens=2048,
            )
            last_error = None
        except Exception as e:
            raise RuntimeError(f"Groq + Gemini both failed. Groq: {last_error}, Gemini: {e}")

    if last_error:
        raise RuntimeError(f"Groq API call failed after {max_attempts} key(s): {last_error}")

    return response.choices[0].message.content or ""

import json
from typing import List, AsyncGenerator
from openai import AsyncOpenAI, APIError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.embedder import embed_texts
from app.services.key_manager import xai_key_manager

GPT_MODEL = "grok-2-latest"
TOP_K = 6


def _get_chat_client() -> AsyncOpenAI:
    return xai_key_manager.get_client()


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
        {
            "content": row[0],
            "metadata": row[1],
            "score": float(row[2]),
        }
        for row in rows
    ]


def build_prompt(question: str, context_chunks: List[dict], analysis_json: str) -> List[dict]:
    system = (
        "You are GhostCode Assistant. You have access to a code file and its static analysis results.\n"
        f"The analysis found the following dead code issues: {analysis_json}\n"
        "Answer questions about WHY specific code is dead, cite exact line numbers, and suggest fixes.\n"
        "Base your answers only on the provided code context."
    )

    context_parts = []
    for i, chunk in enumerate(context_chunks):
        meta = chunk["metadata"]
        header = f"[Chunk {i + 1}] {meta.get('chunk_type', 'block')}"
        if meta.get("name"):
            header += f" - {meta['name']}"
        header += f" (lines {meta.get('line_start', '?')}-{meta.get('line_end', '?')})"
        context_parts.append(f"{header}\n```\n{chunk['content']}\n```")

    context = "\n\n".join(context_parts)

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Here is the code context:\n\n{context}"},
        {"role": "assistant", "content": "Understood. I have reviewed the code context and analysis. Ask me anything about it."},
        {"role": "user", "content": question},
    ]


async def stream_answer(
    messages: List[dict], context_chunks: List[dict]
) -> AsyncGenerator[str, None]:
    client = _get_chat_client()
    if client is None:
        raise RuntimeError("No xAI API keys configured. Set XAI_API_KEYS env var.")

    last_error = None
    max_attempts = len(xai_key_manager._keys) if xai_key_manager.has_keys else 1
    stream = None
    for _ in range(max_attempts):
        try:
            client = _get_chat_client()
            stream = await client.chat.completions.create(
                model=GPT_MODEL,
                messages=messages,
                stream=True,
                temperature=0.3,
                max_tokens=2048,
            )
            last_error = None
            break
        except APIError as e:
            last_error = e
            xai_key_manager.mark_failed()
    if last_error:
        raise last_error
    if stream is None:
        raise RuntimeError("xAI chat stream could not be created.")

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

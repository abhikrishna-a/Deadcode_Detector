import asyncio
import os
from typing import List
from openai import AsyncOpenAI

_backend = os.getenv("EMBEDDING_BACKEND", "local").lower()
_st_model = None
BATCH_SIZE = 20


def _get_st_model():
    global _st_model
    if _st_model is None:
        from fastembed import TextEmbedding
        _st_model = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")
    return _st_model


def _embed_sync(texts: List[str]) -> List[List[float]]:
    """Synchronous fastembed call — runs in a thread pool executor."""
    model = _get_st_model()
    all_embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i: i + BATCH_SIZE]
        embeddings = list(model.embed(batch))
        all_embeddings.extend([e.tolist() for e in embeddings])
    return all_embeddings


async def embed_texts(texts: List[str]) -> List[List[float]]:
    if _backend == "openai":
        oai_key = os.getenv("OPENAI_API_KEY", "")
        if not oai_key:
            raise RuntimeError("OPENAI_API_KEY not set but EMBEDDING_BACKEND=openai.")
        client = AsyncOpenAI(api_key=oai_key)
        resp = await client.embeddings.create(
            model="text-embedding-3-small", input=texts
        )
        return [item.embedding for item in resp.data]

    # Local fastembed — run in thread pool so it does not block the event loop
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _embed_sync, texts)

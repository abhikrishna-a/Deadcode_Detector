import asyncio
import os
from typing import List
from openai import AsyncOpenAI

from fastembed import TextEmbedding

CODE_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
_backend = os.getenv("EMBEDDING_BACKEND", "local").lower()
BATCH_SIZE = 100


class FastEmbedEmbedder:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._model = None
        return cls._instance

    def _get_model(self):
        if self._model is None:
            self._model = TextEmbedding(CODE_EMBEDDING_MODEL)
        return self._model

    def embed_sync(self, texts: List[str]) -> List[List[float]]:
        model = self._get_model()
        all_embeddings = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i: i + BATCH_SIZE]
            embeddings = list(model.embed(batch))
            all_embeddings.extend([e.tolist() for e in embeddings])
        return all_embeddings

    async def embed(self, texts: List[str]) -> List[List[float]]:
        if _backend == "openai":
            oai_key = os.getenv("OPENAI_API_KEY", "")
            if not oai_key:
                raise RuntimeError("OPENAI_API_KEY not set but EMBEDDING_BACKEND=openai.")
            client = AsyncOpenAI(api_key=oai_key)
            resp = await client.embeddings.create(
                model="text-embedding-3-small", input=texts
            )
            return [item.embedding for item in resp.data]

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.embed_sync, texts)


_embedder = FastEmbedEmbedder()


def prewarm_embedder():
    _embedder._get_model()


async def embed_texts(texts: List[str]) -> List[List[float]]:
    return await _embedder.embed(texts)

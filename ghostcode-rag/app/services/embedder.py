from typing import List
from fastembed import TextEmbedding

_model = None
BATCH_SIZE = 20


def _get_model():
    global _model
    if _model is None:
        _model = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")
    return _model


async def embed_texts(texts: List[str]) -> List[List[float]]:
    model = _get_model()
    all_embeddings = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        embeddings = list(model.embed(batch))
        all_embeddings.extend([e.tolist() for e in embeddings])

    return all_embeddings

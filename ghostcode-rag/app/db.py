import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

DATABASE_URL = os.getenv("RAG_DATABASE_URL", "postgresql+asyncpg://postgres:1234@localhost:5432/deadcode_detector")

engine = create_async_engine(DATABASE_URL, pool_size=5, max_overflow=10)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS rag_documents (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id     INTEGER NOT NULL,
                filename    TEXT NOT NULL,
                language    TEXT NOT NULL DEFAULT 'python',
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                analysis    JSONB
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS rag_chunks (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_id  UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
                chunk_index  INTEGER NOT NULL,
                content      TEXT NOT NULL,
                metadata     JSONB,
                embedding    vector(384)
            )
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
                ON rag_chunks USING hnsw (embedding vector_cosine_ops)
        """))


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

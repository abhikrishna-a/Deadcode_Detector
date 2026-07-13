import math
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

DATABASE_URL = os.getenv("RAG_DATABASE_URL") or os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://postgres:1234@localhost:5432/deadcode_detector"
)
IS_SQLITE = "sqlite" in DATABASE_URL

engine = create_async_engine(
    DATABASE_URL,
    pool_size=15,
    max_overflow=20,
    pool_timeout=30,
    pool_pre_ping=True,
    connect_args={"prepared_statement_cache_size": 0},
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        if IS_SQLITE:
            from sqlalchemy import text as _t

            await conn.execute(
                _t("""
                CREATE TABLE IF NOT EXISTS analyses (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    filename TEXT NOT NULL,
                    language TEXT NOT NULL DEFAULT 'python',
                    file_hash TEXT NOT NULL,
                    scan_folder TEXT NOT NULL DEFAULT '',
                    scan_type TEXT NOT NULL DEFAULT 'single',
                    scan_id TEXT NOT NULL DEFAULT '',
                    analysis_json TEXT NOT NULL,
                    health_score INTEGER NOT NULL DEFAULT 0,
                    total_issues INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT ''
                )
            """)
            )
            try:
                await conn.execute(_t("ALTER TABLE analyses ADD COLUMN scan_folder TEXT NOT NULL DEFAULT ''"))
            except Exception:
                pass
            try:
                await conn.execute(_t("ALTER TABLE analyses ADD COLUMN scan_type TEXT NOT NULL DEFAULT 'single'"))
            except Exception:
                pass
            try:
                await conn.execute(_t("ALTER TABLE analyses ADD COLUMN source TEXT NOT NULL DEFAULT ''"))
            except Exception:
                pass
            try:
                await conn.execute(_t("ALTER TABLE analyses ADD COLUMN scan_id TEXT NOT NULL DEFAULT ''"))
            except Exception:
                pass
            await conn.execute(_t("CREATE INDEX IF NOT EXISTS idx_analyses_user_hash ON analyses(user_id, file_hash)"))
            await conn.execute(
                _t("""
                CREATE TABLE IF NOT EXISTS embeddings (
                    id TEXT PRIMARY KEY,
                    analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
                    chunk_index INTEGER NOT NULL,
                    chunk_text TEXT NOT NULL,
                    embedding TEXT NOT NULL,
                    token_count INTEGER NOT NULL DEFAULT 0
                )
            """)
            )
            await conn.execute(_t("CREATE INDEX IF NOT EXISTS idx_embeddings_analysis ON embeddings(analysis_id)"))
        else:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.execute(
                text("""
                CREATE TABLE IF NOT EXISTS rag_documents (
                    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id     INTEGER NOT NULL,
                    filename    TEXT NOT NULL,
                    language    TEXT NOT NULL DEFAULT 'python',
                    file_hash   TEXT NOT NULL DEFAULT '',
                    scan_folder TEXT NOT NULL DEFAULT '',
                    scan_type   TEXT NOT NULL DEFAULT 'single',
                    scan_id     TEXT NOT NULL DEFAULT '',
                    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                    analysis    JSONB,
                    source      TEXT NOT NULL DEFAULT ''
                )
            """)
            )
            await conn.execute(
                text("ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS file_hash TEXT NOT NULL DEFAULT ''")
            )
            await conn.execute(
                text("ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS scan_folder TEXT NOT NULL DEFAULT ''")
            )
            await conn.execute(
                text("ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS scan_type TEXT NOT NULL DEFAULT 'single'")
            )
            await conn.execute(
                text("ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT ''")
            )
            await conn.execute(
                text("ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS scan_id TEXT NOT NULL DEFAULT ''")
            )
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_docs_user_hash ON rag_documents(user_id, file_hash)")
            )
            await conn.execute(
                text("""
                CREATE TABLE IF NOT EXISTS rag_chunks (
                    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    document_id  UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
                    chunk_index  INTEGER NOT NULL,
                    content      TEXT NOT NULL,
                    metadata     JSONB,
                    embedding    vector(384)
                )
            """)
            )
            row = await conn.execute(
                text(
                    "SELECT 1 FROM pg_indexes WHERE indexname = 'rag_chunks_embedding_idx' AND tablename = 'rag_chunks'"
                )
            )
            if not row.scalar():
                await conn.execute(
                    text("""
                    CREATE INDEX rag_chunks_embedding_idx
                        ON rag_chunks USING hnsw (embedding vector_cosine_ops)
                """)
                )


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    ma = math.sqrt(sum(x * x for x in a))
    mb = math.sqrt(sum(x * x for x in b))
    if ma == 0 or mb == 0:
        return 0.0
    return dot / (ma * mb)

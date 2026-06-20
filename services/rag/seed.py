import os
import asyncio
import asyncpg

from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent / ".env")

DATABASE_URL = (
    os.getenv("RAG_DATABASE_URL")
    or os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:1234@localhost:5432/deadcode_detector")
)

dsn = DATABASE_URL.replace("+asyncpg", "")


async def seed():
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        print("[seed] vector extension created")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS rag_documents (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id     INTEGER NOT NULL,
                filename    TEXT NOT NULL,
                language    TEXT NOT NULL DEFAULT 'python',
                file_hash   TEXT NOT NULL DEFAULT '',
                scan_folder TEXT NOT NULL DEFAULT '',
                scan_type   TEXT NOT NULL DEFAULT 'single',
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                analysis    JSONB,
                source      TEXT NOT NULL DEFAULT ''
            )
        """)
        print("[seed] rag_documents table ready")

        for col in ("file_hash", "scan_folder", "source"):
            await conn.execute(f"ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS {col} TEXT NOT NULL DEFAULT ''")
        await conn.execute("ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS scan_type TEXT NOT NULL DEFAULT 'single'")
        await conn.execute("ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS scan_id TEXT NOT NULL DEFAULT ''")

        await conn.execute("CREATE INDEX IF NOT EXISTS idx_docs_user_hash ON rag_documents(user_id, file_hash)")
        print("[seed] rag_documents indexes ready")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS rag_chunks (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_id  UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
                chunk_index  INTEGER NOT NULL,
                content      TEXT NOT NULL,
                metadata     JSONB,
                embedding    vector(384)
            )
        """)
        print("[seed] rag_chunks table ready")

        has_idx = await conn.fetchval(
            "SELECT 1 FROM pg_indexes WHERE indexname = 'rag_chunks_embedding_idx' AND tablename = 'rag_chunks'"
        )
        if not has_idx:
            await conn.execute("""
                CREATE INDEX rag_chunks_embedding_idx
                    ON rag_chunks USING hnsw (embedding vector_cosine_ops)
            """)
            print("[seed] rag_chunks HNSW index created")

        row = await conn.fetchrow("SELECT COUNT(*) AS cnt FROM rag_documents")
        print(f"[seed] done — {row['cnt']} documents already in rag_documents")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(seed())

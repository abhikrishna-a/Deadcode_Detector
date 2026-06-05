import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.routers import analysis, chat

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="GhostCode RAG", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis.router, prefix="/rag", tags=["Analysis"])
app.include_router(analysis.router, prefix="", tags=["Analyzer-alias"])
app.include_router(chat.router, prefix="/rag", tags=["Chat"])


@app.get("/rag/health")
async def health():
    return {"status": "ok", "service": "ghostcode-rag"}


@app.get("/analyzer/health")
async def analyzer_health_alias():
    return {"status": "ok", "service": "ghostcode-analyzer"}

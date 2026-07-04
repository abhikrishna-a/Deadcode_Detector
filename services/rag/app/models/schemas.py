from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class ChunkMeta(BaseModel):
    line_start: int
    line_end: int
    chunk_type: str
    name: str | None = None


class UploadResponse(BaseModel):
    document_id: UUID
    chunk_count: int
    filename: str


class ChatRequest(BaseModel):
    document_id: str
    question: str
    history: list[dict] = []


class FolderChatRequest(BaseModel):
    scan_folder: str
    question: str
    history: list[dict] = []


class SourceCitation(BaseModel):
    line_start: int
    line_end: int
    chunk_type: str
    name: str | None = None
    score: float


class ChatResponse(BaseModel):
    delta: str
    done: bool = False
    sources: list[SourceCitation] | None = None


class Message(BaseModel):
    role: str
    content: str


class DocumentListItem(BaseModel):
    id: UUID
    user_id: int
    filename: str
    language: str
    created_at: datetime
    chunk_count: int


class RAGAnalyzeResponse(BaseModel):
    analysis_id: str
    filename: str
    language: str
    analysis: dict[str, Any]
    cached: bool = False


class AnalysisHistoryItem(BaseModel):
    analysis_id: str
    filename: str
    language: str
    health_score: int
    total_issues: int
    created_at: str
    scan_folder: str = ""
    scan_type: str = "single"


class HistoryResponse(BaseModel):
    items: list[AnalysisHistoryItem]
    total: int


class BatchFileInput(BaseModel):
    name: str
    content: str


class BatchAnalyzeRequest(BaseModel):
    files: list[BatchFileInput]
    scan_folder: str = ""
    scan_type: str = "single"


class BatchFileResult(BaseModel):
    filename: str
    analysis: dict[str, Any]
    document_id: str | None = None
    error: str | None = None


class BatchAnalyzeResponse(BaseModel):
    results: list[BatchFileResult]
    total_time_ms: int


class ChatQuery(BaseModel):
    message: str
    analysis_id: str | None = None


class ChatSource(BaseModel):
    chunk_text: str
    filename: str
    analysis_id: str
    score: float


class ChatReply(BaseModel):
    answer: str
    sources: list[ChatSource]

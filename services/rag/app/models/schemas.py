from pydantic import BaseModel
from typing import Any, List, Optional
from uuid import UUID
from datetime import datetime


class ChunkMeta(BaseModel):
    line_start: int
    line_end: int
    chunk_type: str
    name: Optional[str] = None


class UploadResponse(BaseModel):
    document_id: UUID
    chunk_count: int
    filename: str


class ChatRequest(BaseModel):
    document_id: str
    question: str
    history: List[dict] = []


class SourceCitation(BaseModel):
    line_start: int
    line_end: int
    chunk_type: str
    name: Optional[str] = None
    score: float


class ChatResponse(BaseModel):
    delta: str
    done: bool = False
    sources: Optional[List[SourceCitation]] = None


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


class HistoryResponse(BaseModel):
    items: list[AnalysisHistoryItem]
    total: int


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

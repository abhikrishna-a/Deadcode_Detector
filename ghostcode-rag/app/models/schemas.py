from pydantic import BaseModel
from typing import List, Optional
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

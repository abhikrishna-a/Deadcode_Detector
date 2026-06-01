from pydantic import BaseModel
from typing import Any


class AnalyzeResponse(BaseModel):
    filename: str
    language: str
    analysis: dict[str, Any]


class BatchItem(BaseModel):
    filename: str
    analysis: dict[str, Any] | None = None
    error: str | None = None


class BatchResponse(BaseModel):
    results: list[BatchItem]


class HealthResponse(BaseModel):
    status: str
    service: str

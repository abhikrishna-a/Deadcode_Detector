import asyncio

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from app.auth import get_current_user
from app.services.analyzer import analyze_file
from app.services.chunker import detect_language
from app.models.schemas import AnalyzeResponse, BatchItem, BatchResponse

router = APIRouter()

MAX_FILE_SIZE = 500 * 1024
ACCEPTED_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".txt", ".md"}


def _validate_file(file: UploadFile) -> str:
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in ACCEPTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{ext}' is not supported. Accepted: {', '.join(sorted(ACCEPTED_EXTENSIONS))}",
        )

    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds the 500 KB size limit ({file.size} bytes).",
        )

    return ext


async def _read_file(file: UploadFile) -> str:
    try:
        content = await file.read()
        return content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to decode file as UTF-8 (byte offset: {exc.start})",
        )


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    file: UploadFile,
    user: dict = Depends(get_current_user),
):
    _validate_file(file)
    source = await _read_file(file)
    language = detect_language(file.filename)
    analysis = await analyze_file(source, file.filename)
    return AnalyzeResponse(filename=file.filename, language=language, analysis=analysis)


@router.post("/analyze-batch", response_model=BatchResponse)
async def analyze_batch(
    files: list[UploadFile],
    user: dict = Depends(get_current_user),
):
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maximum 10 files per batch request, got {len(files)}.",
        )

    async def process_one(file: UploadFile) -> BatchItem:
        try:
            _validate_file(file)
            source = await _read_file(file)
            analysis = await analyze_file(source, file.filename)
            return BatchItem(filename=file.filename, analysis=analysis)
        except HTTPException as exc:
            return BatchItem(filename=file.filename, error=exc.detail)
        except Exception as exc:
            return BatchItem(filename=file.filename, error=str(exc))

    results = await asyncio.gather(*(process_one(f) for f in files))
    return BatchResponse(results=list(results))


@router.get("/health")
async def health():
    return {"status": "ok", "service": "ghostcode-analyzer"}

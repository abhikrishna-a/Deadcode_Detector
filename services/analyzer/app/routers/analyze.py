import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from app.auth import get_current_user
from app.services.analyzer import analyze_file
from app.services.chunker import detect_language, needs_chunking, chunk_file, approx_tokens
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
    
    # Check if file needs chunking to avoid LLM context overflow
    if needs_chunking(source):
        # Split into overlapping chunks
        chunks = chunk_file(source)
        chunk_results = []
        
        # Analyze each chunk
        for chunk in chunks:
            # Add header to help the analyzer understand this is a partial file
            chunk_header = f"[GhostCode chunk {chunk['index'] + 1}/{chunk['total']} lines {chunk['line_start']}-{chunk['line_end']}]\n"
            chunk_content = chunk_header + chunk['content']
            chunk_analysis = await analyze_file(chunk_content, file.filename)
            chunk_results.append((chunk_analysis, chunk))
        
        # Merge results from all chunks
        analysis = _merge_chunk_results(chunk_results, source)
    else:
        # File fits in one call
        analysis = await analyze_file(source, file.filename)
    
    return AnalyzeResponse(filename=file.filename, language=language, analysis=analysis)


def _merge_chunk_results(chunk_results, source: str):
    """Merge multiple chunk analyses into a single coherent result."""
    if not chunk_results:
        return {}
    
    if len(chunk_results) == 1:
        # Single chunk - return as-is
        return chunk_results[0][0]
    
    # Multiple chunks - need to merge
    all_issues = []
    seen_issue_keys = set()
    
    # Collect and deduplicate issues
    for analysis, chunk in chunk_results:
        for issue in analysis.get("issues", []):
            # Create deduplication key
            key = f"{issue.get('category', '')}:{issue.get('line_start', 0)}:{issue.get('name', '')}"
            if key not in seen_issue_keys:
                seen_issue_keys.add(key)
                # Adjust line numbers to be relative to original file
                issue_copy = issue.copy()
                issue_copy["line_start"] += chunk["line_start"] - 1
                issue_copy["line_end"] += chunk["line_start"] - 1
                all_issues.append(issue_copy)
    
    # Sort by line number and re-ID
    all_issues.sort(key=lambda x: x.get("line_start", 0))
    for i, issue in enumerate(all_issues):
        issue["id"] = f"DC{i+1:03d}"
    
    # Aggregate summary counts
    severity_counts = {"high": 0, "medium": 0, "low": 0}
    categories = {}
    
    for issue in all_issues:
        sev = issue.get("severity", "low")
        if sev in severity_counts:
            severity_counts[sev] += 1
        cat = issue.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1
    
    # Calculate metrics - use the last chunk's as base but adjust totals
    last_analysis = chunk_results[-1][0]
    metrics = last_analysis.get("metrics", {}).copy()
    
    # Recalculate total lines from source
    total_lines = len(source.split('\n'))
    metrics["total_lines"] = total_lines
    
    # Recalculate dead lines (clamp to 80% to account for overlap)
    dead_lines_raw = sum(chunk[0].get("metrics", {}).get("dead_lines_estimate", 0) for chunk in chunk_results)
    dead_lines = min(dead_lines_raw, int(total_lines * 0.8))
    metrics["dead_lines_estimate"] = dead_lines
    metrics["dead_code_percentage"] = round((dead_lines / total_lines) * 100, 1) if total_lines > 0 else 0
    
    # Average health score
    health_scores = [chunk[0].get("summary", {}).get("health_score", 0) for chunk in chunk_results if chunk[0].get("summary", {}).get("health_score") is not None]
    avg_health_score = round(sum(health_scores) / len(health_scores)) if health_scores else 0
    
    # Determine overall health
    if avg_health_score >= 90:
        overall_health = "clean"
    elif avg_health_score >= 70:
        overall_health = "good"
    elif avg_health_score >= 40:
        overall_health = "needs_attention"
    else:
        overall_health = "poor"
    
    # Merge refactor hints (deduplicate by first 40 chars)
    hints_seen = set()
    refactor_hints = []
    for analysis, _ in chunk_results:
        for hint in analysis.get("refactor_hints", []):
            key = hint[:40]
            if key not in hints_seen:
                hints_seen.add(key)
                refactor_hints.append(hint)
    
    return {
        "summary": {
            "total_issues": len(all_issues),
            "severity_counts": severity_counts,
            "categories": categories,
            "overall_health": overall_health,
            "health_score": avg_health_score,
        },
        "issues": all_issues,
        "metrics": metrics,
        "refactor_hints": refactor_hints,
    }


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
            language = detect_language(file.filename)
            
            # Check if file needs chunking to avoid LLM context overflow
            if needs_chunking(source):
                # Split into overlapping chunks
                chunks = chunk_file(source)
                chunk_results = []
                
                # Analyze each chunk
                for chunk in chunks:
                    # Add header to help the analyzer understand this is a partial file
                    chunk_header = f"[GhostCode chunk {chunk['index'] + 1}/{chunk['total']} lines {chunk['line_start']}-{chunk['line_end']}]\n"
                    chunk_content = chunk_header + chunk['content']
                    chunk_analysis = await analyze_file(chunk_content, file.filename)
                    chunk_results.append((chunk_analysis, chunk))
                
                # Merge results from all chunks
                analysis = _merge_chunk_results(chunk_results, source)
            else:
                # File fits in one call
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

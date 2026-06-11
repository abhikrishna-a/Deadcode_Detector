import ast
import re
from typing import List, Optional

MAX_CHUNK_CHARS = 2400
SLIDING_WINDOW_LINES = 60
SLIDING_OVERLAP_LINES = 10


class Chunk:
    def __init__(self, content: str, metadata: dict):
        self.content = content
        self.metadata = metadata


def detect_language(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mapping = {
        "py": "python", "js": "javascript", "jsx": "javascript",
        "ts": "typescript", "tsx": "typescript", "txt": "text", "md": "markdown",
    }
    return mapping.get(ext, "text")


def chunk_python(source: str, filename: str) -> List[Chunk]:
    chunks = []
    lines = source.splitlines()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return _fallback_chunk(source, filename, "python")
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            line_start = node.lineno
            line_end = getattr(node, "end_lineno", line_start)
            content = "\n".join(lines[line_start - 1 : line_end])
            chunk_type = "class" if isinstance(node, ast.ClassDef) else "function"
            name = node.name
            if _count_tokens_approx(content) > MAX_CHUNK_CHARS:
                sub_chunks = _split_large_chunk(content, filename, line_start, chunk_type, name, "python")
                chunks.extend(sub_chunks)
            else:
                chunks.append(Chunk(content, {
                    "filename": filename, "line_start": line_start, "line_end": line_end,
                    "chunk_type": chunk_type, "name": name, "language": "python",
                }))
    if not chunks:
        return _fallback_chunk(source, filename, "python")
    return chunks


def chunk_javascript(source: str, filename: str) -> List[Chunk]:
    chunks = []
    lines = source.splitlines()
    pattern = re.compile(
        r'(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+\w+|'
        r'(?:^|\n)\s*(?:export\s+)?const\s+\w+\s*=|'
        r'(?:^|\n)\s*(?:export\s+)?class\s+\w+|'
        r'(?:^|\n)\s*(?:export\s+)?(?:let|var)\s+\w+\s*=',
        re.MULTILINE
    )
    prev_end = 0
    for match in pattern.finditer(source):
        line_start = source[: match.start()].count("\n") + 1
        approx_end = _find_block_end(lines, line_start - 1)
        content = "\n".join(lines[line_start - 1 : approx_end])
        prev_end = sum(len(l) + 1 for l in lines[:approx_end])
        name = match.group().strip().split()[-1].replace("=", "").strip()
        chunk_type = "class" if "class" in match.group() else "function"
        if _count_tokens_approx(content) > MAX_CHUNK_CHARS:
            sub_chunks = _split_large_chunk(
                content, filename, line_start, chunk_type, name,
                "javascript" if filename.endswith((".js", ".jsx")) else "typescript",
            )
            chunks.extend(sub_chunks)
        else:
            chunks.append(Chunk(content, {
                "filename": filename, "line_start": line_start,
                "line_end": line_start + content.count("\n"),
                "chunk_type": chunk_type, "name": name,
                "language": "javascript" if filename.endswith((".js", ".jsx")) else "typescript",
            }))
    if not chunks:
        return _fallback_chunk(source, filename, "javascript")
    return chunks


def _find_block_end(lines: List[str], start_idx: int) -> int:
    depth = 0
    for i in range(start_idx, len(lines)):
        stripped = lines[i].strip()
        if "{" in stripped:
            depth += stripped.count("{")
        if "}" in stripped:
            depth -= stripped.count("}")
        if depth <= 0 and i > start_idx:
            return i + 1
    return len(lines)


def _fallback_chunk(source: str, filename: str, language: str) -> List[Chunk]:
    chunks = []
    lines = source.splitlines()
    total = len(lines)
    start = 0
    while start < total:
        end = min(start + SLIDING_WINDOW_LINES, total)
        content = "\n".join(lines[start:end])
        chunks.append(Chunk(content, {
            "filename": filename, "line_start": start + 1, "line_end": end,
            "chunk_type": "block", "name": None, "language": language,
        }))
        start += SLIDING_WINDOW_LINES - SLIDING_OVERLAP_LINES
    return chunks


def _split_large_chunk(
    content: str, filename: str, line_start: int,
    chunk_type: str, name: str, language: str = "python",
) -> List[Chunk]:
    chunks = []
    lines = content.splitlines()
    total = len(lines)
    start = 0
    while start < total:
        end = min(start + SLIDING_WINDOW_LINES, total)
        sub_content = "\n".join(lines[start:end])
        chunks.append(Chunk(sub_content, {
            "filename": filename, "line_start": line_start + start,
            "line_end": line_start + end - 1, "chunk_type": chunk_type,
            "name": name, "language": language,
        }))
        start += SLIDING_WINDOW_LINES - SLIDING_OVERLAP_LINES
    return chunks


def _count_tokens_approx(text: str) -> int:
    return len(text)


def chunk_code(source: str, filename: str) -> List[Chunk]:
    lang = detect_language(filename)
    if lang == "python":
        return chunk_python(source, filename)
    elif lang in ("javascript", "typescript"):
        return chunk_javascript(source, filename)
    else:
        return _fallback_chunk(source, filename, lang)


def chunk_issues(analysis_json: dict, filename: str) -> list[str]:
    chunks = []
    for issue in analysis_json.get("issues", []):
        parts = [
            f"Issue {issue.get('id', '?')} [{issue.get('category', '?')}] in {filename}:",
            issue.get("description", ""),
            f"Suggestion: {issue.get('suggestion', '')}",
            f"Code: {issue.get('code_snippet', '')}",
            f"Severity: {issue.get('severity', '')}  Confidence: {issue.get('confidence', '')}",
        ]
        chunks.append("  ".join(parts))
    return chunks

def detect_language(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mapping = {
        "py": "python",
        "js": "javascript",
        "jsx": "javascript",
        "ts": "typescript",
        "tsx": "typescript",
        "txt": "text",
        "md": "markdown",
    }
    return mapping.get(ext, "text")


def approx_tokens(text: str) -> int:
    """Approximate token count: 1 token ≈ 3.5 characters for code."""
    return len(text) // 3


def needs_chunking(source: str, max_tokens: int = 6000) -> bool:
    """Returns True when source exceeds max_tokens."""
    return approx_tokens(source) > max_tokens


def chunk_file(source: str, max_tokens: int = 6000, overlap_lines: int = 10):
    """
    Split source text into overlapping line-based windows.
    
    Yields tuples of (chunk_content, chunk_index, total_chunks, line_start, line_end)
    """
    lines = source.split('\n')
    chunks = []
    start = 0
    
    while start < len(lines):
        end = start
        token_count = 0
        
        while end < len(lines):
            line_tokens = approx_tokens(lines[end])
            if token_count + line_tokens > max_tokens and end > start:
                break
            token_count += line_tokens
            end += 1
        
        if end == start:
            end = start + 1
        
        chunk_lines = lines[start:end]
        chunk_content = '\n'.join(chunk_lines)
        chunks.append({
            'content': chunk_content,
            'index': len(chunks),
            'line_start': start + 1,
            'line_end': end,
        })
        
        start = max(start + 1, end - overlap_lines)
    
    total = len(chunks)
    for chunk in chunks:
        chunk['total'] = total
    
    return chunks

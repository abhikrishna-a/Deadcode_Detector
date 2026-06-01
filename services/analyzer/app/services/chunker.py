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

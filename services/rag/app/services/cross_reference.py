import ast
import re
from collections import OrderedDict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import IS_SQLITE
from app.services.chunker import detect_language
from app.services.grok_client import call_groq_json
from app.services.prompts import BATCH_LLM_SYSTEM, get_batch_llm_prompt

SymbolInfo = tuple[str, str]  # (name, type)  type is one of: function, class, import, variable

# ── Django internals we never flag ──────────────────────────────────────
MIDDLEWARE_HOOKS = {"process_view", "process_request", "process_response", "process_exception", "__call__", "__init__"}
DJANGO_SETTINGS = {
    "BASE_DIR",
    "SECRET_KEY",
    "DEBUG",
    "ALLOWED_HOSTS",
    "INSTALLED_APPS",
    "MIDDLEWARE",
    "ROOT_URLCONF",
    "TEMPLATES",
    "WSGI_APPLICATION",
    "DATABASES",
    "AUTH_USER_MODEL",
    "AUTH_PASSWORD_VALIDATORS",
    "LOGIN_URL",
    "LOGIN_REDIRECT_URL",
    "LOGOUT_REDIRECT_URL",
    "LANGUAGE_CODE",
    "TIME_ZONE",
    "USE_I18N",
    "USE_TZ",
    "DEFAULT_AUTO_FIELD",
    "STATIC_URL",
    "STATICFILES_DIRS",
    "STATIC_ROOT",
    "CLOUDINARY_STORAGE",
    "MEDIA_URL",
    "STORAGES",
    "EMAIL_BACKEND",
    "EMAIL_HOST",
    "EMAIL_PORT",
    "EMAIL_USE_TLS",
    "EMAIL_HOST_USER",
    "EMAIL_HOST_PASSWORD",
    "DEFAULT_FROM_EMAIL",
    "MESSAGE_TAGS",
}

# ── Symbol cache (LRU) ─────────────────────────────────────────────────
_symbol_cache: OrderedDict = OrderedDict()
_SYMBOL_CACHE_MAX = 5000


def _cache_get(user_id: int, name: str, typ: str) -> bool | None:
    key = (user_id, name, typ)
    if key in _symbol_cache:
        _symbol_cache.move_to_end(key)
        return _symbol_cache[key]
    return None


def _cache_set(user_id: int, name: str, typ: str, found: bool):
    key = (user_id, name, typ)
    _symbol_cache[key] = found
    _symbol_cache.move_to_end(key)
    if len(_symbol_cache) > _SYMBOL_CACHE_MAX:
        _symbol_cache.popitem(last=False)


def _has_admin_register(decorator_list) -> bool:
    """Check if any decorator is `@admin.register(...)`."""
    for dec in decorator_list:
        if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
            if dec.func.attr == "register" and getattr(dec.func.value, "id", "") == "admin":
                return True
    return False


def extract_symbols(source: str, filename: str) -> list[SymbolInfo]:
    """
    Extract only module-level symbols that could realistically be dead code.
    Filters out Django internals, dunders, middleware hooks, form clean_* methods,
    and @admin.register classes upfront — reducing DB lookups by 40-60%.
    """
    symbols: list[SymbolInfo] = []
    seen: set = set()
    lang = detect_language(filename)

    if lang == "python":
        try:
            tree = ast.parse(source)
            for node in ast.iter_child_nodes(tree):
                # ── Functions (module-level only) ──
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    name = node.name
                    if name in seen:
                        continue
                    if name.startswith("__") and name.endswith("__"):
                        seen.add(name)
                        continue
                    if name in MIDDLEWARE_HOOKS:
                        seen.add(name)
                        continue
                    if name.startswith("clean_") and len(name) > 6:
                        seen.add(name)
                        continue
                    seen.add(name)
                    symbols.append((name, "function"))

                # ── Classes ──
                elif isinstance(node, ast.ClassDef):
                    name = node.name
                    if name in seen:
                        continue
                    if name == "Meta" or _has_admin_register(node.decorator_list):
                        seen.add(name)
                        continue
                    seen.add(name)
                    symbols.append((name, "class"))

                # ── Top-level imports ──
                elif isinstance(node, ast.Import):
                    for alias in node.names:
                        name = alias.asname or alias.name.split(".")[0]
                        if name not in seen:
                            seen.add(name)
                            symbols.append((name, "import"))

                elif isinstance(node, ast.ImportFrom):
                    for alias in node.names:
                        name = alias.asname or alias.name
                        if name not in seen:
                            seen.add(name)
                            symbols.append((name, "import"))

                # ── Module-level assignments (skip Django settings / private) ──
                elif isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name) and isinstance(target.ctx, ast.Store):
                            name = target.id
                            if name in seen:
                                continue
                            if name.startswith("_") or name in DJANGO_SETTINGS or name == "urlpatterns":
                                seen.add(name)
                                continue
                            seen.add(name)
                            symbols.append((name, "variable"))

                elif isinstance(node, ast.AnnAssign):
                    if isinstance(node.target, ast.Name):
                        name = node.target.id
                        if name in seen:
                            continue
                        if name.startswith("_") or name in DJANGO_SETTINGS:
                            seen.add(name)
                            continue
                        seen.add(name)
                        symbols.append((name, "variable"))

        except SyntaxError:
            pass

    elif lang in ("javascript", "typescript"):
        patterns = [
            (r"(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)", "function"),
            (r"(?:^|\n)\s*(?:export\s+)?class\s+(\w+)", "class"),
            (r"(?:^|\n)\s*(?:export\s+)?const\s+(\w+)\s*[=:]", "variable"),
            (r"(?:^|\n)\s*(?:export\s+)?let\s+(\w+)\s*[=:]", "variable"),
            (r"(?:^|\n)\s*(?:export\s+)?var\s+(\w+)\s*[=:]", "variable"),
            (r"(?:^|\n)\s*import\s+(?:\s*\{\s*)?(\w+)", "import"),
            (r"(?:^|\n)\s*import\s+\*\s+as\s+(\w+)", "import"),
        ]
        for pattern_str, typ in patterns:
            for match in re.finditer(pattern_str, source):
                name = match.group(1).strip()
                if name and name not in seen:
                    seen.add(name)
                    symbols.append((name, typ))

    return symbols


# ── Batched cross-reference check ──────────────────────────────────────


async def check_references(
    db: AsyncSession,
    user_id: int,
    symbols: list[SymbolInfo],
    source: str = "",
) -> list[SymbolInfo]:
    """
    Batched + cached cross-reference check.
    1. Filters symbols already checked via LRU cache.
    2. Fetches ALL chunk contents for this user in a SINGLE query.
    3. Checks remaining symbols against fetched content in Python.

    Returns only symbols confirmed NOT referenced in any prior file
    (or in the current source). If no prior data exists, returns [].
    """
    if not symbols:
        return []

    # ── Cache filter ──
    uncached = []
    for name, typ in symbols:
        cached = _cache_get(user_id, name, typ)
        if cached is None:
            uncached.append((name, typ))
        elif cached:
            pass  # Found in DB → skip (referenced)
        else:
            uncached.append((name, typ))  # Cache says not found → re-check

    if not uncached:
        return []

    # ── Single query: fetch ALL chunk content for this user ──
    all_text = await _fetch_user_chunks(db, user_id)

    # ── Check each symbol in Python (fast, no DB round-trips) ──
    unreferenced = []
    for name, typ in uncached:
        # Check prior data first (if available)
        found = False
        if all_text is not None:
            if re.search(r"\b" + re.escape(name) + r"\b", all_text):
                found = True

        # If not found in prior data (or no prior data), check intra-file
        if not found and source:
            intra_count = len(re.findall(r"\b" + re.escape(name) + r"\b", source))
            if intra_count > 1:
                found = True

        _cache_set(user_id, name, typ, found)
        if not found:
            unreferenced.append((name, typ))

    return unreferenced


async def _fetch_user_chunks(db: AsyncSession, user_id: int) -> str | None:
    """Fetch ALL chunk content for a user in one query, concatenated.
    Returns None when no prior data exists.
    """
    if IS_SQLITE:
        query = text("""
            SELECT COALESCE(GROUP_CONCAT(e.chunk_text, '\n'), '')
            FROM embeddings e
            JOIN analyses a ON a.id = e.analysis_id
            WHERE a.user_id = :uid
        """)
    else:
        query = text("""
            SELECT COALESCE(string_agg(c.content, E'\n'), '')
            FROM rag_chunks c
            JOIN rag_documents d ON d.id = c.document_id
            WHERE d.user_id = :uid
        """)
    result = await db.execute(query, {"uid": user_id})
    val = result.scalar()
    return val if val else None


# ── Batch cross-reference across all files (no DB) ─────────────────────


def batch_check_references(
    files: list[tuple[str, str]],  # [(filename, source), ...]
) -> dict:
    """
    Fast in-memory cross-reference across ALL files at once.
    No DB queries, no LLM calls — pure AST + regex.

    Cross-file + intra-file detection:
    - A symbol is unreferenced when it does NOT appear in any other
      file's tokens AND appears only once (its definition) in its own
      source. If the name appears >1 time in the same file, it is
      considered referenced (definition + usage/call/instantiation).

    Returns: { filename: [unreferenced_symbols], ... }
    """
    # Phase 1: extract symbols from every file
    file_symbols: dict = {}  # filename → [(name, type), ...]

    for filename, source in files:
        syms = extract_symbols(source, filename)
        file_symbols[filename] = syms

    # Phase 2: build global token→file index (ONE tokenization pass)
    # token_files[token] = set of file indices containing this token
    token_files: dict = {}
    for idx, (filename, source) in enumerate(files):
        tokens = set(re.findall(r"\w+", source))
        for token in tokens:
            token_files.setdefault(token, set()).add(idx)

    # Phase 3: check each file's symbols cross-file first, then intra-file
    result: dict = {}
    for idx, (filename, source) in enumerate(files):
        syms = file_symbols[filename]
        if not syms:
            result[filename] = build_result([], source, filename)
            continue

        unreferenced = []
        for name, typ in syms:
            # Cross-file check: does this name appear as a token in another file?
            sources = token_files.get(name)
            if sources is not None and (sources - {idx}):
                continue

            # Intra-file check: does this name appear more than once in its own
            # source? The first occurrence is typically the definition; subsequent
            # ones are usage (calls, instantiation, references).
            intra_count = len(re.findall(r"\b" + re.escape(name) + r"\b", source))
            if intra_count > 1:
                continue

            unreferenced.append((name, typ))

        if unreferenced:
            result[filename] = build_result(unreferenced, source, filename)
        else:
            result[filename] = build_result([], source, filename)

    return result


# ── Phase 2: LLM analysis for files with 0 cross-ref hits ─────────────


async def phase2_llm_analysis(filename: str, source: str, candidates: list[dict]) -> dict:
    prompt = get_batch_llm_prompt(source, filename, candidates)
    result, usage = await call_groq_json(prompt=prompt, system=BATCH_LLM_SYSTEM)
    if usage:
        result["_token_usage"] = usage
    return result


# ── Token index builder ──────────────────────────────────────────────


def build_token_index(files: list[tuple[str, str]]) -> dict:
    token_files: dict = {}
    for idx, (filename, source) in enumerate(files):
        tokens = set(re.findall(r"\w+", source))
        for token in tokens:
            token_files.setdefault(token, set()).add(idx)
    return token_files


def build_cross_references(
    files: list[tuple[str, str]],
    token_index: dict | None = None,
) -> dict:
    if token_index is None:
        token_index = build_token_index(files)
    result: dict = {}
    for idx, (filename, source) in enumerate(files):
        syms = extract_symbols(source, filename)
        unreferenced = []
        for name, typ in syms:
            sources = token_index.get(name)
            if sources is not None and (sources - {idx}):
                continue
            intra_count = len(re.findall(r"\b" + re.escape(name) + r"\b", source))
            if intra_count > 1:
                continue
            unreferenced.append((name, typ))
        result[filename] = build_result(unreferenced, source, filename)
    return result


async def cross_reference(
    files: list[tuple[str, str]],
    db=None,
    user_id: int | None = None,
) -> dict:
    all_results: dict = {}
    if db is not None and user_id is not None:
        for filename, source in files:
            syms = extract_symbols(source, filename)
            if syms:
                unreferenced = await check_references(db, user_id, syms, source)
                all_results[filename] = build_result(unreferenced, source, filename)
            else:
                all_results[filename] = build_result([], source, filename)
    else:
        all_results = build_cross_references(files)
    return all_results


# ── Build result for unreferenced symbols ──────────────────────────────


def _category_for_symbol(name: str, definition_type: str) -> str:
    mapping = {
        "function": "unused_function",
        "class": "unused_class",
        "import": "unused_import",
        "variable": "unused_variable",
    }
    return mapping.get(definition_type, "unused_variable")


def _severity_for_type(definition_type: str) -> str:
    mapping = {
        "function": "high",
        "class": "high",
        "import": "medium",
        "variable": "low",
    }
    return mapping.get(definition_type, "medium")


def _find_symbol_in_source(
    source: str,
    filename: str,
    symbol: str,
    tree: ast.AST | None = None,
) -> dict | None:
    lang = detect_language(filename)
    lines = source.splitlines()

    if lang == "python":
        try:
            t = tree if tree is not None else ast.parse(source)
            for node in ast.walk(t):
                name = None
                typ = None
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    name = node.name
                    typ = "function"
                elif isinstance(node, ast.ClassDef):
                    name = node.name
                    typ = "class"
                elif isinstance(node, (ast.Import, ast.ImportFrom)):
                    for alias in node.names:
                        resolved = alias.asname or alias.name.split(".")[0]
                        if resolved == symbol:
                            line_start = getattr(node, "lineno", 1)
                            return {
                                "line_start": line_start,
                                "line_end": line_start,
                                "code_snippet": lines[line_start - 1] if line_start <= len(lines) else "",
                                "type": "import",
                            }
                    continue
                elif isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name) and target.id == symbol:
                            line_start = getattr(node, "lineno", 1)
                            line_end = getattr(node, "end_lineno", line_start)
                            snippet = "\n".join(lines[line_start - 1 : line_end]) if line_start <= len(lines) else ""
                            return {
                                "line_start": line_start,
                                "line_end": line_end,
                                "code_snippet": snippet,
                                "type": "variable",
                            }
                    continue
                elif isinstance(node, ast.AnnAssign):
                    if isinstance(node.target, ast.Name) and node.target.id == symbol:
                        line_start = getattr(node, "lineno", 1)
                        line_end = getattr(node, "end_lineno", line_start)
                        snippet = "\n".join(lines[line_start - 1 : line_end]) if line_start <= len(lines) else ""
                        return {
                            "line_start": line_start,
                            "line_end": line_end,
                            "code_snippet": snippet,
                            "type": "variable",
                        }
                    continue
                else:
                    continue

                if name == symbol:
                    line_start = getattr(node, "lineno", 1)
                    line_end = getattr(node, "end_lineno", line_start)
                    snippet = "\n".join(lines[line_start - 1 : line_end]) if line_start <= len(lines) else ""
                    return {
                        "line_start": line_start,
                        "line_end": line_end,
                        "code_snippet": snippet,
                        "type": typ,
                    }
        except SyntaxError:
            pass

    else:
        patterns = [
            (r"(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(" + re.escape(symbol) + r")\s*\b", "function"),
            (r"(?:^|\n)\s*(?:export\s+)?class\s+(" + re.escape(symbol) + r")\s*\b", "class"),
            (r"(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(" + re.escape(symbol) + r")\s*[=:]", "variable"),
            (r"(?:^|\n)\s*import\s+(?:\s*\{\s*)?(" + re.escape(symbol) + r")\b", "import"),
            (r"(?:^|\n)\s*import\s+\*\s+as\s+(" + re.escape(symbol) + r")\b", "import"),
        ]
        for pattern_str, typ in patterns:
            match = re.search(pattern_str, source)
            if match:
                line_start = source[: match.start()].count("\n") + 1
                snippet = lines[line_start - 1] if line_start <= len(lines) else ""
                return {
                    "line_start": line_start,
                    "line_end": line_start,
                    "code_snippet": snippet,
                    "type": typ,
                }

    return None


def _tree_for_source(source: str, filename: str) -> ast.AST | None:
    """Parse source once, return AST tree. Returns None for non-Python or syntax errors."""
    if detect_language(filename) != "python":
        return None
    try:
        return ast.parse(source)
    except SyntaxError:
        return None


def build_result(unreferenced: list[SymbolInfo], source: str, filename: str) -> dict:
    """Build result from unreferenced symbols. Parses AST once and reuses it."""
    lines = source.splitlines()
    total_lines = len(lines)

    description_map = {
        "function": "Function '{name}' is never called or referenced anywhere in the analyzed codebase.",
        "class": "Class '{name}' is never instantiated or referenced anywhere in the analyzed codebase.",
        "import": "Import '{name}' is never used anywhere in the analyzed codebase.",
        "variable": "Variable '{name}' is never read anywhere in the analyzed codebase.",
    }
    suggestion_map = {
        "function": "Remove the unused function '{name}' and all calls to it.",
        "class": "Remove the unused class '{name}' or add instantiation points.",
        "import": "Remove the unused import '{name}'.",
        "variable": "Remove the unused variable '{name}' or verify it is needed.",
    }

    # Parse AST once, reuse for all symbols in this file
    tree = _tree_for_source(source, filename)

    issues = []
    for name, typ in unreferenced:
        info = _find_symbol_in_source(source, filename, name, tree=tree)
        line_start = info["line_start"] if info else 1
        line_end = info["line_end"] if info else 1
        snippet = info["code_snippet"] if info else ""

        issues.append(
            {
                "id": "",
                "category": _category_for_symbol(name, typ),
                "severity": _severity_for_type(typ),
                "line_start": line_start,
                "line_end": line_end,
                "name": name,
                "description": description_map.get(typ, f"'{name}' is unreferenced in the codebase.").format(name=name),
                "code_snippet": snippet,
                "suggestion": suggestion_map.get(typ, f"Review and remove '{name}'.").format(name=name),
                "confidence": 1.0,
            }
        )

    issues.sort(key=lambda x: x["line_start"])
    for i, issue in enumerate(issues):
        issue["id"] = f"DC{i + 1:03d}"

    total_issues = len(issues)
    severity_counts = {"high": 0, "medium": 0, "low": 0}
    categories = {}
    for issue in issues:
        sev = issue["severity"]
        if sev in severity_counts:
            severity_counts[sev] += 1
        cat = issue["category"]
        categories[cat] = categories.get(cat, 0) + 1

    dead_lines = sum((i["line_end"] - i["line_start"] + 1) for i in issues)
    dead_lines = min(dead_lines, int(total_lines * 0.8))
    dead_pct = round((dead_lines / total_lines) * 100, 1) if total_lines > 0 else 0

    health_score = max(0, 100 - (total_issues * 15)) if total_issues > 0 else 100
    if health_score >= 90:
        overall = "clean"
    elif health_score >= 70:
        overall = "good"
    elif health_score >= 40:
        overall = "needs_attention"
    else:
        overall = "poor"

    refactor_hints = list(set(i["suggestion"] for i in issues))

    return {
        "summary": {
            "total_issues": total_issues,
            "severity_counts": severity_counts,
            "categories": categories,
            "overall_health": overall,
            "health_score": health_score,
        },
        "issues": issues,
        "metrics": {
            "total_lines": total_lines,
            "code_lines": total_lines,
            "comment_lines": 0,
            "blank_lines": 0,
            "dead_lines_estimate": dead_lines,
            "dead_code_percentage": dead_pct,
            "complexity_hint": "low" if total_issues < 3 else "medium",
        },
        "refactor_hints": refactor_hints,
        "_cross_referenced": True,
        "_token_usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
    }

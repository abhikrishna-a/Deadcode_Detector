import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.grok_client import call_groq_json
from app.services.prompts import get_analysis_prompt, get_analysis_system_prompt
from app.services.chunker import detect_language
from app.services.cross_reference import extract_symbols, check_references, build_result

DEAD_CODE_CATEGORIES = [
    "unused_import", "unused_function", "unused_class", "unused_variable",
    "unused_parameter", "unreachable_code", "dead_branch", "redundant_code",
    "commented_code", "obsolete_todo", "shadowed_variable", "duplicate_logic",
    "bare_except", "marker", "empty_function", "py2_print",
]

MAX_TOKENS = 6000
OVERLAP_LINES = 10


def _approx_tokens(text: str) -> int:
    return len(text) // 3


def _needs_chunking(source: str) -> bool:
    return _approx_tokens(source) > MAX_TOKENS


def _chunk_file(source: str):
    lines = source.split("\n")
    chunks = []
    start = 0
    while start < len(lines):
        end = start
        token_count = 0
        while end < len(lines):
            line_tokens = _approx_tokens(lines[end])
            if token_count + line_tokens > MAX_TOKENS and end > start:
                break
            token_count += line_tokens
            end += 1
        if end == start:
            end = start + 1
        chunks.append({
            "content": "\n".join(lines[start:end]),
            "index": len(chunks),
            "line_start": start + 1,
            "line_end": end,
        })
        start = max(start + 1, end - OVERLAP_LINES)
    total = len(chunks)
    for c in chunks:
        c["total"] = total
    return chunks


def _merge_chunk_results(chunk_results: list, source: str) -> dict:
    if not chunk_results:
        return {}
    if len(chunk_results) == 1:
        return chunk_results[0][0]

    all_issues = []
    seen_keys: set = set()
    for analysis, chunk in chunk_results:
        for issue in analysis.get("issues", []):
            key = f"{issue.get('category','')}:{issue.get('line_start',0)}:{issue.get('name','')}"
            if key not in seen_keys:
                seen_keys.add(key)
                issue_copy = issue.copy()
                issue_copy["line_start"] += chunk["line_start"] - 1
                issue_copy["line_end"] += chunk["line_start"] - 1
                all_issues.append(issue_copy)

    all_issues.sort(key=lambda x: x.get("line_start", 0))
    for i, issue in enumerate(all_issues):
        issue["id"] = f"DC{i+1:03d}"

    severity_counts = {"high": 0, "medium": 0, "low": 0}
    categories: dict = {}
    for issue in all_issues:
        sev = issue.get("severity", "low")
        if sev in severity_counts:
            severity_counts[sev] += 1
        cat = issue.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1

    total_lines = len(source.split("\n"))
    last_analysis = chunk_results[-1][0]
    metrics = last_analysis.get("metrics", {}).copy()
    metrics["total_lines"] = total_lines

    dead_lines_raw = sum(
        c[0].get("metrics", {}).get("dead_lines_estimate", 0) for c in chunk_results
    )
    dead_lines = min(dead_lines_raw, int(total_lines * 0.8))
    metrics["dead_lines_estimate"] = dead_lines
    metrics["dead_code_percentage"] = (
        round((dead_lines / total_lines) * 100, 1) if total_lines > 0 else 0
    )

    health_scores = [
        c[0].get("summary", {}).get("health_score", 0)
        for c in chunk_results
        if c[0].get("summary", {}).get("health_score") is not None
    ]
    avg_health = round(sum(health_scores) / len(health_scores)) if health_scores else 0
    if avg_health >= 90:
        overall = "clean"
    elif avg_health >= 70:
        overall = "good"
    elif avg_health >= 40:
        overall = "needs_attention"
    else:
        overall = "poor"

    hints_seen: set = set()
    refactor_hints = []
    for analysis, _ in chunk_results:
        for hint in analysis.get("refactor_hints", []):
            key = hint[:40]
            if key not in hints_seen:
                hints_seen.add(key)
                refactor_hints.append(hint)

    result = {
        "summary": {
            "total_issues": len(all_issues),
            "severity_counts": severity_counts,
            "categories": categories,
            "overall_health": overall,
            "health_score": avg_health,
        },
        "issues": all_issues,
        "metrics": metrics,
        "refactor_hints": refactor_hints,
    }

    total_tok = sum(
        c[0].get("_token_usage", {}).get("total_tokens", 0) for c in chunk_results
    )
    if total_tok:
        result["_token_usage"] = {
            "prompt_tokens": sum(
                c[0].get("_token_usage", {}).get("prompt_tokens", 0) for c in chunk_results
            ),
            "completion_tokens": sum(
                c[0].get("_token_usage", {}).get("completion_tokens", 0) for c in chunk_results
            ),
            "total_tokens": total_tok,
        }
    return result


def _fallback_result(source: str, error: str) -> dict:
    lines = source.count("\n") + 1
    return {
        "summary": {
            "total_issues": 0,
            "severity_counts": {"high": 0, "medium": 0, "low": 0},
            "categories": {c: 0 for c in DEAD_CODE_CATEGORIES},
            "overall_health": "error",
            "health_score": 0,
        },
        "issues": [],
        "metrics": {
            "total_lines": lines, "code_lines": 0, "comment_lines": 0,
            "blank_lines": 0, "dead_lines_estimate": 0,
            "dead_code_percentage": 0.0, "complexity_hint": "unknown",
        },
        "refactor_hints": [],
        "_error": error,
    }


def _ensure_defaults(result: dict, source: str):
    lines = source.count("\n") + 1
    result.setdefault("summary", {
        "total_issues": 0,
        "severity_counts": {"high": 0, "medium": 0, "low": 0},
        "categories": {c: 0 for c in DEAD_CODE_CATEGORIES},
        "overall_health": "clean",
        "health_score": 100,
    })
    result.setdefault("issues", [])
    result.setdefault("metrics", {
        "total_lines": lines, "code_lines": 0, "comment_lines": 0,
        "blank_lines": 0, "dead_lines_estimate": 0,
        "dead_code_percentage": 0.0, "complexity_hint": "low",
    })
    result.setdefault("refactor_hints", [])


async def _analyze_single_chunk(content: str, filename: str) -> dict:
    language = detect_language(filename)
    prompt = get_analysis_prompt(content, filename, language)
    system = get_analysis_system_prompt()
    try:
        result, usage = await call_groq_json(prompt=prompt, system=system)
    except Exception as exc:
        return _fallback_result(content, str(exc))
    if usage:
        result["_token_usage"] = usage
    _ensure_defaults(result, content)
    return result


def _merge_rag_with_llm(rag_result: dict, llm_result: dict) -> dict:
    """Merge RAG cross-reference findings into LLM results, deduping by symbol name."""
    rag_issues = {i.get("name"): i for i in rag_result.get("issues", []) if i.get("name")}
    llm_issues = llm_result.get("issues", [])

    # Keep LLM issues, but remove any that RAG already confirmed as dead (use RAG's version)
    deduped = []
    seen_names = set(rag_issues.keys())
    for issue in llm_issues:
        name = issue.get("name")
        if name and name in rag_issues:
            # RAG version is more reliable — skip the LLM duplicate
            continue
        deduped.append(issue)

    all_issues = list(rag_result.get("issues", [])) + deduped
    all_issues.sort(key=lambda x: x.get("line_start", 0))

    for i, issue in enumerate(all_issues):
        issue["id"] = f"DC{i+1:03d}"

    # Recompute summary
    severity_counts = {"high": 0, "medium": 0, "low": 0}
    categories = {}
    for issue in all_issues:
        sev = issue.get("severity", "low")
        if sev in severity_counts:
            severity_counts[sev] += 1
        cat = issue.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1

    metrics = llm_result.get("metrics", {}).copy()
    metrics["dead_lines_estimate"] = metrics.get("dead_lines_estimate", 0) + rag_result.get("metrics", {}).get("dead_lines_estimate", 0)
    if metrics.get("total_lines", 0) > 0:
        metrics["dead_code_percentage"] = round((metrics["dead_lines_estimate"] / metrics["total_lines"]) * 100, 1)
    else:
        metrics["dead_code_percentage"] = 0.0

    health_scores = [
        rag_result.get("summary", {}).get("health_score", 0),
        llm_result.get("summary", {}).get("health_score", 0),
    ]
    health_scores = [s for s in health_scores if s is not None and s > 0]
    avg_health = round(sum(health_scores) / len(health_scores)) if health_scores else 0
    if avg_health >= 90:
        overall = "clean"
    elif avg_health >= 70:
        overall = "good"
    elif avg_health >= 40:
        overall = "needs_attention"
    else:
        overall = "poor"

    llm_usage = llm_result.get("_token_usage")
    rag_usage = rag_result.get("_token_usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
    token_usage = llm_usage if llm_usage else rag_usage

    return {
        "summary": {
            "total_issues": len(all_issues),
            "severity_counts": severity_counts,
            "categories": categories,
            "overall_health": overall,
            "health_score": avg_health,
        },
        "issues": all_issues,
        "metrics": metrics,
        "refactor_hints": llm_result.get("refactor_hints", []) + rag_result.get("refactor_hints", []),
        "_token_usage": token_usage,
        "_cross_referenced": True,
    }


async def analyze_file(source: str, filename: str, db: AsyncSession | None = None, user_id: int | None = None) -> dict:
    """
    Analyze a source file. Uses RAG cross-reference as a pre-pass:
    each symbol is checked against previously analyzed files.
    Known-dead symbols return instantly; the LLM only processes
    remaining code. Results are merged.
    """
    rag_result = None
    if db is not None and user_id is not None:
        symbols = extract_symbols(source, filename)
        if symbols:
            unreferenced = await check_references(db, user_id, symbols, source)
            if len(unreferenced) == len(symbols):
                return build_result(unreferenced, source, filename)
            if unreferenced:
                # Partial RAG hit — build result for known-dead symbols
                rag_result = build_result(unreferenced, source, filename)

    if not _needs_chunking(source):
        llm_result = await _analyze_single_chunk(source, filename)
    else:
        chunks = _chunk_file(source)
        tasks = [
            _analyze_single_chunk(
                f"[GhostCode chunk {c['index']+1}/{c['total']} "
                f"lines {c['line_start']}-{c['line_end']}]\n{c['content']}",
                filename,
            )
            for c in chunks
        ]
        chunk_analyses = await asyncio.gather(*tasks)
        chunk_results = list(zip(chunk_analyses, chunks))
        llm_result = _merge_chunk_results(chunk_results, source)

    if rag_result:
        result = _merge_rag_with_llm(rag_result, llm_result)
    else:
        result = llm_result

    total = len(result.get("issues", []))
    health = max(0, 100 - (total * 15)) if total > 0 else 100
    if health >= 90:
        overall = "clean"
    elif health >= 70:
        overall = "good"
    elif health >= 40:
        overall = "needs_attention"
    else:
        overall = "poor"
    result.setdefault("summary", {})["health_score"] = health
    result["summary"]["overall_health"] = overall
    result["summary"]["total_issues"] = total

    return result


# Backwards-compatible alias (used by rag/routers/analysis.py)
analyze_code_with_grok = analyze_file

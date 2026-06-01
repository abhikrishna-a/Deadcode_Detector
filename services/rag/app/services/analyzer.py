from app.services.grok_client import call_groq_json
from app.services.prompts import get_analysis_prompt, get_analysis_system_prompt

_DEAD_CODE_CATEGORIES = [
    "unused_import", "unused_function", "unused_class", "unused_variable",
    "unused_parameter", "unreachable_code", "dead_branch", "redundant_code",
    "commented_code", "obsolete_todo", "shadowed_variable", "duplicate_logic",
]


async def analyze_file(
    source: str,
    filename: str,
    language: str,
) -> dict:
    prompt = get_analysis_prompt(source, filename, language)
    system = get_analysis_system_prompt()
    try:
        result = await call_groq_json(prompt=prompt, system=system)
    except Exception as exc:
        return _fallback_result(source, str(exc))
    _ensure_defaults(result, source)
    return result


analyze_code_with_grok = analyze_file


def _fallback_result(source: str, error: str) -> dict:
    lines = source.count("\n") + 1
    return {
        "summary": {
            "total_issues": 0,
            "severity_counts": {"high": 0, "medium": 0, "low": 0},
            "categories": {c: 0 for c in _DEAD_CODE_CATEGORIES},
            "overall_health": "error",
            "health_score": 0,
        },
        "issues": [],
        "metrics": {
            "total_lines": lines, "code_lines": 0, "comment_lines": 0,
            "blank_lines": 0, "dead_lines_estimate": 0, "dead_code_percentage": 0.0,
            "complexity_hint": "unknown",
        },
        "refactor_hints": [],
        "_error": error,
    }


def _ensure_defaults(result: dict, source: str):
    lines = source.count("\n") + 1
    result.setdefault("summary", {
        "total_issues": 0, "severity_counts": {"high": 0, "medium": 0, "low": 0},
        "categories": {c: 0 for c in _DEAD_CODE_CATEGORIES},
        "overall_health": "unknown", "health_score": 0,
    })
    result.setdefault("issues", [])
    result.setdefault("metrics", {
        "total_lines": lines, "code_lines": 0, "comment_lines": 0,
        "blank_lines": 0, "dead_lines_estimate": 0, "dead_code_percentage": 0.0,
        "complexity_hint": "unknown",
    })
    result.setdefault("refactor_hints", [])

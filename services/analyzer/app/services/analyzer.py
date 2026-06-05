from app.services.groq_client import call_groq_json
from app.services.prompts import SYSTEM_PROMPT, build_analysis_prompt
from app.services.chunker import detect_language


def _fallback(source: str, error: str) -> dict:
    total_lines = source.count("\n") + 1
    return {
        "summary": {
            "total_issues": 0,
            "severity_counts": {"high": 0, "medium": 0, "low": 0},
            "categories": {
                "unused_import": 0, "unused_function": 0, "unused_class": 0,
                "unused_variable": 0, "unused_parameter": 0, "unreachable_code": 0,
                "dead_branch": 0, "redundant_code": 0, "commented_code": 0,
                "obsolete_todo": 0, "shadowed_variable": 0, "duplicate_logic": 0,
                "bare_except": 0, "marker": 0, "empty_function": 0, "py2_print": 0,
            },
            "overall_health": "error",
            "health_score": 0,
        },
        "issues": [],
        "metrics": {
            "total_lines": total_lines,
            "code_lines": 0,
            "comment_lines": 0,
            "blank_lines": 0,
            "dead_lines_estimate": 0,
            "dead_code_percentage": 0.0,
            "complexity_hint": "unknown",
        },
        "refactor_hints": [],
        "_error": error,
    }


def _apply_defaults(result: dict, source: str) -> None:
    defaults = {
        "summary": {
            "total_issues": 0,
            "severity_counts": {"high": 0, "medium": 0, "low": 0},
            "categories": {
                "unused_import": 0, "unused_function": 0, "unused_class": 0,
                "unused_variable": 0, "unused_parameter": 0, "unreachable_code": 0,
                "dead_branch": 0, "redundant_code": 0, "commented_code": 0,
                "obsolete_todo": 0, "shadowed_variable": 0, "duplicate_logic": 0,
                "bare_except": 0, "marker": 0, "empty_function": 0, "py2_print": 0,
            },
            "overall_health": "clean",
            "health_score": 100,
        },
        "issues": [],
        "metrics": {
            "total_lines": source.count("\n") + 1,
            "code_lines": 0,
            "comment_lines": 0,
            "blank_lines": 0,
            "dead_lines_estimate": 0,
            "dead_code_percentage": 0.0,
            "complexity_hint": "low",
        },
        "refactor_hints": [],
    }
    for key, value in defaults.items():
        if key not in result or result[key] is None:
            result[key] = value
        elif isinstance(value, dict) and isinstance(result[key], dict):
            for sub_key, sub_value in value.items():
                if sub_key not in result[key] or result[key][sub_key] is None:
                    result[key][sub_key] = sub_value


async def analyze_file(source: str, filename: str) -> dict:
    language = detect_language(filename)
    prompt = build_analysis_prompt(source, filename, language)
    try:
        result, usage = await call_groq_json(prompt=prompt, system=SYSTEM_PROMPT)
    except Exception as exc:
        return _fallback(source, str(exc))
    if usage:
        result["_token_usage"] = usage
    _apply_defaults(result, source)
    return result

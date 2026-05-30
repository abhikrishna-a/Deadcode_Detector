from app.services.grok_client import call_groq_json
from app.services.prompts import get_analysis_prompt, get_analysis_system_prompt


async def analyze_file(
    source: str,
    filename: str,
    language: str,
) -> dict:
    """
    Analyze a single file using raw source code + Groq.
    Returns structured JSON with dead code findings.
    """
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
            "severity_counts": {},
            "categories": {},
            "overall_health": "error",
        },
        "issues": [],
        "metrics": {
            "total_lines": lines,
            "dead_lines_estimate": 0,
            "dead_code_percentage": 0.0,
        },
        "error": error,
    }


def _ensure_defaults(result: dict, source: str):
    lines = source.count("\n") + 1
    result.setdefault("summary", {"total_issues": 0, "severity_counts": {}, "categories": {}, "overall_health": "unknown"})
    result.setdefault("issues", [])
    result.setdefault("metrics", {"total_lines": lines, "dead_lines_estimate": 0, "dead_code_percentage": 0.0})

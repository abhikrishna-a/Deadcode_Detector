DEAD_CODE_CATEGORIES = [
    "unused_import", "unused_function", "unused_class", "unused_variable",
    "unused_parameter", "unreachable_code", "dead_branch", "redundant_code",
    "commented_code", "obsolete_todo", "shadowed_variable", "duplicate_logic",
    "bare_except", "marker", "empty_function", "py2_print",
]

SYSTEM_PROMPT = """You are GhostCode Analyzer — a senior static-analysis engine \
specialized in dead code detection, code quality assessment, and actionable \
refactoring guidance.

## Core Mission
Inspect the raw source file and emit a single, production-grade JSON report \
that a CI pipeline or developer IDE can consume directly without post-processing.

## Analysis Principles
1. **Whole-file reasoning**: Consider the complete file before flagging anything.
   Cross-function and cross-class references inside the file count as usage.
2. **Conservative flagging**: Only report an issue when you have strong textual
   evidence it is dead or redundant. A false positive that deletes working code
   is worse than a missed finding.
3. **Framework & language awareness — NEVER flag**:
   - Framework entry-points and lifecycle hooks (componentDidMount, setUp, tearDown)
   - Decorators and decorator targets (@app.route, @pytest.fixture, @property)
   - Dependency injection targets and factory methods
   - Exported symbols (export keyword, __all__ lists, module.exports)
   - Public API methods in classes that extend/implement external interfaces
   - __init__, __str__, __repr__, __enter__, __exit__ and all dunder methods
   - Symbols referenced via getattr(), globals(), locals(), or string-based dispatch
   - Test fixtures, conftest.py definitions, and anything prefixed test_ / Test
4. **Exact line numbers**: Copy line numbers directly from the numbered source.
5. **Crisp descriptions**: One sentence. Action-oriented. State WHY it is dead.
6. **Safe removals only**: Set safe_to_remove: true only when deletion cannot
   alter any observable behavior, including side effects.

## Severity Definitions
| Level  | Criteria                                                                 |
|--------|--------------------------------------------------------------------------|
| high   | Unreachable code, always-false branches, logic defects from dead paths   |
| medium | Clearly unused definitions/imports/variables with high-confidence evidence|
| low    | Minor redundancy, style-level issues, weak-evidence cleanup candidates   |

## Confidence Score Guide
- 0.95\u20131.0 : Textual proof \u2014 symbol defined and provably never referenced
- 0.75\u20130.94: Strong evidence \u2014 no visible usage, low reflection/dynamic risk
- 0.50\u20130.74: Moderate evidence \u2014 possibly used outside visible scope
- Below 0.50: Do NOT report

## Health Score Rubric
- 90\u2013100 \u2192 "clean"
- 70\u201389  \u2192 "good"
- 40\u201369  \u2192 "needs_attention"
- 0\u201339   \u2192 "poor"
base_score = 100 - (dead_lines_estimate / total_lines * 100)
Deduct 5 pts per high issue, 2 pts per medium, 0.5 pts per low. Floor 0, ceil 100.

## Output Contract
- Return ONLY the raw JSON object. No markdown fences, no preamble, no commentary.
- All string values must be properly escaped (no unescaped quotes or newlines).
- code_snippet must use \\n for newlines, never literal line breaks.
- Issue IDs: unique zero-padded "DC001", "DC002", \u2026
- Every field in the schema is required.
"""


def get_analysis_system_prompt() -> str:
    return SYSTEM_PROMPT


def get_analysis_prompt(source: str, filename: str, language: str) -> str:
    total_lines = source.count("\n") + 1
    cats = ", ".join(DEAD_CODE_CATEGORIES)
    numbered = "\n".join(
        f"{i+1:>4}  {line}" for i, line in enumerate(source.splitlines())
    )
    return f"""Analyze the source file below for dead code and return a JSON report.

## File Metadata
- filename   : {filename}
- language   : {language}
- total_lines: {total_lines}
- categories : {cats}

## Required JSON Schema
{{
  "summary": {{
    "total_issues": <int>,
    "severity_counts": {{"high": <int>, "medium": <int>, "low": <int>}},
    "categories": {{
      "unused_import": <int>, "unused_function": <int>, "unused_class": <int>,
      "unused_variable": <int>, "unused_parameter": <int>, "unreachable_code": <int>,
      "dead_branch": <int>, "redundant_code": <int>, "commented_code": <int>,
      "obsolete_todo": <int>, "shadowed_variable": <int>, "duplicate_logic": <int>,
      "bare_except": <int>, "marker": <int>, "empty_function": <int>, "py2_print": <int>
    }},
    "overall_health": "clean|good|needs_attention|poor",
    "health_score": <int 0-100>
  }},
  "issues": [
    {{
      "id": "DC001",
      "category": "<one of 16 categories>",
      "severity": "high|medium|low",
      "line_start": <int>,
      "line_end": <int>,
      "name": "<symbol or null>",
      "description": "<one sentence: why this is dead>",
      "code_snippet": "<1-3 lines; \\n for newlines>",
      "suggestion": "<concrete safe action>",
      "safe_to_remove": <true|false>,
      "confidence": <float 0.50-1.0>
    }}
  ],
  "metrics": {{
    "total_lines": {total_lines},
    "code_lines": <int>,
    "comment_lines": <int>,
    "blank_lines": <int>,
    "dead_lines_estimate": <int>,
    "dead_code_percentage": <float>,
    "complexity_hint": "low|medium|high"
  }},
  "refactor_hints": ["<actionable suggestion if total_issues > 3, else empty array>"]
}}

## Source Code (line numbers prepended)
```{language}
{numbered}
```
"""


# Keep backwards-compatible alias used by rag/services/analyzer.py
def build_analysis_prompt(source: str, filename: str, language: str) -> str:
    return get_analysis_prompt(source, filename, language)

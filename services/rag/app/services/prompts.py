ANALYSIS_CATEGORIES = [
    "unused_import", "unused_function", "unused_class", "unused_variable",
    "unused_parameter", "unreachable_code", "dead_branch", "redundant_code",
    "commented_code", "obsolete_todo", "shadowed_variable", "duplicate_logic",
]


def get_analysis_system_prompt() -> str:
    return """You are GhostCode Analyzer — a senior static-analysis engine specialized in \
dead code detection, code quality assessment, and actionable refactoring guidance.

## Core Mission
Inspect the raw source file and emit a single, production-grade JSON report \
that a CI pipeline or developer IDE can consume directly without post-processing.

## Analysis Principles
1. Whole-file reasoning: Consider the complete file before flagging anything.
2. Conservative flagging: False positives are worse than missed findings.
3. Framework & language awareness — NEVER flag:
   - Framework entry-points, lifecycle hooks, decorators, route handlers
   - Exported symbols (export keyword, __all__, module.exports)
   - __init__, __str__, __repr__, dunder methods
   - Symbols via getattr/globals/locals/string dispatch
   - Test fixtures, conftest.py, anything prefixed test_/Test
4. Exact line numbers: copy from numbered source only.
5. Crisp descriptions: one sentence, state WHY it is dead.
6. safe_to_remove: true only when deletion cannot change observable behavior.

## Severity Definitions
high   — Unreachable code, always-false branches, logic defects
medium — Clearly unused definitions/imports/variables
low    — Minor redundancy, weak-evidence cleanup

## Confidence Score Guide
0.95–1.0 : Textual proof
0.75–0.94: Strong evidence
0.50–0.74: Moderate evidence
Below 0.50: Do NOT report

## Health Score Rubric
90–100 → clean | 70–89 → good | 40–69 → needs_attention | 0–39 → poor
base_score = 100 - (dead_lines_estimate / total_lines * 100)
Deduct 5 pts/high, 2 pts/medium, 0.5 pts/low. Floor 0, ceil 100.

## Output Contract
- Return ONLY the raw JSON object. No markdown, no commentary.
- code_snippet: use \\n for newlines, never literal line breaks.
- Issue IDs: unique zero-padded "DC001", "DC002", …
- Every field in the schema is required.
"""


def get_analysis_prompt(source: str, filename: str, language: str) -> str:
    total_lines = source.count("\n") + 1
    numbered = "\n".join(f"{i+1:>4}  {line}" for i, line in enumerate(source.splitlines()))
    cats = ", ".join(ANALYSIS_CATEGORIES)
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
      "obsolete_todo": <int>, "shadowed_variable": <int>, "duplicate_logic": <int>
    }},
    "overall_health": "clean|good|needs_attention|poor",
    "health_score": <int 0-100>
  }},
  "issues": [
    {{
      "id": "DC001",
      "category": "<one of 12 categories>",
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
  "refactor_hints": ["<actionable file-level suggestion if total_issues > 3>"]
}}

## Source Code (line numbers prepended)
```{language}
{numbered}
```
"""

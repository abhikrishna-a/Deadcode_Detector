DEAD_CODE_CATEGORIES = [
    "unused_import",
    "unused_function",
    "unused_class",
    "unused_variable",
    "unused_parameter",
    "unreachable_code",
    "dead_branch",
    "redundant_code",
    "commented_code",
    "obsolete_todo",
    "shadowed_variable",
    "duplicate_logic",
]

SYSTEM_PROMPT = """You are GhostCode Analyzer — a senior static-analysis engine specialized in \
dead code detection, code quality assessment, and actionable refactoring guidance.

## Core Mission
Inspect the raw source file and emit a single, production-grade JSON report that \
a CI pipeline or developer IDE could consume directly.

## Analysis Principles
1. **Whole-file reasoning**: Consider the complete file before flagging anything. \
Cross-function and cross-class references inside the file count as usage.
2. **Conservative flagging**: False positives are worse than missed findings. \
Only report an issue when you have strong textual evidence it is dead or redundant.
3. **Framework awareness**: Never flag framework entry-points, lifecycle hooks, \
decorators, route handlers, dependency injection targets, test fixtures, \
exported public APIs, or symbols that are likely called via reflection/dynamic dispatch.
4. **Exact line numbers**: Use the line numbers as they appear in the raw source. \
Never invent or estimate line numbers.
5. **Crisp descriptions**: One sentence. Action-oriented. No filler.
6. **Safe removals only**: `safe_to_remove: true` only when removal cannot change \
intended observable behavior.

## Severity Scale
| Level  | Meaning |
|--------|---------|
| high   | Unreachable code, logic defects from dead branches, clearly broken dead code |
| medium | Clearly unused definitions, imports, or variables with solid evidence |
| low    | Minor redundancy, weak-evidence cleanup, style-level dead code |

## Output Contract
- Return **valid JSON only** — no markdown, no commentary outside the JSON.
- Always include `summary`, `issues`, and `metrics`.
- If no issues found: empty `issues` array, `total_issues: 0`.
- Issue IDs must be unique strings in the format `"DC001"`, `"DC002"`, etc.
"""


def build_analysis_prompt(source: str, filename: str, language: str) -> str:
    total_lines = source.count("\n") + 1
    cats = ", ".join(DEAD_CODE_CATEGORIES)
    return f"""Analyze the source file below and return a dead-code report.

## File Metadata
- filename: {filename}
- language: {language}
- total_lines: {total_lines}
- detectable categories: {cats}

## Detection Checklist
1. unused_import        — imported symbol never referenced after import line
2. unused_function      — function/method defined but never called in this file
3. unused_class         — class defined but never instantiated or subclassed here
4. unused_variable      — variable assigned but never read
5. unused_parameter     — function parameter never used inside the function body
6. unreachable_code     — code after return/raise/break/continue; always-false branches
7. dead_branch          — if/else branch provably never taken (e.g. `if False`, `if 1 == 2`)
8. redundant_code       — duplicate assignments, no-op operations, self-assignments
9. commented_code       — large commented-out code blocks (not documentation)
10. obsolete_todo       — TODO/FIXME comments referencing removed code or resolved issues
11. shadowed_variable   — inner scope variable shadows outer without using the outer
12. duplicate_logic     — two or more code blocks that perform identical operations

## Required JSON Shape
{{
  "summary": {{
    "total_issues": 0,
    "severity_counts": {{"high": 0, "medium": 0, "low": 0}},
    "categories": {{
      "unused_import": 0, "unused_function": 0, "unused_class": 0,
      "unused_variable": 0, "unused_parameter": 0, "unreachable_code": 0,
      "dead_branch": 0, "redundant_code": 0, "commented_code": 0,
      "obsolete_todo": 0, "shadowed_variable": 0, "duplicate_logic": 0
    }},
    "overall_health": "clean|good|needs_attention|poor",
    "health_score": 0
  }},
  "issues": [
    {{
      "id": "DC001",
      "category": "unused_function",
      "severity": "high|medium|low",
      "line_start": 1,
      "line_end": 10,
      "name": "symbol_name_or_null",
      "description": "One concise sentence explaining exactly why this is dead.",
      "code_snippet": "Exact 1-3 line excerpt copied from source.",
      "suggestion": "Concrete, safe, specific action to resolve this.",
      "safe_to_remove": true,
      "confidence": 0.95
    }}
  ],
  "metrics": {{
    "total_lines": {total_lines},
    "code_lines": 0,
    "comment_lines": 0,
    "blank_lines": 0,
    "dead_lines_estimate": 0,
    "dead_code_percentage": 0.0,
    "complexity_hint": "low|medium|high"
  }},
  "refactor_hints": [
    "Optional high-level refactoring suggestion for the file as a whole."
  ]
}}

## Source Code
```{language}
{source}
```
"""

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
   Never infer, estimate, or adjust line numbers.
5. **Crisp descriptions**: One sentence. Action-oriented. State WHY it is dead,
   not just WHAT it is.
6. **Safe removals only**: Set safe_to_remove: true only when deletion cannot
   alter any observable behavior, including side effects.

## Severity Definitions
| Level  | Criteria                                                                 |
|--------|--------------------------------------------------------------------------|
| high   | Unreachable code, always-false branches, logic defects from dead paths   |
| medium | Clearly unused definitions/imports/variables with high-confidence evidence|
| low    | Minor redundancy, style-level issues, weak-evidence cleanup candidates   |

## Confidence Score Guide
Assign confidence as a float from 0.0 to 1.0:
- 0.95–1.0 : Textual proof — symbol defined and provably never referenced
- 0.75–0.94: Strong evidence — no visible usage, low reflection/dynamic risk
- 0.50–0.74: Moderate evidence — possibly used outside visible scope
- Below 0.50: Do NOT report — insufficient evidence

## Health Score Rubric
Compute health_score (0–100) and overall_health as follows:
- 90–100 → "clean"         (0–1 low-severity issues)
- 70–89  → "good"          (a few low/medium issues, no high)
- 40–69  → "needs_attention"(multiple medium or any high issues)
- 0–39   → "poor"          (many high/medium issues, high dead_code_percentage)

dead_code_percentage heavily influences the score:
  base_score = 100 - (dead_lines_estimate / total_lines * 100)
  Deduct 5 pts per high issue, 2 pts per medium, 0.5 pts per low.
  Floor at 0, ceil at 100.

## Output Contract
- Return ONLY the raw JSON object. No markdown fences, no preamble, no commentary.
- The response must be directly parseable by JSON.parse() or json.loads().
- All string values must be properly escaped (no unescaped quotes or newlines).
- code_snippet must use \\n for newlines, never literal line breaks inside the string.
- If no issues found: return empty issues array with total_issues: 0.
- Issue IDs must be unique, zero-padded: "DC001", "DC002", … "DC099", "DC100".
- Every field in the schema is required. Use null only where explicitly noted.
"""


def build_analysis_prompt(source: str, filename: str, language: str) -> str:
    total_lines = source.count("\n") + 1
    cats = ", ".join(DEAD_CODE_CATEGORIES)

    # Number the source lines so the model can cite exact line numbers
    numbered_source = "\n".join(
        f"{i+1:>4}  {line}" for i, line in enumerate(source.splitlines())
    )

    return f"""Analyze the source file below for dead code and return a report.

## File Metadata
- filename   : {filename}
- language   : {language}
- total_lines: {total_lines}
- categories : {cats}

## Detection Checklist
Work through each category in order. For each one, scan the entire file before
moving to the next. Cross-reference every definition against every usage site.

1. unused_import      — Imported symbol never referenced after its import line.
2. unused_function    — Function/method defined but never called within this file
                        and not exported or decorated as an entry-point.
3. unused_class       — Class defined but never instantiated, subclassed, or
                        used as a type annotation in this file; not exported.
4. unused_variable    — Variable assigned but its value never subsequently read.
5. unused_parameter   — Parameter never referenced inside the function body.
                        Skip *args/**kwargs, and params in abstract/interface methods.
6. unreachable_code   — Code following a return/raise/break/continue with no
                        intervening label or conditional that could reach it.
7. dead_branch        — Conditional branch provably never taken:
                        `if False`, `if 0`, `if 1 == 2`, `while False`, etc.
8. redundant_code     — Duplicate assignments to same variable, no-op operations,
                        x = x self-assignments, double negations.
9. commented_code     — Blocks of commented-out executable code (≥3 lines).
                        Ignore single-line explanatory comments and docstrings.
10. obsolete_todo     — TODO/FIXME/HACK comments referencing code that no longer
                        exists or issues that appear already resolved in the file.
11. shadowed_variable — Inner scope variable shadows an outer-scope variable of
                        the same name without ever reading the outer value.
12. duplicate_logic   — Two or more distinct code blocks performing identical
                        computations or sequences of operations.

## Concrete Example (abbreviated)
Input snippet (lines 12–15):
  12  import os
  13  import sys
  14
  15  print(sys.argv)

Expected issue entry:
{{
  "id": "DC001",
  "category": "unused_import",
  "severity": "medium",
  "line_start": 12,
  "line_end": 12,
  "name": "os",
  "description": "'os' is imported on line 12 but never referenced in the file.",
  "code_snippet": "import os",
  "suggestion": "Remove the 'import os' statement.",
  "safe_to_remove": true,
  "confidence": 0.98
}}

## Required JSON Schema
{{
  "summary": {{
    "total_issues": <int>,
    "severity_counts": {{"high": <int>, "medium": <int>, "low": <int>}},
    "categories": {{
      "unused_import": <int>, "unused_function": <int>, "unused_class": <int>,
      "unused_variable": <int>, "unused_parameter": <int>,
      "unreachable_code": <int>, "dead_branch": <int>, "redundant_code": <int>,
      "commented_code": <int>, "obsolete_todo": <int>,
      "shadowed_variable": <int>, "duplicate_logic": <int>
    }},
    "overall_health": "clean|good|needs_attention|poor",
    "health_score": <int 0-100>
  }},
  "issues": [
    {{
      "id": "DC001",
      "category": "<one of the 12 categories>",
      "severity": "high|medium|low",
      "line_start": <int>,
      "line_end": <int>,
      "name": "<symbol name or null>",
      "description": "<one sentence: why this is dead>",
      "code_snippet": "<exact 1–3 line excerpt; \\n for newlines>",
      "suggestion": "<concrete safe action to resolve>",
      "safe_to_remove": <true|false>,
      "confidence": <float 0.50–1.0>
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
  "refactor_hints": [
    "<Specific, actionable file-level refactoring suggestion — include at least one if total_issues > 3, otherwise empty array>"
  ]
}}

## Source Code (line numbers prepended)
```{language}
{numbered_source}
```
"""
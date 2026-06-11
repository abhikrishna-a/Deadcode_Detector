DEAD_CODE_CATEGORIES = [
    "unused_import", "unused_function", "unused_class", "unused_variable",
    "unused_parameter", "unreachable_code", "dead_branch", "redundant_code",
    "commented_code", "obsolete_todo", "shadowed_variable", "duplicate_logic",
    "bare_except", "marker", "empty_function", "py2_print",
]

SYSTEM_PROMPT = """You are GhostCode Analyzer — a senior static-analysis engine \
for dead code detection.

## Principles
1. **Whole-file reasoning**: Cross-function/class refs inside file count as usage.
2. **Conservative**: Only flag when there is strong textual evidence.
3. **NEVER flag**: framework hooks, decorators, dunders, exported symbols,
   public API methods, test fixtures, conftest, string-dispatch targets.
4. **Exact line numbers**: Use line numbers from the numbered source.
5. **Crisp descriptions**: One sentence, WHY it is dead.

## Severity
- high: unreachable code, always-false branches
- medium: clearly unused definitions/imports/variables
- low: minor redundancy, cleanup candidates

## Health Score
base = 100 - (dead_lines / total_lines * 100); deduct 5/high, 2/med, 0.5/low.
90-100=clean, 70-89=good, 40-69=needs_attention, 0-39=poor.

## Output Contract
- Return ONLY the JSON. No markdown, no preamble.
- code_snippet: \\n for newlines.
- Issue IDs: "DC001", "DC002" etc.
"""


def get_analysis_system_prompt() -> str:
    return SYSTEM_PROMPT


def get_analysis_prompt(source: str, filename: str, language: str) -> str:
    total_lines = source.count("\n") + 1
    numbered = "\n".join(
        f"{i+1} {line}" for i, line in enumerate(source.splitlines())
    )
    return f"""Analyze this file for dead code. Return JSON.

## File
{filename}  {language}  {total_lines} lines

## Source (numbered)
```{language}
{numbered}
```
"""


# Keep backwards-compatible alias used by rag/services/analyzer.py
def build_analysis_prompt(source: str, filename: str, language: str) -> str:
    return get_analysis_prompt(source, filename, language)

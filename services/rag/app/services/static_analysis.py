import ast
import re

from app.services.chunker import detect_language


def static_analysis(source: str, filename: str) -> list[dict]:
    lang = detect_language(filename)
    issues: list[dict] = []
    issues.extend(_check_unreachable_code(source, filename, lang))
    issues.extend(_check_dead_branches(source, filename, lang))
    issues.extend(_check_empty_functions(source, filename, lang))
    issues.extend(_check_bare_except(source, filename, lang))
    issues.extend(_check_shadowed_variables(source, filename, lang))
    issues.extend(_check_commented_code(source, filename, lang))
    issues.extend(_check_obsolete_todo(source, filename, lang))
    issues.extend(_check_unused_parameters(source, filename, lang))
    issues.extend(_check_markers(source, filename, lang))
    issues.extend(_check_duplicate_logic(source, filename, lang))
    issues.extend(_check_py2_print(source, filename, lang))
    return issues


def merge_static_into_result(result: dict, static_issues: list[dict]) -> dict:
    if not static_issues:
        return result

    existing = result.get("issues", [])
    seen = {(i.get("category", ""), i.get("line_start", 0), i.get("name", "")) for i in existing}
    for si in static_issues:
        key = (si.get("category", ""), si.get("line_start", 0), si.get("name", ""))
        if key not in seen:
            seen.add(key)
            existing.append(si)

    existing.sort(key=lambda x: x.get("line_start", 0))
    for i, issue in enumerate(existing):
        issue["id"] = f"DC{i+1:03d}"

    total_issues = len(existing)
    severity_counts = {"high": 0, "medium": 0, "low": 0}
    categories: dict = {}
    for issue in existing:
        sev = issue.get("severity", "low")
        if sev in severity_counts:
            severity_counts[sev] += 1
        cat = issue.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1

    source = result.get("_source", "")
    if not source:
        source = result.get("source", "")
    total_lines = len(source.splitlines()) if source else result.get("metrics", {}).get("total_lines", 0)

    dead_lines = sum((i.get("line_end", i.get("line_start", 1)) - i.get("line_start", 1) + 1) for i in existing)
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

    refactor_hints = list(set(i.get("suggestion", "") for i in existing if i.get("suggestion")))

    result["summary"] = {
        "total_issues": total_issues,
        "severity_counts": severity_counts,
        "categories": categories,
        "overall_health": overall,
        "health_score": health_score,
    }
    result["issues"] = existing
    result["metrics"]["dead_lines_estimate"] = dead_lines
    result["metrics"]["dead_code_percentage"] = dead_pct
    result["refactor_hints"] = refactor_hints
    return result


# ── Python helpers ─────────────────────────────────────────────────

def _is_empty_body(body: list) -> bool:
    if not body:
        return True
    if len(body) == 1:
        stmt = body[0]
        if isinstance(stmt, ast.Pass):
            return True
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and stmt.value.value is Ellipsis:
            return True
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str):
            return _is_empty_body([])
    if len(body) == 2:
        if isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
            return _is_empty_body(body[1:])
    return False


def _node_text(lines: list[str], node: ast.AST) -> str:
    start = getattr(node, "lineno", 1) - 1
    end = getattr(node, "end_lineno", start + 1)
    return "\n".join(lines[start:end])


def _normalize_body(body_text: str) -> str:
    return re.sub(r'\s+', '', body_text)


# ── 1. Unreachable code ──────────────────────────────────────────

def _check_unreachable_code(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    lines = source.splitlines()
    if lang == "python":
        try:
            tree = ast.parse(source)
            for node in ast.walk(tree):
                for attr in ("body", "orelse", "finalbody"):
                    body = getattr(node, attr, None)
                    if not body:
                        continue
                    for i, stmt in enumerate(body):
                        if i + 1 >= len(body):
                            continue
                        is_jump = isinstance(stmt, (ast.Return, ast.Raise, ast.Break, ast.Continue))
                        if not is_jump:
                            continue
                        next_stmt = body[i + 1]
                        next_text = _node_text(lines, next_stmt).strip()
                        if not next_text:
                            continue
                        jump_type = "return" if isinstance(stmt, ast.Return) else \
                                    "raise" if isinstance(stmt, ast.Raise) else \
                                    "break" if isinstance(stmt, ast.Break) else "continue"
                        issues.append(_make_issue(
                            category="unreachable_code",
                            name=f"after_{jump_type}",
                            line_start=getattr(next_stmt, "lineno", 1),
                            line_end=getattr(next_stmt, "end_lineno", getattr(next_stmt, "lineno", 1)),
                            snippet=next_text[:200],
                            severity="high",
                            description=f"Code after '{jump_type}' statement is unreachable.",
                            suggestion=f"Remove the unreachable code after '{jump_type}'.",
                        ))
        except SyntaxError:
            pass
    return issues


# ── 2. Dead branches ─────────────────────────────────────────────

def _is_falsy_constant(node: ast.AST) -> bool:
    if isinstance(node, ast.Constant):
        val = node.value
        if val is False or val is None or val == 0 or val == 0.0 or val == "":
            return True
    return False


def _is_truthy_constant(node: ast.AST) -> bool:
    if isinstance(node, ast.Constant):
        val = node.value
        if val is True or val == 1:
            return True
    return False


def _condition_text(node: ast.AST) -> str:
    if isinstance(node, ast.Constant):
        return repr(node.value)
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return f"not {_condition_text(node.operand)}"
    return "constant_condition"


def _check_dead_branches(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    lines = source.splitlines()
    if lang == "python":
        try:
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, ast.If):
                    cond = node.test
                    if _is_falsy_constant(cond):
                        cond_str = _condition_text(cond)
                        s = _node_text(lines, node).strip()
                        issues.append(_make_issue(
                            category="dead_branch",
                            name=f"if {cond_str}",
                            line_start=getattr(node, "lineno", 1),
                            line_end=getattr(node, "end_lineno", getattr(node, "lineno", 1)),
                            snippet=s[:200],
                            severity="medium",
                            description=f"Condition '{cond_str}' is always falsy — the 'if' body never executes.",
                            suggestion="Remove the dead branch or fix the condition.",
                        ))
                    elif _is_truthy_constant(cond) and node.orelse:
                        cond_str = _condition_text(cond)
                        else_start = getattr(node.orelse[0], "lineno", 1) if node.orelse else getattr(node, "lineno", 1)
                        else_end = getattr(node.orelse[-1], "end_lineno", else_start) if node.orelse else else_start
                        issues.append(_make_issue(
                            category="dead_branch",
                            name=f"else (if {cond_str})",
                            line_start=else_start,
                            line_end=else_end,
                            snippet=_node_text(lines, node.orelse[0]).strip()[:200] if node.orelse else "",
                            severity="medium",
                            description=f"Condition '{cond_str}' is always truthy — the 'else' branch never executes.",
                            suggestion="Remove the dead 'else' branch.",
                        ))
                elif isinstance(node, ast.While):
                    cond = node.test
                    if _is_falsy_constant(cond):
                        cond_str = _condition_text(cond)
                        issues.append(_make_issue(
                            category="dead_branch",
                            name=f"while {cond_str}",
                            line_start=getattr(node, "lineno", 1),
                            line_end=getattr(node, "end_lineno", getattr(node, "lineno", 1)),
                            snippet=_node_text(lines, node).strip()[:200],
                            severity="high",
                            description=f"While loop condition '{cond_str}' is always falsy — the loop body never executes.",
                            suggestion="Remove the dead while loop.",
                        ))
        except SyntaxError:
            pass
    elif lang in ("javascript", "typescript"):
        for m in re.finditer(r'(?:^|\n)(\s*)(?:if|while)\s*\(\s*(false|null|undefined|0)\s*\)', source, re.MULTILINE):
            line_no = source[: m.start()].count("\n") + 1
            issues.append(_make_issue(
                category="dead_branch",
                name=m.group(2),
                line_start=line_no,
                line_end=line_no,
                snippet=m.group().strip()[:200],
                severity="medium" if "if" in m.group() else "high",
                description=f"Branch condition '{m.group(2)}' is always falsy — the body never executes.",
                suggestion="Remove the dead branch.",
            ))
        for m in re.finditer(r'(?:^|\n)(\s*)if\s*\(\s*(true|1)\s*\)', source, re.MULTILINE):
            if not m or not m.group():
                continue
            line_no = source[: m.start()].count("\n") + 1
            issues.append(_make_issue(
                category="dead_branch",
                name="else",
                line_start=line_no,
                line_end=line_no,
                snippet=m.group().strip()[:200],
                severity="medium",
                description=f"Condition '{m.group(2)}' is always truthy — the 'else' branch (if any) never executes.",
                suggestion="Remove the dead 'else' branch.",
            ))
    return issues


# ── 3. Empty functions / classes ─────────────────────────────────

def _check_empty_functions(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    lines = source.splitlines()
    if lang == "python":
        try:
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if _is_empty_body(node.body):
                        issues.append(_make_issue(
                            category="empty_function",
                            name=node.name,
                            line_start=getattr(node, "lineno", 1),
                            line_end=getattr(node, "end_lineno", getattr(node, "lineno", 1)),
                            snippet=_node_text(lines, node).strip()[:200],
                            severity="medium",
                            description=f"Function '{node.name}' has an empty body (only pass/.../docstring).",
                            suggestion=f"Implement '{node.name}' or remove it.",
                        ))
                elif isinstance(node, ast.ClassDef):
                    if _is_empty_body(node.body):
                        issues.append(_make_issue(
                            category="empty_function",
                            name=node.name,
                            line_start=getattr(node, "lineno", 1),
                            line_end=getattr(node, "end_lineno", getattr(node, "lineno", 1)),
                            snippet=_node_text(lines, node).strip()[:200],
                            severity="medium",
                            description=f"Class '{node.name}' has an empty body.",
                            suggestion=f"Implement '{node.name}' or remove it.",
                        ))
        except SyntaxError:
            pass
    elif lang in ("javascript", "typescript"):
        for m in re.finditer(
            r'(?:^|\n)\s*(?:(?:export\s+)?(?:async\s+)?function\s+\w+|class\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>)\s*\{\s*\}',
            source
        ):
            line_no = source[: m.start()].count("\n") + 1
            name = m.group().strip()
            issues.append(_make_issue(
                category="empty_function",
                name=name,
                line_start=line_no,
                line_end=line_no,
                snippet=m.group().strip()[:200],
                severity="medium",
                description="Empty function or class body.",
                suggestion="Implement or remove it.",
            ))
    return issues


# ── 4. Bare except ───────────────────────────────────────────────

def _check_bare_except(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    lines = source.splitlines()
    if lang == "python":
        try:
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, ast.ExceptHandler) and node.type is None:
                    start = getattr(node, "lineno", 1)
                    issues.append(_make_issue(
                        category="bare_except",
                        name="except",
                        line_start=start,
                        line_end=start,
                        snippet=lines[start - 1].strip()[:200] if start <= len(lines) else "",
                        severity="medium",
                        description="Bare 'except:' catches all exceptions, including KeyboardInterrupt and SystemExit.",
                        suggestion="Specify an exception type (e.g., 'except Exception:').",
                    ))
        except SyntaxError:
            pass
    return issues


# ── 5. Shadowed variables ────────────────────────────────────────

def _check_shadowed_variables(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    lines = source.splitlines()
    if lang == "python":
        try:
            tree = ast.parse(source)

            def _collect_names(body: list) -> set:
                names = set()
                for stmt in body:
                    if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                        names.add(stmt.name)
                    elif isinstance(stmt, ast.Assign):
                        for t in stmt.targets:
                            if isinstance(t, ast.Name):
                                names.add(t.id)
                    elif isinstance(stmt, ast.AnnAssign):
                        if isinstance(stmt.target, ast.Name):
                            names.add(stmt.target.id)
                    elif isinstance(stmt, ast.For):
                        if isinstance(stmt.target, ast.Name):
                            names.add(stmt.target.id)
                    elif isinstance(stmt, ast.With):
                        for item in stmt.items:
                            if isinstance(item.optional_vars, ast.Name):
                                names.add(item.optional_vars.id)
                    elif isinstance(stmt, ast.Import):
                        for alias in stmt.names:
                            names.add(alias.asname or alias.name.split(".")[0])
                    elif isinstance(stmt, ast.ImportFrom):
                        for alias in stmt.names:
                            names.add(alias.asname or alias.name)
                    elif isinstance(stmt, ast.ExceptHandler):
                        if isinstance(stmt.name, ast.Name):
                            names.add(stmt.name.id)
                return names

            def _walk_scope(body: list, parent_names: set) -> None:
                local_names = _collect_names(body)
                for name in local_names:
                    if name in parent_names and not name.startswith("_"):
                        for stmt in body:
                            n = None
                            if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)) and stmt.name == name:
                                n = stmt
                            elif isinstance(stmt, ast.Assign):
                                for t in stmt.targets:
                                    if isinstance(t, ast.Name) and t.id == name:
                                        n = stmt
                                        break
                            elif isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name) and stmt.target.id == name:
                                n = stmt
                            if n is not None:
                                issues.append(_make_issue(
                                    category="shadowed_variable",
                                    name=name,
                                    line_start=getattr(n, "lineno", 1),
                                    line_end=getattr(n, "end_lineno", getattr(n, "lineno", 1)),
                                    snippet=_node_text(lines, n).strip()[:200] if isinstance(n, ast.AST) else "",
                                    severity="medium",
                                    description=f"Variable '{name}' in the inner scope shadows a variable from an outer scope.",
                                    suggestion=f"Rename the inner '{name}' to avoid shadowing.",
                                ))
                                break
                for stmt in body:
                    if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        _walk_scope(stmt.body, parent_names | local_names)

            _walk_scope(tree.body, set())
        except SyntaxError:
            pass
    elif lang in ("javascript", "typescript"):
        tracked = {}
        for m in re.finditer(r'(?:^|\n)\s*(?:let|var|const)\s+(\w+)', source):
            name = m.group(1)
            line_no = source[: m.start()].count("\n") + 1
            if name in tracked:
                issues.append(_make_issue(
                    category="shadowed_variable",
                    name=name,
                    line_start=line_no,
                    line_end=line_no,
                    snippet=m.group().strip()[:200],
                    severity="medium",
                    description=f"Variable '{name}' shadows a previous declaration.",
                    suggestion=f"Rename the inner '{name}' to avoid shadowing.",
                ))
            tracked[name] = line_no
    return issues


# ── 6. Commented code ────────────────────────────────────────────

_CODE_KEYWORDS = {"def ", "class ", "import ", "from ", "return ", "if ", "for ", "while ", "try:",
                  "except", "with ", "print", "self.", "lambda", "yield ", "async ", "await "}


def _looks_like_code(text: str) -> bool:
    stripped = text.lstrip("#").strip()
    if not stripped:
        return False
    for kw in _CODE_KEYWORDS:
        if stripped.startswith(kw):
            return True
    if re.search(r'[{}()\[\];=]', stripped):
        return True
    return False


def _check_commented_code(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    lines = source.splitlines()
    if not lines:
        return issues

    blocks: list[tuple[int, str]] = []
    current: list[tuple[int, str]] = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("#") and _looks_like_code(stripped):
            current.append((i + 1, stripped))
        else:
            if len(current) >= 3:
                blocks.extend(current)
            current = []
    if len(current) >= 3:
        blocks.extend(current)

    if not blocks:
        return issues

    blocks[0][0]
    prev = blocks[0][0]
    group = [blocks[0]]
    for line_no, text in blocks[1:]:
        if line_no == prev + 1:
            group.append((line_no, text))
        else:
            if len(group) >= 3:
                snippet_lines = [t for _, t in group]
                issues.append(_make_issue(
                    category="commented_code",
                    name="commented_block",
                    line_start=group[0][0],
                    line_end=group[-1][0],
                    snippet="\n".join(snippet_lines)[:200],
                    severity="low",
                    description=f"Block of {len(group)} lines of commented-out code detected.",
                    suggestion="Remove the commented-out code or uncomment if needed.",
                ))
            group = [(line_no, text)]
        prev = line_no
    if len(group) >= 3:
        snippet_lines = [t for _, t in group]
        issues.append(_make_issue(
            category="commented_code",
            name="commented_block",
            line_start=group[0][0],
            line_end=group[-1][0],
            snippet="\n".join(snippet_lines)[:200],
            severity="low",
            description=f"Block of {len(group)} lines of commented-out code detected.",
            suggestion="Remove the commented-out code or uncomment if needed.",
        ))

    return issues


# ── 7. Obsolete TODO ─────────────────────────────────────────────

def _check_obsolete_todo(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    for i, line in enumerate(source.splitlines()):
        m = re.search(r'#.*\b(TODO|FIXME|HACK|XXX)\b', line, re.IGNORECASE)
        if m:
            tag = m.group(1).upper()
            issues.append(_make_issue(
                category="obsolete_todo",
                name=tag,
                line_start=i + 1,
                line_end=i + 1,
                snippet=line.strip()[:200],
                severity="low",
                description=f"'{tag}' marker found in the code.",
                suggestion=f"Review and resolve the '{tag}' item.",
            ))
    return issues


# ── 8. Unused parameters ─────────────────────────────────────────

def _check_unused_parameters(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    lines = source.splitlines()
    if lang == "python":
        try:
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                params: list[str] = []
                args_node = node.args
                for a in args_node.posonlyargs:
                    params.append(a.arg)
                for a in args_node.args:
                    params.append(a.arg)
                for a in args_node.kwonlyargs:
                    params.append(a.arg)
                if args_node.vararg:
                    params.append(args_node.vararg.arg)
                if args_node.kwarg:
                    params.append(args_node.kwarg.arg)

                body_start = node.body[0].lineno if node.body and hasattr(node.body[0], 'lineno') else getattr(node, "lineno", 1)
                body_text = "\n".join(lines[body_start:getattr(node, "end_lineno", getattr(node, "lineno", 1))])
                for param in params:
                    if param in ("self", "cls"):
                        continue
                    count = len(re.findall(r'\b' + re.escape(param) + r'\b', body_text))
                    if count == 0:
                        issues.append(_make_issue(
                            category="unused_parameter",
                            name=param,
                            line_start=node.lineno,
                            line_end=node.end_lineno if hasattr(node, 'end_lineno') and node.end_lineno else node.lineno,
                            snippet=_node_text(lines, node).strip()[:200],
                            severity="medium",
                            description=f"Parameter '{param}' is never used inside the function body.",
                            suggestion=f"Remove '{param}' or prefix it with '_' to indicate it's intentionally unused.",
                        ))
        except SyntaxError:
            pass
    return issues


# ── 9. Markers (debug artifacts) ─────────────────────────────────

def _check_markers(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    lines = source.splitlines()
    for i, line in enumerate(lines):
        stripped = line.strip()

        to_check = [
            (r'\bbreakpoint\s*\(\s*\)', "breakpoint", "high",
             "Breakpoint call left in production code.",
             "Remove the breakpoint() call."),
            (r'\bpdb\s*\.\s*set_trace\s*\(\s*\)', "pdb.set_trace", "high",
             "Debugger breakpoint left in production code.",
             "Remove the pdb.set_trace() call."),
            (r'\bipdb\s*\.\s*set_trace\s*\(\s*\)', "ipdb.set_trace", "high",
             "Debugger breakpoint left in production code.",
             "Remove the ipdb.set_trace() call."),
            (r'\bimport\s+pdb\b', "import pdb", "medium",
             "pdb (debugger) import found. May be a leftover from debugging.",
             "Remove the pdb import if no longer needed."),
        ]

        for pattern, name, severity, desc, suggestion in to_check:
            if re.search(pattern, stripped):
                issues.append(_make_issue(
                    category="marker",
                    name=name,
                    line_start=i + 1,
                    line_end=i + 1,
                    snippet=stripped[:200],
                    severity=severity,
                    description=desc,
                    suggestion=suggestion,
                ))
                break
    return issues


# ── 10. Duplicate logic (AST subtree hashing) ────────────────────

def _check_duplicate_logic(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    lines = source.splitlines()
    if lang == "python":
        try:
            tree = ast.parse(source)
            body_map: dict[str, list[tuple[str, int, int, str]]] = {}
            for node in ast.walk(tree):
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    continue
                if node.body:
                    body_start = node.body[0].lineno
                    body_end = getattr(node, "end_lineno", body_start)
                    body_text = "\n".join(lines[body_start - 1:body_end])
                else:
                    body_text = ""
                norm = _normalize_body(body_text)
                body_map.setdefault(norm, []).append((
                    node.name,
                    node.lineno,
                    getattr(node, "end_lineno", node.lineno),
                    _node_text(lines, node).strip()[:200],
                ))

            for norm, funcs in body_map.items():
                if len(funcs) >= 2 and norm:
                    primary = funcs[0]
                    for secondary in funcs[1:]:
                        issues.append(_make_issue(
                            category="duplicate_logic",
                            name=f"{primary[0]} / {secondary[0]}",
                            line_start=secondary[1],
                            line_end=secondary[2],
                            snippet=secondary[3],
                            severity="medium",
                            description=f"Function/class '{secondary[0]}' is identical to '{primary[0]}' at line {primary[1]}.",
                            suggestion=f"Remove the duplicate '{secondary[0]}' or extract common logic into a shared helper.",
                        ))
        except SyntaxError:
            pass
    elif lang in ("javascript", "typescript"):
        funcs: list[tuple[str, int, int, str]] = []
        for m in re.finditer(
            r'(?:^|\n)\s*(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>\s*\{)',
            source
        ):
            name = m.group(1) or m.group(2)
            if not name:
                continue
            start = source[: m.start()].count("\n") + 1
            brace_start = source.find("{", m.start())
            if brace_start == -1:
                continue
            depth = 0
            end_pos = brace_start
            for pos in range(brace_start, len(source)):
                ch = source[pos]
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end_pos = pos + 1
                        break
            body = source[brace_start:end_pos]
            norm = _normalize_body(body)
            funcs.append((name, start, source[:end_pos].count("\n") + 1, body[:200]))
        body_map2: dict[str, list] = {}
        for name, ln_start, ln_end, snippet in funcs:
            norm = _normalize_body(snippet)
            body_map2.setdefault(norm, []).append((name, ln_start, ln_end, snippet))
        for norm, fn_list in body_map2.items():
            if len(fn_list) >= 2 and norm:
                primary = fn_list[0]
                for secondary in fn_list[1:]:
                    issues.append(_make_issue(
                        category="duplicate_logic",
                        name=f"{primary[0]} / {secondary[0]}",
                        line_start=secondary[1],
                        line_end=secondary[2],
                        snippet=secondary[3],
                        severity="medium",
                        description=f"Function '{secondary[0]}' is identical to '{primary[0]}' at line {primary[1]}.",
                        suggestion=f"Remove the duplicate '{secondary[0]}' or extract common logic.",
                    ))
    return issues


# ── 11. Py2 print ────────────────────────────────────────────────

def _check_py2_print(source: str, filename: str, lang: str) -> list[dict]:
    issues = []
    if lang != "python":
        return issues
    for i, line in enumerate(source.splitlines()):
        m = re.match(r'^\s*print\s+(\w|["\']|True|False|None)', line)
        if m:
            issues.append(_make_issue(
                category="py2_print",
                name="print",
                line_start=i + 1,
                line_end=i + 1,
                snippet=line.strip()[:200],
                severity="medium",
                description="Python 2 style 'print' statement found. Use 'print()' function instead.",
                suggestion="Replace 'print ...' with 'print(...)'.",
            ))
    return issues


# ── Issue builder helper ─────────────────────────────────────────

def _make_issue(
    category: str,
    name: str,
    line_start: int,
    line_end: int,
    snippet: str,
    severity: str,
    description: str,
    suggestion: str,
) -> dict:
    return {
        "id": "",
        "category": category,
        "severity": severity,
        "line_start": line_start,
        "line_end": line_end,
        "name": name,
        "description": description,
        "code_snippet": snippet,
        "suggestion": suggestion,
        "confidence": 1.0,
    }

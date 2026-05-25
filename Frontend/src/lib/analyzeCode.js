export function analyzeCode(text, filename) {
  const lines = text.split(/\r?\n/);
  const totalLines = lines.length;
  const issues = [];

  const imported = new Set();
  const definitions = new Set();
  const screams = new Set();

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) return;

    const imp = trimmed.match(/^import\s+(\w+)/);
    if (imp) imported.add(imp[1]);

    const fr = trimmed.match(/^from\s+(\w+).*import\s+(.+)/);
    if (fr) fr[2].split(',').forEach(n => imported.add(n.trim().split(/\s+as\s+/).pop()));

    const def = trimmed.match(/^def\s+(\w+)/);
    if (def) definitions.add(def[1]);

    const cls = trimmed.match(/^class\s+(\w+)/);
    if (cls) definitions.add(cls[1]);

    const scr = trimmed.match(/^([A-Z][A-Z_0-9]+)\s*=/);
    if (scr) screams.add(scr[1]);
  });

  const allCalls = new Set();
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) return;
    const calls = trimmed.match(/\b(\w+)\s*\(/g);
    if (calls) calls.forEach(c => allCalls.add(c.replace('(', '')));
  });

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) return;

    if (/^except\s*:/i.test(trimmed) || /^except\s+Exception\s*:/i.test(trimmed)) {
      issues.push({ severity: 'warning', type: 'bare_except', message: 'Bare except clause catches all exceptions — consider catching specific exceptions.', line: i + 1 });
    } else if (/^except\s[^:]*$/i.test(trimmed) && i + 1 < lines.length && lines[i + 1].trim() === ':') {
      // multiline except
    } else if (/^except\s/i.test(trimmed) && trimmed.endsWith(':')) {
      const exceptTarget = trimmed.match(/^except\s+(\w+)/);
      if (exceptTarget && !exceptTarget[1].startsWith('(')) {
        // specific except, ok
      }
    }

    if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(trimmed)) {
      issues.push({ severity: 'info', type: 'marker', message: `Code marker found: ${trimmed.slice(0, 60)}`, line: i + 1 });
    }

    if (i < lines.length - 1 && lines[i + 1].trim() === 'pass') {
      const prev = lines[i].trim();
      if (/^def\s/.test(prev) || /^class\s/.test(prev) || /^if\s/.test(prev)) {
        issues.push({ severity: 'warning', type: 'empty_function', message: `Empty block detected: "${prev.slice(0, 40)}" contains only pass.`, line: i + 1 });
      }
    }

    if (/\bprint\s*\(/.test(trimmed) && !trimmed.startsWith('#')) {
      issues.push({ severity: 'info', type: 'py2_print', message: `print() statement — ensure Python 3 compatibility, line: ${i + 1}`, line: i + 1 });
    }
  });

  imported.forEach(name => {
    if (name === 'os' || name === 'sys' || name === 're' || name === 'json' || name === 'math' || name === 'datetime') {
      const used = lines.some((l, j) => j !== 0 && l.includes(`${name}.`));
      if (!used) {
        issues.push({ severity: 'warning', type: 'dead_import', message: `Import "${name}" appears unused in the file.`, line: lines.findIndex(l => l.includes(`import ${name}`)) + 1 || 1 });
      }
    }
  });

  definitions.forEach(name => {
    if (!allCalls.has(name) && name !== 'main' && !name.startsWith('_')) {
      const lineNum = lines.findIndex(l => {
        const t = l.trim();
        return (t.startsWith(`def ${name}`) || t.startsWith(`class ${name}`)) && (t.endsWith(':') || t.includes('('));
      }) + 1;
      issues.push({ severity: 'warning', type: 'unused_function', message: `"${name}" is defined but never called in this file.`, line: lineNum || 1 });
    }
  });

  const summary = {
    total: issues.length,
    dead_import: issues.filter(i => i.type === 'dead_import').length,
    unused_function: issues.filter(i => i.type === 'unused_function').length,
    bare_except: issues.filter(i => i.type === 'bare_except').length,
    marker: issues.filter(i => i.type === 'marker').length,
    empty_function: issues.filter(i => i.type === 'empty_function').length,
    py2_print: issues.filter(i => i.type === 'py2_print').length,
  };

  return { filename, lines: totalLines, issues, summary, raw: text };
}

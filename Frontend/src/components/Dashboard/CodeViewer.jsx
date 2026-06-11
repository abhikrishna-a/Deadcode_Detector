import { useMemo, useState } from 'react';

const SEVERITY_COLORS = {
  high:   { bg: 'rgba(248,113,113,0.12)', gutter: '#f87171', label: 'HIGH' },
  medium: { bg: 'rgba(251,191,36,0.12)',  gutter: '#fbbf24', label: 'MED' },
  low:    { bg: 'rgba(96,165,250,0.12)',  gutter: '#60a5fa', label: 'LOW' },
};

export default function CodeViewer({ source, issues, filename, onSelectIssue }) {
  const [hoveredLine, setHoveredLine] = useState(null);

  const issueMap = useMemo(() => {
    const map = {};
    for (const issue of issues || []) {
      const start = issue.line ?? issue.line_start ?? 1;
      const end = issue.line_end ?? start;
      for (let l = start; l <= end; l++) {
        if (!map[l]) map[l] = [];
        map[l].push(issue);
      }
    }
    return map;
  }, [issues]);

  const lines = useMemo(() => {
    if (!source) return [];
    const raw = source.split('\n');
    // Remove trailing empty line (all files end with \n)
    if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop();
    return raw;
  }, [source]);

  const lineHeight = 20;
  const gutterWidth = 48;
  const totalHeight = Math.max(lines.length * lineHeight, 200);

  const ext = filename?.split('.').pop() || 'py';
  const langColors = { py: '#3572A5', js: '#f7df1e', ts: '#3178c6', jsx: '#61dafb', tsx: '#3178c6', txt: '#78716c', md: '#78716c' };

  if (!source) {
    return (
      <div style={{
        padding: 32, textAlign: 'center', color: '#57534e',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
        border: '1px solid rgba(255,255,255,0.04)', borderRadius: 12,
      }}>
        Source code not available for this file.
      </div>
    );
  }

  return (
    <div style={{
      border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
      overflow: 'hidden', fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: langColors[ext] || '#78716c' }} />
        <span style={{ color: '#a8a29e', fontSize: 11 }}>{filename}</span>
        <span style={{ marginLeft: 'auto', color: '#57534e', fontSize: 10 }}>{lines.length} lines</span>
      </div>

      {/* Code area */}
      <div style={{
        position: 'relative', overflow: 'auto', maxHeight: 'calc(100vh - 500px)',
      }}>
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          const lineIssues = issueMap[lineNum] || [];
          const hasDead = lineIssues.some(i =>
            ['unused_function', 'unused_class', 'unused_import', 'unreachable_code', 'dead_branch', 'duplicate_logic', 'unused_variable', 'unused_parameter'].includes(i.type || i.category)
          );
          const hasWarning = lineIssues.some(i =>
            !['unused_function', 'unused_class', 'unused_import', 'unreachable_code', 'dead_branch', 'duplicate_logic'].includes(i.type || i.category)
          );
          const isHovered = hoveredLine === lineNum;

          let bg = 'transparent';
          let gutterColor = '#44403c';
          if (hasDead) {
            bg = 'rgba(248,113,113,0.06)';
            gutterColor = '#f87171';
          } else if (hasWarning && !hasDead) {
            bg = 'rgba(251,191,36,0.04)';
            gutterColor = '#fbbf24';
          }

          if (isHovered) bg = 'rgba(255,255,255,0.03)';

          return (
            <div
              key={lineNum}
              onClick={() => {
                if (lineIssues.length > 0 && onSelectIssue) {
                  onSelectIssue(lineIssues[0]);
                }
              }}
              onMouseEnter={() => setHoveredLine(lineNum)}
              onMouseLeave={() => setHoveredLine(null)}
              style={{
                display: 'flex', alignItems: 'center', height: lineHeight,
                background: bg, cursor: lineIssues.length > 0 ? 'pointer' : 'default',
                transition: 'background 0.1s',
              }}
            >
              {/* Gutter */}
              <div style={{
                width: gutterWidth, flexShrink: 0, textAlign: 'right',
                paddingRight: 12, color: gutterColor,
                fontSize: 10, userSelect: 'none',
                borderRight: hasDead
                  ? `2px solid ${SEVERITY_COLORS.high.gutter}`
                  : hasWarning
                    ? `2px solid ${SEVERITY_COLORS.medium.gutter}`
                    : '2px solid transparent',
              }}>
                {lineNum}
              </div>

              {/* Code line */}
              <div style={{
                flex: 1, paddingLeft: 12, whiteSpace: 'pre', overflow: 'hidden',
                color: lineIssues.length > 0 ? '#d4d4d4' : '#a8a29e',
              }}>
                {line || ' '}
              </div>

              {/* Issue badges on hover */}
              {isHovered && lineIssues.length > 0 && (
                <div style={{
                  display: 'flex', gap: 4, paddingRight: 8, flexShrink: 0,
                }}>
                  {lineIssues.slice(0, 2).map((iss, i) => {
                    const c = SEVERITY_COLORS[iss.severity] || SEVERITY_COLORS.medium;
                    return (
                      <span key={i} style={{
                        fontSize: 8, color: c.gutter, background: c.bg,
                        borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap',
                      }}>
                        {iss.type || iss.category || ''}
                      </span>
                    );
                  })}
                  {lineIssues.length > 2 && (
                    <span style={{ fontSize: 8, color: '#78716c' }}>+{lineIssues.length - 2}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

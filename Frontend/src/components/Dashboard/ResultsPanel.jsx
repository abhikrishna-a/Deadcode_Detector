import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Editor } from '@monaco-editor/react';
import CodeViewer from './CodeViewer';

const typeColors = {
  unused_import:     { bg: 'rgba(5,150,105,0.08)', border: 'rgba(5,150,105,0.3)',   label: '#34d399', badge: 'DEAD_IMPORT' },
  unused_function:   { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', label: '#f87171', badge: 'UNUSED_FN' },
  unused_class:      { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', label: '#f87171', badge: 'UNUSED_CLASS' },
  unused_variable:   { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.3)',  label: '#fbbf24', badge: 'UNUSED_VAR' },
  unused_parameter:  { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.3)',  label: '#fbbf24', badge: 'UNUSED_PARAM' },
  unreachable_code:  { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', label: '#f87171', badge: 'DEAD_CODE' },
  redundant_code:    { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.3)',  label: '#fbbf24', badge: 'REDUNDANT' },
  dead_branch:       { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', label: '#f87171', badge: 'DEAD_BRANCH' },
  commented_code:    { bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.3)',  label: '#60a5fa', badge: 'COMMENTED' },
  obsolete_todo:     { bg: 'rgba(5,150,105,0.08)', border: 'rgba(5,150,105,0.3)', label: '#34d399', badge: 'OBSOLETE_TODO' },
  shadowed_variable: { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.3)',  label: '#fbbf24', badge: 'SHADOWED' },
  duplicate_logic:   { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', label: '#f87171', badge: 'DUPLICATE' },
  bare_except:       { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.3)',  label: '#fbbf24', badge: 'BARE_EXCEPT' },
  marker:            { bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.3)',  label: '#60a5fa', badge: 'MARKER' },
  empty_function:    { bg: 'rgba(5,150,105,0.08)', border: 'rgba(5,150,105,0.3)', label: '#34d399', badge: 'EMPTY_FN' },
  py2_print:         { bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.3)',  label: '#4ade80', badge: 'PY2_PRINT' },
};

const severityMap = {
  unused_import: 'error',
  unused_function: 'error',
  unused_class: 'error',
  unused_variable: 'warning',
  unused_parameter: 'warning',
  unreachable_code: 'error',
  redundant_code: 'warning',
  dead_branch: 'error',
  commented_code: 'info',
  obsolete_todo: 'info',
  shadowed_variable: 'warning',
  duplicate_logic: 'error',
  bare_except: 'error',
  marker: 'warning',
  empty_function: 'warning',
  py2_print: 'info',
};

function normalizeIssues(issues = []) {
  return issues.map(issue => ({
    ...issue,
    type: issue.type || issue.category || 'unknown',
    message: issue.message || issue.description || '',
    line: issue.line ?? issue.line_start ?? null,
  }));
}

function normalizeSummary(summary = {}) {
  if (summary.total_issues !== undefined) {
    return summary;
  }
  if (summary.overall_health || summary.health_score) {
    return {
      total_issues: 0,
      severity_counts: summary.severity_counts || {},
      categories: summary.categories || {},
      overall_health: summary.overall_health || 'unknown',
      health_score: summary.health_score,
    };
  }
  return {
    total_issues: Object.values(summary).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) || 0,
    severity_counts: {},
    categories: summary,
    overall_health: 'unknown',
    health_score: undefined,
  };
}

export default function ResultsPanel({ results, onClear }) {
  const [filter, setFilter] = useState('all');
  const [expandedIdx, setExpandedIdx] = useState(null);

  const issues = useMemo(() => {
    if (!results) return [];
    return normalizeIssues(results.issues || []);
  }, [results]);

  const summary = useMemo(() => {
    if (!results) return null;
    return normalizeSummary(results.summary || {});
  }, [results]);

  const errorMessage = results?._error;

  const filteredIssues = useMemo(() => {
    if (filter === 'all') return issues;
    return issues.filter(i => (severityMap[i.type] || 'info') === filter);
  }, [issues, filter]);

  const counts = useMemo(() => {
    const c = { all: issues.length, error: 0, warning: 0, info: 0 };
    issues.forEach(i => {
      const s = severityMap[i.type] || 'info';
      c[s] = (c[s] || 0) + 1;
    });
    return c;
  }, [issues]);

  if (!results) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: '#57534e', userSelect: 'none' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ opacity: 0.3, marginBottom: 16 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
        </svg>
        <p style={{ fontSize: 13, color: '#78716c', fontFamily: "'Inter', sans-serif" }}>No results yet — analyze a file to see the report.</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div style={{
        background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
        borderRadius: 16, padding: 24, textAlign: 'center',
      }}>
        <p style={{ fontSize: 14, color: '#f87171', fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>Analysis Failed</p>
        <p style={{ fontSize: 12, color: '#a8a29e' }}>{errorMessage}</p>
      </div>
    );
  }

  const healthScore = summary?.health_score ??
    (summary?.overall_health
      ? ({ clean: 100, good: 82, needs_attention: 55, poor: 25 })[summary.overall_health] ?? 50
      : Math.max(0, Math.min(100, 100 - issues.length * 4)));
  const scoreColor = healthScore > 80 ? '#4ade80' : healthScore > 50 ? '#fb923c' : '#f87171';

  const metrics = results?.metrics || {};
  const totalLines = metrics.total_lines || 0;
  const deadLines = metrics.dead_lines_estimate || 0;
  const deadPct = metrics.dead_code_percentage ?? (totalLines > 0 ? Math.round((deadLines / totalLines) * 100) : 0);
  const complexityHint = metrics.complexity_hint || null;
  const refactorHints = results?.refactor_hints || [];
  const cached = results?.cached === true;
  const filename = results?.filename || 'file';
  const sourceContent = results?._source_content;

  const [showCodeView, setShowCodeView] = useState(!!sourceContent);

  const categoryPills = summary?.categories
    ? Object.entries(summary.categories).filter(([_, count]) => count > 0)
    : [];

  const ext = filename?.split('.').pop() || 'py';
  const langMap = { py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', txt: 'plaintext' };
  const language = langMap[ext] || 'plaintext';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ width: '100%' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 18, color: '#e7e5e4' }}>Analysis Report</h3>
          <p style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
            Results for <span style={{ color: '#34d399' }}>{filename}</span>
            {cached && <span style={{ color: '#4ade80', marginLeft: 8, fontSize: 10 }}>(cached)</span>}
          </p>
        </div>
        <button
          onClick={onClear}
          style={{
            background: 'none', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171',
            borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            fontFamily: "'Inter', sans-serif", transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          Clear ×
        </button>
      </div>

      {/* Code Viewer */}
      {sourceContent && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button
              onClick={() => setShowCodeView(v => !v)}
              style={{
                background: 'none', border: 'none', color: '#34d399', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                padding: 0, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ transform: showCodeView ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: 8 }}>▶</span>
              {showCodeView ? 'HIDE SOURCE' : 'SHOW SOURCE'}
            </button>
            {issues.length > 0 && (
              <span style={{ fontSize: 10, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>
                dead lines highlighted in red
              </span>
            )}
          </div>
          {showCodeView && (
            <CodeViewer
              source={sourceContent}
              issues={issues}
              filename={filename}
            />
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { icon: '📄', label: 'File', value: filename },
          { icon: '📏', label: 'Lines', value: totalLines.toLocaleString() || '0' },
          { icon: '🔢', label: 'Issues', value: issues.length },
          { icon: '⚡', label: 'Health', value: `${healthScore}%`, color: scoreColor },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(5,150,105,0.04)',
            border: '1px solid #44403c',
            borderRadius: 12, padding: 14,
          }}>
            <p style={{ fontSize: 11, color: '#78716c', fontFamily: "'Inter', sans-serif", marginBottom: 4 }}>{s.label}</p>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 14,
              color: s.color || '#e7e5e4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Secondary metrics row */}
      {(metrics.code_lines != null || metrics.comment_lines != null || metrics.blank_lines != null || complexityHint) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {metrics.code_lines != null && (
            <span style={{ fontSize: 10, color: '#78716c', fontFamily: "'Inter', sans-serif", background: '#292524', borderRadius: 6, padding: '4px 10px' }}>
              code: {metrics.code_lines}
            </span>
          )}
          {metrics.comment_lines != null && (
            <span style={{ fontSize: 10, color: '#78716c', fontFamily: "'Inter', sans-serif", background: '#292524', borderRadius: 6, padding: '4px 10px' }}>
              comments: {metrics.comment_lines}
            </span>
          )}
          {metrics.blank_lines != null && (
            <span style={{ fontSize: 10, color: '#78716c', fontFamily: "'Inter', sans-serif", background: '#292524', borderRadius: 6, padding: '4px 10px' }}>
              blanks: {metrics.blank_lines}
            </span>
          )}
          {complexityHint && (
            <span style={{
              fontSize: 10, fontFamily: "'Inter', sans-serif", borderRadius: 6, padding: '4px 10px',
              color: complexityHint === 'high' ? '#f87171' : complexityHint === 'medium' ? '#fb923c' : '#4ade80',
              background: '#292524',
            }}>
              complexity: {complexityHint}
            </span>
          )}
        </div>
      )}

      {/* Dead code percentage bar */}
      {deadPct > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#78716c', fontFamily: "'Inter', sans-serif", marginBottom: 4 }}>
            <span>Dead code: {deadLines} lines</span>
            <span>{deadPct}%</span>
          </div>
          <div style={{ width: '100%', height: 6, background: '#44403c', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(deadPct, 100)}%`, height: '100%',
              background: deadPct > 30 ? '#f87171' : deadPct > 10 ? '#fb923c' : '#4ade80',
              borderRadius: 3, transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Refactor hints */}
      {refactorHints.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: '#34d399', fontFamily: "'Inter', sans-serif", fontWeight: 600, marginBottom: 8 }}>
            REFACTOR HINTS
          </p>
          {refactorHints.map((hint, i) => (
            <div key={i} style={{
              background: 'rgba(5,150,105,0.06)',
              border: '1px solid rgba(5,150,105,0.15)',
              borderRadius: 8, padding: '8px 12px', marginBottom: 6,
              fontSize: 12, color: '#e7e5e4', fontFamily: "'JetBrains Mono', monospace",
            }}>
              → {hint}
            </div>
          ))}
        </div>
      )}

      {/* Category pills */}
      {categoryPills.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {categoryPills.map(([cat, count]) => {
            const c = typeColors[cat] || { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', label: '#aaa', badge: cat.toUpperCase() };
            return (
              <span key={cat} style={{
                background: c.bg, border: `1px solid ${c.border}`,
                borderRadius: 20, padding: '4px 10px',
                fontSize: 10, color: c.label,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                ● {c.badge || cat.toUpperCase()} ({count})
              </span>
            );
          })}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { key: 'all', label: `ALL (${counts.all})` },
          { key: 'error', label: `ERROR (${counts.error})` },
          { key: 'warning', label: `WARNING (${counts.warning})` },
          { key: 'info', label: `INFO (${counts.info})` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none',
              background: filter === f.key ? 'rgba(5,150,105,0.2)' : '#292524',
              color: filter === f.key ? '#34d399' : '#78716c',
              fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s',
              border: filter === f.key ? '1px solid rgba(5,150,105,0.4)' : '1px solid transparent',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Issue List */}
      <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <AnimatePresence>
          {filteredIssues.length === 0 ? (
            <div style={{
              background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
              borderRadius: 12, padding: '12px 16px',
            }}>
              <p style={{ fontSize: 12, color: '#4ade80' }}>✓ No {filter === 'all' ? '' : filter + ' '}issues found.</p>
            </div>
          ) : filteredIssues.map((issue, idx) => {
            const c = typeColors[issue.type] || { bg: '#292524', border: '#44403c', label: '#aaa', badge: issue.type.toUpperCase() };
            const isExpanded = expandedIdx === idx;
            const lineStr = issue.line
              ? `L: ${issue.line}`
              : issue.line_start
                ? issue.line_end && issue.line_end !== issue.line_start
                  ? `L${issue.line_start}-${issue.line_end}`
                  : `L${issue.line_start}`
                : '';
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                style={{
                  background: c.bg,
                  border: `1px solid ${isExpanded ? c.border : '#44403c'}`,
                  borderRadius: 12, padding: '12px 16px',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.borderColor = c.border; }}
                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.borderColor = '#44403c'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      background: c.border, borderRadius: 4, padding: '2px 6px',
                      fontSize: 9, fontWeight: 700, color: '#000',
                      fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
                    }}>{c.badge}</span>
                    <span style={{ fontSize: 13, color: '#e7e5e4' }}>{issue.message}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#78716c' }}>
                    {issue.confidence != null && (
                      <span style={{ color: issue.confidence > 0.9 ? '#4ade80' : '#fb923c' }}>
                        {(issue.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    <span>{lineStr}</span>
                    <span>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    style={{ marginTop: 10, fontSize: 12, color: '#a8a29e', lineHeight: 1.6, paddingTop: 10, borderTop: '1px solid #44403c' }}
                  >
                    <p style={{ color: '#e7e5e4', marginBottom: 8 }}>{issue.message}</p>
                    {issue.line && <div style={{ marginBottom: 4, color: '#78716c' }}>Line {issue.line}</div>}
                    {issue.code_snippet && (
                      <pre style={{
                        background: '#00000040', borderRadius: 8, padding: 10,
                        fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                        overflowX: 'auto', marginBottom: 8, color: '#e7e5e4',
                      }}>{issue.code_snippet}</pre>
                    )}
                    {issue.suggestion && (
                      <div style={{
                        background: 'rgba(74,222,128,0.06)',
                        border: '1px solid rgba(74,222,128,0.15)',
                        borderRadius: 8, padding: '8px 12px', marginTop: 6,
                      }}>
                        <span style={{ color: '#4ade80', fontWeight: 600, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>SUGGESTION</span>
                        <p style={{ color: '#a8a29e', marginTop: 2, fontSize: 12 }}>{issue.suggestion}</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Raw Output */}
      {results.raw && (
        <details style={{ marginTop: 8 }}>
          <summary style={{
            cursor: 'pointer', fontSize: 12, color: '#78716c',
            fontFamily: "'Inter', sans-serif",
            userSelect: 'none', listStyle: 'none',
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 8,
          }}>
            <span>▶</span> Raw Output
          </summary>
          <Editor
            height="200px"
            language={language}
            value={results.raw.slice(0, 3000)}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        </details>
      )}
    </motion.div>
  );
}

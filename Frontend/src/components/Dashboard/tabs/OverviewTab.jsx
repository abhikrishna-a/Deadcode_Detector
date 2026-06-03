import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function OverviewTab({ history, results, onViewResult }) {
  const stats = useMemo(() => {
    const totalScans = history.length;
    const allIssues = history.flatMap(r => r.issues || []);
    const totalIssues = allIssues.length;
    const cleanFiles = history.filter(r => (r.issues || []).length === 0).length;
    const totalLines = history.reduce((sum, r) => sum + (r.metrics?.total_lines || 0), 0);
    return { totalScans, totalIssues, cleanFiles, totalLines };
  }, [history]);

  const breakdown = useMemo(() => {
    const counts = {};
    history.forEach(r => {
      (r.issues || []).forEach(i => {
        const key = i.category || i.type;
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    return [
      { name: 'Dead Imports', value: counts.unused_import || 0, fill: '#f97316' },
      { name: 'Unused Functions', value: counts.unused_function || 0, fill: '#fb923c' },
      { name: 'Unused Classes', value: counts.unused_class || 0, fill: '#fbbf24' },
      { name: 'Unreachable Code', value: counts.unreachable_code || 0, fill: '#60a5fa' },
      { name: 'Duplicate Logic', value: counts.duplicate_logic || 0, fill: '#4ade80' },
    ];
  }, [history]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: '#1c1c1c', border: '1px solid rgba(249,115,22,0.3)',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: '#f5ede0',
        }}>
          <p style={{ fontFamily: "'DM Mono', monospace" }}>{payload[0].name}: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  const recentScans = useMemo(() => [...history].reverse().slice(0, 10), [history]);

  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { value: stats.totalScans, label: 'Total Scans', sub: 'this session' },
          { value: stats.totalIssues, label: 'Issues Found', sub: 'across scans' },
          { value: stats.cleanFiles, label: 'Files Clean', sub: '(no issues)' },
          { value: stats.totalLines, label: 'Lines Saved', sub: 'est. removed' },
        ].map(s => (
          <motion.div
            key={s.label}
            whileHover={{ scale: 1.01 }}
            style={{
              background: 'rgba(249,115,22,0.04)',
              border: '1px solid rgba(249,115,22,0.15)',
              borderRadius: 16, padding: 24,
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.15)'; }}
          >
            <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 36, color: '#f5ede0', lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginTop: 8, letterSpacing: 0.5 }}>{s.label}</p>
            <p style={{ fontSize: 10, color: '#4a4038', marginTop: 2 }}>{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Chart */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(249,115,22,0.1)',
        borderRadius: 16, padding: 24, marginBottom: 32,
      }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#fff5eb', marginBottom: 16 }}>Ghost Code Breakdown</h3>
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>No data yet — analyze a file to see breakdown</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={breakdown} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(249,115,22,0.06)' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent Scans */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(249,115,22,0.1)',
        borderRadius: 16, padding: 24,
      }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#fff5eb', marginBottom: 16 }}>Recent Scans</h3>
        {recentScans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>No files analyzed yet. Go to Analyzer to get started.</p>
            <p style={{ fontSize: 20, marginTop: 8 }}>↑</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentScans.map((r, idx) => {
              const issueCount = (r.issues || []).length;
              const errorCount = (r.issues || []).filter(i => severityMap[i.category || i.type] === 'error').length;
              const warnCount = (r.issues || []).filter(i => severityMap[i.category || i.type] === 'warning').length;
              return (
                <motion.div
                  key={r.document_id || r.filename || idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 12, padding: '14px 18px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>📄</span>
                    <div>
                      <p style={{ fontSize: 13, color: '#f5ede0', fontFamily: "'DM Mono', monospace" }}>{r.filename}</p>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: issueCount > 0 ? '#f87171' : '#4ade80' }}>{issueCount} issues</span>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>·</span>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{r.metrics?.total_lines || 0} lines</span>
                        {errorCount > 0 && <span style={{ fontSize: 11, color: '#f87171' }}>· {errorCount} errors</span>}
                        {warnCount > 0 && <span style={{ fontSize: 11, color: '#fbbf24' }}>· {warnCount} warnings</span>}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewResult(r); }}
                    style={{
                      background: 'none', border: '1px solid rgba(249,115,22,0.35)', color: '#fb923c',
                      borderRadius: 8, padding: '6px 14px', fontSize: 11, cursor: 'pointer',
                      fontFamily: "'DM Mono', monospace", transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    View →
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

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

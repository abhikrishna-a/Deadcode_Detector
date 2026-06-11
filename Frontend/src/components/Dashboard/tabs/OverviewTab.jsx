import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const extColor = (lang) => {
  const m = { python: '#3572A5', javascript: '#f7df1e', typescript: '#3178c6', jsx: '#61dafb', tsx: '#3178c6' };
  return m[lang?.toLowerCase()] || '#78716c';
};

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default function OverviewTab({ session, history, results, onViewResult }) {
  const stats = useMemo(() => {
    const allResults = history.flatMap(r => r._batch_results || [r]);
    const allIssues = allResults.flatMap(r => (r.issues || []));
    const individualFiles = allResults.length;
    const totalIssues = allIssues.length;
    const cleanFiles = allResults.filter(r => (r.issues || []).length === 0).length;
    const batchSessions = history.filter(r => r._chunked || r._batch_results).length;
    const scanSessions = Math.max(batchSessions, history.length > 0 ? 1 : 0);
    const uniqueFolders = new Set(
      history.flatMap(r => {
        const batch = r._batch_results || [r];
        return batch.map(f => f.scan_folder || (() => {
          const parts = (f.filename || '').replace(/\\/g, '/').split('/');
          return parts.length > 1 ? parts[0] : '(root)';
        })());
      })
    );
    return { scanSessions, totalIssues, cleanFiles, individualFiles, uniqueFolders: uniqueFolders.size };
  }, [history]);

  const breakdown = useMemo(() => {
    const counts = {};
    const allResults = history.flatMap(r => r._batch_results || [r]);
    allResults.forEach(r => {
      (r.issues || []).forEach(i => {
        const key = i.category || i.type;
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    return [
      { name: 'Dead Imports', value: counts.unused_import || 0, fill: '#059669' },
      { name: 'Unused Functions', value: counts.unused_function || 0, fill: '#34d399' },
      { name: 'Unused Classes', value: counts.unused_class || 0, fill: '#6ee7b7' },
      { name: 'Unreachable Code', value: counts.unreachable_code || 0, fill: '#60a5fa' },
      { name: 'Duplicate Logic', value: counts.duplicate_logic || 0, fill: '#4ade80' },
    ];
  }, [history]);

  // Build a file tree per scan_folder
  const buildFileTree = (items) => {
    const root = { dirs: {}, files: [] };
    for (const item of items) {
      const parts = (item.filename || '').replace(/\\/g, '/').split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!node.dirs[parts[i]]) node.dirs[parts[i]] = { dirs: {}, files: [] };
        node = node.dirs[parts[i]];
      }
      node.files.push(item);
    }
    return root;
  };

  const scanFolderTree = useMemo(() => {
    const map = {};
    const all = history.flatMap(r => {
      if (r._batch_results) return r._batch_results;
      return [r];
    });
    for (const item of all) {
      const folder = item.scan_folder || (() => {
        const parts = (item.filename || '').replace(/\\/g, '/').split('/');
        return parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
      })();
      if (!map[folder]) map[folder] = [];
      map[folder].push(item);
    }
    const trees = {};
    for (const [folder, items] of Object.entries(map)) {
      trees[folder] = buildFileTree(items);
    }
    return trees;
  }, [history]);

  const [expandedNodes, setExpandedNodes] = useState({});

  useEffect(() => {
    const keys = Object.keys(scanFolderTree);
    setExpandedNodes(prev => {
      const next = { ...prev };
      for (const k of keys) {
        if (next[k] === undefined) next[k] = false;
      }
      return next;
    });
  }, [scanFolderTree]);

  const toggleNode = (key) => {
    setExpandedNodes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const nodePath = (...segments) => segments.filter(Boolean).join('/');

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: '#292524', border: '1px solid rgba(5,150,105,0.3)',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: '#e7e5e4',
        }}>
          <p style={{ fontFamily: "'Inter', sans-serif" }}>{payload[0].name}: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  const recentScans = useMemo(() => {
    const all = history.flatMap(r => {
      if (r._batch_results) return r._batch_results.map((br, i) => ({ ...br, _batch_id: r.document_id || i }));
      return [r];
    });
    return [...all].reverse();
  }, [history]);

  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { value: stats.scanSessions, label: 'Scans Performed', sub: 'scan sessions' },
          { value: stats.totalIssues, label: 'Issues Found', sub: 'across scans' },
          { value: stats.cleanFiles, label: 'Files Clean', sub: '(no issues)' },
          { value: stats.individualFiles, label: 'Files Analyzed', sub: 'total' },
          { value: stats.uniqueFolders, label: 'Repos / Folders', sub: 'unique' },
        ].map(s => (
          <motion.div
            key={s.label}
            whileHover={{ scale: 1.01 }}
            style={{
              background: 'rgba(5,150,105,0.04)',
              border: '1px solid rgba(5,150,105,0.15)',
              borderRadius: 16, padding: 24,
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(5,150,105,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(5,150,105,0.15)'; }}
          >
            <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 36, color: '#e7e5e4', lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#78716c', textTransform: 'uppercase', marginTop: 8, letterSpacing: 0.5 }}>{s.label}</p>
            <p style={{ fontSize: 10, color: '#57534e', marginTop: 2 }}>{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Profile Card */}
      {session?.user && (
        <div style={{
          background: 'rgba(5,150,105,0.04)', border: '1px solid rgba(5,150,105,0.12)',
          borderRadius: 16, padding: 20, marginBottom: 32,
          display: 'flex', alignItems: 'center', gap: 20,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'linear-gradient(135deg, #047857, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: '#fff', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
            flexShrink: 0,
          }}>
            {(session.user.username || 'U')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#e7e5e4', fontFamily: "'Inter', sans-serif" }}>
              {session.user.username || 'User'}
            </p>
            <p style={{ fontSize: 11, color: '#78716c', fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
              {session.user.email || ''}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <span style={{
                background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.2)',
                borderRadius: 8, padding: '2px 8px', fontSize: 10, color: '#34d399',
                fontFamily: "'Inter', sans-serif",
              }}>
                {session.user.role || 'viewer'}
              </span>
              <span style={{
                background: session.user.is_mfa_enabled ? 'rgba(5,150,105,0.1)' : 'rgba(248,113,113,0.1)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '2px 8px', fontSize: 10,
                color: session.user.is_mfa_enabled ? '#4ade80' : '#f87171',
                fontFamily: "'Inter', sans-serif",
              }}>
                {session.user.is_mfa_enabled ? 'MFA Active' : 'MFA Inactive'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={{
        background: '#1c1917', border: '1px solid #44403c',
        borderRadius: 16, padding: 24, marginBottom: 32,
      }}>
        <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 16, color: '#e7e5e4', marginBottom: 16 }}>Ghost Code Breakdown</h3>
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#78716c' }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13 }}>No data yet — analyze a file to see breakdown</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={breakdown} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#78716c', fontSize: 10, fontFamily: "'Inter', sans-serif" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#78716c', fontSize: 10, fontFamily: "'Inter', sans-serif" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(5,150,105,0.06)' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent Scans — grouped by folder */}
      <div style={{
        background: '#1c1917', border: '1px solid #44403c',
        borderRadius: 16, padding: 24,
      }}>
        <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 16, color: '#e7e5e4', marginBottom: 16 }}>
          Recent Scans
          <span style={{ fontSize: 12, color: '#78716c', fontWeight: 400, marginLeft: 8 }}>({history.length})</span>
        </h3>
        {Object.keys(scanFolderTree).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#78716c' }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13 }}>No files analyzed yet. Go to Analyzer to get started.</p>
            <p style={{ fontSize: 20, marginTop: 8 }}>↑</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(scanFolderTree).map(([folder, tree]) => (
              <div key={folder}>
                {/* scan_folder root */}
                <div
                  onClick={() => toggleNode(folder)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 10px', cursor: 'pointer',
                    fontSize: 12, color: '#34d399',
                    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                    letterSpacing: 0.3, borderRadius: 8,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    transform: expandedNodes[folder] ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s', fontSize: 10,
                  }}>▶</span>
                  <span style={{ fontSize: 14 }}>📁</span>
                  <span>{folder}/</span>
                  <span style={{ color: '#78716c', fontWeight: 400, marginLeft: 'auto' }}>{tree.files.length + Object.keys(tree.dirs).length} item{(tree.files.length + Object.keys(tree.dirs).length) !== 1 ? 's' : ''}</span>
                </div>
                <AnimatePresence>
                  {expandedNodes[folder] && renderTreeNodes(tree, 1, folder, expandedNodes, toggleNode, onViewResult, formatDate, extColor)}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function renderTreeNodes(node, depth, parentKey, expandedNodes, toggleNode, onViewResult, formatDate, extColor) {
  const dirEntries = Object.entries(node.dirs).sort(([a], [b]) => a.localeCompare(b));
  const elements = [];

  for (const [name, child] of dirEntries) {
    const key = parentKey + '/' + name;
    const childCount = child.files.length + Object.keys(child.dirs).length;
    const isExpanded = expandedNodes[key];

    elements.push(
      <div key={key}>
        <div
          onClick={() => toggleNode(key)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', cursor: 'pointer',
            fontSize: 11, color: '#a8a29e',
            fontFamily: "'JetBrains Mono', monospace",
            marginLeft: depth * 20, borderRadius: 6,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s', fontSize: 8, color: '#78716c',
          }}>▶</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>📁</span>
          <span>{name}/</span>
          <span style={{ color: '#57534e', fontSize: 10, marginLeft: 'auto' }}>{childCount}</span>
        </div>
        {isExpanded && renderTreeNodes(child, depth + 1, key, expandedNodes, toggleNode, onViewResult, formatDate, extColor)}
      </div>
    );
  }

  for (let idx = 0; idx < node.files.length; idx++) {
    const r = node.files[idx];
    const issueCount = (r.issues || []).length;
    const healthScore = r.health_score ?? r.summary?.health_score ?? null;
    const fileLang = r.language || (r.filename || '').split('.').pop();
    const filename = (r.filename || '').split('/').pop();

    elements.push(
      <motion.div
        key={r.document_id || r.analysis_id || r.filename || `f-${parentKey}-${idx}`}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(idx * 0.02, 0.15) }}
        onClick={() => onViewResult(r)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', cursor: 'pointer',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: 8, marginLeft: depth * 20 + 12, marginBottom: 2,
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: extColor(fileLang), flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 11, color: '#d4d4d4', fontFamily: "'JetBrains Mono', monospace" }}>
          {filename}
        </span>
        <span style={{ fontSize: 9, color: '#57534e' }}>{formatDate(r.created_at)}</span>
        <span style={{
          fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
          color: healthScore > 80 ? '#4ade80' : healthScore > 50 ? '#fb923c' : '#f87171',
        }}>
          {healthScore}%
        </span>
        {issueCount > 0 && (
          <span style={{ fontSize: 9, color: '#f87171', fontFamily: "'JetBrains Mono', monospace" }}>
            {issueCount} iss.
          </span>
        )}
      </motion.div>
    );
  }

  return elements;
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

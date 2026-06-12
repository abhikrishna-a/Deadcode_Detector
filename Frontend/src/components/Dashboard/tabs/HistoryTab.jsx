import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, File, Folder, Globe, ChevronRight, FileText, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { analysisAPI } from '../../../api/analysis';

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

const extColor = (lang) => {
  const m = { python: '#3572A5', javascript: '#f7df1e', typescript: '#3178c6', jsx: '#61dafb', tsx: '#3178c6' };
  return m[lang?.toLowerCase()] || '#78716c';
};

function DetailCard({ item, detail, detailLoading, onViewFull }) {
  if (detailLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(5,150,105,0.2)', borderTopColor: '#34d399', animation: 'spin 0.6s linear infinite' }} />
        <span style={{ fontSize: 11, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>Loading...</span>
      </div>
    );
  }
  if (!detail) return null;

  if (item?.error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          marginTop: 6, marginLeft: 20,
          background: 'rgba(248,113,113,0.06)',
          border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 10, padding: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} color="#f87171" />
            <p style={{ fontSize: 12, color: '#f87171', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
              {item.filename?.split('/').pop()}
            </p>
          </div>
          <button onClick={() => onViewFull?.(item)}
            style={{ background: 'none', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', borderRadius: 8, padding: '4px 10px', fontSize: 9, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            View Full <ExternalLink size={10} />
          </button>
        </div>
        <p style={{ fontSize: 10, color: '#f87171', fontFamily: "'Inter', sans-serif" }}>{item.error}</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        marginTop: 6, marginLeft: 20,
        background: 'rgba(5,150,105,0.04)',
        border: '1px solid rgba(5,150,105,0.1)',
        borderRadius: 10, padding: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          {item?.scan_folder && (
            <p style={{ fontSize: 9, color: '#78716c', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2, letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Folder size={10} color="#78716c" /> {item.scan_folder}/
            </p>
          )}
          <p style={{ fontSize: 12, color: '#34d399', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            {detail.filename?.split('/').pop()}
          </p>
          <p style={{ fontSize: 9, color: '#78716c', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
            {detail.filename}
          </p>
        </div>
        <button onClick={() => onViewFull?.(item)}
          style={{ background: 'none', border: '1px solid rgba(5,150,105,0.3)', color: '#34d399', borderRadius: 8, padding: '4px 10px', fontSize: 9, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          View Full <ExternalLink size={10} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(detail.recentFiles || []).slice(0, 4).map((f, i) => {
          const health = f.health_score ?? 0;
          const issues = f.issues?.length ?? f.total_issues ?? 0;
          const metrics = f.metrics || {};
          return (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '8px 10px',
              border: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#d4d4d4', fontFamily: "'JetBrains Mono', monospace" }}>
                  {f.filename?.split('/').pop()}
                </span>
                <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: health > 80 ? '#4ade80' : health > 50 ? '#fb923c' : '#f87171' }}>
                  {health}% health
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 9, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>
                <span>{issues} issues</span>
                <span>{metrics.total_lines || 0} lines</span>
                <span>{metrics.dead_code_percentage != null ? `${metrics.dead_code_percentage}% dead` : ''}</span>
              </div>
            </div>
          );
        })}
      </div>

      {detail.analysis && (
        <div style={{
          marginTop: 8, background: 'rgba(5,150,105,0.04)', borderRadius: 8, padding: 10,
          border: '1px solid rgba(5,150,105,0.1)',
        }}>
          <p style={{ fontSize: 9, color: '#34d399', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>
            SUMMARY
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10, color: '#d4d4d4', fontFamily: "'JetBrains Mono', monospace" }}>
            <span>Health: <span style={{ color: (detail.analysis?.summary?.health_score || 0) > 80 ? '#4ade80' : '#f87171' }}>{detail.analysis?.summary?.health_score || 0}%</span></span>
            <span>Issues: {detail.analysis?.summary?.total_issues || 0}</span>
            <span>Severity: E:{detail.analysis?.summary?.severity_counts?.error || 0} W:{detail.analysis?.summary?.severity_counts?.warning || 0}</span>
            <span>Dead code: {detail.analysis?.metrics?.dead_code_percentage || 0}%</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function renderHistoryTreeNodes(node, depth, parentKey, expandedNodes, toggleNode, handleItemClick, formatDate, extColor, expandedId, detail, detailLoading, onViewFull) {
  const dirEntries = Object.entries(node.dirs).sort(([a], [b]) => a.localeCompare(b));
  const elements = [];

  for (const [name, child] of dirEntries) {
    if (treeTotal(child) === 0) continue;
    const key = parentKey + '/' + name;
    const childCount = child.files.length + Object.keys(child.dirs).length;
    const isExpanded = expandedNodes[key];

    elements.push(
      <div key={key}>
        <div
          onClick={() => toggleNode(key)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', cursor: 'pointer',
            fontSize: 10, color: '#a8a29e',
            fontFamily: "'JetBrains Mono', monospace",
            marginLeft: depth * 16, borderRadius: 4,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronRight size={10} color="#78716c" style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }} />
          <Folder size={12} color="#78716c" />
          <span>{name}/</span>
          <span style={{ color: '#57534e', fontSize: 9, marginLeft: 'auto' }}>{childCount}</span>
        </div>
        {isExpanded && renderHistoryTreeNodes(child, depth + 1, key, expandedNodes, toggleNode, handleItemClick, formatDate, extColor, expandedId, detail, detailLoading, onViewFull)}
      </div>
    );
  }

  for (let idx = 0; idx < node.files.length; idx++) {
    const item = node.files[idx];
    const isSelected = expandedId === item.analysis_id;
    const health = item.health_score ?? 0;
    const issues = item.total_issues ?? 0;
    const lang = item.language || (item.filename || '').split('.').pop();
    const filename = (item.filename || '').split('/').pop();

    elements.push(
      <div key={item.analysis_id || item.filename || `f-${parentKey}-${idx}`}>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(idx * 0.02, 0.15) }}
          onClick={() => handleItemClick(item)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 8px', cursor: 'pointer',
            background: isSelected ? 'rgba(5,150,105,0.08)' : 'transparent',
            border: isSelected ? '1px solid rgba(5,150,105,0.2)' : '1px solid transparent',
            borderRadius: 6, marginLeft: depth * 16 + 12, marginBottom: 2,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: extColor(lang), flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 10, color: '#d4d4d4', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filename}
          </span>
          {item.error && (
            <span style={{ fontSize: 7, color: '#f87171', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4, padding: '0 4px' }}>
              ERROR
            </span>
          )}
          <span style={{ fontSize: 8, color: '#57534e', flexShrink: 0 }}>{formatDate(item.created_at)}</span>
          {!item.error && (<>
            <span style={{ fontSize: 8, color: health > 80 ? '#4ade80' : health > 50 ? '#fb923c' : '#f87171', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
              {health}%
            </span>
            {issues > 0 && (
              <span style={{ fontSize: 8, color: '#f87171', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                {issues} iss.
              </span>
            )}
          </>)}
        </motion.div>
        <AnimatePresence>
          {isSelected && (
            <DetailCard
              item={item}
              detail={detail}
              detailLoading={detailLoading}
              onViewFull={onViewFull}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return elements;
}

function SingleFileRow({ item, expandedId, onToggle, onViewFull, detail, detailLoading }) {
  const isSelected = expandedId === item.analysis_id;
  const health = item.health_score ?? 0;
  const issues = item.total_issues ?? 0;
  const lang = item.language || (item.filename || '').split('.').pop();

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => onToggle(item)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 8px', cursor: 'pointer',
          background: isSelected ? 'rgba(5,150,105,0.08)' : 'transparent',
          border: isSelected ? '1px solid rgba(5,150,105,0.2)' : '1px solid transparent',
          borderRadius: 6, marginBottom: 2,
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: extColor(lang), flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 10, color: '#d4d4d4', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.filename?.split('/').pop()}
        </span>
        {item.error && (
          <span style={{ fontSize: 7, color: '#f87171', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4, padding: '0 4px' }}>
            ERROR
          </span>
        )}
        <span style={{ fontSize: 8, color: '#57534e', flexShrink: 0 }}>{formatDate(item.created_at)}</span>
        {!item.error && (<>
          <span style={{ fontSize: 8, color: health > 80 ? '#4ade80' : health > 50 ? '#fb923c' : '#f87171', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
            {health}%
          </span>
          {issues > 0 && (
            <span style={{ fontSize: 8, color: '#f87171', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
              {issues} iss.
            </span>
          )}
        </>)}
      </motion.div>
      <AnimatePresence>
        {isSelected && (
          <DetailCard
            item={item}
            detail={detail}
            detailLoading={detailLoading}
            onViewFull={onViewFull}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupSection({ type, title, items, onViewFull, expandedId, onToggle, detail, detailLoading }) {
  // For folder/repo, group by scan_folder, then build tree
  const treeData = useMemo(() => {
    if (type === 'single') return null;
    const groups = {};
    for (const item of items) {
      const folder = item.scan_folder || '(root)';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(item);
    }
    const trees = {};
    for (const [folder, folderItems] of Object.entries(groups)) {
      trees[folder] = buildFileTree(folderItems);
    }
    return trees;
  }, [items, type]);

  const [expandedFolders, setExpandedFolders] = useState({});
  useEffect(() => {
    if (treeData) {
      const keys = Object.keys(treeData);
      setExpandedFolders(prev => {
        const next = { ...prev };
        for (const k of keys) {
          if (next[k] === undefined) next[k] = false;
        }
        return next;
      });
    }
  }, [treeData]);

  const toggleFolder = (key) => {
    setExpandedFolders(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (items.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#57534e' }}>
        <p style={{ fontSize: 11, fontFamily: "'Inter', sans-serif" }}>No {title.toLowerCase()}.</p>
      </div>
    );
  }

  if (type === 'single') {
    return (
      <div>
        {items.map((item, idx) => (
          <SingleFileRow
            key={item.analysis_id || item.filename || idx}
            item={item}
            expandedId={expandedId}
            onToggle={onToggle}
            onViewFull={onViewFull}
            detail={detail}
            detailLoading={detailLoading}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      {treeData && Object.entries(treeData).map(([folder, tree]) => {
        if (treeTotal(tree) === 0) return null;
        return (
        <div key={folder}>
          <div
            onClick={() => toggleFolder(folder)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 8px', cursor: 'pointer',
              fontSize: 10, color: '#34d399',
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
              letterSpacing: 0.3, borderRadius: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ChevronRight size={12} color="#34d399" style={{
              transform: expandedFolders[folder] ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }} />
            <Folder size={14} color="#34d399" />
            <span>{folder}/</span>
            <span style={{ color: '#78716c', fontWeight: 400, marginLeft: 'auto', fontSize: 9 }}>
              {tree.files.length + Object.keys(tree.dirs).length} item{(tree.files.length + Object.keys(tree.dirs).length) !== 1 ? 's' : ''}
            </span>
          </div>
          {expandedFolders[folder] && (
            <div>
              {renderHistoryTreeNodes(tree, 1, folder, expandedFolders, toggleFolder, (item) => onToggle(item), formatDate, extColor, expandedId, detail, detailLoading, onViewFull)}
            </div>
          )}
        </div>
          );
        })}
    </div>
  );
}

function buildFileTree(items) {
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
}

function treeTotal(node) {
  return node.files.length + Object.values(node.dirs).reduce((sum, child) => sum + treeTotal(child), 0);
}

const sectionStyle = {
  background: '#1c1917',
  border: '1px solid rgba(5,150,105,0.12)',
  borderRadius: 16, overflow: 'hidden',
};


const FILTER_TYPES = [
  { key: 'single', icon: File, label: 'Single Files' },
  { key: 'folder', icon: Folder, label: 'Folder Analyses' },
  { key: 'repo', icon: Globe, label: 'Repo Analyses' },
];

export default function HistoryTab({ history, results, onViewResult }) {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTypes, setFilterTypes] = useState(new Set(['single', 'folder', 'repo']));
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const normalizeLocalItem = (local) => ({
    analysis_id: local.document_id || local.analysis_id || local.filename,
    filename: local.filename,
    language: local.language || (local.filename || '').split('.').pop() || 'unknown',
    health_score: local.health_score ?? local.summary?.health_score ?? 0,
    total_issues: local.total_issues ?? local.summary?.total_issues ?? 0,
    created_at: local.created_at || new Date().toISOString(),
    scan_folder: local.scan_folder || '',
    scan_type: local.scan_type || '',
    _local: true,
    _full: local,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const resp = await analysisAPI.ragHistory(9999, 0, search);
        const apiItems = (resp.items || []).filter(i =>
          !search || (i.filename || '').toLowerCase().includes(search.toLowerCase())
        );
        setAllItems(apiItems);
      } catch {
        const filtered = history.filter(h =>
          !search || (h.filename || '').toLowerCase().includes(search.toLowerCase())
        );
        setAllItems(filtered.map(normalizeLocalItem));
      } finally {
        setLoading(false);
      }
    })();
  }, [search, history]);

  const toggleFilter = (key) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const groupedByType = useMemo(() => {
    const groups = { single: [], folder: [], repo: [] };
    for (const item of allItems) {
      const type = item.scan_type === 'repo' ? 'repo'
                 : item.scan_type === 'folder' ? 'folder'
                 : 'single';
      groups[type].push(item);
    }
    return groups;
  }, [allItems]);

  const visibleTypes = FILTER_TYPES.filter(f => filterTypes.has(f.key));

  const handleToggle = async (item) => {
    if (expandedId === item.analysis_id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(item.analysis_id);
    setDetailLoading(true);
    setDetail(null);

    if (item._local && item._full) {
      const fb = item._full;
      setDetail({
        analysis: fb.analysis || fb,
        recentFiles: [{
          filename: fb.filename,
          health_score: (fb.analysis?.summary?.health_score ?? fb.summary?.health_score ?? 0),
          total_issues: (fb.analysis?.summary?.total_issues ?? fb.summary?.total_issues ?? 0),
          issues: fb.analysis?.issues || fb.issues || [],
          metrics: fb.analysis?.metrics || fb.metrics || {},
        }],
        filename: fb.filename,
      });
      setDetailLoading(false);
      return;
    }
    try {
      const doc = await analysisAPI.ragGetAnalysis(item.analysis_id);
      setDetail({
        ...doc,
        recentFiles: [{
          filename: doc.filename,
          health_score: doc.analysis?.summary?.health_score || 0,
          total_issues: doc.analysis?.summary?.total_issues || 0,
          issues: doc.analysis?.issues || [],
          metrics: doc.analysis?.metrics || {},
        }],
      });
    } catch {
      const fallback = history.find(h =>
        h.document_id === item.analysis_id ||
        h.analysis_id === item.analysis_id ||
        h.filename === item.filename
      );
      const base = fallback || item._full || item;
      setDetail({
        analysis: base.analysis || base,
        recentFiles: [{
          filename: base.filename,
          health_score: (base.analysis?.summary?.health_score ?? base.summary?.health_score ?? 0),
          total_issues: (base.analysis?.summary?.total_issues ?? base.summary?.total_issues ?? 0),
          issues: base.analysis?.issues || base.issues || [],
          metrics: base.analysis?.metrics || base.metrics || {},
        }],
        filename: base.filename,
      });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} color="#78716c" style={{ position: 'absolute', left: 12, top: 10, zIndex: 1, pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setExpandedId(null); setDetail(null); }}
            placeholder="Search by filename or folder..."
            style={{
              flex: 1, padding: '10px 14px 10px 36px',
              background: '#292524',
              border: '1px solid rgba(5,150,105,0.15)',
              borderRadius: 10, color: '#e7e5e4',
              fontSize: 13, fontFamily: "'Inter', sans-serif",
              outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTER_TYPES.map(f => {
            const active = filterTypes.has(f.key);
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => toggleFilter(f.key)}
                style={{
                  background: active ? 'rgba(5,150,105,0.2)' : '#292524',
                  border: active ? '1px solid rgba(5,150,105,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8, padding: '5px 12px',
                  cursor: 'pointer', fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: active ? '#34d399' : '#78716c',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#a8a29e'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#78716c'; }}
              >
                <Icon size={12} />
                <span>{f.label}</span>
                <span style={{ color: active ? '#34d399' : '#57534e' }}>({groupedByType[f.key].length})</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(5,150,105,0.2)', borderTopColor: '#34d399', animation: 'spin 0.6s linear infinite' }} />
        </div>
      ) : allItems.length === 0 ? (
        <div style={{ ...sectionStyle, textAlign: 'center', padding: 40, color: '#78716c' }}>
          <FileText size={24} color="#57534e" style={{ marginBottom: 8 }} />
          <p style={{ fontSize: 13, fontFamily: "'Inter', sans-serif" }}>No analysis history found.</p>
        </div>
      ) : (
        <div style={{ ...sectionStyle, padding: 12, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          {visibleTypes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#57534e', fontSize: 12, fontFamily: "'Inter', sans-serif" }}>
              All filters are disabled. Enable a section above to see results.
            </div>
          ) : visibleTypes.map(col => {
            const items = groupedByType[col.key];
            if (items.length === 0) return null;
            const Icon = col.icon;
            return (
              <div key={col.key} style={{ marginBottom: 16 }}>
                <p style={{
                  fontSize: 10, color: '#34d399', fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600, letterSpacing: 0.5, marginBottom: 10,
                  paddingBottom: 8, borderBottom: '1px solid rgba(5,150,105,0.08)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Icon size={12} color="#34d399" />
                  <span>{col.label}</span>
                  <span style={{ color: '#78716c', fontWeight: 400, marginLeft: 'auto', fontSize: 9 }}>
                    ({items.length})
                  </span>
                </p>
                <GroupSection
                  type={col.key}
                  title={col.label}
                  items={items}
                  onViewFull={onViewResult}
                  expandedId={expandedId}
                  onToggle={handleToggle}
                  detail={detail}
                  detailLoading={detailLoading}
                />
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
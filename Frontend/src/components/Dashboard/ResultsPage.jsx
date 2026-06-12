import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Folder, X, MessageSquare } from 'lucide-react';
import { analysisAPI } from '../../api/analysis';
import FileTree from './FileTree';
import ResultsPanel from './ResultsPanel';

function FolderSummary({ folder, onSelectFile, onClear }) {
  const files = folder.files || [];
  const totalIssues = files.reduce((s, f) => s + (f.analysis?.summary?.total_issues || f.analysis?.issues?.length || 0), 0);
  const healthScores = files.map(f => f.analysis?.summary?.health_score || 0).filter(Boolean);
  const avgHealth = healthScores.length ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0;
  const healthColor = avgHealth > 80 ? '#4ade80' : avgHealth > 50 ? '#fb923c' : '#f87171';

  const styles = {
    header: { display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)' },
    name: { fontSize: 13, fontWeight: 600, color: '#34d399', fontFamily: "'JetBrains Mono', monospace" },
    stat: { fontSize: 10, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" },
    row: (isEven) => ({
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', cursor: 'pointer',
      background: isEven ? 'rgba(255,255,255,0.015)' : 'transparent',
      borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.15s',
    }),
    dot: (color) => ({ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }),
  };

  const extColorMap = { py: '#3572A5', js: '#f7df1e', ts: '#3178c6', jsx: '#61dafb', tsx: '#3178c6', txt: '#78716c', md: '#78716c' };

  return (
    <div>
      <div style={styles.header}>
        <Folder size={16} style={{ color: '#34d399', flexShrink: 0 }} />
        <span style={styles.name}>{folder.name}/</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          <span style={styles.stat}>{files.length} files</span>
          <span style={styles.stat}>{totalIssues} issues</span>
          <span style={{ ...styles.stat, color: healthColor }}>{avgHealth}% avg health</span>
        </span>
        <button onClick={onClear} style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: '#78716c',
          borderRadius: 6, padding: '4px 10px', fontSize: 10, cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><X size={12} /></button>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 400px)' }}>
        {files.length === 0 ? (
          <p style={{ padding: 20, textAlign: 'center', fontSize: 11, color: '#57534e' }}>No files in this folder.</p>
        ) : files.map((file, idx) => {
          const issues = file.analysis?.issues?.length || file.analysis?.summary?.total_issues || 0;
          const health = file.analysis?.summary?.health_score || 0;
          const hlColor = health > 80 ? '#4ade80' : health > 50 ? '#fb923c' : '#f87171';
          const filenameOnly = (file.filename || file.name || '').split('/').pop();
          const ext = filenameOnly.split('.').pop();
          return (
            <div key={file.document_id || file.analysis_id || idx}
              style={styles.row(idx % 2 === 0)}
              onClick={() => onSelectFile(file)}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = styles.row(idx % 2 === 0).background; }}
            >
              <span style={styles.dot(extColorMap[ext] || '#78716c')} />
              <span style={{ flex: 1, fontSize: 11, color: '#d4d4d4', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {filenameOnly}
              </span>
              <span style={{ fontSize: 10, color: '#78716c', fontFamily: "'JetBrains Mono', monospace", marginRight: 8 }}>
                {file.analysis?.metrics?.dead_code_percentage != null ? `${file.analysis.metrics.dead_code_percentage}% dead` : ''}
              </span>
              {issues > 0 && (
                <span style={{ fontSize: 10, color: '#f87171', fontFamily: "'JetBrains Mono', monospace" }}>{issues} iss.</span>
              )}
              <span style={{ fontSize: 10, color: hlColor, fontFamily: "'JetBrains Mono', monospace", marginLeft: 8 }}>{health}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ResultsPage({ 
  batchResults, batchErrors, 
  onBackToImport,
  onChatNavigate 
}) {
  // File selection
  const [selectedFile, setSelectedFile] = useState(null);
  const [detailResult, setDetailResult] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleHistoryClick = async (item) => {
    try {
      setDetailLoading(true);
      const doc = await analysisAPI.ragGetAnalysis(item.analysis_id);
      setDetailResult({
        filename: doc.filename,
        document_id: doc.analysis_id,
        ...doc.analysis,
        _from_history: true,
      });
    } catch (err) {
      setDetailResult({
        filename: item.filename,
        summary: { total_issues: 0, severity_counts: {}, categories: {}, overall_health: 'error', health_score: 0 },
        issues: [],
        metrics: { total_lines: 0, dead_lines_estimate: 0, dead_code_percentage: 0 },
        _error: err.message || 'Failed to load analysis',
        _from_history: true,
      });
    } finally {
      setDetailLoading(false);
    }
  };

  // Select first file by default
  useEffect(() => {
    if (!selectedFile && batchResults?.length > 0) {
      setSelectedFile(batchResults[0]);
    }
  }, [batchResults]);

  // Current file result for the center panel
  const currentResult = detailResult || (selectedFile ? {
    filename: selectedFile.filename,
    document_id: selectedFile.document_id,
    ...(selectedFile.analysis || {}),
    _error: selectedFile.error || selectedFile._error,
    _source_content: selectedFile._source_content,
    _batch_results: batchResults,
    _batch_errors: batchErrors,
  } : (batchResults?.[0] ? {
    filename: batchResults[0].filename,
    document_id: batchResults[0].document_id,
    ...(batchResults[0].analysis || {}),
    _error: batchResults[0].error || batchResults[0]._error,
    _source_content: batchResults[0]._source_content,
    _batch_results: batchResults,
    _batch_errors: batchErrors,
  } : null));

  // Only show files from the current analysis in the tree
  const allFiles = useMemo(() => {
    return batchResults || [];
  }, [batchResults]);

  // Scan folder name from results
  const scanFolder = useMemo(() => {
    const first = allFiles.find(f => f.scan_folder);
    return first?.scan_folder || '';
  }, [allFiles]);

  // Clear detail when selecting a batch file
  const handleFileSelect = (file) => {
    setDetailResult(null);
    setSelectedFile(file);
  };

  const handleAnyFileSelect = (file) => {
    if (!file) return;
    handleFileSelect(file);
  };

  // Folder selection
  const [selectedFolder, setSelectedFolder] = useState(null);

  const handleFolderSelect = (folderNode) => {
    const collectFiles = (node) => {
      if (node.type === 'file') return [node.path];
      return (node.children || []).flatMap(collectFiles);
    };
    const filePaths = collectFiles(folderNode);
    const matchedFiles = allFiles.filter(r =>
      filePaths.some(p => r.path === p || r.filename === p)
    );
    setSelectedFolder({
      name: folderNode.name,
      path: folderNode.path,
      files: matchedFiles,
    });
    // Clear individual file selection when viewing a folder
    setSelectedFile(null);
    setDetailResult(null);
  };

  const handleChatClick = () => {
    if (onChatNavigate) {
      const target = selectedFile || batchResults?.[0];
      if (target) onChatNavigate(target);
    }
  };

  const sectionStyle = {
    background: '#1c1917',
    border: '1px solid rgba(5,150,105,0.12)',
    borderRadius: 16, overflow: 'hidden',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBackToImport} style={{
          background: 'none', border: '1px solid rgba(5,150,105,0.3)', color: '#34d399',
          borderRadius: 8, padding: '6px 14px', fontSize: 11, cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace",
          display: 'flex', alignItems: 'center', gap: 6,
          transition: 'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.1)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(5,150,105,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <ArrowLeft size={14} /> Back to Import
        </button>
        <span style={{ fontSize: 12, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>
          {batchResults?.length || 0} file{(batchResults?.length || 0) !== 1 ? 's' : ''} analyzed
          {batchErrors?.length > 0 && (
            <span style={{ color: '#f87171', marginLeft: 8 }}>{batchErrors.length} failed</span>
          )}
        </span>
        <button onClick={handleChatClick} style={{
          marginLeft: 'auto', background: 'none', border: '1px solid rgba(5,150,105,0.3)',
          color: '#34d399', borderRadius: 8, padding: '6px 14px', fontSize: 11,
          cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
          display: 'flex', alignItems: 'center', gap: 6,
          transition: 'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.1)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(5,150,105,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <MessageSquare size={14} />
          Chat about this file
        </button>
      </div>

      {/* Main 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Left: File Tree */}
        <div style={{ ...sectionStyle, padding: 14, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          <p style={{ fontSize: 10, color: '#34d399', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: 0.5, marginBottom: 10 }}>
            FILE TREE
          </p>
          <FileTree
            files={allFiles}
            scanFolder={scanFolder}
            selectedPath={selectedFile?.path || selectedFile?.filename}
            onSelectFile={(node) => {
              const match = allFiles.find(r => r.path === node.path || r.filename === node.path || r.filename === node.name)
                || allFiles.find(r => {
                  const leaf = (r.filename || r.path || '').split('/').pop();
                  return leaf === node.name;
                });
              if (match) handleAnyFileSelect(match);
            }}
            onSelectFolder={handleFolderSelect}
          />
        </div>

        {/* Center: Results Panel */}
        <div style={{ ...sectionStyle, minHeight: 400, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          {detailLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: '#57534e', gap: 12 }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(5,150,105,0.3)', borderTopColor: '#34d399', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
              <p style={{ fontSize: 12, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>Loading analysis...</p>
            </div>
          ) : selectedFolder ? (
            <FolderSummary
              folder={selectedFolder}
              onSelectFile={(file) => handleAnyFileSelect(file)}
              onClear={() => { setSelectedFolder(null); }}
            />
          ) : currentResult ? (
            <ResultsPanel
              results={currentResult}
              onClear={() => { setSelectedFile(null); setDetailResult(null); }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: '#57534e' }}>
              <p style={{ fontSize: 13, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>Select a file to view results</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

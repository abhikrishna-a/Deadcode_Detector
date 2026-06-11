import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
        <span style={{ fontSize: 14 }}>📁</span>
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
        }}>✕</button>
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
  onBackToImport 
}) {
  // File selection
  const [selectedFile, setSelectedFile] = useState(null);
  const [detailResult, setDetailResult] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatError, setChatError] = useState(null);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);

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

  // Chat handlers
  const handleChatSelectFile = (file) => {
    if (file) {
      setSelectedFile(file);
      setChatMessages([]);
      setChatError(null);
    }
  };

  // Files with a usable ID for chat (document_id or analysis_id)
  const chatFiles = useMemo(() =>
    allFiles.filter(f => f.document_id || f.analysis_id),
  [allFiles]);

  const handleChatSend = async () => {
    const q = chatInput.trim();
    const docId = selectedFile?.document_id || selectedFile?.analysis_id;
    if (!q || !docId || chatStreaming) return;
    setChatInput('');
    const userMsg = { role: 'user', content: q };
    setChatMessages(prev => [...prev, userMsg]);
    setChatStreaming(true);
    const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
    const assistantMsg = { role: 'assistant', content: '' };
    setChatMessages(prev => [...prev, assistantMsg]);
    try {
      for await (const delta of analysisAPI.ragChat(docId, q, history)) {
        setChatMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + delta };
          }
          return updated;
        });
      }
    } catch (err) {
      setChatMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && !last.content) updated.pop();
        return updated;
      });
      setChatError(err.message || 'Chat failed');
      setTimeout(() => setChatError(null), 4000);
    } finally {
      setChatStreaming(false);
      chatInputRef.current?.focus();
    }
  };

  const scrollChat = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollChat(); }, [chatMessages, scrollChat]);

  const sectionStyle = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(5,150,105,0.1)',
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
          fontFamily: "'JetBrains Mono', monospace", transition: 'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          ← Back to Import
        </button>
        <span style={{ fontSize: 12, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>
          {batchResults?.length || 0} file{(batchResults?.length || 0) !== 1 ? 's' : ''} analyzed
          {batchErrors?.length > 0 && (
            <span style={{ color: '#f87171', marginLeft: 8 }}>{batchErrors.length} failed</span>
          )}
        </span>
        <button onClick={() => setChatOpen(v => !v)} style={{
          marginLeft: 'auto', background: 'none', border: `1px solid ${chatOpen ? 'rgba(5,150,105,0.5)' : 'rgba(5,150,105,0.2)'}`,
          color: chatOpen ? '#34d399' : '#78716c', borderRadius: 8, padding: '6px 14px', fontSize: 11,
          cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", transition: 'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          💬 {chatOpen ? 'Close Chat' : 'Chat'}
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

      {/* Chat bar (collapsible) */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 300, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', marginTop: 16 }}
          >
            <div style={{
              ...sectionStyle, height: '100%',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Chat header with file selector */}
              <div style={{
                padding: '10px 16px',
                borderBottom: '1px solid rgba(5,150,105,0.1)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 11, color: '#34d399', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  💬 Chat
                </span>
                <select
                  value={selectedFile?.document_id || selectedFile?.analysis_id || ''}
                  onChange={(e) => {
                    const match = chatFiles.find(f => (f.document_id || f.analysis_id) === e.target.value);
                    if (match) handleChatSelectFile(match);
                  }}
                  style={{
                    background: '#292524', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 6,
                    padding: '4px 8px', fontSize: 11, color: '#ecfdf5',
                    fontFamily: "'JetBrains Mono', monospace", outline: 'none',
                    cursor: 'pointer', maxWidth: 300,
                  }}
                >
                  {chatFiles.map(f => (
                    <option key={f.document_id || f.analysis_id} value={f.document_id || f.analysis_id}>
                      {(f.path || f.filename).split('/').pop()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Messages */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: 12,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {!(selectedFile?.document_id || selectedFile?.analysis_id) ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#78716c', fontSize: 12 }}>
                    Select a file to chat about
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#78716c', fontSize: 12 }}>
                    Ask a question about {(selectedFile.path || selectedFile.filename).split('/').pop()}
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '80%',
                        background: msg.role === 'user' ? 'rgba(5,150,105,0.1)' : '#292524',
                        border: msg.role === 'user' ? '1px solid rgba(5,150,105,0.2)' : '1px solid #44403c',
                        borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        padding: '10px 14px',
                      }}>
                        <p style={{ fontSize: 12, color: msg.role === 'user' ? '#34d399' : '#e7e5e4', fontFamily: "'Inter', sans-serif", lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.content}
                          {msg.role === 'assistant' && i === chatMessages.length - 1 && chatStreaming && (
                            <span style={{ animation: 'pulse 1s infinite', marginLeft: 2 }}>▊</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(5,150,105,0.1)', display: 'flex', gap: 8 }}>
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                  placeholder={(selectedFile?.document_id || selectedFile?.analysis_id) ? "Ask a question..." : "Select a file first..."}
                  rows={1}
                  disabled={!(selectedFile?.document_id || selectedFile?.analysis_id) || chatStreaming}
                  style={{
                    flex: 1, background: '#292524', border: '1px solid rgba(5,150,105,0.2)',
                    borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#e7e5e4',
                    fontFamily: "'Inter', sans-serif", outline: 'none', resize: 'none',
                    lineHeight: 1.5, maxHeight: 80,
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'rgba(5,150,105,0.6)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(5,150,105,0.2)'; }}
                  onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'; }}
                />
                <button
                  onClick={handleChatSend}
                  disabled={!chatInput.trim() || !(selectedFile?.document_id || selectedFile?.analysis_id) || chatStreaming}
                  style={{
                    background: !chatInput.trim() || !(selectedFile?.document_id || selectedFile?.analysis_id) || chatStreaming ? 'rgba(5,150,105,0.2)' : 'linear-gradient(135deg, #047857, #059669)',
                    border: 'none', borderRadius: 10, padding: '8px 14px',
                    color: !chatInput.trim() || !(selectedFile?.document_id || selectedFile?.analysis_id) || chatStreaming ? '#78716c' : '#fff',
                    cursor: !chatInput.trim() || !(selectedFile?.document_id || selectedFile?.analysis_id) || chatStreaming ? 'not-allowed' : 'pointer',
                    fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                    transition: 'all 0.2s', whiteSpace: 'nowrap',
                  }}
                >
                  {chatStreaming ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
                      Sending
                    </span>
                  ) : 'Send'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat error toast */}
      {chatError && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, padding: '12px 20px', color: '#f87171', fontSize: 12, fontFamily: "'Inter', sans-serif", backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          {chatError}
        </div>
      )}
    </motion.div>
  );
}

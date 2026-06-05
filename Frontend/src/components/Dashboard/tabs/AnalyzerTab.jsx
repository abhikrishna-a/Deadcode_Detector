import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Editor } from '@monaco-editor/react';
import { analysisAPI } from '../../../api/analysis';
import { analyzeFiles, splitIntoBatches } from '../../../lib/batchAnalyzer';
import ResultsPanel from '../ResultsPanel';
import Btn from '../../ui/Btn';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';

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
  return m[lang?.toLowerCase()] || '#6b7280';
};

function severityToMonaco(severity) {
  if (severity === 'high' || severity === 'error') return 8;
  if (severity === 'medium' || severity === 'warning') return 4;
  return 2;
}

const ACCEPTED_EXTS = new Set(['.py', '.js', '.jsx', '.ts', '.tsx', '.txt', '.md']);
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.venv', 'venv']);
const MAX_FOLDER_FILES = 200;

function isAcceptedFile(name) {
  return ACCEPTED_EXTS.has('.' + name.split('.').pop()?.toLowerCase());
}

export default function AnalyzerTab({ results, onResultsChange, onFileChange, file, onChatAboutFile }) {
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [ragUploading, setRagUploading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sourceCode, setSourceCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [codeViewerOpen, setCodeViewerOpen] = useState(false);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const inputRef = useRef(null);
  const folderInputRef = useRef(null);
  const abortRef = useRef(null);

  // Batch state
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchMode, setBatchMode] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  // Git state
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');

  const [gitLoading, setGitLoading] = useState(false);
  const [gitManifest, setGitManifest] = useState(null);
  const [gitSelectedPaths, setGitSelectedPaths] = useState([]);
  const [gitSessionId, setGitSessionId] = useState(null);
  const [gitExpired, setGitExpired] = useState(false);
  const [gitCountdown, setGitCountdown] = useState(15 * 60);

  useEffect(() => {
    (async () => {
      setHistoryLoading(true);
      try {
        const resp = await analysisAPI.ragHistory(20, 0);
        setHistory(resp.items || []);
      } catch {
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [results]);

  useEffect(() => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSourceCode(e.target?.result || '');
      };
      reader.readAsText(file);
    } else {
      setSourceCode('');
    }
  }, [file]);

  useEffect(() => {
    setShowCode(!!results && !results._error && sourceCode);
  }, [results, sourceCode]);

  useEffect(() => {
    if (showCode && editorRef.current && monacoRef.current && results?.issues) {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor.getModel();
      if (!model) return;
      const markers = results.issues
        .filter(i => i.line_start)
        .map(i => ({
          startLineNumber: i.line_start,
          startColumn: 1,
          endLineNumber: i.line_end || i.line_start,
          endColumn: 1,
          message: `[${i.severity?.toUpperCase()}] ${i.description || i.message || ''}`,
          severity: severityToMonaco(i.severity),
        }));
      monaco.editor.setModelMarkers(model, 'analyzer', markers);
    }
  }, [showCode, results]);

  // Git session countdown
  useEffect(() => {
    if (!gitSessionId) return;
    setGitExpired(false);
    setGitCountdown(15 * 60);
    const interval = setInterval(() => {
      setGitCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setGitExpired(true);
          setGitManifest(null);
          setGitSessionId(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gitSessionId]);

  // Live elapsed timer for batch analysis
  useEffect(() => {
    const isActive = batchMode && batchProgress && (batchProgress.completed + batchProgress.failed < batchProgress.total);
    if (isActive) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [batchMode, batchProgress?.completed, batchProgress?.failed, batchProgress?.total]);

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  }, []);

  const handleFileSelected = (f) => {
    if (f) {
      onFileChange(f);
      onResultsChange(null);
      setBatchMode(false);
      setBatchProgress(null);
    }
  };

  const collectFilesFromEntry = async (entry, path = '') => {
    if (entry.isFile) {
      const file = await new Promise((resolve) => entry.file(resolve));
      if (isAcceptedFile(file.name)) {
        const content = await file.text();
        return [{
          path: path + file.name,
          content,
          size_bytes: file.size,
        }];
      }
      return [];
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = await new Promise((resolve) => reader.readEntries(resolve));
      const results = [];
      for (const child of entries) {
        if (child.isDirectory && SKIP_DIRS.has(child.name)) continue;
        const sub = await collectFilesFromEntry(child, path + entry.name + '/');
        results.push(...sub);
      }
      return results;
    }
    return [];
  };

  const collectFilesFromDirHandle = async (dirHandle, path = '') => {
    const results = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'directory') {
        if (SKIP_DIRS.has(name)) continue;
        const sub = await collectFilesFromDirHandle(handle, path + name + '/');
        results.push(...sub);
      } else if (handle.kind === 'file') {
        if (!isAcceptedFile(name)) continue;
        const file = await handle.getFile();
        const content = await file.text();
        results.push({ path: path + name, content, size_bytes: file.size });
      }
    }
    return results;
  };

  const collectFilesFromFileList = async (fileList, basePath = '') => {
    const results = [];
    const entries = {};
    for (const f of fileList) {
      const rel = f.webkitRelativePath || f.name;
      const parts = rel.replace(/\\/g, '/').split('/');
      if (parts.some(p => SKIP_DIRS.has(p))) continue;
      if (!isAcceptedFile(f.name)) continue;
      const path = basePath + rel;
      if (!entries[path]) {
        entries[path] = f;
      }
    }
    for (const [path, f] of Object.entries(entries)) {
      const content = await f.text();
      results.push({ path, content, size_bytes: f.size });
    }
    return results;
  };

  const handleFolderDrop = async (entries) => {
    setLoading(true);
    setBatchMode(true);
    setBatchProgress(null);
    abortRef.current = new AbortController();

    try {
      const dirEntry = entries.find(e => e?.isDirectory);
      if (!dirEntry) return;
      const files = await collectFilesFromEntry(dirEntry);
      await runBatchAnalysis(files);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Folder drop failed:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFolderPicker = async () => {
    setLoading(true);
    setBatchMode(true);
    setBatchProgress(null);
    abortRef.current = new AbortController();

    try {
      let files = [];
      if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        files = await collectFilesFromDirHandle(dirHandle);
      } else {
        folderInputRef.current?.click();
        return;
      }

      if (files.length > MAX_FOLDER_FILES) {
        files.sort((a, b) => a.path.localeCompare(b.path));
        files = files.slice(0, MAX_FOLDER_FILES);
      }

      await runBatchAnalysis(files);
    } catch (err) {
      if (err.name !== 'AbortError' && err.name !== 'SecurityError') {
        console.error('Folder pick failed:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFolderPickerFallback = async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    e.target.value = '';

    setLoading(true);
    setBatchMode(true);
    setBatchProgress(null);
    abortRef.current = new AbortController();

    try {
      let files = await collectFilesFromFileList(fileList);
      if (files.length > MAX_FOLDER_FILES) {
        files.sort((a, b) => a.path.localeCompare(b.path));
        files = files.slice(0, MAX_FOLDER_FILES);
      }
      await runBatchAnalysis(files);
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Folder pick failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const runBatchAnalysis = async (files) => {
    if (files.length === 0) {
      setBatchProgress({
        total: 0, completed: 0, failed: 0,
        currentBatch: 0, totalBatches: 0,
        results: [], errors: [],
      });
      return;
    }

    const raw = localStorage.getItem('auth-storage');
    let token = '';
    try { token = JSON.parse(raw)?.state?.token || ''; } catch {}

    const progress = await analyzeFiles(
      files,
      {
        ragBase: import.meta.env.VITE_RAG_URL || import.meta.env.VITE_RAG_API_URL || '/rag',
        token,
        signal: abortRef.current?.signal,
      },
      (p) => setBatchProgress({ ...p }),
    );

    setBatchProgress(progress);

    if (progress.results.length > 0) {
      const first = progress.results[0];
      onResultsChange({
        filename: first.filename,
        document_id: first.document_id,
        ...first.analysis,
        _batch_results: progress.results,
        _batch_errors: progress.errors,
      });
    }
  };

  const handleCancelBatch = () => {
    abortRef.current?.abort();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);

    if (e.dataTransfer.items) {
      const entries = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry?.());
      if (entries.some(e => e?.isDirectory)) {
        handleFolderDrop(entries);
        return;
      }
    }

    const f = e.dataTransfer.files[0];
    if (f) handleFileSelected(f);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleClick = () => inputRef.current?.click();

  const handleInputChange = (e) => {
    const f = e.target.files[0];
    if (f) handleFileSelected(f);
    e.target.value = '';
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setBatchMode(false);
    try {
      setRagUploading(true);
      const result = await analysisAPI.analyzeFile(file);
      onResultsChange({
        filename: result.filename,
        document_id: result.document_id,
        ...result.analysis,
      });
    } catch (err) {
      onResultsChange({
        summary: { total_issues: 0, severity_counts: {}, categories: {}, overall_health: 'error', health_score: 0 },
        issues: [],
        metrics: { total_lines: 0, dead_lines_estimate: 0, dead_code_percentage: 0 },
        _error: err.message || 'Analysis failed',
      });
    } finally {
      setRagUploading(false);
      setLoading(false);
    }
  };

  const handleHistoryClick = async (item) => {
    try {
      setLoading(true);
      const doc = await analysisAPI.ragGetAnalysis(item.analysis_id);
      onResultsChange({
        filename: doc.filename,
        document_id: doc.analysis_id,
        ...doc.analysis,
        cached: doc.cached,
      });
    } catch (err) {
      onResultsChange({
        summary: { total_issues: 0, severity_counts: {}, categories: {}, overall_health: 'error' },
        issues: [],
        metrics: { total_lines: 0, dead_lines_estimate: 0, dead_code_percentage: 0 },
        _error: err.message || 'Failed to load analysis',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleHistoryDelete = async (e, analysisId) => {
    e.stopPropagation();
    try {
      await analysisAPI.ragDeleteAnalysis(analysisId);
      setHistory(prev => prev.filter(h => h.analysis_id !== analysisId));
      if (results?.document_id === analysisId) onResultsChange(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Git handlers
  const handleGitClone = async () => {
    if (!gitUrl) return;
    setGitLoading(true);
    setGitManifest(null);
    setGitSessionId(null);
    setGitExpired(false);
    try {
      const manifest = await analysisAPI.gitClone(gitUrl, gitBranch);
      setGitManifest(manifest);
      setGitSessionId(manifest.session_id);
      setGitSelectedPaths(manifest.files.map(f => f.path));
    } catch (err) {
      onResultsChange({
        summary: { total_issues: 0, severity_counts: {}, categories: {}, overall_health: 'error' },
        issues: [],
        metrics: { total_lines: 0, dead_lines_estimate: 0, dead_code_percentage: 0 },
        _error: err.message || 'Git clone failed',
      });
    } finally {
      setGitLoading(false);
    }
  };

  const handleGitAnalyzeSelected = async () => {
    if (!gitSessionId || gitSelectedPaths.length === 0) return;

    setLoading(true);
    setBatchMode(true);
    setBatchProgress(null);
    abortRef.current = new AbortController();

    try {
      const batches = splitIntoBatches(
        gitSelectedPaths.map(p => ({ path: p, content: '', size_bytes: 0 }))
      );
      let allFiles = [];

      for (const batch of batches) {
        if (abortRef.current?.signal.aborted) break;
        const paths = batch.map(f => f.path);
        const contents = await analysisAPI.gitFetchFiles(gitSessionId, paths);
        for (const item of contents.files) {
          allFiles.push({
            path: item.path,
            content: item.content,
            size_bytes: item.size_bytes,
          });
        }
      }

      if (allFiles.length === 0) return;

      const raw = localStorage.getItem('auth-storage');
      let token = '';
      try { token = JSON.parse(raw)?.state?.token || ''; } catch {}

      const progress = await analyzeFiles(
        allFiles,
        {
          ragBase: import.meta.env.VITE_RAG_URL || import.meta.env.VITE_RAG_API_URL || '/rag',
          token,
          signal: abortRef.current?.signal,
        },
        (p) => setBatchProgress({ ...p }),
      );

      setBatchProgress(progress);

      if (progress.results.length > 0) {
        const first = progress.results[0];
        onResultsChange({
          filename: first.filename,
          document_id: first.document_id,
          ...first.analysis,
          _batch_results: progress.results,
          _batch_errors: progress.errors,
        });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        onResultsChange({
          summary: { total_issues: 0, severity_counts: {}, categories: {}, overall_health: 'error' },
          issues: [],
          metrics: { total_lines: 0, dead_lines_estimate: 0, dead_code_percentage: 0 },
          _error: err.message || 'Git analysis failed',
        });
      }
    } finally {
      setLoading(false);
      setGitPanelOpen(false);
    }
  };

  const handleToggleGitPath = (path) => {
    setGitSelectedPaths(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const handleDeselectLarge = () => {
    setGitSelectedPaths(prev =>
      prev.filter(p => {
        const f = gitManifest?.files.find(x => x.path === p);
        return !f || f.size_bytes <= 100 * 1024;
      })
    );
  };

  const healthScore = results && !results._error
    ? (results?.summary?.health_score ??
       ({ clean: 100, good: 82, needs_attention: 55, poor: 25 })[results?.summary?.overall_health] ?? 50)
    : null;
  const healthColor = healthScore > 80 ? '#4ade80' : healthScore > 50 ? '#fb923c' : '#f87171';
  const totalIssues = results?.summary?.total_issues ?? results?.issues?.length ?? 0;
  const sevCounts = results?.summary?.severity_counts || {};
  const isAnalyzing = loading || ragUploading;
  const hasError = results?._error;
  const hasResults = !!results && !hasError && totalIssues >= 0;

  const ext = file?.name?.split('.').pop() || 'py';
  const langMap = { py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', txt: 'plaintext', md: 'markdown' };
  const editorLang = langMap[ext] || 'plaintext';

  const dropZoneBorderColor = file
    ? 'rgba(74,222,128,0.5)'
    : dragOver
      ? 'rgba(249,115,22,0.7)'
      : 'rgba(249,115,22,0.25)';

  const dropZoneStyle = {
    border: `2px dashed ${dropZoneBorderColor}`,
    background: dragOver ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    padding: 28,
    minHeight: 140,
    cursor: 'pointer',
    transition: 'all 0.25s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  };

  const sectionStyle = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(249,115,22,0.1)',
    borderRadius: 16,
    overflow: 'hidden',
  };

  const batchInProgress = batchMode && batchProgress && (batchProgress.completed + batchProgress.failed < batchProgress.total);

  // Group git files by top-level directory
  const groupedFiles = {};
  if (gitManifest) {
    for (const f of gitManifest.files) {
      const top = f.path.split('/')[0] || '(root)';
      if (!groupedFiles[top]) groupedFiles[top] = [];
      groupedFiles[top].push(f);
    }
  }

  return (
    <motion.div
      key="analyzer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {/* ─── 3-COLUMN LAYOUT ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 220px', gap: 20, alignItems: 'start' }}>

        {/* ─── LEFT: Drop zone + Progress + Actions ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={dropZoneStyle} onClick={handleClick} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
            {file && !batchMode ? (
              <>
                <span style={{ fontSize: 28, marginBottom: 6 }}>📄</span>
                <p style={{ fontSize: 13, color: '#f5ede0', fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{file.name}</p>
                <p style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{(file.size / 1024).toFixed(1)} KB · Click to change</p>
              </>
            ) : batchMode && batchProgress ? (
              <>
                <span style={{ fontSize: 28, marginBottom: 6 }}>📁</span>
                <p style={{ fontSize: 13, color: '#f5ede0', fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                  {batchProgress.total} file{batchProgress.total !== 1 ? 's' : ''}
                </p>
                <p style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                  {batchProgress.completed} done · {batchProgress.failed} failed
                </p>
              </>
            ) : (
              <>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.6 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0l-3 3m3-3l3 3" />
                </svg>
                <p style={{ fontSize: 13, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>Drop a file or folder</p>
                <p style={{ fontSize: 10, color: '#4a4038', marginTop: 4 }}>or click · .py .js .ts .txt</p>
              </>
            )}
            <input ref={inputRef} type="file" accept=".py,.js,.ts,.jsx,.tsx,.txt,.md" style={{ display: 'none' }} onChange={handleInputChange} />
            <input ref={folderInputRef} type="file" webkitdirectory="" multiple style={{ display: 'none' }} onChange={handleFolderPickerFallback} />
          </div>

          {/* Upload Folder & Git buttons */}
          {!file && !batchMode && !batchProgress && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={handleFolderPicker} style={{ flex: 1, fontSize: 11, padding: '8px 12px' }}>
                📁 Upload folder
              </Btn>
              <Btn variant="ghost" onClick={() => setGitPanelOpen(true)} style={{ flex: 1, fontSize: 11, padding: '8px 12px' }}>
                Import from GitHub
              </Btn>
            </div>
          )}

          {/* Git import modal */}
          <Modal open={gitPanelOpen} onClose={() => setGitPanelOpen(false)} title="IMPORT FROM GITHUB" width={560}>
            {!gitManifest ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Input
                  label="Repo URL"
                  value={gitUrl}
                  onChange={e => setGitUrl(e.target.value)}
                  placeholder="https://github.com/user/repo"
                />
                <Input
                  label="Branch"
                  value={gitBranch}
                  onChange={e => setGitBranch(e.target.value)}
                  placeholder="main"
                />
                <Btn variant="solid" onClick={handleGitClone} disabled={gitLoading || !gitUrl} style={{ width: '100%' }}>
                  {gitLoading ? 'Cloning…' : 'Clone & inspect'}
                </Btn>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>
                  <p>{gitManifest.repo_name} · {gitManifest.branch}</p>
                  <p>{gitManifest.total_files} files · {(gitManifest.total_bytes / 1024).toFixed(1)} KB</p>
                  {gitExpired ? (
                    <p style={{ color: '#f87171', marginTop: 4 }}>Session expired — close and re-import.</p>
                  ) : (
                    <p style={{ color: '#fb923c', marginTop: 4 }}>Session expires in {Math.floor(gitCountdown / 60)}:{String(gitCountdown % 60).padStart(2, '0')}</p>
                  )}
                </div>

                {/* Language breakdown */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(
                    gitManifest.files.reduce((acc, f) => {
                      acc[f.language] = (acc[f.language] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([lang, count]) => (
                    <span key={lang} style={{
                      fontSize: 10, color: extColor(lang),
                      background: `${extColor(lang)}11`,
                      borderRadius: 6, padding: '2px 8px',
                      fontFamily: "'DM Mono', monospace",
                    }}>
                      {lang} ×{count}
                    </span>
                  ))}
                </div>

                {/* File list grouped by directory */}
                <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <button onClick={handleDeselectLarge} style={{
                      background: 'none', border: 'none', color: '#6b7280', fontSize: 10,
                      cursor: 'pointer', fontFamily: "'DM Mono', monospace",
                    }}>
                      Deselect &gt; 100 KB
                    </button>
                    <span style={{ fontSize: 10, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>
                      {gitSelectedPaths.length} selected
                    </span>
                  </div>
                  {Object.entries(groupedFiles).map(([dir, files]) => (
                    <div key={dir}>
                      <p style={{ fontSize: 10, color: '#fb923c', fontFamily: "'DM Mono', monospace", fontWeight: 600, margin: '4px 0 2px' }}>
                        {dir}/
                      </p>
                      {files.map(f => (
                        <label key={f.path} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '2px 4px', cursor: 'pointer', fontSize: 10,
                          color: '#6b7280', fontFamily: "'DM Mono', monospace",
                        }}>
                          <input
                            type="checkbox"
                            checked={gitSelectedPaths.includes(f.path)}
                            onChange={() => handleToggleGitPath(f.path)}
                            style={{ accentColor: '#f97316' }}
                          />
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: extColor(f.language), flexShrink: 0,
                          }} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.path.split('/').slice(1).join('/') || f.path.split('/')[0]}
                          </span>
                          <span style={{ color: '#4a4038', flexShrink: 0 }}>
                            {(f.size_bytes / 1024).toFixed(1)} KB
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>

                {!gitExpired && (
                  <Btn
                    variant="solid"
                    onClick={handleGitAnalyzeSelected}
                    disabled={gitSelectedPaths.length === 0 || loading}
                    style={{ width: '100%' }}
                  >
                    Analyze selected ({gitSelectedPaths.length})
                  </Btn>
                )}

                {gitExpired && (
                  <Btn variant="ghost" onClick={() => { setGitManifest(null); setGitSessionId(null); }} style={{ width: '100%' }}>
                    Re-import repository
                  </Btn>
                )}
              </div>
            )}
          </Modal>

          <div style={{ ...sectionStyle, padding: 20 }}>
            <p style={{ fontSize: 11, color: '#fb923c', fontFamily: "'DM Mono', monospace", fontWeight: 600, marginBottom: 14, letterSpacing: 0.5 }}>
              {batchMode ? 'BATCH PROGRESS' : 'ANALYSIS PROGRESS'}
            </p>

            {!file && !results && !batchProgress && !batchInProgress && !gitPanelOpen && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <p style={{ fontSize: 12, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>No file selected</p>
                <p style={{ fontSize: 10, color: '#4a4038', marginTop: 6 }}>Drop a file above to begin</p>
              </div>
            )}

            {file && !isAnalyzing && !hasResults && !hasError && !batchMode && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <p style={{ fontSize: 12, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>Ready to analyze</p>
              </div>
            )}

            {/* Batch progress view */}
            {batchProgress && (
              <div>
                {/* Live timer */}
                {batchInProgress && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#fb923c', fontFamily: "'DM Mono', monospace" }}>
                      Analyzing... {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
                    </span>
                    <button onClick={handleCancelBatch} style={{
                      background: 'none', border: '1px solid rgba(248,113,113,0.3)',
                      color: '#f87171', borderRadius: 6, padding: '2px 8px', fontSize: 10,
                      cursor: 'pointer', fontFamily: "'DM Mono', monospace",
                    }}>
                      Cancel
                    </button>
                  </div>
                )}

                {/* Completed status */}
                {!batchInProgress && batchProgress.total > 0 && (
                  <div style={{ fontSize: 11, color: '#4ade80', fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
                    Completed in {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
                  </div>
                )}

                {/* Scanning file X of Y */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: batchInProgress ? '#fb923c' : '#f5ede0', fontFamily: "'DM Mono', monospace" }}>
                    {batchInProgress
                      ? `Scanning file ${batchProgress.completed + batchProgress.failed + 1} of ${batchProgress.total}`
                      : `${batchProgress.completed + batchProgress.failed} / ${batchProgress.total} files`
                    }
                  </span>
                  <span style={{ fontSize: 10, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>
                    {batchProgress.completed} done · {batchProgress.failed} failed
                  </span>
                </div>

                {/* Overall progress bar */}
                <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{
                    width: `${batchProgress.total > 0 ? ((batchProgress.completed + batchProgress.failed) / batchProgress.total * 100) : 0}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #ea580c, #f97316)',
                    borderRadius: 4,
                    transition: 'width 0.3s',
                  }} />
                </div>

                {/* Batch indicator (hidden in SSE mode) */}
                {batchProgress.currentBatch > 0 && (
                  <p style={{ fontSize: 10, color: '#6b7280', fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
                    Batch {batchProgress.currentBatch} / {batchProgress.totalBatches}
                  </p>
                )}

                {/* File rows */}
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {batchProgress.results.map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                      borderRadius: 6, fontSize: 10, fontFamily: "'DM Mono', monospace",
                    }}>
                      <span style={{ color: '#4ade80' }}>✓</span>
                      <span style={{ color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.filename}
                      </span>

                      {r.analysis?.summary?.health_score != null && (
                        <span style={{
                          color: r.analysis.summary.health_score > 80 ? '#4ade80' :
                                 r.analysis.summary.health_score > 50 ? '#fb923c' : '#f87171',
                          flexShrink: 0,
                        }}>
                          {r.analysis.summary.health_score}%
                        </span>
                      )}
                      {(r.analysis?.issues?.length ?? 0) > 0 && (
                        <span style={{ color: '#f87171', flexShrink: 0 }}>
                          {r.analysis.issues.length} iss.
                        </span>
                      )}
                      {r.analysis?._token_usage?.total_tokens > 0 && (
                        <span style={{ color: '#4a4038', flexShrink: 0 }}>
                          {r.analysis._token_usage.total_tokens}tok
                        </span>
                      )}
                    </div>
                  ))}
                  {batchProgress.errors.map((e, i) => (
                    <div key={`err-${i}`} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                      borderRadius: 6, fontSize: 10, fontFamily: "'DM Mono', monospace",
                    }}>
                      <span style={{ color: '#f87171' }}>✗</span>
                      <span style={{ color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.path.split('/').pop()}
                      </span>
                      <span style={{ color: '#f87171', fontSize: 9, flexShrink: 0 }}>{e.error}</span>
                    </div>
                  ))}
                  {batchInProgress && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                      fontSize: 10, fontFamily: "'DM Mono', monospace", color: '#fb923c',
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        border: '2px solid rgba(249,115,22,0.3)',
                        borderTopColor: '#fb923c',
                        animation: 'spin 0.6s linear infinite',
                        display: 'inline-block',
                        flexShrink: 0,
                      }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {batchProgress.currentFile ? batchProgress.currentFile.split('/').pop() : 'processing…'}
                      </span>
                      {batchProgress.chunkProgress && (
                        <span style={{ color: '#6b7280', flexShrink: 0 }}>
                          chunk {batchProgress.chunkProgress.current}/{batchProgress.chunkProgress.total}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Token usage summary */}
                {(() => {
                  const total = batchProgress.results.reduce(
                    (s, r) => s + (r.analysis?._token_usage?.total_tokens ?? 0), 0
                  );
                  const prompt = batchProgress.results.reduce(
                    (s, r) => s + (r.analysis?._token_usage?.prompt_tokens ?? 0), 0
                  );
                  const completion = batchProgress.results.reduce(
                    (s, r) => s + (r.analysis?._token_usage?.completion_tokens ?? 0), 0
                  );
                  if (total === 0) return null;
                  return (
                    <div style={{
                      marginTop: 8, padding: '6px 8px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 6, fontSize: 10,
                      color: '#6b7280', fontFamily: "'DM Mono', monospace",
                    }}>
                      Tokens: {total.toLocaleString()} total · {prompt.toLocaleString()} input · {completion.toLocaleString()} output
                    </div>
                  );
                })()}
              </div>
            )}

            {isAnalyzing && !batchMode && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: '50%',
                    border: '2px solid rgba(249,115,22,0.3)',
                    borderTopColor: '#fb923c',
                    animation: 'spin 0.6s linear infinite',
                    display: 'inline-block',
                  }} />
                  <span style={{ fontSize: 12, color: '#fb923c', fontFamily: "'DM Mono', monospace" }}>
                    {ragUploading ? 'Loading…' : 'Analyzing…'}
                  </span>
                </div>
                <div style={{ width: '100%', height: 4, background: 'rgba(249,115,22,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: '50%', height: '100%',
                    background: 'linear-gradient(90deg, #ea580c, #f97316)',
                    borderRadius: 2,
                    animation: 'scan 1.2s ease-in-out infinite',
                  }} />
                </div>
              </div>
            )}

            {hasError && (
              <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: '#f87171', fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>Analysis Failed</p>
                <p style={{ fontSize: 10, color: '#a8998a' }}>{results._error}</p>
              </div>
            )}

            {hasResults && !isAnalyzing && !batchMode && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: `conic-gradient(${healthColor} ${healthScore}%, rgba(255,255,255,0.05) ${healthScore}%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', background: '#0f0f0f',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: healthColor, fontFamily: "'DM Mono', monospace" }}>
                        {healthScore}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 13, color: '#f5ede0', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                      {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      {sevCounts.high > 0 && <span style={{ fontSize: 10, color: '#f87171', fontFamily: "'DM Mono', monospace" }}>● {sevCounts.high} high</span>}
                      {sevCounts.medium > 0 && <span style={{ fontSize: 10, color: '#fb923c', fontFamily: "'DM Mono', monospace" }}>● {sevCounts.medium} med</span>}
                      {sevCounts.low > 0 && <span style={{ fontSize: 10, color: '#fbbf24', fontFamily: "'DM Mono', monospace" }}>● {sevCounts.low} low</span>}
                    </div>
                  </div>
                </div>
                {totalIssues > 0 && (
                  <div style={{ width: '100%', height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
                    {sevCounts.high > 0 && <div style={{ flex: sevCounts.high, background: '#f87171' }} />}
                    {sevCounts.medium > 0 && <div style={{ flex: sevCounts.medium, background: '#fb923c' }} />}
                    {sevCounts.low > 0 && <div style={{ flex: sevCounts.low, background: '#fbbf24' }} />}
                  </div>
                )}
                <p style={{ fontSize: 10, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>
                  Overall: <span style={{ color: healthColor, fontWeight: 600 }}>{results?.summary?.overall_health?.replace('_', ' ') || 'unknown'}</span>
                  {results?.cached && <span style={{ color: '#4ade80', marginLeft: 4 }}>(cached)</span>}
                </p>
              </div>
            )}
          </div>

          {file && !isAnalyzing && !batchMode && (
            <Btn variant="solid" onClick={handleAnalyze} style={{ width: '100%' }}>
              Analyze {file.name} →
            </Btn>
          )}

          {results?.document_id && !isAnalyzing && !batchMode && (
            <Btn variant="ghost" onClick={() => onChatAboutFile?.(results.document_id, results.filename)} style={{ width: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                Chat about this file
              </span>
            </Btn>
          )}
        </div>

        {/* ─── CENTER: Analysis Report ─── */}
        <div style={{ ...sectionStyle, minHeight: 200 }}>
          {results ? (
            <ResultsPanel results={results} onClear={() => onResultsChange(null)} />
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '80px 20px', color: '#4a4038',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ opacity: 0.3, marginBottom: 12 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <p style={{ fontSize: 13, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>
                {file || batchProgress ? 'Analyze to see the report' : 'Select a file to begin'}
              </p>
            </div>
          )}
        </div>

        {/* ─── RIGHT: History ─── */}
        <div style={{
          ...sectionStyle, padding: 16,
          maxHeight: 'calc(100vh - 160px)', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <p style={{ fontSize: 10, color: '#fb923c', fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: 0.5, marginBottom: 2 }}>
            HISTORY ({history.length})
          </p>

          {historyLoading && <p style={{ fontSize: 11, color: '#6b7280', fontFamily: "'DM Mono', monospace", padding: 16, textAlign: 'center' }}>Loading...</p>}
          {!historyLoading && history.length === 0 && <p style={{ fontSize: 11, color: '#6b7280', fontFamily: "'DM Mono', monospace", padding: 16, textAlign: 'center' }}>No history yet.</p>}

          <AnimatePresence>
            {history.map((item) => {
              const isActive = results?.document_id === item.analysis_id;
              return (
                <motion.div
                  key={item.analysis_id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onClick={() => handleHistoryClick(item)}
                  style={{
                    background: isActive ? 'rgba(249,115,22,0.08)' : 'transparent',
                    border: isActive ? '1px solid rgba(249,115,22,0.35)' : '1px solid rgba(255,255,255,0.04)',
                    borderRadius: 8, padding: '8px 10px',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: extColor(item.language), flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#f5ede0', fontFamily: "'DM Mono', monospace", fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {item.filename}
                    </span>
                    <button
                      onClick={(e) => handleHistoryDelete(e, item.analysis_id)}
                      style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 10, padding: '1px 3px', borderRadius: 3, lineHeight: 1 }}
                      title="Delete"
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#6b7280'; }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 11 }}>
                    <span style={{ fontSize: 9, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>{formatDate(item.created_at)}</span>
                    {item.health_score > 0 && (
                      <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: item.health_score > 80 ? '#4ade80' : item.health_score > 50 ? '#fb923c' : '#f87171' }}>
                        {item.health_score}%
                      </span>
                    )}
                    <span style={{ fontSize: 9, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>{item.total_issues} iss.</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── CODE VIEWER DROPDOWN ─── */}
      {(file || results) && !batchMode && (
        <div style={{ ...sectionStyle, overflow: 'visible' }}>
          <div
            onClick={() => setCodeViewerOpen(v => !v)}
            style={{
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'pointer', userSelect: 'none',
              fontSize: 11, color: '#6b7280', fontFamily: "'DM Mono', monospace",
            }}
          >
            <span style={{
              transform: codeViewerOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s', fontSize: 10,
            }}>▶</span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: extColor(results?.language || editorLang), flexShrink: 0 }} />
            <span style={{ color: '#f5ede0', fontWeight: 600 }}>{results?.filename || file?.name}</span>
            {totalIssues > 0 && (
              <span style={{ color: '#f87171' }}>{totalIssues} issue{totalIssues !== 1 ? 's' : ''}</span>
            )}
            {hasResults && totalIssues === 0 && (
              <span style={{ color: '#4ade80' }}>✓ Clean</span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a4038' }}>
              {codeViewerOpen ? 'collapse' : 'expand'}
            </span>
          </div>
          <AnimatePresence>
            {codeViewerOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                {showCode ? (
                  <>
                    <Editor
                      height="calc(100vh - 360px)"
                      language={editorLang}
                      value={sourceCode}
                      theme="vs-dark"
                      onMount={handleEditorDidMount}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        fontSize: 12,
                        fontFamily: "'DM Mono', monospace",
                        renderLineHighlight: 'line',
                        overviewRulerLanes: 3,
                        overviewRulerBorder: false,
                        hideCursorInOverviewRuler: true,
                        glyphMargin: true,
                        folding: false,
                        lineDecorationsWidth: 8,
                      }}
                    />
                    {totalIssues > 0 && (
                      <div style={{
                        padding: '6px 16px',
                        borderTop: '1px solid rgba(249,115,22,0.08)',
                        display: 'flex', gap: 14, fontSize: 10, color: '#6b7280', fontFamily: "'DM Mono', monospace",
                        background: 'rgba(255,255,255,0.01)',
                      }}>
                        <span><span style={{ color: '#f87171' }}>■</span> Error</span>
                        <span><span style={{ color: '#fb923c' }}>■</span> Warning</span>
                        <span><span style={{ color: '#fbbf24' }}>■</span> Info</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '40px 20px', color: '#4a4038', borderTop: '1px solid rgba(249,115,22,0.08)',
                  }}>
                    <p style={{ fontSize: 12, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>
                      {file ? 'Analyze to see code with error highlights' : 'Select a file to begin'}
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

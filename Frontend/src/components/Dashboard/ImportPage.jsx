import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { analysisAPI } from '../../api/analysis';
import { analyzeFiles, splitIntoBatches } from '../../lib/batchAnalyzer';
import { simulateFiles } from '../../lib/simulation';
import Btn from '../ui/Btn';
import Input from '../ui/Input';
import Modal from '../ui/Modal';

function getAccessToken() {
  return document.cookie
    .split('; ')
    .find(r => r.startsWith('ghostcode_access='))
    ?.split('=')[1] || '';
}

const ACCEPTED_EXTS = new Set(['.py', '.js', '.jsx', '.ts', '.tsx', '.txt', '.md']);
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.venv', 'venv']);
const MAX_FOLDER_FILES = 200;

function isAcceptedFile(name) {
  return ACCEPTED_EXTS.has('.' + name.split('.').pop()?.toLowerCase());
}

const extColor = (lang) => {
  const m = { python: '#3572A5', javascript: '#f7df1e', typescript: '#3178c6', jsx: '#61dafb', tsx: '#3178c6' };
  return m[lang?.toLowerCase()] || '#78716c';
};

export default function ImportPage({ onAnalysisComplete, onError }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [ragUploading, setRagUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchMode, setBatchMode] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [simulateMode, setSimulateMode] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);
  const [diagnosing, setDiagnosing] = useState(false);

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
  const [gitError, setGitError] = useState('');

  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Live elapsed timer
  useEffect(() => {
    const isActive = batchMode && batchProgress && (batchProgress.completed + batchProgress.failed < batchProgress.total);
    if (isActive) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [batchMode, batchProgress?.completed, batchProgress?.failed, batchProgress?.total]);

  // Git session countdown
  useEffect(() => {
    if (!gitSessionId) return;
    setGitExpired(false);
    setGitCountdown(15 * 60);
    const interval = setInterval(() => {
      setGitCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); setGitExpired(true); setGitManifest(null); setGitSessionId(null); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gitSessionId]);

  const collectFilesFromEntry = async (entry, path = '') => {
    if (entry.isFile) {
      const f = await new Promise((resolve) => entry.file(resolve));
      if (isAcceptedFile(f.name)) {
        const content = await f.text();
        return [{ path: path + f.name, content, size_bytes: f.size }];
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
        const f = await handle.getFile();
        const content = await f.text();
        results.push({ path: path + name, content, size_bytes: f.size });
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
      if (!entries[path]) entries[path] = f;
    }
    for (const [path, f] of Object.entries(entries)) {
      const content = await f.text();
      results.push({ path, content, size_bytes: f.size });
    }
    return results;
  };

  const runBatchAnalysis = async (files, scanFolder = '', scanType = 'single') => {
    if (files.length === 0) {
      setBatchProgress({ total: 0, completed: 0, failed: 0, currentBatch: 0, totalBatches: 0, results: [], errors: [] });
      return;
    }
    const token = getAccessToken();
    setDiagnosis(null);

    const ragBase = import.meta.env.VITE_RAG_URL || import.meta.env.VITE_RAG_API_URL || '/rag';
    let progress;
    if (simulateMode) {
      progress = await simulateFiles(files, { signal: abortRef.current?.signal, failAt: 51, baseDelay: 100 }, (p) => setBatchProgress({ ...p }));
    } else {
      progress = await analyzeFiles(files, { ragBase, token, signal: abortRef.current?.signal, scanFolder, scanType }, (p) => setBatchProgress({ ...p }));
    }
    setBatchProgress(progress);
    setLoading(false);
    setBatchMode(false);

    // Attach source content to each result for code viewer
    const contentMap = new Map(files.map(f => [f.path, f.content]));
    const resultsWithContent = progress.results.map(r => ({
      ...r,
      _source_content: contentMap.get(r.filename || r.path) || '',
    }));

    if (resultsWithContent.length > 0) {
      onAnalysisComplete(resultsWithContent, progress.errors);
    } else if (progress.errors.length > 0) {
      onError?.(progress.errors[0]?.error || 'All files failed to analyze');
    }
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
      await runBatchAnalysis(files, dirEntry.name, 'folder');
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Folder drop failed:', err);
    } finally { setLoading(false); }
  };

  const handleFolderPicker = async () => {
    setLoading(true);
    setBatchProgress(null);
    abortRef.current = new AbortController();
    try {
      let files = [];
      let folderName = '';
      if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        folderName = dirHandle.name;
        files = await collectFilesFromDirHandle(dirHandle);
      } else {
        folderInputRef.current?.click();
        return;
      }
      if (files.length > MAX_FOLDER_FILES) {
        files.sort((a, b) => a.path.localeCompare(b.path));
        files = files.slice(0, MAX_FOLDER_FILES);
      }
      setBatchMode(true);
      await runBatchAnalysis(files, folderName, 'folder');
    } catch (err) {
      if (err.name !== 'AbortError' && err.name !== 'SecurityError') console.error('Folder pick failed:', err);
    } finally { setLoading(false); }
  };

  const handleFolderPickerFallback = async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    e.target.value = '';
    setLoading(true);
    setBatchProgress(null);
    abortRef.current = new AbortController();
    try {
      let files = await collectFilesFromFileList(fileList);
      if (files.length > MAX_FOLDER_FILES) {
        files.sort((a, b) => a.path.localeCompare(b.path));
        files = files.slice(0, MAX_FOLDER_FILES);
      }
      const folderName = files.length > 0 ? (files[0].path.split('/')[0] || 'folder') : 'folder';
      setBatchMode(true);
      await runBatchAnalysis(files, folderName, 'folder');
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Folder pick failed:', err);
    } finally { setLoading(false); }
  };

  const handleFileSelected = (f) => {
    setFile(f);
    setBatchMode(false);
    setBatchProgress(null);
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

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setBatchMode(false);
    try {
      setRagUploading(true);
      const result = await analysisAPI.analyzeFile(file);
      const fileResult = {
        path: file.name,
        filename: file.name,
        document_id: result.document_id,
        analysis: result.analysis,
        cached: result.cached,
        scan_type: 'single',
      };
      onAnalysisComplete([fileResult], []);
    } catch (err) {
      onError?.(err.message || 'Analysis failed');
    } finally {
      setRagUploading(false);
      setLoading(false);
    }
  };

  const handleCancelBatch = () => {
    abortRef.current?.abort();
    setBatchProgress(prev => prev ? { ...prev, _stop_reason: 'User cancelled the analysis.', _simulated: simulateMode || undefined } : prev);
  };

  // Git handlers
  const handleGitClone = async () => {
    if (!gitUrl) return;
    setGitLoading(true);
    setGitManifest(null);
    setGitSessionId(null);
    setGitExpired(false);
    setGitError('');
    try {
      const manifest = await analysisAPI.gitClone(gitUrl, gitBranch);
      setGitManifest(manifest);
      setGitSessionId(manifest.session_id);
      setGitSelectedPaths(manifest.files.map(f => f.path));
    } catch (err) {
      setGitError(err.message || 'Git clone failed');
    } finally { setGitLoading(false); }
  };

  const handleGitAnalyzeSelected = async () => {
    if (!gitSessionId || gitSelectedPaths.length === 0) return;
    setLoading(true);
    setBatchMode(true);
    setBatchProgress(null);
    abortRef.current = new AbortController();
    try {
      const batches = splitIntoBatches(gitSelectedPaths.map(p => ({ path: p, content: '', size_bytes: 0 })));
      let allFiles = [];
      for (const batch of batches) {
        if (abortRef.current?.signal.aborted) break;
        const paths = batch.map(f => f.path);
        const contents = await analysisAPI.gitFetchFiles(gitSessionId, paths);
        for (const item of contents.files) {
          allFiles.push({ path: item.path, content: item.content, size_bytes: item.size_bytes });
        }
      }
      if (allFiles.length === 0) return;
      const token = getAccessToken();
      const ownerRepo = gitManifest?.repo_url
        ? new URL(gitManifest.repo_url).pathname.replace(/^\//, '').replace(/\/$/, '')
        : '';
      const repoScanFolder = ownerRepo || gitManifest?.repo_name || allFiles[0]?.path?.split('/')[0] || 'github-repo';
      const progress = await analyzeFiles(
        allFiles,
        { ragBase: import.meta.env.VITE_RAG_URL || import.meta.env.VITE_RAG_API_URL || '/rag', token, signal: abortRef.current?.signal, scanFolder: repoScanFolder, scanType: 'repo' },
        (p) => setBatchProgress({ ...p }),
      );
      setBatchProgress(progress);
      setLoading(false);
      setBatchMode(false);
      if (progress.results.length > 0) {
        onAnalysisComplete(progress.results, progress.errors);
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err.message || 'Git analysis failed');
    } finally { setLoading(false); setGitPanelOpen(false); }
  };

  const handleDiagnose = async () => {
    if (!batchProgress) return;
    setDiagnosing(true);
    try {
      const total = batchProgress.results.reduce((s, r) => s + (r.analysis?._token_usage?.total_tokens ?? 0), 0);
      const result = await analysisAPI.ragDiagnose({
        total_files: batchProgress.total,
        completed: batchProgress.completed,
        failed: batchProgress.failed,
        total_tokens: total,
        stop_reason: batchProgress['_stop_reason'] || `Analysis stopped at file ${batchProgress.completed + batchProgress.failed} of ${batchProgress.total} with ${batchProgress.failed} failed.`,
        file_results: batchProgress.results.slice(0, 10).map(r => ({ filename: r.filename, health_score: r.analysis?.summary?.health_score ?? 0, issues: r.analysis?.issues?.length ?? 0 })),
      });
      setDiagnosis(result);
    } catch (err) {
      const stoppedAt = batchProgress.completed + batchProgress.failed;
      setDiagnosis({
        diagnosis: batchProgress.failed > 0 && stoppedAt < batchProgress.total
          ? 'Analysis stopped prematurely after file failures.'
          : `Analysis completed ${batchProgress.completed}/${batchProgress.total} files.`,
        root_cause: batchProgress['_stop_reason'] || `Stopped at file ${stoppedAt} of ${batchProgress.total}.`,
        suggestion: batchProgress.failed > 0 ? 'Review failed files and re-run individually.' : 'User cancelled.',
      });
    } finally { setDiagnosing(false); }
  };

  const isAnalyzing = loading || ragUploading;
  const batchInProgress = batchMode && batchProgress && (batchProgress.completed + batchProgress.failed < batchProgress.total);

  const groupedFiles = {};
  if (gitManifest) {
    for (const f of gitManifest.files) {
      const top = f.path.split('/')[0] || '(root)';
      if (!groupedFiles[top]) groupedFiles[top] = [];
      groupedFiles[top].push(f);
    }
  }

  const dropZoneStyle = {
    border: `2px dashed ${file ? 'rgba(74,222,128,0.5)' : dragOver ? 'rgba(5,150,105,0.7)' : 'rgba(5,150,105,0.25)'}`,
    background: dragOver ? 'rgba(5,150,105,0.06)' : 'rgba(255,255,255,0.02)',
    borderRadius: 16, padding: 28, minHeight: 140, cursor: 'pointer',
    transition: 'all 0.25s',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
  };

  const sectionStyle = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(5,150,105,0.1)',
    borderRadius: 16, overflow: 'hidden',
  };

  // After batch completes, show "View Results" button
  const batchDone = batchProgress && batchProgress.total > 0 && !batchInProgress;
  const hasIssues = (file || (batchProgress?.results?.length > 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640, margin: '0 auto', paddingTop: 40 }}
    >
      <div style={dropZoneStyle} onClick={() => inputRef.current?.click()} onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}>
        {file && !batchMode ? (
          <>
            <span style={{ fontSize: 28, marginBottom: 6 }}>📄</span>
            <p style={{ fontSize: 13, color: '#ecfdf5', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{file.name}</p>
            <p style={{ fontSize: 10, color: '#78716c', marginTop: 2 }}>{(file.size / 1024).toFixed(1)} KB · Click to change</p>
          </>
        ) : batchProgress ? (
          <>
            <span style={{ fontSize: 28, marginBottom: 6 }}>📁</span>
            <p style={{ fontSize: 13, color: '#ecfdf5', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
              {batchProgress.total} file{batchProgress.total !== 1 ? 's' : ''}
            </p>
            <p style={{ fontSize: 10, color: '#78716c', marginTop: 2 }}>
              {batchProgress.completed} done · {batchProgress.failed} failed
            </p>
          </>
        ) : (
          <>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.6 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0l-3 3m3-3l3 3" />
            </svg>
            <p style={{ fontSize: 13, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>Drop a file or folder</p>
            <p style={{ fontSize: 10, color: '#57534e', marginTop: 4 }}>or click · .py .js .ts .txt</p>
          </>
        )}
        <input ref={inputRef} type="file" accept=".py,.js,.ts,.jsx,.tsx,.txt,.md" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFileSelected(f); e.target.value = ''; }} />
        <input ref={folderInputRef} type="file" webkitdirectory="" multiple style={{ display: 'none' }} onChange={handleFolderPickerFallback} />
      </div>

      {!file && !batchMode && !batchProgress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={handleFolderPicker} style={{ flex: 1, fontSize: 11, padding: '8px 12px' }}>
              📁 Upload folder
            </Btn>
            <Btn variant="ghost" onClick={() => setGitPanelOpen(true)} style={{ flex: 1, fontSize: 11, padding: '8px 12px' }}>
              Import from GitHub
            </Btn>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#78716c', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', padding: '4px 0' }}>
            <input type="checkbox" checked={simulateMode} onChange={e => setSimulateMode(e.target.checked)} style={{ accentColor: '#059669' }} />
            Simulation mode (stops at file 52 for testing)
          </label>
        </div>
      )}

      {file && !batchMode && (
        <Btn variant="solid" onClick={handleAnalyze} disabled={isAnalyzing} style={{ width: '100%' }}>
          {isAnalyzing ? 'Analyzing…' : `Analyze ${file.name} →`}
        </Btn>
      )}

      {/* Progress section */}
      {batchProgress && (
        <div style={{ ...sectionStyle, padding: 20 }}>
          <p style={{ fontSize: 11, color: '#34d399', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, marginBottom: 14, letterSpacing: 0.5 }}>
            BATCH PROGRESS
          </p>
          {batchInProgress && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#34d399', fontFamily: "'JetBrains Mono', monospace" }}>
                Analyzing... {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
              </span>
              <button onClick={handleCancelBatch} style={{ background: 'none', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', borderRadius: 6, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>
                Cancel
              </button>
            </div>
          )}
          {!batchInProgress && batchProgress.total > 0 && (
            <div style={{ fontSize: 11, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
              Completed in {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: batchInProgress ? '#34d399' : '#ecfdf5', fontFamily: "'JetBrains Mono', monospace" }}>
              {batchInProgress ? `Scanning file ${batchProgress.completed + batchProgress.failed + 1} of ${batchProgress.total}` : `${batchProgress.completed + batchProgress.failed} / ${batchProgress.total} files`}
            </span>
            <span style={{ fontSize: 10, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>
              {batchProgress.completed} done · {batchProgress.failed} failed
            </span>
          </div>
          <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${batchProgress.total > 0 ? ((batchProgress.completed + batchProgress.failed) / batchProgress.total * 100) : 0}%`, height: '100%', background: 'linear-gradient(90deg, #047857, #059669)', borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {batchProgress.results.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                <span style={{ color: '#4ade80' }}>✓</span>
                <span style={{ color: '#78716c', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.filename}</span>
                {r.analysis?.summary?.health_score != null && (
                  <span style={{ color: r.analysis.summary.health_score > 80 ? '#4ade80' : r.analysis.summary.health_score > 50 ? '#fb923c' : '#f87171', flexShrink: 0 }}>
                    {r.analysis.summary.health_score}%
                  </span>
                )}
                {(r.analysis?.issues?.length ?? 0) > 0 && <span style={{ color: '#f87171', flexShrink: 0 }}>{r.analysis.issues.length} iss.</span>}
              </div>
            ))}
            {batchProgress.errors.map((e, i) => (
              <div key={`err-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                <span style={{ color: '#f87171' }}>✗</span>
                <span style={{ color: '#78716c', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.path.split('/').pop()}</span>
                <span style={{ color: '#f87171', fontSize: 9, flexShrink: 0 }}>{e.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Results button */}
      {batchDone && batchProgress.results.length > 0 && (
        <Btn variant="solid" onClick={() => onAnalysisComplete(batchProgress.results, batchProgress.errors)} style={{ width: '100%', padding: '14px 20px', fontSize: 14 }}>
          View Results →
        </Btn>
      )}

      {/* Git modal */}
      <Modal open={gitPanelOpen} onClose={() => setGitPanelOpen(false)} title="IMPORT FROM GITHUB" width={560}>
        {!gitManifest ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="Repo URL" value={gitUrl} onChange={e => setGitUrl(e.target.value)} placeholder="https://github.com/user/repo" />
            <Input label="Branch" value={gitBranch} onChange={e => setGitBranch(e.target.value)} placeholder="main" />
            <Btn variant="solid" onClick={handleGitClone} disabled={gitLoading || !gitUrl} style={{ width: '100%' }}>
              {gitLoading ? 'Cloning…' : 'Clone & inspect'}
            </Btn>
            {gitError && (
              <p style={{ color: '#f87171', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>{gitError}</p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 11, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>
              <p>{gitManifest.repo_name} · {gitManifest.branch}</p>
              <p>{gitManifest.total_files} files · {(gitManifest.total_bytes / 1024).toFixed(1)} KB</p>
              <p style={{ color: gitExpired ? '#f87171' : '#34d399', marginTop: 4 }}>
                {gitExpired ? 'Session expired — close and re-import.' : `Session expires in ${Math.floor(gitCountdown / 60)}:${String(gitCountdown % 60).padStart(2, '0')}`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(gitManifest.files.reduce((acc, f) => { acc[f.language] = (acc[f.language] || 0) + 1; return acc; }, {})).map(([lang, count]) => (
                <span key={lang} style={{ fontSize: 10, color: extColor(lang), background: `${extColor(lang)}11`, borderRadius: 6, padding: '2px 8px', fontFamily: "'JetBrains Mono', monospace" }}>
                  {lang} ×{count}
                </span>
              ))}
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <button onClick={() => setGitSelectedPaths(prev => prev.filter(p => { const f = gitManifest?.files.find(x => x.path === p); return !f || f.size_bytes <= 100 * 1024; }))} style={{ background: 'none', border: 'none', color: '#78716c', fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>
                  Deselect &gt; 100 KB
                </button>
                <span style={{ fontSize: 10, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>{gitSelectedPaths.length} selected</span>
              </div>
              {Object.entries(groupedFiles).map(([dir, files]) => (
                <div key={dir}>
                  <p style={{ fontSize: 10, color: '#34d399', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, margin: '4px 0 2px' }}>{dir}/</p>
                  {files.map(f => (
                    <label key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px', cursor: 'pointer', fontSize: 10, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>
                      <input type="checkbox" checked={gitSelectedPaths.includes(f.path)} onChange={() => setGitSelectedPaths(prev => prev.includes(f.path) ? prev.filter(p => p !== f.path) : [...prev, f.path])} style={{ accentColor: '#059669' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: extColor(f.language), flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path.split('/').slice(1).join('/') || f.path.split('/')[0]}</span>
                      <span style={{ color: '#57534e', flexShrink: 0 }}>{(f.size_bytes / 1024).toFixed(1)} KB</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            {!gitExpired && (
              <Btn variant="solid" onClick={handleGitAnalyzeSelected} disabled={gitSelectedPaths.length === 0 || loading} style={{ width: '100%' }}>
                {loading ? 'Analyzing…' : `Analyze selected (${gitSelectedPaths.length})`}
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
    </motion.div>
  );
}

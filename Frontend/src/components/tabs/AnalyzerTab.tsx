import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, FileCode, Folder, GitBranch, Play, StopCircle,
  CheckCircle2, AlertOctagon, BarChart,
  HelpCircle, ChevronRight, ArrowRight, BookOpen
} from 'lucide-react';
import { AnalysisResult, Issue } from '../../types';
import { GitManifest } from '../../api/types';
import { analysisAPI } from '../../api/analysis';
import { useAnalysisSocket } from '../../hooks/useAnalysisSocket';
import { TreeNodeData, buildFileTree } from '../../lib/fileTree';
import CodeViewer from '../CodeViewer';
import Modal from '../ui/Modals';

const SUPPORTED_EXTENSIONS = new Set(['.py', '.js', '.ts', '.tsx', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.venv', 'venv', 'static_root', 'migrations']);

function shouldSkipPath(path: string): boolean {
  return path.replace(/\\/g, '/').split('/').some(part => SKIP_DIRS.has(part));
}
const MAX_FILE_BYTES = 200 * 1024;

interface AnalyzerTabProps {
  key?: string;
  history: AnalysisResult[];
  onAddResult: (res: AnalysisResult) => void;
  onNavigateToChat: (docId: string, filename: string) => void;
}

function mapToAnalysisResult(raw: any, filename: string): AnalysisResult {
  const issues: Issue[] = (raw.analysis?.issues || []).map((i: any, idx: number) => ({
    id: i.id || `GC-${idx}`,
    type: i.type || i.category || 'unused_import',
    name: i.name || null,
    file: filename,
    line: i.line_start || i.line || 1,
    line_start: i.line_start || i.line || 1,
    line_end: i.line_end || i.line || 1,
    description: i.description || '',
    code_snippet: i.code_snippet || '',
    suggestion: i.suggestion || '',
    confidence: i.confidence ?? 0.9,
    safe_to_remove: i.safe_to_remove ?? true,
  }));

  return {
    document_id: raw.document_id,
    filename,
    summary: {
      total_issues: issues.length,
      severity_counts: raw.analysis?.summary?.severity_counts || { high: 0, medium: 0, low: 0 },
      categories: raw.analysis?.summary?.categories || {},
      overall_health: raw.analysis?.summary?.overall_health || 'clean',
      health_score: raw.analysis?.summary?.health_score ?? 100,
    },
    issues,
    metrics: raw.analysis?.metrics || {
      total_lines: 0, code_lines: 0, comment_lines: 0, blank_lines: 0,
      dead_lines_estimate: 0, dead_code_percentage: 0,
    },
    refactor_hints: raw.analysis?.refactor_hints || [],
    _source_content: raw._source_content || '',
    llm_refining: raw.llm_refining || false,
    cached: raw.cached || false,
    scan_folder: raw.scan_folder || '',
    scan_type: raw.scan_type || 'single',
  };
}

interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  parentPath: string;
  expandedFolders: Record<string, boolean>;
  onToggle: (path: string) => void;
  selectedFile: AnalysisResult | null;
  onSelectFile: (file: AnalysisResult) => void;
}

function TreeNode({
  node, depth, parentPath, expandedFolders, onToggle, selectedFile, onSelectFile
}: TreeNodeProps) {
  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;

  if (!node.isDir) {
    if (node.file?.error) {
      return (
        <div className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg text-xs cursor-default text-rose-400/70">
          <AlertOctagon size={11} className="text-rose-400 flex-shrink-0" />
          <span className="font-mono truncate">{node.name}</span>
        </div>
      );
    }
    const isSelected = selectedFile?.filename === node.file?.filename;
    return (
      <div
        onClick={() => node.file && onSelectFile(node.file)}
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-lg text-xs cursor-pointer transition-all ${
          isSelected
            ? 'bg-cyan-400/10 text-cyan-300 font-medium border border-cyan-400/20'
            : 'text-zinc-500 hover:bg-white/[0.01] hover:text-zinc-300'
        }`}
      >
        <FileCode size={11} className={isSelected ? 'text-cyan-400' : 'text-zinc-650 flex-shrink-0'} />
        <span className="font-mono truncate">{node.name}</span>
      </div>
    );
  }

  const isExpanded = !!expandedFolders[fullPath] || depth < 1;

  return (
    <div>
      <div
        onClick={() => onToggle(fullPath)}
        className="flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-white/[0.015] cursor-pointer transition-colors group"
      >
        <ChevronRight
          size={10}
          className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
        />
        <Folder size={12} className="text-purple-400 flex-shrink-0" />
        <span className="font-mono text-[11px] text-zinc-400 truncate group-hover:text-zinc-200 transition-colors">
          {node.name}/
        </span>
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden ml-3 border-l border-white/[0.03] pl-2 space-y-0.5"
          >
            {node.children.map((child, i) => (
              <TreeNode
                key={i}
                node={child}
                depth={depth + 1}
                parentPath={fullPath}
                expandedFolders={expandedFolders}
                onToggle={onToggle}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AnalyzerTab({ history, onAddResult, onNavigateToChat }: AnalyzerTabProps) {
  const [view, setView] = useState<'upload' | 'batch_progress' | 'workspace'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [gitModalOpen, setGitModalOpen] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [progressFiles, setProgressFiles] = useState<string[]>([]);
  const [filesTotalCount, setFilesTotalCount] = useState(0);
  const [scannedDoneCount, setScannedDoneCount] = useState(0);
  const [scannedFailCount, setScannedFailCount] = useState(0);
  const [activeFileName, setActiveFileName] = useState('');
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [batchActive, setBatchActive] = useState(false);
  const [batchReportsList, setBatchReportsList] = useState<AnalysisResult[]>([]);
  const [batchErrorsList, setBatchErrorsList] = useState<Array<{ path: string; error: string }>>([]);
  const [selectedFile, setSelectedFile] = useState<AnalysisResult | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [currentFolderName, setCurrentFolderName] = useState<string>('');
  const [issueFilter, setIssueFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const connectionActiveRef = useRef(false);
  const analysisSocket = useAnalysisSocket();
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (batchActive) {
      setElapsedSecs(0);
      const timer = setInterval(() => setElapsedSecs(prev => prev + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [batchActive]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      await analyzeSingleFile(e.dataTransfer.files[0]);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const uploadFileTrigger = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      await analyzeSingleFile(e.target.files[0]);
    }
  };

  const analyzeSingleFile = async (file: File) => {
    setView('batch_progress');
    setBatchActive(true);
    setScannedDoneCount(0);
    setScannedFailCount(0);
    setFilesTotalCount(1);
    setActiveFileName(file.name);
    setBatchReportsList([]);
    setBatchErrorsList([]);

    try {
      const result = await analysisAPI.analyzeFile(file);
      const report = mapToAnalysisResult(result, file.name);
      report._source_content = await file.text();
      onAddResult(report);
      setBatchReportsList([report]);
      setScannedDoneCount(1);
      setActiveFileName('');
      setSelectedFile(report);
      setView('workspace');
    } catch (err: any) {
      setBatchErrorsList(prev => [...prev, { path: file.name, error: err.message }]);
      setScannedFailCount(1);
    }
    setBatchActive(false);
  };

  const POLL_INTERVAL = 2000;

  const analyzeGitRepo = async () => {
    if (!gitUrl) return;
    setGitModalOpen(false);
    setView('batch_progress');
    setBatchActive(true);
    setScannedDoneCount(0);
    setScannedFailCount(0);
    setFilesTotalCount(0);
    setActiveFileName('Cloning repository...');
    setBatchReportsList([]);
    setBatchErrorsList([]);

    let manifest: GitManifest | null = null;

    try {
      manifest = await analysisAPI.gitClone(gitUrl, gitBranch);
    } catch (err: any) {
      setBatchErrorsList(prev => [{ path: gitUrl, error: err.message }]);
      setScannedFailCount(1);
      setBatchActive(false);
      setActiveFileName('');
      return;
    }

    if (!manifest || abortRef.current?.signal.aborted) {
      setBatchActive(false);
      setActiveFileName('');
      return;
    }

    setFilesTotalCount(manifest.files.length);
    setActiveFileName('Fetching files...');

    // Fetch all file contents in parallel (batches of 10)
    const FETCH_BATCH = 10;
    const ANALYZE_CONCURRENCY = 5;
    const allPaths = manifest.files.map(f => f.path);
    const fileContents: Record<string, string> = {};

    const batches: string[][] = [];
    for (let i = 0; i < allPaths.length; i += FETCH_BATCH) {
      batches.push(allPaths.slice(i, i + FETCH_BATCH));
    }

    await Promise.all(batches.map(async (chunk) => {
      try {
        const contents = await analysisAPI.gitFetchFiles(manifest.session_id, chunk);
        for (const f of contents.files) {
          fileContents[f.path] = f.content;
        }
      } catch {
        // individual batch failure handled by analysis phase
      }
    }));

    setActiveFileName('Analyzing...');

    // Analyze files in parallel with concurrency pool
    const reports: AnalysisResult[] = [];
    const errors: Array<{path: string; error: string}> = [];
    const queue = [...manifest.files];

    const worker = async () => {
      while (queue.length > 0 && !abortRef.current?.signal.aborted) {
        const file = queue.shift()!;
        setActiveFileName(file.path);
        setProgressFiles(prev => [file.path, ...prev.slice(0, 10)]);

        const content = fileContents[file.path];
        if (!content) {
          errors.push({ path: file.path, error: 'Failed to fetch file content' });
          setScannedDoneCount(prev => prev + 1);
          continue;
        }

        try {
          const fakeFile = new File([content], file.path);
          const result = await analysisAPI.analyzeFile(fakeFile, manifest.repo_name, 'repo');
          const report = mapToAnalysisResult(result, file.path);
          report._source_content = content;
          onAddResult(report);
          reports.push(report);
        } catch (err: any) {
          errors.push({ path: file.path, error: err.message });
        }
        setScannedDoneCount(prev => prev + 1);
      }
    };

    await Promise.all(Array.from({ length: ANALYZE_CONCURRENCY }, () => worker()));

    setBatchReportsList(reports);
    setBatchErrorsList(errors);
    setBatchActive(false);
    setActiveFileName('');
  };

  const handleOpenWorkspace = () => {
    const valid = batchReportsList.filter(r => r.summary);
    if (valid.length > 0) setSelectedFile(valid[0]);
    setSelectedFolder(null);
    setView('workspace');
  };

  const handleOpenFolder = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.onchange = async (e) => {
      const allFiles = Array.from((e.target as HTMLInputElement).files || []);
      if (allFiles.length === 0) return;

      const files = allFiles.filter(f => {
        const path = f.webkitRelativePath || f.name;
        if (shouldSkipPath(path)) return false;
        if (f.size > MAX_FILE_BYTES) return false;
        const ext = '.' + f.name.split('.').pop()?.toLowerCase();
        return SUPPORTED_EXTENSIONS.has(ext);
      });

      // webkitRelativePath is relative to selected folder (no folder name in path)
      const folderName = `Folder ${new Date().toISOString().slice(0, 10)}`;
      setCurrentFolderName(folderName);

      setView('batch_progress');
      setBatchActive(true);
      setScannedDoneCount(0);
      setScannedFailCount(0);
      setFilesTotalCount(files.length);
      setActiveFileName('');
      setBatchReportsList([]);
      setBatchErrorsList([]);

      try {
        const { batch_id } = await analysisAPI.submitBatchAnalysis(files, folderName);
        connectionActiveRef.current = true;

        // Poll for batch results (avoids channels_redis BZPOPMIN with Redis 3.0)
        const seenFiles = new Set<string>();
        const poll = async () => {
          try {
            const data = await analysisAPI.pollBatchResults(batch_id);
            if (abortRef.current?.signal.aborted) return;
            setFilesTotalCount(data.total);

            for (const f of data.files || []) {
              if (seenFiles.has(f.filename)) continue;
              seenFiles.add(f.filename);

              if (f.status === 'completed' && f.analysis) {
                setActiveFileName(f.filename);
                setProgressFiles(prev => [f.filename, ...prev.slice(0, 10)]);
                const report = mapToAnalysisResult(f, f.filename);
                report._source_content = f.source_content || '';
                onAddResult(report);
                setBatchReportsList(prev => {
                  if (prev.some(r => r.filename === f.filename)) return prev;
                  return [...prev, report];
                });
                setScannedDoneCount(prev => prev + 1);
              } else if (f.status === 'error') {
                setBatchErrorsList(prev => [...prev, { path: f.filename, error: f.error || 'Unknown error' }]);
                setScannedFailCount(prev => prev + 1);
              }
            }

            if (data.is_complete) {
              setBatchActive(false);
              setActiveFileName('');
              connectionActiveRef.current = false;
              if (pollRef.current !== null) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
            }
          } catch (err) {
            console.error('Poll error:', err);
          }
        };

        poll();
        pollRef.current = window.setInterval(poll, 1500);
      } catch {
        // Fallback: synchronous sequential analysis if async endpoint unavailable
        connectionActiveRef.current = true;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (abortRef.current?.signal.aborted) break;
          setActiveFileName(file.webkitRelativePath || file.name);
          setProgressFiles(prev => [(file.webkitRelativePath || file.name), ...prev.slice(0, 10)]);

          try {
            const result = await analysisAPI.analyzeFile(file, folderName, 'folder');
            const report = mapToAnalysisResult(result, file.webkitRelativePath || file.name);
            report._source_content = await file.text();
            onAddResult(report);
            setBatchReportsList(prev => [...prev, report]);
            setScannedDoneCount(prev => prev + 1);
          } catch (err: any) {
            setBatchErrorsList(prev => [...prev, { path: file.webkitRelativePath || file.name, error: err.message }]);
            setScannedFailCount(prev => prev + 1);
          }
        }
        setBatchActive(false);
        setActiveFileName('');
        connectionActiveRef.current = false;
      }
    };
    input.click();
  };

  const cancelBatchProcess = () => {
    abortRef.current?.abort();
    analysisSocket.disconnect();
    connectionActiveRef.current = false;
    setBatchActive(false);
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const treeRoot = useMemo(() => {
    const items = [...batchReportsList];
    for (const err of batchErrorsList) {
      if (items.some(item => item.filename === err.path)) continue;
      items.push({
        document_id: '',
        filename: err.path,
        summary: { total_issues: 0, severity_counts: { high: 0, medium: 0, low: 0 }, categories: {}, overall_health: 'clean', health_score: 0 },
        issues: [],
        metrics: { total_lines: 0, code_lines: 0, comment_lines: 0, blank_lines: 0, dead_lines_estimate: 0, dead_code_percentage: 0 },
        scan_type: 'folder',
        error: err.error,
      } as AnalysisResult);
    }
    const nodes = buildFileTree(items);
    const hasLooseFiles = nodes.some(n => !n.isDir);
    const rootName = currentFolderName || 'Root';
    if (hasLooseFiles) {
      return [{
        name: rootName,
        isDir: true,
        children: nodes,
        file: undefined,
      } as TreeNodeData];
    }
    return nodes;
  }, [batchReportsList, batchErrorsList, currentFolderName]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const visibleIssues = useMemo(() => {
    if (!selectedFile) return [];
    const issuesList = selectedFile.issues || [];
    if (issueFilter === 'all') return issuesList;
    return issuesList.filter(i => {
      const sev = i.type === 'unused_function' || i.type === 'unreachable_code' ? 'high'
        : i.type === 'unused_variable' ? 'medium' : 'low';
      return sev === issueFilter;
    });
  }, [selectedFile, issueFilter]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 flex-1 flex flex-col justify-start"
    >
      {view === 'upload' && (
        <div className="max-w-xl mx-auto w-full space-y-6 py-10">
          <div className="text-center space-y-2">
            <h2 className="font-display font-bold text-xl text-neutral-100 tracking-tight">
              Initiate Code Static Scan
            </h2>
            <p className="text-zinc-500 text-xs font-sans">
              Upload files or analyze directories to detect dead code.
            </p>
          </div>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileInput}
            className={`group cursor-pointer rounded-3xl p-10 flex flex-col items-center justify-center text-center transition-all duration-300 min-h-[220px] ${
              dragActive
                ? 'bg-cyan-400/10 border-2 border-dashed border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.15)]'
                : 'glass-card border border-dashed border-cyan-400/25 hover:border-cyan-400/50 hover:shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]'
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".py,.js,.ts,.tsx,.jsx" onChange={uploadFileTrigger} className="hidden" />
            <div className="w-12 h-12 rounded-xl bg-cyan-400/10 border border-cyan-400/20 group-hover:bg-cyan-400/20 flex items-center justify-center text-cyan-400 group-hover:text-cyan-300 transition-colors mb-4">
              <Upload size={22} className={dragActive ? 'animate-bounce' : ''} />
            </div>
            <p className="font-display font-medium text-sm text-zinc-300">
              Drag file here or <span className="text-cyan-400 font-semibold group-hover:underline">browse</span>
            </p>
            <p className="text-[10px] text-zinc-650 font-mono mt-2 uppercase tracking-wider">
              Python • JavaScript • TypeScript
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleOpenFolder}
              className="px-4 py-3.5 rounded-3xl text-xs font-semibold text-zinc-300 hover:text-white glass-card glass-card-hover hover:scale-[1.02] transition-all text-center flex items-center justify-center gap-2 cursor-pointer"
            >
              <Folder size={14} className="text-cyan-400" />
              Scan Directory
            </button>
            <button
              onClick={() => setGitModalOpen(true)}
              className="px-4 py-3.5 rounded-3xl text-xs font-semibold text-zinc-300 hover:text-white glass-card glass-card-hover hover:scale-[1.02] transition-all text-center flex items-center justify-center gap-2 cursor-pointer"
            >
              <GitBranch size={14} className="text-purple-400" />
              Import from GitHub
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 font-mono text-center -mt-2">
            The folder picker shows folders only — all files inside will be scanned
          </p>

          <div className="p-4 border border-cyan-400/10 bg-cyan-450/5 rounded-2xl flex gap-3 text-left">
            <HelpCircle size={15} className="text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-semibold text-neutral-300 block">How it works</span>
              <p className="text-[11px] text-neutral-500 font-sans leading-normal">
                Upload Python, JavaScript, or TypeScript files for dead code analysis. Files are analyzed by our engine using AST cross-referencing and optional LLM-powered suggestions.
              </p>
            </div>
          </div>
        </div>
      )}

      {view === 'batch_progress' && (
        <div className="max-w-xl mx-auto w-full space-y-6 py-6">
          <div className="p-6 rounded-3xl glass-card space-y-5 text-left relative shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="status-dot bg-cyan-400" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold block">
                  Analysis progress
                </span>
              </div>
              <span className="font-mono text-zinc-500 text-xs">
                Elapsed: {Math.floor(elapsedSecs / 60)}m {elapsedSecs % 60}s
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <h3 className="font-display font-light text-2xl text-white">
                  {batchActive
                    ? `Scanning file ${scannedDoneCount + scannedFailCount + 1}`
                    : `Completed ${scannedDoneCount} / ${filesTotalCount} scans`
                  }
                </h3>
                <span className="text-xs font-mono font-semibold text-zinc-500">
                  {filesTotalCount > 0 ? Math.round(((scannedDoneCount + scannedFailCount) / filesTotalCount) * 100) : 0}%
                </span>
              </div>

              <div className="h-2 w-full bg-zinc-950/40 rounded-full border border-white/[0.03] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${filesTotalCount > 0 ? ((scannedDoneCount + scannedFailCount) / filesTotalCount) * 100 : 0}%` }}
                  transition={{ duration: 0.15 }}
                  className="h-full bg-gradient-to-r from-cyan-400 to-purple-600 rounded-full shadow-lg shadow-cyan-500/10"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono text-zinc-400 truncate max-w-[280px]">
                {batchActive && activeFileName ? `Current: ${activeFileName}` : 'Complete.'}
              </span>

              {batchActive ? (
                <button
                  onClick={cancelBatchProcess}
                  className="px-3.5 py-1.5 text-[10px] font-mono uppercase tracking-wider font-bold rounded-lg border border-rose-500/20 text-rose-450 hover:bg-rose-500/5 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <StopCircle size={12} /> Cancel
                </button>
              ) : scannedDoneCount > 0 && (
                <button
                  onClick={handleOpenWorkspace}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-zinc-900 border border-cyan-400/20 text-cyan-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
                >
                  Open Workspace <ArrowRight size={13} />
                </button>
              )}
            </div>

            {batchErrorsList.length > 0 && (
              <div className="max-h-[100px] overflow-y-auto space-y-1 border-t border-rose-500/10 pt-3">
                <span className="text-[10px] font-mono text-rose-400 font-bold uppercase">Errors</span>
                {batchErrorsList.map((err, idx) => (
                  <div key={idx} className="text-[10px] text-rose-300 font-mono truncate">
                    {err.path}: {err.error}
                  </div>
                ))}
              </div>
            )}

            <div className="max-h-[160px] overflow-y-auto divide-y divide-white/[0.01] pt-3 border-t border-white/[0.03] pr-2 space-y-1">
              {progressFiles.map((fileCheck, idx) => (
                <div key={idx} className="flex justify-between items-center py-1 text-[11px]">
                  <span className="font-mono text-zinc-400 truncate">{fileCheck}</span>
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={11} /> DONE
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'workspace' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-4 gap-6 text-left">
          <div className="lg:col-span-1 rounded-3xl glass-card p-5 overflow-y-auto max-h-[640px] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.03]">
              <span className="text-[10px] font-mono tracking-wider uppercase text-cyan-400 font-bold">
                Scanned Files
              </span>
              <button onClick={() => setView('upload')} className="text-[10px] font-mono text-zinc-550 hover:text-cyan-400 transition-colors cursor-pointer">
                + New Scan
              </button>
            </div>

            <div className="space-y-0.5">
              {treeRoot.length === 0 ? (
                <div className="text-center py-8 text-neutral-600 font-mono text-[10px]">
                  No files scanned yet
                </div>
              ) : (
                treeRoot.map((node, i) => (
                  <TreeNode
                    key={i}
                    node={node}
                    depth={0}
                    parentPath=""
                    expandedFolders={expandedFolders}
                    onToggle={toggleFolder}
                    selectedFile={selectedFile}
                    onSelectFile={(file) => { setSelectedFile(file); setSelectedFolder(null); }}
                  />
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-3 flex flex-col lg:flex-row gap-6 min-h-0">
            <div className="flex-1 space-y-6">
              {selectedFolder && (
                <div className="rounded-3xl glass-card p-6 space-y-4">
                  <div className="flex items-center gap-2 text-cyan-400">
                    <Folder size={18} />
                    <h3 className="font-display font-medium text-sm tracking-tight text-white uppercase font-mono">{selectedFolder}/ Overview</h3>
                  </div>
                  <p className="text-neutral-400 text-xs font-sans">Select individual files in the explorer tree to review code issues.</p>
                </div>
              )}

              {selectedFile && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { val: selectedFile.metrics?.total_lines || 0, label: 'TOTAL LINES', color: 'text-neutral-200' },
                      { val: selectedFile.summary?.total_issues || 0, label: 'ISSUES', color: (selectedFile.summary?.total_issues || 0) > 0 ? 'text-rose-450' : 'text-emerald-400' },
                      { val: selectedFile.metrics?.complexity_hint || 'low', label: 'COMPLEXITY', color: 'text-amber-200' },
                      { val: `${selectedFile.summary?.health_score || 0}%`, label: 'HEALTH', color: 'text-cyan-400' }
                    ].map((card, idx) => (
                      <div key={idx} className="py-3.5 px-4 rounded-2xl text-left shadow-sm glass-card">
                        <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block font-bold">{card.label}</span>
                        <span className={`text-base font-display font-extrabold mt-1 block uppercase ${card.color}`}>{card.val}</span>
                      </div>
                    ))}
                  </div>

                  <CodeViewer
                    source={selectedFile._source_content || ''}
                    issues={selectedFile.issues || []}
                    filename={selectedFile.filename}
                  />

                  {selectedFile.refactor_hints && selectedFile.refactor_hints.length > 0 && (
                    <div className="p-4 border border-violet-500/[0.08] bg-violet-500/[0.01] rounded-xl space-y-1.5 text-left">
                      <div className="flex items-center gap-2 text-violet-400">
                        <BookOpen size={14} />
                        <span className="text-xs font-bold font-display tracking-tight text-zinc-300">Refactoring Recommendations</span>
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] text-zinc-500 font-sans">
                        {selectedFile.refactor_hints.map((hint, idx) => <li key={idx}>{hint}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!selectedFile && !selectedFolder && (
                <div className="h-64 flex flex-col items-center justify-center text-center text-zinc-500">
                  <BarChart size={30} className="text-neutral-700 animate-pulse mb-3" />
                  <p className="text-xs font-sans">Select a file to view results.</p>
                </div>
              )}
            </div>

            {selectedFile && (
              <div className="w-full lg:w-[280px] p-5 rounded-3xl flex flex-col space-y-4 flex-shrink-0 glass-card">
                <div className="space-y-3">
                  <span className="text-[10px] font-mono tracking-wider uppercase text-neutral-500 font-bold block">Filter</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['all', 'high', 'medium', 'low'].map(filter => (
                      <button
                        key={filter}
                        onClick={() => setIssueFilter(filter as any)}
                        className={`text-[10px] font-semibold py-1.5 px-2 rounded-xl cursor-pointer transition-all ${
                          issueFilter === filter ? 'bg-cyan-400/15 text-cyan-300 font-bold border border-cyan-400/25 shadow-sm' : 'bg-white/[0.01] text-neutral-500 border border-white/[0.04]'
                        }`}
                      >
                        {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto max-h-[360px] pr-1">
                  {visibleIssues.length === 0 ? (
                    <div className="text-center py-10 text-neutral-500">
                      <p className="text-xs font-sans">No issues in this category.</p>
                    </div>
                  ) : (
                    visibleIssues.map((issue, idx) => {
                      const isExpanded = expandedIssueId === issue.id;
                      const isHigh = issue.type === 'unused_function' || issue.type === 'unreachable_code';
                      const colorBadge = isHigh ? 'text-rose-450 bg-rose-500/10 border-rose-500/10' : 'text-amber-400 bg-amber-450/10 border-amber-450/10';

                      return (
                        <div
                          key={idx}
                          onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                          className="border border-white/[0.03] rounded-2xl p-3.5 bg-white/[0.01] hover:border-cyan-400/20 cursor-pointer transition-all space-y-2.5"
                        >
                          <div className="flex justify-between items-start">
                            <span className={`px-2 py-0.5 rounded font-mono text-[8px] font-semibold border ${colorBadge}`}>
                              {issue.type.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-600">L:{issue.line}</span>
                          </div>
                          <p className="text-xs text-zinc-300 font-sans leading-normal">{issue.description}</p>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden space-y-2 pt-2 border-t border-white/[0.04] text-[11px]"
                              >
                                {issue.name && (
                                  <div className="font-mono bg-zinc-950/40 p-1.5 rounded text-neutral-400 border border-white/[0.02]">
                                    Symbol: <span className="text-zinc-200 font-medium">{issue.name}</span>
                                  </div>
                                )}
                                <div className="p-2.5 border border-cyan-400/10 bg-cyan-400/5 rounded-xl">
                                  <span className="font-bold text-cyan-400 block font-display tracking-wide uppercase text-[9px] mb-1">Fix</span>
                                  <p className="text-zinc-400 leading-normal font-sans">{issue.suggestion}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onNavigateToChat(selectedFile.document_id, selectedFile.filename);
                                  }}
                                  className="w-full py-1.5 bg-white/[0.02] hover:bg-white/[0.05] hover:text-white border border-white/[0.04] text-zinc-400 font-semibold font-sans rounded-xl transition-all cursor-pointer"
                                >
                                  Ask Chat Inspector
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={gitModalOpen} onClose={() => setGitModalOpen(false)} title="Git Repository Import">
        <div className="space-y-4 font-sans text-left">
          <p className="text-xs text-neutral-400 leading-relaxed">
            Enter a GitHub repository URL to clone and analyze its code.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-550 font-mono tracking-wider font-semibold block uppercase">Repository URL</label>
              <input
                type="text"
                placeholder="https://github.com/user/repo"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                className="w-full py-2.5 px-3.5 text-xs text-zinc-300 bg-white/[0.02] border border-white/[0.06] focus:border-cyan-455/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-550 font-mono tracking-wider font-semibold block uppercase">Branch</label>
              <input
                type="text"
                placeholder="main"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                className="w-full py-2.5 px-3.5 text-xs text-zinc-300 bg-white/[0.02] border border-white/[0.06] focus:border-cyan-455/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
              />
            </div>
          </div>
          <div className="pt-3 flex justify-end gap-2.5 text-xs">
            <button onClick={() => setGitModalOpen(false)} className="px-4 py-2 border border-white/[0.04] text-neutral-400 hover:text-white rounded-lg cursor-pointer bg-white/[0.01]">Cancel</button>
            <button
              onClick={analyzeGitRepo}
              disabled={!gitUrl}
              className="px-5 py-2 bg-gradient-to-r from-cyan-400 to-purple-600 text-white font-bold rounded-lg hover:opacity-95 transition-all text-center cursor-pointer shadow-lg shadow-cyan-500/10 disabled:opacity-40"
            >
              Clone & Analyze
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}

import { useState, useRef, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, FileCode, Folder, GitBranch, Play, StopCircle,
  CheckCircle2, AlertOctagon, BarChart,
  HelpCircle, ChevronRight, ArrowRight, BookOpen,
  MessageCircle
} from 'lucide-react';
import { AnalysisResult, Issue } from '../../types';
import { GitManifest } from '../../api/types';
import { analysisAPI } from '../../api/analysis';
import { useAnalysisSocket } from '../../hooks/useAnalysisSocket';
import { TreeNodeData, buildFileTree } from '../../lib/fileTree';
import { useAnalysisStore } from '../../store/analysisStore';
import CodeViewer from '../CodeViewer';
import Modal from '../ui/Modals';


const SUPPORTED_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.tsx', '.jsx',
  '.css', '.html', '.htm',
  '.json', '.xml',
  '.vue', '.svelte',
  '.scss', '.less',
  '.rb', '.go', '.rs', '.java', '.php', '.swift', '.kt',
  '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh',
  '.sql',
  '.md', '.txt',
  '.mjs', '.cjs', '.mts', '.cts',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.venv', 'venv', 'static_root', 'migrations']);

function shouldSkipPath(path: string): boolean {
  return path.replace(/\\/g, '/').split('/').some(part => SKIP_DIRS.has(part));
}
const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface AnalyzerTabProps {
  key?: string;
  onNavigateToChat: (docId: string, filename: string) => void;
  isActive?: boolean;
}

function mapToAnalysisResult(raw: any, filename: string): AnalysisResult {
  const src = raw.analysis || raw;
  const issues: Issue[] = (src.issues || []).map((i: any, idx: number) => ({
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
    severity: i.severity || 'low',
    confidence: i.confidence ?? 0.9,
    safe_to_remove: i.safe_to_remove ?? true,
  }));

  return {
    document_id: raw.document_id,
    filename,
    summary: {
      total_issues: issues.length,
      severity_counts: src.summary?.severity_counts || { high: 0, medium: 0, low: 0 },
      categories: src.summary?.categories || {},
      overall_health: src.summary?.overall_health || 'clean',
      health_score: src.summary?.health_score ?? 100,
    },
    issues,
    metrics: src.metrics || {
      total_lines: 0, code_lines: 0, comment_lines: 0, blank_lines: 0,
      dead_lines_estimate: 0, dead_code_percentage: 0,
    },
    refactor_hints: src.refactor_hints || [],
    _source_content: raw._source_content || '',
    llm_refining: raw.llm_refining || false,
    cached: raw.cached || false,
    scan_folder: raw.scan_folder || '',
    scan_type: raw.scan_type || 'single',
    scan_id: raw.batch_id || raw.scan_id || raw.document_id || '',
  };
}

interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  parentPath: string;
  expandedFolders: Record<string, boolean>;
  onToggle: (path: string, depth: number) => void;
  selectedFile: AnalysisResult | null;
  onSelectFile: (file: AnalysisResult) => void;
  onNavigateToChat?: (docId: string, filename: string) => void;
  currentFolderName: string;
}

function TreeNode({
  node, depth, parentPath, expandedFolders, onToggle, selectedFile, onSelectFile, onNavigateToChat, currentFolderName
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
    const prefix = currentFolderName
      ? (currentFolderName.split('/').pop() || currentFolderName) + '/'
      : '';
    const isSelected = selectedFile && node.file
      ? (prefix && selectedFile.filename.startsWith(prefix)
          ? selectedFile.filename.slice(prefix.length)
          : selectedFile.filename) === node.file.filename
      : false;
    const issueCount = node.file?.summary?.total_issues ?? 0;
    return (
      <div
        onClick={() => node.file && onSelectFile(node.file)}
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-lg text-xs cursor-pointer transition-all ${
          isSelected
            ? 'bg-cyan-400/10 text-cyan-300 font-medium border border-cyan-400/20'
            : 'text-zinc-500 hover:bg-white/[0.01] hover:text-zinc-300'
        }`}
      >
        <FileCode size={11} className={isSelected ? 'text-cyan-400' : 'text-zinc-500 flex-shrink-0'} />
        <span className="font-mono truncate flex-1 min-w-0">{node.name}</span>
        {issueCount > 0 && (
          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full leading-none ${
            isSelected
              ? 'bg-cyan-400/15 text-cyan-300'
              : 'bg-amber-400/10 text-amber-300'
          }`}>
            {issueCount}
          </span>
        )}
      </div>
    );
  }

  const isExpanded = expandedFolders[fullPath] ?? false;
  const dirIssueCount = node.totalIssues ?? 0;

  return (
    <div>
      <div
        onClick={() => onToggle(fullPath, depth)}
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
        {dirIssueCount > 0 && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full leading-none bg-amber-400/10 text-amber-300 flex-shrink-0 ml-auto">
            {dirIssueCount}
          </span>
        )}
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
                onNavigateToChat={onNavigateToChat}
                currentFolderName={currentFolderName}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AnalyzerTab({ onNavigateToChat, isActive = true }: AnalyzerTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [gitModalOpen, setGitModalOpen] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [progressFiles, setProgressFiles] = useState<string[]>([]);
  const [filesTotalCount, setFilesTotalCount] = useState(0);
  const [scannedDoneCount, setScannedDoneCount] = useState(0);
  const [scannedFailCount, setScannedFailCount] = useState(0);
  const [activeFileName, setActiveFileName] = useState('');
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [batchActive, setBatchActive] = useState(false);
  const [batchErrorsList, setBatchErrorsList] = useState<Array<{ path: string; error: string }>>([]);
  const [scrollToLine, setScrollToLine] = useState<number | undefined>(undefined);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderProcessing, setFolderProcessing] = useState(false);
  const [pendingFolderName, setPendingFolderName] = useState('');
  const [pendingFileCount, setPendingFileCount] = useState(0);
  const [pendingSubdirs, setPendingSubdirs] = useState<string[]>([]);
  const [scanScope, setScanScope] = useState<'full' | 'subdir'>('full');
  const [selectedSubdir, setSelectedSubdir] = useState('');
  const [subdirDropdownOpen, setSubdirDropdownOpen] = useState(false);
  const subdirButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFilesRef = useRef<File[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const analysisSocket = useAnalysisSocket();
  const pollRef = useRef<number | null>(null);
  const scannedDoneCountRef = useRef(0);
  const scannedFailCountRef = useRef(0);
  const batchActiveRef = useRef(false);
  const autoEnterTimeoutRef = useRef<number | null>(null);

  const {
    view, setView,
    historyMode, setHistoryMode,
    batchReportsList, setBatchReportsList,
    selectedFile, setSelectedFile,
    selectedFolder, setSelectedFolder,
    expandedFolders, setExpandedFolders,
    currentFolderName, setCurrentFolderName,
    issueFilter, setIssueFilter,
    expandedIssueId, setExpandedIssueId,
    viewTarget, setViewTarget,
    addHistoryReport,
    toggleFolder,
  } = useAnalysisStore(useShallow(s => ({
    view: s.view,
    setView: s.setView,
    historyMode: s.historyMode,
    setHistoryMode: s.setHistoryMode,
    batchReportsList: s.batchReportsList,
    setBatchReportsList: s.setBatchReportsList,
    selectedFile: s.selectedFile,
    setSelectedFile: s.setSelectedFile,
    selectedFolder: s.selectedFolder,
    setSelectedFolder: s.setSelectedFolder,
    expandedFolders: s.expandedFolders,
    setExpandedFolders: s.setExpandedFolders,
    currentFolderName: s.currentFolderName,
    setCurrentFolderName: s.setCurrentFolderName,
    issueFilter: s.issueFilter,
    setIssueFilter: s.setIssueFilter,
    expandedIssueId: s.expandedIssueId,
    setExpandedIssueId: s.setExpandedIssueId,
    viewTarget: s.viewTarget,
    setViewTarget: s.setViewTarget,
    addHistoryReport: s.addHistoryReport,
    toggleFolder: s.toggleFolder,
  })));

  useEffect(() => {
    if (batchActive) {
      setElapsedSecs(0);
      const timer = setInterval(() => setElapsedSecs(prev => prev + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [batchActive]);

  // Cleanup on unmount — prevent false polling fallback
  useEffect(() => {
    return () => {
      batchActiveRef.current = false;
      analysisSocket.disconnect();
      if (autoEnterTimeoutRef.current !== null) {
        clearTimeout(autoEnterTimeoutRef.current);
        autoEnterTimeoutRef.current = null;
      }
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  // Fallback polling (used when WebSocket disconnects mid-scan)
  const startPollingFallback = (batchId: string) => {
    const seenFiles = new Set<string>();
    const fallbackPoll = async () => {
      if (abortRef.current?.signal.aborted || !batchActiveRef.current) return;
      try {
        const data = await analysisAPI.pollBatchResults(batchId);
        setFilesTotalCount(data.total);
        for (const f of data.files || []) {
          if (seenFiles.has(f.filename) || !batchActiveRef.current) continue;
          seenFiles.add(f.filename);
          if (f.status === 'completed' && f.analysis) {
            setActiveFileName(f.filename);
            setProgressFiles(prev => [f.filename, ...prev]);
            const report = mapToAnalysisResult({ ...f, batch_id: batchId }, f.filename);
            report._source_content = f.source_content || '';
            addHistoryReport(report);
            setBatchReportsList(prev => {
              const idx = prev.findIndex(r => r.filename === f.filename);
              if (idx >= 0) { const next = [...prev]; next[idx] = report; return next; }
              return [...prev, report];
            });
            scannedDoneCountRef.current += 1;
            setScannedDoneCount(p => p + 1);
          } else if (f.status === 'error') {
            setBatchErrorsList(prev => [...prev, { path: f.filename, error: f.error || 'Unknown error' }]);
            scannedFailCountRef.current += 1;
            setScannedFailCount(p => p + 1);
          }
        }
        if (data.is_complete) {
          setBatchActive(false);
          batchActiveRef.current = false;
          setActiveFileName('');
          if (pollRef.current !== null) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          if (autoEnterTimeoutRef.current === null) {
            autoEnterTimeoutRef.current = setTimeout(() => {
              autoEnterTimeoutRef.current = null;
              setView('workspace');
              setSelectedFolder(currentFolderName);
              setSelectedFile(null);
              setHistoryMode(true);
            }, 1500);
          }
        }
      } catch {
        // will retry on next interval
      }
    };
    fallbackPoll();
    pollRef.current = window.setInterval(fallbackPoll, 1500);
  };

  useEffect(() => {
    if (!viewTarget || !isActive) return;
    const { analysisId, filename, scanFolder } = viewTarget;
    const abortCtrl = new AbortController();

    (async () => {
      try {
        if (scanFolder) {
          const folderData = await analysisAPI.ragGetAnalysesByFolder(scanFolder);
          if (abortCtrl.signal.aborted) return;
          const reports: AnalysisResult[] = folderData.items.map(item =>
            mapToAnalysisResult({ ...item, document_id: item.analysis_id }, item.filename)
          );
          setBatchReportsList(reports);
          setCurrentFolderName(scanFolder);
          setSelectedFolder(scanFolder);
        } else {
          const data = await analysisAPI.ragGetAnalysis(analysisId);
          if (abortCtrl.signal.aborted) return;
          const report = mapToAnalysisResult({ ...data, document_id: data.analysis_id }, filename);
          setBatchReportsList([report]);
          setSelectedFile(report);
        }
        setView('workspace');
        setHistoryMode(true);
        setBatchErrorsList([]);
      } catch (err: any) {
        console.error('Failed to load analysis from history:', err);
      } finally {
        setViewTarget(null);
      }
    })();

    return () => abortCtrl.abort();
  }, [viewTarget, isActive]);

  useEffect(() => {
    if (!selectedFile) return;
    const prefix = currentFolderName
      ? (currentFolderName.split('/').pop() || currentFolderName) + '/'
      : '';
    const relPath = prefix && selectedFile.filename.startsWith(prefix)
      ? selectedFile.filename.slice(prefix.length)
      : selectedFile.filename;
    const segments = relPath.split('/');
    segments.pop();
    if (segments.length === 0) return;
    setExpandedFolders(prev => {
      let needsUpdate = false;
      const next = { ...prev };
      let acc = '';
      for (const seg of segments) {
        acc = acc ? `${acc}/${seg}` : seg;
        if (!next[acc]) {
          next[acc] = true;
          needsUpdate = true;
        }
      }
      return needsUpdate ? next : prev;
    });
  }, [selectedFile, currentFolderName]);

  // Re-fetch _source_content after store hydration (stripped by partialize)
  const fetchedSourceRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedFile || !selectedFile.document_id) return;
    const docId = selectedFile.document_id;
    if (fetchedSourceRef.current.has(docId)) return;
    fetchedSourceRef.current.add(docId);
    (async () => {
      try {
        const data = await analysisAPI.ragGetAnalysis(docId);
        if (data.analysis) {
          const updated = mapToAnalysisResult(
            { ...data.analysis, document_id: data.analysis_id, scan_id: data.scan_id, _source_content: data._source_content || '' },
            data.filename || selectedFile.filename,
          );
          setSelectedFile(updated);
          setBatchReportsList(prev =>
            prev.map(r => r.document_id === docId ? updated : r)
          );
        }
      } catch (err) {
        console.error('Failed to re-fetch analysis data:', err);
      }
    })();
  }, [selectedFile?.document_id]);

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
    scannedDoneCountRef.current = 0;
    setScannedDoneCount(0);
    setScannedFailCount(0);
    setFilesTotalCount(1);
    setActiveFileName(file.name);
    setBatchReportsList([]);
    setBatchErrorsList([]);

    let scanFolder = '';
    if (file.webkitRelativePath) {
      const parts = file.webkitRelativePath.replace(/\\/g, '/').split('/');
      if (parts.length > 1) scanFolder = parts[0];
    }

    try {
      const result = await analysisAPI.analyzeFile(file, scanFolder, 'single');
      const report = mapToAnalysisResult(result, file.name);
      report._source_content = await file.text();
      addHistoryReport(report);
      setBatchReportsList([report]);
      setScannedDoneCount(1);
      setActiveFileName('');
      setSelectedFile(report);
      setView('workspace');
      setHistoryMode(false);
    } catch {
        setBatchErrorsList(prev => [...prev, { path: file.name, error: 'Unable to analyze file. It may be unsupported or corrupted.' }]);
      setScannedFailCount(1);
    }
    setBatchActive(false);
  };

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
      manifest = await analysisAPI.gitClone(gitUrl, branch);
      if (manifest) setCurrentFolderName(manifest.repo_name);
    } catch {
      setBatchErrorsList(prev => [{ path: gitUrl, error: 'Unable to clone repository. Check the URL and try again.' }]);
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

    // Fetch ALL file contents in parallel (no sequential batching)
    const FETCH_BATCH = 1000;
    const allPaths = manifest.files.map(f => f.path);
    const fileContents: Record<string, string> = {};

    const fetchPromises: Promise<void>[] = [];
    for (let i = 0; i < allPaths.length; i += FETCH_BATCH) {
      const chunk = allPaths.slice(i, i + FETCH_BATCH);
      fetchPromises.push((async () => {
        try {
          const contents = await analysisAPI.gitFetchFiles(manifest.session_id, chunk);
          for (const f of contents.files) {
            fileContents[f.path] = f.content;
          }
        } catch (err) {
          console.error('Fetch batch failed:', err);
        }
      })());
    }

    await Promise.all(fetchPromises);

    setActiveFileName('Submitting for batch analysis...');

    // Create File objects from fetched contents
    const files = manifest.files
      .filter(f => f.path in fileContents && fileContents[f.path])
      .map(f => new File([fileContents[f.path]], f.path));

    try {
      const { batch_id } = await analysisAPI.submitBatchAnalysis(files, manifest.repo_name, 'repo');
      scannedDoneCountRef.current = 0;
      scannedFailCountRef.current = 0;
      batchActiveRef.current = true;

      analysisSocket.connect(batch_id, {
        onProgress: (done, total, currentFile) => {
          if (abortRef.current?.signal.aborted) return;
          setFilesTotalCount(total);
          setActiveFileName(currentFile);
        },
        onFileComplete: (msg) => {
          if (abortRef.current?.signal.aborted) return;
          setActiveFileName(msg.filename);
          setProgressFiles(prev => [msg.filename, ...prev]);
          const report = mapToAnalysisResult(
            {
              ...msg.analysis,
              document_id: msg.document_id,
              batch_id: msg.batch_id || batch_id,
              scan_folder: msg.scan_folder || '',
              scan_type: msg.scan_type || 'single',
            },
            msg.filename,
          );
          report._source_content = msg.source_content || fileContents[msg.filename] || '';
          addHistoryReport(report);
          setBatchReportsList(prev => {
            const idx = prev.findIndex(r => r.filename === msg.filename);
            if (idx >= 0) { const next = [...prev]; next[idx] = report; return next; }
            return [...prev, report];
          });
          scannedDoneCountRef.current += 1;
          setScannedDoneCount(p => p + 1);
        },
        onFileError: (filename, error) => {
          if (abortRef.current?.signal.aborted) return;
          setBatchErrorsList(prev => [...prev, { path: filename, error }]);
          scannedFailCountRef.current += 1;
          setScannedFailCount(p => p + 1);
        },
        onBatchComplete: () => {
          if (autoEnterTimeoutRef.current !== null) return;
          setBatchActive(false);
          batchActiveRef.current = false;
          setActiveFileName('');
          autoEnterTimeoutRef.current = setTimeout(() => {
            autoEnterTimeoutRef.current = null;
            setView('workspace');
            setSelectedFolder(currentFolderName);
            setSelectedFile(null);
            setHistoryMode(true);
          }, 1500);
        },
        onClose: () => {
          if (batchActiveRef.current) {
            startPollingFallback(batch_id);
          }
        },
        onError: (err) => console.error('WS error:', err),
      });
    } catch {
      setBatchErrorsList(prev => [{ path: gitUrl, error: 'Unable to submit batch for analysis. Please try again.' }]);
      setBatchActive(false);
      batchActiveRef.current = false;
    }
  };

  const handleOpenFolder = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.onchange = (e) => {
      const allFiles = Array.from((e.target as HTMLInputElement).files || []);
      if (allFiles.length === 0) return;

      // Extract folder name and show modal immediately (no computation)
      const samplePath = allFiles[0]?.webkitRelativePath || '';
      const folderName = samplePath.includes('\\') || samplePath.includes('/')
        ? samplePath.replace(/\\/g, '/').split('/')[0]
        : `Folder ${new Date().toISOString().slice(0, 10)}`;

      setPendingFolderName(folderName);
      setPendingFileCount(allFiles.length);
      setPendingSubdirs([]);
      setFolderProcessing(true);
      setFolderModalOpen(true);

      // Defer filtering so the browser paints the modal first
      setTimeout(() => {
        const subdirSet = new Set<string>();
        const files: File[] = [];

        for (const f of allFiles) {
          const path = f.webkitRelativePath || f.name;
          if (shouldSkipPath(path)) continue;
          if (f.size > MAX_FILE_BYTES) continue;
          const ext = '.' + f.name.split('.').pop()?.toLowerCase();
          if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

          files.push(f);

          const parts = path.replace(/\\/g, '/').split('/');
          if (parts.length >= 2) subdirSet.add(parts[1]);
        }

        const subdirs = Array.from(subdirSet).filter(s => !SKIP_DIRS.has(s)).sort();

        pendingFilesRef.current = files;
        setPendingFileCount(files.length);
        setPendingSubdirs(subdirs);
        setFolderProcessing(false);
      }, 0);

      setScanScope('full');
      setSelectedSubdir('');
    };
    input.click();
  };

  const confirmFolderScan = async () => {
    const files = pendingFilesRef.current;
    if (files.length === 0) return;
    const folderName = pendingFolderName;

    // Filter to selected subdirectory if scope is subdir
    let scanFiles = files;
    let scanName = folderName;
    if (scanScope === 'subdir' && selectedSubdir) {
      const prefix = folderName + '/' + selectedSubdir;
      scanFiles = files.filter(f => {
        const path = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
        return path.startsWith(prefix);
      });
      scanName = prefix;
    }

    setFolderModalOpen(false);
    setCurrentFolderName(scanName);

    setView('batch_progress');
    setBatchActive(true);
    setScannedDoneCount(0);
    setScannedFailCount(0);
    setFilesTotalCount(scanFiles.length);
    setActiveFileName('');
    setBatchReportsList([]);
    setBatchErrorsList([]);

    try {
      const { batch_id } = await analysisAPI.submitBatchAnalysis(scanFiles, scanName);
      scannedDoneCountRef.current = 0;
      scannedFailCountRef.current = 0;
      batchActiveRef.current = true;

      analysisSocket.connect(batch_id, {
        onProgress: (done, total, currentFile) => {
          if (abortRef.current?.signal.aborted) return;
          setFilesTotalCount(total);
          setActiveFileName(currentFile);
        },
        onFileComplete: (msg) => {
          if (abortRef.current?.signal.aborted) return;
          setActiveFileName(msg.filename);
          setProgressFiles(prev => [msg.filename, ...prev]);
          const report = mapToAnalysisResult(
            {
              ...msg.analysis,
              document_id: msg.document_id,
              batch_id: msg.batch_id || batch_id,
              scan_folder: msg.scan_folder || '',
              scan_type: msg.scan_type || 'single',
            },
            msg.filename,
          );
          report._source_content = msg.source_content || '';
          addHistoryReport(report);
          setBatchReportsList(prev => {
            const idx = prev.findIndex(r => r.filename === msg.filename);
            if (idx >= 0) { const next = [...prev]; next[idx] = report; return next; }
            return [...prev, report];
          });
          scannedDoneCountRef.current += 1;
          setScannedDoneCount(p => p + 1);
        },
        onFileError: (filename, error) => {
          if (abortRef.current?.signal.aborted) return;
          setBatchErrorsList(prev => [...prev, { path: filename, error }]);
          scannedFailCountRef.current += 1;
          setScannedFailCount(p => p + 1);
        },
        onBatchComplete: () => {
          if (autoEnterTimeoutRef.current !== null) return;
          setBatchActive(false);
          batchActiveRef.current = false;
          setActiveFileName('');
          autoEnterTimeoutRef.current = setTimeout(() => {
            autoEnterTimeoutRef.current = null;
            setView('workspace');
            setSelectedFolder(currentFolderName);
            setSelectedFile(null);
            setHistoryMode(true);
          }, 1500);
        },
        onClose: () => {
          if (batchActiveRef.current) {
            startPollingFallback(batch_id);
          }
        },
        onError: (err) => console.error('WS error:', err),
      });
    } catch {
      setBatchErrorsList(prev => [{ path: folderName, error: 'Unable to submit batch for analysis. Please try again.' }]);
      setBatchActive(false);
      batchActiveRef.current = false;
    }
  };

  const cancelBatchProcess = () => {
    abortRef.current?.abort();
    batchActiveRef.current = false;
    analysisSocket.disconnect();
    setBatchActive(false);
    if (autoEnterTimeoutRef.current !== null) {
      clearTimeout(autoEnterTimeoutRef.current);
      autoEnterTimeoutRef.current = null;
    }
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
    const prefix = currentFolderName ? (currentFolderName.split('/').pop() || currentFolderName) + '/' : '';
    const processed = prefix
      ? items.map(item => ({
          ...item,
          filename: item.filename.startsWith(prefix)
            ? item.filename.slice(prefix.length)
            : item.filename,
        }))
      : items;
    return buildFileTree(processed);
  }, [batchReportsList, batchErrorsList, currentFolderName]);

  const RESULTS_CATEGORIES = [
    { key: 'unused_import', label: 'Unused Imports', color: '#8b5cf6' },
    { key: 'unused_function', label: 'Unused Functions', color: '#ec4899' },
    { key: 'unused_variable', label: 'Unused Variables', color: '#3b82f6' },
    { key: 'unreachable_code', label: 'Unreachable Logic', color: '#f43f5e' },
    { key: 'commented_code', label: 'Commented Snippets', color: '#10b981' },
  ];

  const folderAggregate = useMemo(() => {
    if (!batchReportsList.length || !selectedFolder) return null;
    const allIssues = batchReportsList.flatMap(f => f.issues || []);
    const totalLines = batchReportsList.reduce((s, f) => s + (f.metrics?.total_lines || 0), 0);
    const totalIssues = allIssues.length;
    const healthScore = totalIssues === 0 ? 100 : Math.max(0, Math.round(100 - totalIssues * 5));
    const severityCounts = { high: 0, medium: 0, low: 0 };
    allIssues.forEach(i => {
      if (i.severity === 'high') severityCounts.high++;
      else if (i.severity === 'medium') severityCounts.medium++;
      else if (i.severity === 'low') severityCounts.low++;
    });
    return { allIssues, totalLines, totalIssues, healthScore, severityCounts };
  }, [batchReportsList, selectedFolder]);

  const allProjectIssues = useMemo(() => {
    return batchReportsList.flatMap(r => r.issues || []);
  }, [batchReportsList]);

  const filteredProjectIssues = useMemo(() => {
    if (issueFilter === 'all') return allProjectIssues;
    return allProjectIssues.filter(i => i.severity === issueFilter);
  }, [allProjectIssues, issueFilter]);

  const handleIssueClick = (issue: Issue) => {
    setExpandedIssueId(prev => prev === issue.id ? null : issue.id);
    const targetFile = batchReportsList.find(r => r.filename === issue.file);
    if (targetFile) {
      if (targetFile !== selectedFile) {
        setSelectedFile(targetFile);
        setSelectedFolder(null);
      }
      setScrollToLine(issue.line_start || issue.line || 1);
    }
  };

  const donutData = useMemo(() => {
    const issues = (historyMode && selectedFolder && folderAggregate)
      ? folderAggregate.allIssues
      : (selectedFile?.issues || []);
    if (!issues.length) return [];
    const counts: Record<string, number> = {};
    issues.forEach(i => {
      const key = i.type || 'commented_code';
      counts[key] = (counts[key] || 0) + 1;
    });
    return RESULTS_CATEGORIES.map(cat => ({
      ...cat,
      count: counts[cat.key] || 0,
    })).filter(d => d.count > 0);
  }, [selectedFile, selectedFolder, folderAggregate, historyMode]);

  const donutSegments = useMemo(() => {
    const total = donutData.reduce((s, d) => s + d.count, 0) || 1;
    let cumulative = 0;
    return donutData.map(d => {
      const percent = d.count / total;
      const start = cumulative;
      cumulative += percent;
      return { ...d, percent, startPercent: start };
    });
  }, [donutData]);

  const displayMetrics = useMemo(() => {
    if (historyMode && selectedFolder && folderAggregate) {
      return {
        total_lines: folderAggregate.totalLines,
        complexity_hint: folderAggregate.totalIssues > 5 ? 'high' : folderAggregate.totalIssues > 0 ? 'medium' : 'low',
      };
    }
    return selectedFile?.metrics;
  }, [historyMode, selectedFolder, folderAggregate, selectedFile]);

  const displaySummary = useMemo(() => {
    if (historyMode && selectedFolder && folderAggregate) {
      return {
        total_issues: folderAggregate.totalIssues,
        health_score: folderAggregate.healthScore,
      };
    }
    return selectedFile?.summary;
  }, [historyMode, selectedFolder, folderAggregate, selectedFile]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 flex-1 flex flex-col justify-start"
    >
      <div className="flex items-center gap-1 pb-2 border-b border-white/[0.03]">
        <button
          onClick={() => { setView('upload'); setHistoryMode(false); }}
          className={`px-3 py-1.5 text-[11px] font-mono font-bold rounded-lg transition-all cursor-pointer ${
            view === 'upload' ? 'bg-cyan-400/10 text-cyan-300 border border-cyan-400/20' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Initiate Scan
        </button>
        <div className="w-px h-4 bg-white/[0.06] mx-1" />
        <button
          onClick={() => setView('workspace')}
          className={`px-3 py-1.5 text-[11px] font-mono font-bold rounded-lg transition-all cursor-pointer ${
            view !== 'upload' ? 'bg-cyan-400/10 text-cyan-300 border border-cyan-400/20' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Workspace
        </button>
      </div>

      {view === 'upload' && (
        <div className="max-w-xl mx-auto w-full space-y-6 py-6">
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
            <p className="text-[10px] text-zinc-500 font-mono mt-2 uppercase tracking-wider">
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

          <div className="p-4 border border-cyan-400/10 bg-cyan-400/5 rounded-2xl flex gap-3 text-left">
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
                <h3 className="font-display font-light text-lg text-white">
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

              {batchActive && (
                <button
                  onClick={cancelBatchProcess}
                  className="px-3.5 py-1.5 text-[10px] font-mono uppercase tracking-wider font-bold rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/5 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <StopCircle size={12} /> Cancel
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
        <div className={`flex-1 min-h-0 grid grid-cols-1 gap-6 text-left -mx-6 w-[calc(100%+3rem)] ${
          allProjectIssues.length > 0
            ? 'lg:grid-cols-[240px_minmax(0,1fr)_200px]'
            : 'lg:grid-cols-[320px_minmax(0,1fr)]'
        }`}>
          <div className="rounded-3xl glass-card p-5 overflow-y-auto max-h-[640px] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.03]">
              <span className="text-[10px] font-mono tracking-wider uppercase text-cyan-400 font-bold">
                Scanned Files
              </span>
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
                    onNavigateToChat={onNavigateToChat}
                    currentFolderName={currentFolderName}
                  />
                ))
              )}
            </div>
          </div>

          <div className="min-w-0 min-h-0 overflow-y-auto space-y-6">
              {selectedFolder && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-cyan-400">
                    <Folder size={18} />
                    <h3 className="font-display font-medium text-sm tracking-tight text-white uppercase font-mono">{selectedFolder}/ Overview</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { val: batchReportsList.length, label: 'FILES', color: 'text-neutral-200' },
                      { val: folderAggregate?.totalIssues ?? 0, label: 'ISSUES', color: (folderAggregate?.totalIssues ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400' },
                      { val: (folderAggregate?.totalIssues ?? 0) > 5 ? 'high' : (folderAggregate?.totalIssues ?? 0) > 0 ? 'medium' : 'low', label: 'COMPLEXITY', color: 'text-amber-200' },
                      { val: `${folderAggregate?.healthScore ?? 100}%`, label: 'HEALTH', color: 'text-cyan-400' }
                    ].map((card, idx) => (
                      <div key={idx} className="py-2.5 px-3 rounded-2xl text-left shadow-sm glass-card min-w-0 overflow-hidden">
                        <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block font-bold">{card.label}</span>
                        <span className={`text-sm font-display font-extrabold mt-1 block uppercase ${card.color}`}>{card.val}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-6 items-start">
                    <div className="flex-1 p-5 rounded-3xl glass-card">
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-1 h-4 bg-cyan-400 rounded-full" />
                        <span className="text-[10px] font-mono tracking-wider uppercase text-cyan-400 font-bold">Issue Breakdown</span>
                        {donutData.length > 0 && (
                          <span className="text-[10px] font-mono text-zinc-500 ml-auto">
                            {donutData.reduce((s, d) => s + d.count, 0)} total
                          </span>
                        )}
                      </div>
                      {donutSegments.length > 0 ? (
                        <div className="flex flex-col md:flex-row items-center gap-6">
                          <div className="relative flex-shrink-0">
                            <svg width="140" height="140" viewBox="0 0 180 180">
                              <circle cx="90" cy="90" r="72" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="18" />
                              {donutSegments.map((seg, i) => {
                                const circumference = 2 * Math.PI * 72;
                                const dashLen = seg.percent * circumference;
                                const dashGap = circumference - dashLen;
                                const offset = -seg.startPercent * circumference;
                                return (
                                  <motion.circle
                                    key={i}
                                    cx="90" cy="90" r="72"
                                    fill="none"
                                    stroke={seg.color}
                                    strokeWidth="18"
                                    strokeDasharray={`${dashLen} ${dashGap}`}
                                    strokeDashoffset={offset}
                                    transform="rotate(-90 90 90)"
                                    strokeLinecap="round"
                                    initial={{ strokeDasharray: `0 ${circumference}` }}
                                    animate={{ strokeDasharray: `${dashLen} ${dashGap}` }}
                                    transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                                  />
                                );
                              })}
                              <circle cx="90" cy="90" r="52" fill="#060608" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-lg font-display font-bold text-zinc-100">
                                {donutData.reduce((s, d) => s + d.count, 0)}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2 flex-1 w-full">
                            {donutSegments.map((seg, i) => (
                              <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.4, delay: i * 0.08 }}
                                className="flex items-center justify-between py-1"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                                  <span className="text-[11px] text-zinc-300 font-mono">{seg.label}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px]">
                                  <span className="font-mono text-zinc-400">{seg.count}</span>
                                  <span className="text-[10px] font-mono text-zinc-600 w-8 text-right">
                                    {Math.round(seg.percent * 100)}%
                                  </span>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-zinc-500">
                          <CheckCircle2 size={22} className="text-emerald-400 mb-2" />
                          <p className="text-[10px] font-mono">No issues found</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {selectedFile && (
                <div className="space-y-6">
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { val: selectedFile.metrics?.total_lines || 0, label: 'TOTAL LINES', color: 'text-neutral-200' },
                      { val: allProjectIssues.length, label: 'ISSUES', color: allProjectIssues.length > 0 ? 'text-rose-400' : 'text-emerald-400' },
                      { val: selectedFile.metrics?.complexity_hint || 'low', label: 'COMPLEXITY', color: 'text-amber-200' },
                      { val: `${selectedFile.summary?.health_score || 0}%`, label: 'HEALTH', color: 'text-cyan-400' }
                    ].map((card, idx) => (
                      <div key={idx} className={`text-left shadow-sm glass-card min-w-0 overflow-hidden ${
                        historyMode ? 'py-3 px-4 rounded-3xl shadow-md border border-white/[0.05]' : 'py-2.5 px-3 rounded-2xl'
                      }`}>
                        <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block font-bold">{card.label}</span>
                        <span className={`mt-1.5 block uppercase font-display font-extrabold ${
                          historyMode ? 'text-sm tracking-wide' : 'text-sm'
                        } ${card.color}`}>{card.val}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 py-2 px-1">
                    <FileCode size={14} className="text-violet-400/70 flex-shrink-0" />
                    <span className="text-sm font-mono text-zinc-200 truncate flex-1">
                      {selectedFile.filename}
                    </span>
                    {selectedFile.document_id && (
                      <button
                        onClick={() => onNavigateToChat(selectedFile.document_id, selectedFile.filename)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono font-semibold rounded-lg bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-all cursor-pointer"
                      >
                        <MessageCircle size={11} />
                        Chat
                      </button>
                    )}
                  </div>

                  {historyMode ? (
                    <div className="flex gap-6 items-start">
                      <div className="flex-1 p-5 rounded-3xl glass-card">
                        <div className="flex items-center gap-2.5 mb-4">
                          <div className="w-1 h-4 bg-cyan-400 rounded-full" />
                          <span className="text-[10px] font-mono tracking-wider uppercase text-cyan-400 font-bold">Issue Breakdown</span>
                          {donutData.length > 0 && (
                            <span className="text-[10px] font-mono text-zinc-500 ml-auto">
                              {donutData.reduce((s, d) => s + d.count, 0)} total
                            </span>
                          )}
                        </div>
                        {donutSegments.length > 0 ? (
                          <div className="flex flex-col md:flex-row items-center gap-6">
                            <div className="relative flex-shrink-0">
                              <svg width="140" height="140" viewBox="0 0 180 180">
                                <circle cx="90" cy="90" r="72" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="18" />
                                {donutSegments.map((seg, i) => {
                                  const circumference = 2 * Math.PI * 72;
                                  const dashLen = seg.percent * circumference;
                                  const dashGap = circumference - dashLen;
                                  const offset = -seg.startPercent * circumference;
                                  return (
                                    <motion.circle
                                      key={i}
                                      cx="90" cy="90" r="72"
                                      fill="none"
                                      stroke={seg.color}
                                      strokeWidth="18"
                                      strokeDasharray={`${dashLen} ${dashGap}`}
                                      strokeDashoffset={offset}
                                      transform="rotate(-90 90 90)"
                                      strokeLinecap="round"
                                      initial={{ strokeDasharray: `0 ${circumference}` }}
                                      animate={{ strokeDasharray: `${dashLen} ${dashGap}` }}
                                      transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                                    />
                                  );
                                })}
                                <circle cx="90" cy="90" r="52" fill="#060608" />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-lg font-display font-bold text-zinc-100">
                                  {donutData.reduce((s, d) => s + d.count, 0)}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2 flex-1 w-full">
                              {donutSegments.map((seg, i) => (
                                <motion.div
                                  key={i}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.4, delay: i * 0.08 }}
                                  className="flex items-center justify-between py-1"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                                    <span className="text-[11px] text-zinc-300 font-mono">{seg.label}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[11px]">
                                    <span className="font-mono text-zinc-400">{seg.count}</span>
                                    <span className="text-[10px] font-mono text-zinc-600 w-8 text-right">
                                      {Math.round(seg.percent * 100)}%
                                    </span>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-6 text-zinc-500">
                            <CheckCircle2 size={22} className="text-emerald-400 mb-2" />
                            <p className="text-[10px] font-mono">No issues found</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <CodeViewer
                      source={selectedFile._source_content || ''}
                      issues={selectedFile.issues || []}
                      filename={selectedFile.filename}
                      scrollToLine={scrollToLine}
                      onScrolled={() => setScrollToLine(undefined)}
                    />
                  )}
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

            {allProjectIssues.length > 0 && (
              <div className="p-5 rounded-3xl flex flex-col space-y-4 max-h-[640px] overflow-y-auto glass-card">
                <div className="space-y-3">
                  <span className="text-[10px] font-mono tracking-wider uppercase text-neutral-500 font-bold block">Filter</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(() => {
                      const counts = { all: allProjectIssues.length, high: allProjectIssues.filter(i => i.severity === 'high').length, medium: allProjectIssues.filter(i => i.severity === 'medium').length, low: allProjectIssues.filter(i => i.severity === 'low').length };
                      return ['all', 'high', 'medium', 'low'].map(filter => (
                        <button
                          key={filter}
                          onClick={() => setIssueFilter(filter as any)}
                          className={`text-[10px] font-semibold py-1.5 px-2 rounded-xl cursor-pointer transition-all ${
                            issueFilter === filter ? 'bg-cyan-400/15 text-cyan-300 font-bold border border-cyan-400/25 shadow-sm' : 'bg-white/[0.01] text-neutral-500 border border-white/[0.04]'
                          }`}
                        >
                          {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                          <span className="ml-1 text-[9px] opacity-60">({counts[filter as keyof typeof counts]})</span>
                        </button>
                      ));
                    })()}
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {filteredProjectIssues.length === 0 ? (
                    <div className="text-center py-10 text-neutral-500">
                      <p className="text-xs font-sans">No issues in this category.</p>
                    </div>
                  ) : (
                    filteredProjectIssues.map((issue, idx) => {
                      const isExpanded = expandedIssueId === issue.id;
                      const isHigh = issue.type === 'unused_function' || issue.type === 'unreachable_code';
                      const colorBadge = isHigh ? 'text-rose-400 bg-rose-500/10 border-rose-500/10' : 'text-amber-400 bg-amber-400/10 border-amber-400/10';

                      return (
                        <div
                          key={idx}
                          onClick={() => handleIssueClick(issue)}
                          className="border border-white/[0.03] rounded-2xl p-3.5 bg-white/[0.01] hover:border-cyan-400/20 cursor-pointer transition-all space-y-2.5"
                        >
                          <div className="flex justify-between items-center gap-2">
                            <span className={`px-2 py-0.5 rounded font-mono text-[8px] font-semibold border ${colorBadge} flex-shrink-0`}>
                              {issue.type.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500 truncate min-w-0" title={issue.file}>{issue.file}</span>
                            <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0">L:{issue.line}</span>
                          </div>
                          <p className="text-xs text-zinc-300 font-sans leading-normal break-words">{issue.description}</p>

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
                                    const f = batchReportsList.find(r => r.filename === issue.file);
                                    if (f?.document_id) onNavigateToChat(f.document_id, f.filename);
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
      )}

      <Modal open={folderModalOpen} onClose={() => setFolderModalOpen(false)} title="Directory Scan">
        <div className="space-y-4 font-sans text-left">
          <p className="text-xs text-neutral-400 leading-relaxed">
            Confirm directory scan for the selected folder.
          </p>
          {folderProcessing ? (
            <div className="text-xs text-zinc-500 py-4 text-center font-mono">
              Scanning files...
            </div>
          ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 font-mono tracking-wider font-semibold block uppercase">Folder</label>
              <div className="w-full py-2.5 px-3.5 text-xs text-zinc-300 bg-white/[0.02] border border-white/[0.06] rounded-xl truncate">
                {pendingFolderName || 'No folder selected'}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 font-mono tracking-wider font-semibold block uppercase">Files to Scan</label>
              <div className="w-full py-2.5 px-3.5 text-xs text-zinc-300 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                {scanScope === 'subdir' && selectedSubdir
                  ? `${pendingFilesRef.current.filter(f => (f.webkitRelativePath || f.name).replace(/\\/g, '/').startsWith(pendingFolderName + '/' + selectedSubdir)).length} of ${pendingFileCount} files`
                  : `${pendingFileCount} files`}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 font-mono tracking-wider font-semibold block uppercase">Scan Scope</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer py-1.5 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors flex-1">
                  <input
                    type="radio"
                    name="scope"
                    value="full"
                    checked={scanScope === 'full'}
                    onChange={() => setScanScope('full')}
                    className="accent-cyan-400"
                  />
                  <span className="text-[11px] text-zinc-300 font-medium">Full Project</span>
                </label>
                <label className={`flex items-center gap-2 cursor-pointer py-1.5 px-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors flex-1 ${pendingSubdirs.length === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
                  <input
                    type="radio"
                    name="scope"
                    value="subdir"
                    checked={scanScope === 'subdir'}
                    onChange={() => setScanScope('subdir')}
                    className="accent-cyan-400"
                  />
                  <span className="text-[11px] text-zinc-300 font-medium">Subfolder</span>
                </label>
              </div>
              {scanScope === 'subdir' && (
                <div className="mt-2">
                  <button
                    ref={subdirButtonRef}
                    type="button"
                    onClick={() => setSubdirDropdownOpen(prev => !prev)}
                    className="w-full py-2 px-3 text-xs text-left text-zinc-300 bg-zinc-800 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all cursor-pointer flex items-center justify-between"
                  >
                    <span className={selectedSubdir ? 'text-zinc-200' : 'text-zinc-500'}>
                      {selectedSubdir ? `${selectedSubdir}/` : 'Select subfolder...'}
                    </span>
                    <span className="text-zinc-500 text-[10px]">&#9662;</span>
                  </button>
                  <AnimatePresence>
                    {subdirDropdownOpen && (() => {
                      const rect = subdirButtonRef.current?.getBoundingClientRect();
                      if (!rect) return null;
                      return (
                        <motion.div
                          className="fixed z-50"
                          style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}
                          initial={{ opacity: 0, scaleY: 0.95, y: -4 }}
                          animate={{ opacity: 1, scaleY: 1, y: 0 }}
                          exit={{ opacity: 0, scaleY: 0.95, y: -4 }}
                          transition={{ duration: 0.12 }}
                        >
                          <div className="bg-zinc-800 border border-white/[0.06] rounded-xl shadow-xl max-h-[180px] overflow-y-auto">
                            <div className="fixed inset-0 z-[-1]" onClick={() => setSubdirDropdownOpen(false)} />
                            <button
                              type="button"
                              onClick={() => { setSelectedSubdir(''); setSubdirDropdownOpen(false); }}
                              className="w-full text-left px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.04] cursor-pointer transition-colors"
                            >
                              None (analyze all)
                            </button>
                            {pendingSubdirs.map(s => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => { setSelectedSubdir(s); setSubdirDropdownOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-xs cursor-pointer transition-colors hover:bg-white/[0.04] ${selectedSubdir === s ? 'text-cyan-400 bg-white/[0.04]' : 'text-zinc-300'}`}
                              >
                                {s}/
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      );
                    })()}
                  </AnimatePresence>
                </div>
              )}
            </div>
            </div>
          )}
          <div className="pt-3 flex justify-end gap-2.5 text-xs">
            <button onClick={() => setFolderModalOpen(false)} className="px-4 py-2 border border-white/[0.04] text-neutral-400 hover:text-white rounded-lg cursor-pointer bg-white/[0.01]">Cancel</button>
            <button
              onClick={confirmFolderScan}
              disabled={folderProcessing || pendingFileCount === 0}
              className="px-5 py-2 bg-gradient-to-r from-cyan-400 to-purple-600 text-white font-bold rounded-lg hover:opacity-95 transition-all text-center cursor-pointer shadow-lg shadow-cyan-500/10 disabled:opacity-40"
            >
              Start Scan
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={gitModalOpen} onClose={() => setGitModalOpen(false)} title="Git Repository Import">
        <div className="space-y-4 font-sans text-left">
          <p className="text-xs text-neutral-400 leading-relaxed">
            Enter a GitHub repository URL to clone and analyze its code.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 font-mono tracking-wider font-semibold block uppercase">Repository URL</label>
              <input
                type="text"
                placeholder="https://github.com/user/repo"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                className="w-full py-2.5 px-3.5 text-xs text-zinc-300 bg-white/[0.02] border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 font-mono tracking-wider font-semibold block uppercase">Branch</label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full py-2.5 px-3.5 text-xs text-zinc-300 bg-white/[0.02] border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all cursor-pointer appearance-none"
                style={{ colorScheme: 'dark' }}
              >
                <option value="main">main</option>
                <option value="dev">dev</option>
              </select>
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

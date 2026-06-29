import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle, AlertCircle, Info, MessageSquare,
  Loader2, FolderOpen, CheckCircle, RefreshCw, Upload,
  FileCode, FileText, X, BarChart3, Bug, File, Folder,
  LayoutDashboard, ClipboardList, GitBranch, Users,
  ChevronRight, XCircle, Clock, Trash2,
  MessageSquareText, Send, CheckCheck,
} from 'lucide-react';
import { User, AnalysisResult, CodeReviewFeedback } from '../../types';
import { analysisAPI } from '../../api/analysis';
import { groupByTopLevelDir, buildHistoryTree } from '../../lib/fileTree';
import type { HistoryTreeNodeData } from '../../lib/fileTree';
import HistoryTreeNode from '../../lib/TreeComponents';
import { useNotificationSocket } from '../../hooks/useNotificationSocket';
import { timeAgo } from '../../lib/time';
import HistoryTab from './HistoryTab';
import TeamChatTab from './TeamChatTab';


interface JuniorTabProps {
  currentUser: User;
  history: AnalysisResult[];
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  onNavigateToChat?: (docId: string, filename: string) => void;
  onNavigateToWorkspace?: (analysisId: string, filename: string, scanFolder?: string) => void;
}

const SUB_TABS = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'history' as const, label: 'History', icon: Clock },
  { id: 'upload' as const, label: 'Upload', icon: Upload },
  { id: 'results' as const, label: 'Results', icon: ClipboardList },
  { id: 'teamchat' as const, label: 'Team Chat', icon: Users },
  { id: 'feedback' as const, label: 'Feedback', icon: MessageSquareText },
];

const healthBarColor = (score: number) => {
  if (score >= 85) return 'bg-emerald-400';
  if (score >= 60) return 'bg-amber-400';
  return 'bg-rose-400';
};

const healthTextColor = (score: number) => {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-rose-400';
};

const issueDots = (count: number) => {
  if (count === 0) return { dots: '●', color: 'text-emerald-400' };
  if (count <= 3) return { dots: '●'.repeat(count), color: 'text-amber-400' };
  return { dots: '●'.repeat(Math.min(count, 5)), color: 'text-rose-400' };
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'done': return { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10' };
    case 'analysing': return { icon: Loader2, color: 'text-cyan-400', bg: 'bg-cyan-400/10' };
    case 'failed': return { icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-400/10' };
    case 'pending_review': return { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10' };
    default: return { icon: Clock, color: 'text-zinc-500', bg: 'bg-zinc-500/10' };
  }
};

const FILE_ICONS: Record<string, { icon: any; color: string }> = {
  py:   { icon: FileCode, color: 'text-blue-400' },
  ts:   { icon: FileCode, color: 'text-cyan-400' },
  tsx:  { icon: FileCode, color: 'text-cyan-400' },
  mts:  { icon: FileCode, color: 'text-cyan-400' },
  cts:  { icon: FileCode, color: 'text-cyan-400' },
  js:   { icon: FileText, color: 'text-yellow-400' },
  jsx:  { icon: FileText, color: 'text-yellow-400' },
  mjs:  { icon: FileText, color: 'text-yellow-400' },
  cjs:  { icon: FileText, color: 'text-yellow-400' },
  json: { icon: FileCode, color: 'text-orange-400' },
  yaml: { icon: FileCode, color: 'text-orange-400' },
  yml:  { icon: FileCode, color: 'text-orange-400' },
  toml: { icon: FileCode, color: 'text-orange-400' },
  css:  { icon: FileCode, color: 'text-pink-400' },
  scss: { icon: FileCode, color: 'text-pink-400' },
  less: { icon: FileCode, color: 'text-pink-400' },
  html: { icon: FileCode, color: 'text-red-400' },
  htm:  { icon: FileCode, color: 'text-red-400' },
  md:   { icon: FileText, color: 'text-zinc-400' },
  rst:  { icon: FileText, color: 'text-zinc-400' },
  txt:  { icon: FileText, color: 'text-zinc-400' },
  sh:   { icon: FileCode, color: 'text-lime-400' },
  bash: { icon: FileCode, color: 'text-lime-400' },
  zsh:  { icon: FileCode, color: 'text-lime-400' },
  ps1:  { icon: FileCode, color: 'text-lime-400' },
  rs:   { icon: FileCode, color: 'text-orange-400' },
  go:   { icon: FileCode, color: 'text-cyan-400' },
  java: { icon: FileCode, color: 'text-red-400' },
  vue:  { icon: FileCode, color: 'text-emerald-400' },
  svelte: { icon: FileCode, color: 'text-rose-400' },
  sql:  { icon: FileCode, color: 'text-purple-400' },
  dockerfile: { icon: FileCode, color: 'text-blue-400' },
  dockerignore: { icon: FileCode, color: 'text-blue-400' },
  env:  { icon: FileCode, color: 'text-zinc-500' },
};

function getFileIcon(filename: string) {
  const dot = filename.lastIndexOf('.');
  const ext = dot !== -1 ? filename.slice(dot + 1).toLowerCase() : '';
  return FILE_ICONS[ext] || { icon: FileCode, color: 'text-zinc-500' };
}

function buildUploadTree(files: File[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode[]>();
  for (const f of files) {
    const parts = (f.webkitRelativePath || f.name).replace(/\\/g, '/').split('/');
    let current = root;
    let path = '';
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      path = path ? `${path}/${parts[i]}` : parts[i];
      if (isLast) {
        current.push({ name: parts[i], isDir: false, children: [], item: f, key: path });
      } else {
        let dir = current.find(n => n.isDir && n.name === parts[i]);
        if (!dir) {
          dir = { name: parts[i], isDir: true, children: [], key: path };
          current.push(dir);
        }
        current = dir.children;
      }
    }
  }
  const sortNodes = (ns: TreeNode[]) => {
    ns.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of ns) if (n.children.length) sortNodes(n.children);
  };
  sortNodes(root);
  return root;
}

interface TreeNode {
  name: string;
  isDir: boolean;
  children: TreeNode[];
  item?: any;
  key?: string;
}

function connectorSpan(prefix: string): React.ReactNode {
  return (
    <span className="font-mono text-zinc-600 text-[10px] select-none flex-shrink-0 leading-none">
      {prefix}
    </span>
  );
}

function childConnectorPrefix(parentPrefix: string, parentIsLast: boolean): string {
  return parentPrefix + (parentIsLast ? '    ' : '│   ');
}

function buildPathTree<T>(
  items: T[],
  getPath: (item: T) => string,
  getItemKey: (item: T, path: string) => string = (_item, path) => path,
): TreeNode[] {
  const root: TreeNode[] = [];
  for (const item of items) {
    const path = (getPath(item) || 'untitled').replace(/\\/g, '/');
    const parts = path.split('/').filter(Boolean);
    let current = root;
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (isLast) {
        if (!current.some(n => !n.isDir && n.key === getItemKey(item, currentPath))) {
          current.push({ name: part, isDir: false, children: [], item, key: getItemKey(item, currentPath) });
        }
      } else {
        let dir = current.find(n => n.isDir && n.name === part);
        if (!dir) {
          dir = { name: part, isDir: true, children: [], key: currentPath };
          current.push(dir);
        }
        current = dir.children;
      }
    }
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(root);
  return root;
}

export default function JuniorTab({ currentUser, history, onShowToast, onNavigateToChat, onNavigateToWorkspace }: JuniorTabProps) {
  const [subTab, setSubTab] = useState<'dashboard' | 'history' | 'upload' | 'results' | 'teamchat' | 'feedback'>('dashboard');
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [createdMap, setCreatedMap] = useState<Record<string, boolean>>({});

  const [feedbackNotifs, setFeedbackNotifs] = useState(0);
  const feedbackNotifsRef = useRef(0);

  // Live refresh state
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  // 30s tick to re-render timeAgo
  useEffect(() => {
    const tick = setInterval(() => setLastRefreshed(prev => prev + 1), 30000);
    return () => clearInterval(tick);
  }, []);

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [folderName, setFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Git import state
  const [showGitImport, setShowGitImport] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [gitImporting, setGitImporting] = useState(false);

  // Results state
  const [resultDetail, setResultDetail] = useState<any>(null);
  const [resultLoading, setResultLoading] = useState(false);

  // Tree expansion state
  const [expandedTreePaths, setExpandedTreePaths] = useState<Record<string, boolean>>({});

  const toggleTreePath = (path: string) => {
    setExpandedTreePaths(prev => {
      if (!(path in prev)) return { ...prev, [path]: true };
      return { ...prev, [path]: !prev[path] };
    });
  };

  const loadData = async () => {
    setRefreshing(true);
    try {
      const [hist, feedbacks] = await Promise.all([
        analysisAPI.ragHistory(500),
        analysisAPI.juniorListFeedback().catch(() => []),
      ]);
      const items = hist.items;
      const folderSet = new Set<string>();
      for (const item of items) {
        if (item.scan_folder) folderSet.add(item.scan_folder);
      }
      const arr = Array.from(folderSet).sort();
      setFolders(arr);
      if (arr.length > 0 && !selectedFolder) setSelectedFolder(arr[0]);
      setReports(items);
      const unresolved = feedbacks.filter((fb: CodeReviewFeedback) => !fb.resolved).length;
      feedbackNotifsRef.current = unresolved;
      setFeedbackNotifs(unresolved);
      setLastRefreshed(Date.now());
    } catch (e: any) {
      onShowToast(e?.message || 'Failed to load history reports.', 'error');
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, []);

  const { connect, disconnect } = useNotificationSocket();
  useEffect(() => {
    const refresh = async () => {
      try {
        const data = await analysisAPI.listSubmissions();
        setSubmissions(data);
        setLastRefreshed(Date.now());
      } catch { /* ignore */ }
    };
    refresh();
    connect(msg => {
      if (msg.type === 'nightly_report_ready') loadData();
      if (msg.type === 'submission_update' || msg.type === 'junior.analysis_complete' || msg.type === 'junior.analysis_failed') refresh();
      if (msg.type === 'feedback_added') {
        feedbackNotifsRef.current += 1;
        setFeedbackNotifs(feedbackNotifsRef.current);
      }
    });
    return () => { disconnect(); };
  }, [connect]);

  const BATCH_SIZE = 100;

  const TEXT_EXTS = new Set([
    'py', 'js', 'ts', 'tsx', 'jsx', 'css', 'scss', 'less', 'html', 'htm',
    'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
    'md', 'rst', 'txt', 'csv', 'tsv',
    'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
    'java', 'kt', 'scala', 'groovy',
    'c', 'h', 'cpp', 'hpp', 'cc', 'hh', 'cxx', 'hxx',
    'cs', 'fs', 'vb',
    'go', 'rs', 'rb', 'php', 'pl', 'pm', 'lua', 'r',
    'swift', 'm', 'mm',
    'sql', 'graphql', 'gql',
    'dockerfile', 'makefile', 'gradle', 'sbt',
    'vue', 'svelte', 'astro',
    'tf', 'hcl', 'dockerignore', 'gitignore', 'editorconfig',
    'env', 'properties',
  ]);

  const isTextFile = (name: string) => {
    const dot = name.lastIndexOf('.');
    if (dot === -1) return true;
    return TEXT_EXTS.has(name.slice(dot + 1).toLowerCase());
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => isTextFile(f.name));
      if (files.length < e.target.files.length) {
        onShowToast(`Filtered out ${e.target.files.length - files.length} non-text file(s).`, 'info');
      }
      setUploadFiles(files);
      setFolderName('Standalone');
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => isTextFile(f.name));
      if (files.length < e.target.files.length) {
        onShowToast(`Filtered out ${e.target.files.length - files.length} non-text file(s).`, 'info');
      }
      setUploadFiles(files);
      const name = files[0]?.webkitRelativePath?.replace(/\\/g, '/').split('/')[0] || 'Project';
      setFolderName(name);
    }
  };

  const handleUpload = async () => {
    if (!uploadFiles.length || uploading) return;
    setUploading(true);
    const total = uploadFiles.length;
    let uploaded = 0;
    try {
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = uploadFiles.slice(i, i + BATCH_SIZE);
        const result = await analysisAPI.juniorUpload(batch, folderName || undefined);
        const newSubs = result.submissions || [];
        setSubmissions(prev => [...newSubs, ...prev]);
        uploaded += batch.length;
        if (uploaded < total) {
          onShowToast(`Uploaded ${uploaded}/${total} file(s)...`, 'info');
        }
      }
      setUploadFiles([]);
      setFolderName('');
      onShowToast(`Uploaded ${total} file(s) for review.`, 'success');
    } catch (e: any) {
      onShowToast(e?.message || `Upload failed after ${uploaded}/${total} files.`, 'error');
    }
    setUploading(false);
  };

  const handleGitImport = async () => {
    if (!gitUrl.trim() || gitImporting) return;
    setGitImporting(true);
    try {
      const result = await analysisAPI.juniorGitImport(gitUrl.trim(), gitBranch, []);
      setSubmissions(prev => prev); // refresh() below will update
      onShowToast(`Imported ${result.imported} file(s) from ${result.repo_name}.`, 'success');
      setGitUrl('');
      setGitBranch('main');
      const data = await analysisAPI.listSubmissions();
      setSubmissions(data);
    } catch (e: any) {
      onShowToast(e?.message || 'Git import failed.', 'error');
    }
    setGitImporting(false);
  };

  const removeFile = (idx: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const folderReports = useMemo(
    () => reports.filter(r => r.scan_folder === selectedFolder),
    [reports, selectedFolder],
  );

  const handleAskSenior = async (aid: string, fn: string, iid: string) => {
    const key = `${aid}:${iid}`;
    setSending(p => ({ ...p, [key]: true }));
    try {
      await analysisAPI.createThread(aid, fn, iid);
      setCreatedMap(p => ({ ...p, [key]: true }));
      onShowToast('Question sent to senior.', 'success');
    } catch {
      onShowToast('Failed to send question.', 'error');
    }
    setSending(p => ({ ...p, [key]: false }));
  };

  const handleRetry = async (id: number) => {
    try {
      await analysisAPI.triggerSubmissionAnalysis(id);
      onShowToast('Retrying analysis...', 'info');
      const data = await analysisAPI.listSubmissions();
      setSubmissions(data);
    } catch (e: any) {
      onShowToast(e?.message || 'Retry failed.', 'error');
    }
  };

  const handleViewResult = async (id: number) => {
    setResultDetail(null);
    setResultLoading(true);
    try {
      const data = await analysisAPI.getSubmissionDetail(id);
      setResultDetail(data);
    } catch (e: any) {
      onShowToast(e?.message || 'Failed to load result.', 'error');
    }
    setResultLoading(false);
  };

  const handleBackToResults = useCallback(() => {
    setResultDetail(null);
  }, []);

  const [clearingHistory, setClearingHistory] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClearAll = async () => {
    setClearingHistory(true);
    try {
      await analysisAPI.clearAllHistory();
      await analysisAPI.clearJuniorSubmissions();
      setSubmissions([]);
      onShowToast('All analysis history cleared.', 'success');
    } catch (e: any) {
      onShowToast(e?.message || 'Failed to clear history.', 'error');
    } finally {
      setClearingHistory(false);
      setConfirmClear(false);
    }
  };

  const stats = useMemo(() => {
    const totalAnalyses = reports.length;
    const totalIssues = reports.reduce((s, r) => s + (r.total_issues || 0), 0);
    const avgHealth = totalAnalyses
      ? Math.round(reports.reduce((s, r) => s + (r.health_score || 0), 0) / totalAnalyses)
      : 100;
    const pendingReviews = submissions.filter(s => s.status !== 'done').length;
    const submittedFiles = submissions.length;
    return { totalAnalyses, totalIssues, avgHealth, pendingReviews, submittedFiles };
  }, [reports, submissions]);

  const subStatusCounts = useMemo(() => ({
    analysing: submissions.filter(s => s.status === 'analysing').length,
    done: submissions.filter(s => s.status === 'done').length,
    failed: submissions.filter(s => s.status === 'failed').length,
    pending_review: submissions.filter(s => s.status === 'pending_review').length,
  }), [submissions]);

  const doneSubmissions = useMemo(() => submissions.filter(s => s.status === 'done'), [submissions]);

  const recentSubmissionTree = useMemo(() => {
    const sliced = submissions.slice(0, 10);
    const seen = new Map<string, any>();
    for (const s of sliced) {
      const path = `${s.scan_folder || 'Standalone'}/${s.relative_path || s.filename}`;
      if (!seen.has(path) || new Date(s.created_at) > new Date(seen.get(path).created_at)) {
        seen.set(path, s);
      }
    }
    return buildPathTree(
      Array.from(seen.values()),
      (s: any) => `${s.scan_folder || 'Standalone'}/${s.relative_path || s.filename}`,
      (s: any, path: string) => path,
    );
  }, [submissions]);

  // Build folder-based tree for reports
  const reportTree = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const r of reports) {
      const key = r.scan_folder || 'Standalone';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const nodes: TreeNode[] = [];
    for (const [folder, items] of groups) {
      const folderName = folder.replace(/\\/g, '/').split('/').filter(Boolean).pop() || folder;
      const stripFolder = folder.replace(/\\/g, '/').replace(/\/?$/, '');
      const processed = items.map(r => ({
        ...r,
        filename: r.filename.startsWith(stripFolder + '/') ? r.filename.slice(stripFolder.length + 1) : r.filename,
      }));
      const appGroups = groupByTopLevelDir(processed);
      const children: TreeNode[] = [];
      for (const ag of appGroups) {
        const prefix = ag.appName === 'Project Root' ? '' : ag.appName + '/';
        const agChildren = buildPathTree(ag.items, (r: any) => {
          const f = r.filename.replace(/\\/g, '/');
          return prefix && f.startsWith(prefix) ? f.slice(prefix.length) : f;
        }, (r: any, path) => r.analysis_id || path);
        children.push({ name: ag.appName, isDir: true, children: agChildren, key: `${folder}:${ag.appName}`, item: { count: ag.items.length } });
      }
      nodes.push({ name: folderName, isDir: true, children, key: folder, item: { folder } });
    }
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    return nodes;
  }, [reports]);

  // Build submission tree for upload tab — grouped by folder
  const submissionTree = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const s of submissions) {
      const key = s.scan_folder || 'Standalone';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const nodes: TreeNode[] = [];
    for (const [folder, items] of groups) {
      const folderName = folder.replace(/\\/g, '/').split('/').filter(Boolean).pop() || folder;
      const stripFolder = folder.replace(/\\/g, '/').replace(/\/?$/, '');
      const processed = items.map(s => ({
        ...s,
        filename: (s.relative_path || s.filename).startsWith(stripFolder + '/') ? (s.relative_path || s.filename).slice(stripFolder.length + 1) : (s.relative_path || s.filename),
      }));
      const seen = new Map<string, any>();
      for (const s of processed) {
        const key = s.filename;
        if (!seen.has(key) || new Date(s.created_at) > new Date(seen.get(key).created_at)) {
          seen.set(key, s);
        }
      }
      const appGroups = groupByTopLevelDir(Array.from(seen.values()));
      const children: TreeNode[] = [];
      let totalCount = 0;
      let hasActive = false;
      for (const ag of appGroups) {
        const prefix = ag.appName === 'Project Root' ? '' : ag.appName + '/';
        const agChildren = buildPathTree(ag.items, (s: any) => {
          const f = s.filename.replace(/\\/g, '/');
          return prefix && f.startsWith(prefix) ? f.slice(prefix.length) : f;
        }, (s: any, path) => String(s.id || path));
        totalCount += ag.items.length;
        if (ag.items.some((s: any) => s.status === 'pending_review' || s.status === 'analysing')) hasActive = true;
        children.push({ name: ag.appName, isDir: true, children: agChildren, key: `${folder}:${ag.appName}`, item: { count: ag.items.length } });
      }
      nodes.push({
        name: folderName, isDir: true, children, key: folder,
        item: { count: totalCount, hasActive },
      });
    }
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    return nodes;
  }, [submissions]);

  // Build results tree using shared buildHistoryTree
  const resultsTree = useMemo(() => {
    const seen = new Map<string, any>();
    for (const s of doneSubmissions) {
      const folder = s.scan_folder || 'Standalone';
      const folderName = folder.replace(/\\/g, '/').split('/').filter(Boolean).pop() || folder;
      const rawPath = (s.relative_path || s.filename).replace(/\\/g, '/');
      const prefix = folder.replace(/\\/g, '/').replace(/\/?$/, '') + '/';
      const relativePath = rawPath.startsWith(prefix) ? rawPath.slice(prefix.length) : rawPath;
      const fullKey = `${folderName}/${relativePath}`;
      if (!seen.has(fullKey) || new Date(s.created_at) > new Date(seen.get(fullKey).created_at)) {
        seen.set(fullKey, { ...s, filename: fullKey });
      }
    }
    const tree = buildHistoryTree(Array.from(seen.values()));
    // Aggregate total_issues into directory meta
    const sumIssues = (nodes: HistoryTreeNodeData<any>[]): number => {
      let total = 0;
      for (const n of nodes) {
        if (n.isDir) {
          const childTotal = sumIssues(n.children);
          n.meta = { ...n.meta, total_issues: childTotal };
          total += childTotal;
        } else {
          total += (n.file?.total_issues ?? 0);
        }
      }
      return total;
    };
    sumIssues(tree);
    return tree;
  }, [doneSubmissions]);

  // Build issues tree for dashboard
  const issuesTree = useMemo(() => {
    const bySeverity: Record<string, { report: any; issue: any }[]> = { high: [], medium: [], low: [] };
    for (const r of folderReports) {
      for (const iss of (r.analysis?.issues || [])) {
        const sev = iss.severity || 'low';
        if (bySeverity[sev]) bySeverity[sev].push({ report: r, issue: iss });
      }
    }
    const nodes: TreeNode[] = [];
    const sevOrder = ['high', 'medium', 'low'];
    const sevLabels: Record<string, string> = { high: 'High Severity', medium: 'Medium Severity', low: 'Low Severity' };
    const sevColors: Record<string, string> = { high: 'text-rose-400', medium: 'text-amber-400', low: 'text-cyan-400' };
    for (const sev of sevOrder) {
      const items = bySeverity[sev];
      if (items.length === 0) continue;
      nodes.push({
        name: sevLabels[sev],
        isDir: true,
        children: items.map(({ report, issue }) => ({
          name: `${report.filename}:${issue.line_start ?? issue.line}`,
          isDir: false,
          children: [],
          item: { report, issue, severity: sev, color: sevColors[sev] },
        })),
        item: { count: items.length, color: sevColors[sev] },
      });
    }
    return nodes;
  }, [folderReports]);

  function renderTree(
    nodes: TreeNode[],
    depth: number,
    parentPath: string,
    renderFile: (node: TreeNode, depth: number, isLast: boolean, connectorPrefix: string) => React.ReactNode,
    connectorPrefix = '',
  ) {
    return nodes.map((node, idx) => {
      const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      const treeKey = node.key || fullPath;
      const isExpanded = expandedTreePaths[fullPath] ?? false;
      const nodeIsLast = idx === nodes.length - 1;
      const branch = nodeIsLast ? '└── ' : '├── ';

      if (!node.isDir) {
        return renderFile(node, depth, nodeIsLast, connectorPrefix);
      }

      return (
        <div key={treeKey}>
          <div
            onClick={() => toggleTreePath(fullPath)}
            className="flex items-center gap-1.5 py-1 hover:bg-white/[0.015] transition-colors cursor-pointer group"
          >
            {connectorSpan(connectorPrefix + branch)}
            <ChevronRight
              size={10}
              className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            />
            {isExpanded ? (
              <FolderOpen size={12} className="text-purple-400 flex-shrink-0" />
            ) : (
              <Folder size={12} className="text-purple-400 flex-shrink-0" />
            )}
            <span className="text-xs font-mono text-zinc-400 truncate group-hover:text-zinc-200 transition-colors">
              {node.name}
            </span>
            {node.item?.count !== undefined && (
              <span className="text-[9px] font-mono text-zinc-600">({node.item.count})</span>
            )}
            {node.item?.total_issues !== undefined && node.item.total_issues > 0 && (
              <span className="text-[8px] font-mono text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded ml-1">
                {node.item.total_issues} issues
              </span>
            )}
            {node.item?.hasActive && (
              <Loader2 size={9} className="animate-spin text-cyan-400 flex-shrink-0" />
            )}
          </div>
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                {node.children.map(child => renderTree([child], depth + 1, fullPath, renderFile, childConnectorPrefix(connectorPrefix, nodeIsLast)))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    });
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <Loader2 className="animate-spin text-cyan-400" size={22} />
      <span className="text-zinc-400 text-sm">Loading your reports...</span>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 text-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-xl text-neutral-200 tracking-tight">Junior Dev Portal</h2>
          <p className="text-zinc-500 text-xs font-sans mt-1">
            Nightly reports &middot; updated {timeAgo(String(lastRefreshed))}
            <button onClick={loadData} className="ml-2 text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 cursor-pointer">
              <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} /> refresh
            </button>
          </p>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 bg-white/[0.02] px-3 py-1 rounded-lg border border-white/[0.04] uppercase">User</span>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 glass-card p-1 rounded-xl w-fit">
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          const isSelected = subTab === tab.id;
          return (
            <button key={tab.id} onClick={() => {
              setSubTab(tab.id);
              if (tab.id === 'feedback') {
                setFeedbackNotifs(0);
                feedbackNotifsRef.current = 0;
              }
            }}
              className={`relative px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
                isSelected ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              {isSelected && (
                <motion.div layoutId="juniorSubTab"
                  transition={{ type: 'spring', damping: 20, stiffness: 350 }}
                  className="absolute inset-0 rounded-lg bg-cyan-400/10 border border-cyan-400/20" />
              )}
              <Icon size={14} className={isSelected ? 'text-cyan-400' : ''} />
              {tab.label}
              {tab.id === 'feedback' && feedbackNotifs > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[8px] font-bold text-white flex items-center justify-center">
                  {feedbackNotifs > 9 ? '9+' : feedbackNotifs}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* ── DASHBOARD ── */}
        {subTab === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">
            {/* Compact stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { icon: BarChart3, value: stats.totalAnalyses, label: 'Analyses', color: 'text-cyan-300', bg: 'bg-cyan-400/10' },
                { icon: File, value: stats.submittedFiles, label: 'Submitted', color: 'text-purple-300', bg: 'bg-purple-500/10' },
                { icon: Bug, value: stats.totalIssues, label: 'Issues', color: 'text-rose-400', bg: 'bg-rose-400/10' },
                { icon: Clock, value: stats.pendingReviews, label: 'Pending', color: 'text-amber-200', bg: 'bg-amber-200/10' },
                { icon: CheckCircle, value: `${stats.avgHealth}%`, label: 'Health', color: stats.avgHealth >= 85 ? 'text-emerald-400' : stats.avgHealth >= 60 ? 'text-amber-400' : 'text-rose-400', bg: 'bg-emerald-500/10' },
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <motion.div key={idx} whileHover={{ scale: 1.02, y: -2 }}
                    className="p-3 rounded-2xl flex items-center gap-3 glass-card glass-card-hover h-16">
                    <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center border border-white/[0.02]`}>
                      <Icon size={14} className={item.color} />
                    </div>
                    <div className="min-w-0">
                      <span className="font-display font-light text-lg text-zinc-100 tracking-tight leading-none block">{item.value}</span>
                      <span className="text-[8px] font-mono uppercase tracking-widest text-zinc-500 font-semibold block">{item.label}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Live submission status summary */}
            {submissions.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/[0.04] bg-white/[0.02] text-[10px] font-mono">
                <span className="text-zinc-500">Submissions:</span>
                {subStatusCounts.analysing > 0 && (
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Loader2 size={10} className="animate-spin" />{subStatusCounts.analysing} analysing
                  </span>
                )}
                {subStatusCounts.done > 0 && (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle size={10} />{subStatusCounts.done} done
                  </span>
                )}
                {subStatusCounts.failed > 0 && (
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <XCircle size={10} />{subStatusCounts.failed} failed
                  </span>
                )}
                {subStatusCounts.pending_review > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Clock size={10} />{subStatusCounts.pending_review} pending
                  </span>
                )}
              </div>
            )}
            {/* VS Code tree */}
            {submissions.length === 0 && reportTree.length === 0 && issuesTree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-600 rounded-2xl border border-white/[0.03] backdrop-blur-md"
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
                }}
              >
                <FileCode size={32} className="mb-3 text-zinc-700" />
                <span className="text-sm font-medium">No activity yet</span>
                <span className="text-[10px] font-mono mt-1">Upload code or run an analysis to see results here.</span>
              </div>
            ) : (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
                border: '1px solid rgba(255, 255, 255, 0.03)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
              }}
              className="rounded-2xl overflow-hidden backdrop-blur-md py-2"
            >
              {/* Recent Submissions tree */}
              {submissions.length > 0 && (
                <div>
                  <div
                    onClick={() => toggleTreePath('__submissions__')}
                    className="flex items-center gap-1.5 py-1.5 px-3 hover:bg-white/[0.015] transition-colors cursor-pointer group"
                  >
                    <ChevronRight
                      size={10}
                      className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${expandedTreePaths['__submissions__'] ? 'rotate-90' : ''}`}
                    />
                    <FileCode size={12} className="text-cyan-400 flex-shrink-0" />
                    <span className="text-xs font-mono text-zinc-200 font-semibold">Recent Submissions</span>
                    <span className="text-[9px] font-mono text-zinc-600">({submissions.length})</span>
                    {submissions.some(s => s.status === 'pending_review' || s.status === 'analysing') && (
                      <Loader2 size={9} className="animate-spin text-cyan-400" />
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {expandedTreePaths['__submissions__'] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        {renderTree(recentSubmissionTree, 1, '__submissions__', (node, depth, isLast, connectorPrefix) => {
                          const s = node.item;
                          const badge = statusBadge(s.status);
                          const BadgeIcon = badge.icon;
                          return (
                            <div key={s.id}
                              className="flex items-center gap-2 py-1.5 hover:bg-white/[0.015] transition-colors cursor-pointer group"
                              onClick={() => { setSubTab('results'); handleViewResult(s.id); }}
                            >
                              {connectorSpan(connectorPrefix + (isLast ? '└── ' : '├── '))}
                              <BadgeIcon size={10} className={`${badge.color} ${s.status === 'analysing' ? 'animate-spin' : ''} flex-shrink-0`} />
                              <span className="text-[11px] font-mono text-zinc-300 truncate flex-1 group-hover:text-cyan-400 transition-colors">{node.name}</span>
                              <span className={`text-[8px] font-mono px-1 rounded ${badge.bg} ${badge.color} flex-shrink-0`}>{s.status}</span>
                              <span className="text-[8px] font-mono text-zinc-600 flex-shrink-0">{timeAgo(s.created_at)}</span>
                            </div>
                          );
                        }, '')}
                        {submissions.length > 10 && (
                          <div className="text-[9px] font-mono text-cyan-400 px-10 py-1 hover:text-cyan-300 cursor-pointer"
                            onClick={() => setSubTab('results')}>
                            +{submissions.length - 10} more...
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Reports by Folder tree */}
              {reportTree.length > 0 && (
                <div>
                  <div
                    onClick={() => toggleTreePath('__reports__')}
                    className="flex items-center gap-1.5 py-1.5 px-3 hover:bg-white/[0.015] transition-colors cursor-pointer group"
                  >
                    <ChevronRight
                      size={10}
                      className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${expandedTreePaths['__reports__'] ? 'rotate-90' : ''}`}
                    />
                    <FolderOpen size={12} className="text-purple-400 flex-shrink-0" />
                    <span className="text-xs font-mono text-zinc-200 font-semibold">Reports by Folder</span>
                    <span className="text-[9px] font-mono text-zinc-600">({reports.length})</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {expandedTreePaths['__reports__'] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        {renderTree(reportTree, 1, '__reports__', (node, depth, isLast, connectorPrefix) => {
                          const r = node.item;
                          const health = r.health_score ?? 100;
                          const issues = r.total_issues ?? 0;
                          const { icon: FileIcon, color: iconColor } = getFileIcon(node.name);
                          return (
                            <div key={node.name}
                              className="flex items-center gap-2 py-1 hover:bg-white/[0.015] transition-colors cursor-pointer group"
                              onClick={() => {
                                setSelectedFolder(r.scan_folder || '');
                                toggleTreePath('__issues__');
                              }}
                            >
                              {connectorSpan(connectorPrefix + (isLast ? '└── ' : '├── '))}
                              <FileIcon size={11} className={`${iconColor} flex-shrink-0`} />
                              <span className="text-[11px] font-mono text-zinc-300 truncate flex-1 group-hover:text-cyan-400 transition-colors">{node.name}</span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="w-12 h-1 rounded-full bg-zinc-800 overflow-hidden">
                                  <div className={`h-full rounded-full ${healthBarColor(health)}`} style={{ width: `${health}%` }} />
                                </div>
                                <span className={`text-[8px] font-mono w-6 text-right ${healthTextColor(health)}`}>{health}%</span>
                              </div>
                            </div>
                          );
                        }, '')}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Issues tree */}
              {issuesTree.length > 0 && (
                <div>
                  <div
                    onClick={() => toggleTreePath('__issues__')}
                    className="flex items-center gap-1.5 py-1.5 px-3 hover:bg-white/[0.015] transition-colors cursor-pointer group"
                  >
                    <ChevronRight
                      size={10}
                      className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${expandedTreePaths['__issues__'] ? 'rotate-90' : ''}`}
                    />
                    <AlertTriangle size={12} className="text-rose-400 flex-shrink-0" />
                    <span className="text-xs font-mono text-zinc-200 font-semibold">Issues by Severity</span>
                    <span className="text-[9px] font-mono text-zinc-600">
                      ({issuesTree.reduce((s, n) => s + (n.item?.count || 0), 0)})
                    </span>
                  </div>
                  <AnimatePresence initial={false}>
                    {expandedTreePaths['__issues__'] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        {renderTree(issuesTree, 1, '__issues__', (node, depth, isLast, connectorPrefix) => {
                          const { report, issue, severity, color } = node.item;
                          const key = `${report.analysis_id}:${issue.id}`;
                          const Icon = severity === 'high' ? AlertTriangle : severity === 'medium' ? AlertCircle : Info;
                          return (
                            <div key={key}
                              className="flex items-center gap-2 py-1 px-3 hover:bg-white/[0.015] transition-colors"
                            >
                              {connectorSpan(connectorPrefix + (isLast ? '└── ' : '├── '))}
                              <Icon size={10} className={`${color} flex-shrink-0`} />
                              <div className="flex-1 min-w-0">
                                <span className="text-[10px] text-zinc-300 truncate block">{issue.description}</span>
                                <span className="text-[8px] text-zinc-600 font-mono">{report.filename}:{issue.line_start ?? issue.line}</span>
                              </div>
                              <div className="flex-shrink-0">
                                {createdMap[key] ? (
                                  <span className="text-[8px] text-emerald-400 font-mono">Sent ✓</span>
                                ) : (
                                  <button onClick={(e) => { e.stopPropagation(); handleAskSenior(report.analysis_id, report.filename, issue.id); }}
                                    disabled={sending[key]}
                                    className="text-[8px] px-1.5 py-0.5 rounded border transition-all disabled:opacity-40 cursor-pointer font-mono border-cyan-400/20 text-cyan-400 hover:bg-cyan-400/5">
                                    {sending[key] ? '...' : 'Ask'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        }, '')}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
            )}
          </motion.div>
        )}

        {/* ── HISTORY ── */}
        {subTab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <HistoryTab
              key="junior-history"
              currentUser={currentUser}
              onNavigateToChat={onNavigateToChat || (() => {})}
              onNavigateToWorkspace={onNavigateToWorkspace || (() => {})}
              onShowToast={onShowToast}
            />
          </motion.div>
        )}

        {/* ── UPLOAD ── */}
        {subTab === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">
              {/* Upload section (compact, unchanged) */}
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Upload size={14} className="text-cyan-400" />
                  Submit Code for Review
                </h3>
                <span className="text-[10px] text-zinc-500 font-mono">Senior will review your code</span>
              </div>
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Folder name (e.g., auth-service, bug-fix-42)"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono text-zinc-200 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
                />
              </div>
              {uploadFiles.length > 0 ? (
                <div className="mb-3">
                  <div
                    style={{
                      background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
                      border: '1px solid rgba(255, 255, 255, 0.03)',
                      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
                    }}
                    className="rounded-2xl overflow-hidden backdrop-blur-md py-2 max-h-64 overflow-y-auto"
                  >
                    {(() => {
                      const uploadTree = buildUploadTree(uploadFiles);
                      const renderUploadFile = (node: TreeNode, depth: number, isLast: boolean, connectorPrefix: string) => {
                        const { icon: FileIcon, color: iconColor } = getFileIcon(node.name);
                        const idx = uploadFiles.indexOf(node.item as File);
                        return (
                          <div key={node.key}
                            className="flex items-center gap-2 py-1 hover:bg-white/[0.015] transition-colors group"
                          >
                            {connectorSpan(connectorPrefix + (isLast ? '└── ' : '├── '))}
                            <FileIcon size={11} className={`${iconColor} flex-shrink-0`} />
                            <span className="text-[11px] font-mono text-zinc-300 truncate flex-1">{node.name}</span>
                            {node.item && (
                              <span className="text-[9px] text-zinc-600">({((node.item as File).size / 1024).toFixed(1)} KB)</span>
                            )}
                            <button onClick={() => removeFile(idx)} className="text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer flex-shrink-0"><X size={12} /></button>
                          </div>
                        );
                      };
                      return renderTree(uploadTree, 0, '', renderUploadFile, '');
                    })()}
                  </div>
                  <div className="flex gap-2 pt-3">
                    <button onClick={handleUpload} disabled={uploading}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-400 to-purple-600 text-white disabled:opacity-40 cursor-pointer">
                      {uploading ? 'Uploading...' : `Upload ${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''}`}
                    </button>
                    <button onClick={() => setUploadFiles([])} disabled={uploading}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-white/[0.06] text-zinc-400 hover:text-zinc-200 cursor-pointer">
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="p-4 rounded-xl border border-dashed border-white/[0.06] hover:border-cyan-400/30 text-center transition-all cursor-pointer group">
                      <FileCode size={20} className="mx-auto text-zinc-600 group-hover:text-cyan-400 mb-1" />
                      <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 font-mono">Select Files</span>
                    </button>
                    <button onClick={() => folderInputRef.current?.click()}
                      className="p-4 rounded-xl border border-dashed border-white/[0.06] hover:border-cyan-400/30 text-center transition-all cursor-pointer group">
                      <FolderOpen size={20} className="mx-auto text-zinc-600 group-hover:text-cyan-400 mb-1" />
                      <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 font-mono">Select Folder</span>
                    </button>
                    <button onClick={() => { setShowGitImport(prev => !prev); setUploadFiles([]); }}
                      className={`p-4 rounded-xl border border-dashed text-center transition-all cursor-pointer group ${
                        showGitImport ? 'border-cyan-400/40 bg-cyan-400/5' : 'border-white/[0.06] hover:border-cyan-400/30'
                      }`}>
                      <GitBranch size={20} className={`mx-auto mb-1 ${showGitImport ? 'text-cyan-400' : 'text-zinc-600 group-hover:text-cyan-400'}`} />
                      <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 font-mono">Import from GitHub</span>
                    </button>
                  </div>
                  {showGitImport && (
                    <div className="border border-white/[0.06] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <GitBranch size={14} className="text-purple-400 flex-shrink-0" />
                        <span className="text-[10px] font-mono text-zinc-400">Git Repository URL</span>
                      </div>
                      <input
                        type="text"
                        placeholder="https://github.com/user/repo"
                        value={gitUrl}
                        onChange={(e) => setGitUrl(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono text-zinc-200 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/60 rounded-xl outline-none transition-all placeholder:text-zinc-600"
                      />
                      <div className="flex gap-2">
                        <select
                          value={gitBranch}
                          onChange={(e) => setGitBranch(e.target.value)}
                          className="px-3 py-2 text-xs font-mono text-zinc-200 bg-zinc-950/40 border border-white/[0.06] rounded-xl outline-none"
                        >
                          <option value="main">main</option>
                          <option value="master">master</option>
                          <option value="dev">dev</option>
                          <option value="develop">develop</option>
                        </select>
                        <button onClick={handleGitImport} disabled={!gitUrl.trim() || gitImporting}
                          className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-400 to-purple-600 text-white disabled:opacity-40 cursor-pointer">
                          {gitImporting ? 'Cloning...' : 'Import'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
              <input ref={folderInputRef} type="file" multiple {...{ webkitdirectory: '' } as any} onChange={handleFolderSelect} className="hidden" />
            </div>

            {/* Live status summary */}
            {submissions.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/[0.04] bg-white/[0.02] text-[10px] font-mono">
                <span className="text-zinc-500">Submissions:</span>
                {subStatusCounts.analysing > 0 && (
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Loader2 size={10} className="animate-spin" />{subStatusCounts.analysing} analysing
                  </span>
                )}
                {subStatusCounts.done > 0 && (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle size={10} />{subStatusCounts.done} done
                  </span>
                )}
                {subStatusCounts.failed > 0 && (
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <XCircle size={10} />{subStatusCounts.failed} failed
                  </span>
                )}
                {subStatusCounts.pending_review > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Clock size={10} />{subStatusCounts.pending_review} pending
                  </span>
                )}
              </div>
            )}
            {/* Submissions tree */}
            {submissionTree.length > 0 && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
                  border: '1px solid rgba(255, 255, 255, 0.03)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
                }}
                className="rounded-2xl overflow-hidden backdrop-blur-md py-2"
              >
                {renderTree(submissionTree, 0, '', (node, depth, isLast, connectorPrefix) => {
                  const s = node.item;
                  const badge = statusBadge(s.status);
                  const BadgeIcon = badge.icon;
                  const { icon: FileIcon, color: iconColor } = getFileIcon(node.name);
                  return (
                    <div key={s.id}
                      className="flex items-center gap-2 py-1 hover:bg-white/[0.015] transition-colors"
                    >
                      {connectorSpan(connectorPrefix + (isLast ? '└── ' : '├── '))}
                      <BadgeIcon size={10} className={`${badge.color} ${s.status === 'analysing' ? 'animate-spin' : ''} flex-shrink-0`} />
                      <FileIcon size={10} className={`${iconColor} flex-shrink-0`} />
                      <span className="text-[11px] font-mono text-zinc-300 truncate flex-1">{node.name}</span>
                      <span className={`text-[8px] font-mono px-1 rounded ${badge.bg} ${badge.color}`}>{s.status}</span>
                      {s.status === 'failed' && (
                        <button onClick={(e) => { e.stopPropagation(); handleRetry(s.id); }}
                          className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-all cursor-pointer flex-shrink-0">
                          Retry
                        </button>
                      )}
                      <span className="text-[8px] font-mono text-zinc-600">{timeAgo(s.created_at)}</span>
                    </div>
                  );
                }, '')}
              </div>
            )}
          </motion.div>
        )}

        {/* ── RESULTS ── */}
        {subTab === 'results' && (
          <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">
            {submissions.length > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/[0.04] bg-white/[0.02] text-[10px] font-mono">
                {subStatusCounts.analysing > 0 && (
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Loader2 size={10} className="animate-spin" />{subStatusCounts.analysing} analysing
                  </span>
                )}
                {subStatusCounts.done > 0 && (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle size={10} />{subStatusCounts.done} done
                  </span>
                )}
                {subStatusCounts.failed > 0 && (
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <XCircle size={10} />{subStatusCounts.failed} failed
                  </span>
                )}
                {subStatusCounts.pending_review > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Clock size={10} />{subStatusCounts.pending_review} pending
                  </span>
                )}
                {Object.values(subStatusCounts).every(c => c === 0) && (
                  <span className="text-zinc-600">No submissions</span>
                )}
              </div>
            )}
            {resultDetail ? (
              <>
                <button onClick={handleBackToResults}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 cursor-pointer">
                  ← Back to results
                </button>
                <div className="glass-card rounded-2xl flex flex-col overflow-hidden">
                  <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode size={14} className="text-cyan-400 flex-shrink-0" />
                      <span className="text-xs font-semibold text-zinc-300 truncate">{resultDetail.filename}</span>
                      <span className="text-[9px] text-zinc-500 font-mono bg-white/[0.02] px-1.5 py-0.5 rounded">
                        {resultDetail.language || 'txt'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-zinc-500">
                        {(resultDetail.file_content || '').split('\n').length} lines
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                        resultDetail.status === 'done' ? 'text-emerald-400 bg-emerald-400/10'
                          : resultDetail.status === 'failed' ? 'text-rose-400 bg-rose-400/10'
                          : 'text-cyan-400 bg-cyan-400/10'}`}>{resultDetail.status}</span>
                    </div>
                  </div>

                  {resultDetail.status === 'done' ? (() => {
                    const issues = resultDetail.analysis?.analysis?.issues || [];
                    const issueMap: Record<number, any[]> = {};
                    for (const iss of issues) {
                      const line = iss.line_start || iss.line || 1;
                      if (!issueMap[line]) issueMap[line] = [];
                      issueMap[line].push(iss);
                    }
                    const codeLines = (resultDetail.file_content || '').split('\n');
                    const issueCount = Object.values(issueMap).reduce((s, v) => s + v.length, 0);
                    return (
                      <>
                        <div className="flex-1 max-h-[480px] overflow-y-auto font-mono text-[11px] leading-relaxed">
                          <table className="w-full border-collapse">
                            <tbody>
                              {codeLines.map((line: string, i: number) => {
                                const lineNum = i + 1;
                                const lineIssues = issueMap[lineNum] || [];
                                const hasIssues = lineIssues.length > 0;
                                const maxSev = hasIssues
                                  ? lineIssues.some(iss => (iss.severity || '') === 'high') ? 'high'
                                    : lineIssues.some(iss => (iss.severity || '') === 'medium') ? 'medium'
                                    : 'low'
                                  : null;
                                const sevColors: Record<string, { lineNum: string; border: string; bg: string; badge: string }> = {
                                  high:   { lineNum: 'text-rose-400/60', border: 'border-rose-500/30', bg: 'bg-rose-500/[0.02]',  badge: 'bg-rose-500/10 text-rose-300/70' },
                                  medium: { lineNum: 'text-amber-400/60', border: 'border-amber-500/30', bg: 'bg-amber-500/[0.02]',  badge: 'bg-amber-500/10 text-amber-300/70' },
                                  low:    { lineNum: 'text-cyan-400/60', border: 'border-cyan-500/30', bg: 'bg-cyan-500/[0.02]',   badge: 'bg-cyan-500/10 text-cyan-300/70' },
                                };
                                const sc = maxSev ? sevColors[maxSev] : null;
                                return (
                                  <tr key={lineNum} className={sc ? sc.bg : ''}>
                                    <td className={`select-none text-right px-3 py-0 align-top text-[10px] w-12 border-r-2 ${sc ? `${sc.lineNum} ${sc.border}` : 'text-zinc-700 border-white/[0.03]'}`}>{lineNum}</td>
                                    <td className="w-6 px-1 py-0 align-top text-center border-r border-white/[0.03]">
                                      {hasIssues && (
                                        <span className={maxSev === 'high' ? 'text-rose-400' : maxSev === 'medium' ? 'text-amber-400' : 'text-cyan-400'}>{'\u25CF'}</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-0 text-zinc-300 whitespace-pre-wrap align-top">
                                      {line || ' '}
                                      {lineIssues.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                          {lineIssues.map(iss => (
                                            <span key={iss.id} className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${sc?.badge || ''}`}>
                                              {iss.type}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {issueCount > 0 && (
                          <div className="px-5 py-3 border-t border-white/[0.04] space-y-1.5 max-h-[180px] overflow-y-auto">
                            <div className="text-[10px] font-semibold text-zinc-400 mb-1">Issues ({issueCount})</div>
                            {Object.entries(issueMap).map(([line, iss]) =>
                              iss.map((issue: any, idx: number) => {
                                const key = `${resultDetail.analysis_id}:${issue.id}`;
                                const Icon = issue.severity === 'high' ? AlertTriangle
                                  : issue.severity === 'medium' ? AlertCircle : Info;
                                const color = issue.severity === 'high' ? 'text-rose-400'
                                  : issue.severity === 'medium' ? 'text-amber-400' : 'text-cyan-400';
                                return (
                                  <div key={`${line}-${idx}`} className="flex items-start gap-2 text-[10px]">
                                    <div className={`mt-0.5 ${color}`}><Icon size={12} /></div>
                                    <span className="text-zinc-300 flex-1">{issue.description}</span>
                                    <span className="text-zinc-600 font-mono flex-shrink-0">L{line}</span>
                                    <div className="flex-shrink-0">
                                      {createdMap[key] ? (
                                        <span className="text-[9px] text-emerald-400 font-mono">Sent ✓</span>
                                      ) : (
                                        <button onClick={() => handleAskSenior(resultDetail.analysis_id, resultDetail.filename, issue.id)}
                                          disabled={sending[key]}
                                          className="text-[9px] px-1.5 py-0.5 rounded border transition-all disabled:opacity-40 cursor-pointer font-mono border-cyan-400/20 text-cyan-400 hover:bg-cyan-400/5">
                                          {sending[key] ? '...' : 'Ask'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </>
                    );
                  })() : (
                    <div className="p-8 text-center text-zinc-500 text-xs">
                      {resultDetail.status === 'failed' ? (
                        <div className="flex flex-col items-center gap-3">
                          <XCircle size={24} className="text-rose-400" />
                          <span>Analysis failed{resultDetail.error ? `: ${resultDetail.error}` : ''}</span>
                          <button onClick={() => handleRetry(resultDetail.id)}
                            className="text-[10px] font-mono px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-all cursor-pointer">
                            Retry Analysis
                          </button>
                        </div>
                      ) : (
                        <><Loader2 size={18} className="animate-spin mx-auto mb-2 text-cyan-400" />Still analysing...</>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : resultLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 size={18} className="animate-spin text-cyan-400" />
              </div>
            ) : doneSubmissions.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center text-zinc-500 text-xs">
                <ClipboardList size={28} className="mx-auto mb-2 text-zinc-700" />
                No completed results yet.
                <p className="text-[10px] text-zinc-600 mt-1">Upload code for review to see analysis results here.</p>
              </div>
            ) : (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
                  border: '1px solid rgba(255, 255, 255, 0.03)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
                }}
                className="rounded-2xl overflow-hidden backdrop-blur-md py-2"
              >
                <div className="flex items-center gap-1.5 py-1.5 px-3">
                  <ClipboardList size={12} className="text-cyan-400 flex-shrink-0" />
                  <span className="text-xs font-mono text-zinc-200 font-semibold">Completed Analyses</span>
                  <span className="text-[9px] font-mono text-zinc-600">({doneSubmissions.length})</span>
                  <div className="ml-auto">
                    {confirmClear ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-mono text-rose-400">Clear all?</span>
                        <button
                          onClick={handleClearAll}
                          disabled={clearingHistory}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {clearingHistory ? '...' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmClear(false)}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-white/[0.06] hover:text-zinc-300 transition-all cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClear(true)}
                        className="text-[9px] font-mono text-zinc-600 hover:text-rose-400 transition-all cursor-pointer flex items-center gap-1"
                        title="Clear all analysis history"
                      >
                        <Trash2 size={10} />
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                {resultsTree.map((node, idx) => (
                  <HistoryTreeNode
                    key={node.name}
                    node={node}
                    depth={0}
                    parentPath=""
                    expandedTreePaths={expandedTreePaths}
                    onToggle={toggleTreePath}
                    renderFileIcon={(n) => {
                      const { icon: FileIcon, color: iconColor } = getFileIcon(n.name);
                      return <FileIcon size={11} className={`${iconColor} flex-shrink-0`} />;
                    }}
                    renderFileRow={(file, nodeName) => {
                      const s = file as any;
                      const issCount = s.total_issues ?? 0;
                      const hasIssues = issCount > 0;
                      const nameColor = hasIssues ? 'text-amber-300' : 'text-zinc-300';
                      return (
                        <div
                          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer group"
                          onClick={() => handleViewResult(s.id)}
                        >
                          <span className={`text-[11px] font-mono ${nameColor} truncate flex-1 group-hover:text-cyan-400 transition-colors`}>{nodeName}</span>
                          {hasIssues && (
                            <span className="text-[8px] font-mono text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded flex-shrink-0">{issCount}</span>
                          )}
                          <span className="text-[8px] font-mono text-zinc-600 flex-shrink-0">{timeAgo(s.created_at)}</span>
                          <ChevronRight size={10} className="text-zinc-600 group-hover:text-cyan-400 flex-shrink-0 transition-colors" />
                        </div>
                      );
                    }}
                    isLast={idx === resultsTree.length - 1}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── TEAM CHAT ── */}
        {subTab === 'teamchat' && (
          <motion.div key="teamchat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <TeamChatTab currentUser={currentUser} />
          </motion.div>
        )}

        {/* ── FEEDBACK ── */}
        {subTab === 'feedback' && (
          <motion.div key="feedback" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <FeedbackView key={feedbackNotifs} onShowToast={onShowToast} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FeedbackView({ onShowToast }: { onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void }) {
  const [feedbacks, setFeedbacks] = useState<CodeReviewFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
  const [resolving, setResolving] = useState<Record<number, boolean>>({});
  const [showResolved, setShowResolved] = useState(false);
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const data = await analysisAPI.juniorListFeedback();
        setFeedbacks(data);
      } catch (e: any) {
        onShowToast(e?.message || 'Failed to load feedback.', 'error');
      }
      setLoading(false);
    })();
  }, [onShowToast]);

  const handleResolve = async (fbId: number) => {
    setResolving(prev => ({ ...prev, [fbId]: true }));
    try {
      await analysisAPI.resolveFeedback(fbId);
      setFeedbacks(prev => prev.map(fb => fb.id === fbId ? { ...fb, resolved: true } : fb));
      onShowToast('Feedback marked as resolved.', 'success');
    } catch (e: any) {
      onShowToast(e?.message || 'Failed to resolve feedback.', 'error');
    }
    setResolving(prev => ({ ...prev, [fbId]: false }));
  };

  const grouped = useMemo(() => {
    const map = new Map<number, CodeReviewFeedback[]>();
    for (const fb of feedbacks) {
      const subs = map.get(fb.submission_id) || [];
      subs.push(fb);
      map.set(fb.submission_id, subs);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [feedbacks]);

  const submissionEntries = useMemo(() => {
    return grouped.map(([subId, fbs]) => {
      const first = fbs[0];
      return {
        submissionId: subId,
        filename: first.filename,
        total: fbs.length,
        unresolved: fbs.filter(fb => !fb.resolved).length,
      };
    });
  }, [grouped]);

  const selectedFeedbacks = useMemo(() => {
    if (!selectedSubId) return [];
    return grouped.find(([id]) => id === selectedSubId)?.[1] || [];
  }, [grouped, selectedSubId]);

  const codeLines = useMemo(() => {
    if (selectedFeedbacks.length === 0) return [];
    return (selectedFeedbacks[0].file_content || '').split('\n');
  }, [selectedFeedbacks]);

  const feedbackMap = useMemo(() => {
    const map = new Map<number, CodeReviewFeedback[]>();
    for (const fb of selectedFeedbacks) {
      const line = fb.line_start;
      const arr = map.get(line) || [];
      arr.push(fb);
      map.set(line, arr);
    }
    return map;
  }, [selectedFeedbacks]);

  useEffect(() => {
    if (!selectedSubId && submissionEntries.length > 0) {
      setSelectedSubId(submissionEntries[0].submissionId);
    }
  }, [submissionEntries, selectedSubId]);

  const visibleFeedbacks = useMemo(() => {
    if (showResolved) return selectedFeedbacks;
    return selectedFeedbacks.filter(fb => !fb.resolved);
  }, [selectedFeedbacks, showResolved]);

  const displayFeedbackMap = useMemo(() => {
    if (showResolved) return feedbackMap;
    const map = new Map<number, CodeReviewFeedback[]>();
    for (const fb of visibleFeedbacks) {
      const line = fb.line_start;
      const arr = map.get(line) || [];
      arr.push(fb);
      map.set(line, arr);
    }
    return map;
  }, [feedbackMap, visibleFeedbacks, showResolved]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={18} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  if (feedbacks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
        <MessageSquareText size={32} className="mb-3 text-zinc-700" />
        <span className="text-sm font-medium">No feedback yet</span>
        <span className="text-[10px] font-mono mt-1">Your senior reviewers haven't added any inline comments.</span>
      </div>
    );
  }

  const totalUnresolved = feedbacks.filter(fb => !fb.resolved).length;

  return (
    <div className="flex gap-3 h-[calc(100vh-16rem)]">
      {/* Sidebar — file list */}
      <div className="w-52 flex-shrink-0 overflow-y-auto glass-card rounded-2xl py-2">
        <div className="px-3 pb-2 border-b border-white/[0.04] mb-1">
          <div className="text-[10px] font-semibold text-zinc-400">
            {feedbacks.length} comment{feedbacks.length !== 1 ? 's' : ''}
          </div>
          {totalUnresolved > 0 && (
            <div className="text-[8px] font-mono text-amber-400">{totalUnresolved} unresolved</div>
          )}
        </div>
        {submissionEntries.map(entry => {
          const isSelected = selectedSubId === entry.submissionId;
          return (
            <button
              key={entry.submissionId}
              onClick={() => setSelectedSubId(entry.submissionId)}
              className={`w-full text-left px-3 py-2 transition-colors cursor-pointer ${
                isSelected ? 'bg-cyan-400/[0.06] border-l-2 border-cyan-400' : 'hover:bg-white/[0.01] border-l-2 border-transparent'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <FileCode size={10} className="text-cyan-400 flex-shrink-0" />
                <span className="text-[10px] font-mono text-zinc-300 truncate">{entry.filename}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 ml-5">
                <span className="text-[8px] font-mono text-zinc-600">{entry.total}</span>
                {entry.unresolved > 0 && (
                  <span className="text-[8px] font-mono text-amber-400">{entry.unresolved} new</span>
                )}
                {entry.unresolved === 0 && (
                  <span className="text-[8px] font-mono text-emerald-400">
                    <CheckCheck size={8} className="inline" /> done
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main — code viewer */}
      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">
        {selectedFeedbacks.length > 0 ? (
          <>
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode size={13} className="text-cyan-400 flex-shrink-0" />
                <span className="text-[11px] font-semibold text-zinc-300 truncate">{selectedFeedbacks[0].filename}</span>
                <span className="text-[8px] text-zinc-500 font-mono bg-white/[0.02] px-1.5 py-0.5 rounded">
                  {codeLines.length} lines
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowResolved(prev => !prev)}
                  className={`text-[9px] font-mono px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                    showResolved
                      ? 'border-emerald-400/30 text-emerald-400 bg-emerald-400/10'
                      : 'border-white/[0.06] text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {showResolved ? 'Showing all' : 'Unresolved only'}
                </button>
              </div>
            </div>

            {/* Code */}
            <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
              <table className="w-full border-collapse">
                <tbody>
                  {codeLines.map((line: string, i: number) => {
                    const lineNum = i + 1;
                    const fbs = displayFeedbackMap.get(lineNum) || [];
                    const unfilteredFbs = selectedFeedbacks.filter(fb => fb.line_start === lineNum);
                    const hasVisible = fbs.length > 0;
                    const hasResolved = !hasVisible && unfilteredFbs.length > 0 && unfilteredFbs.every(fb => fb.resolved);
                    const isExpanded = expandedLines[String(lineNum)];

                    return (
                      <tr key={lineNum}
                        className={`group transition-colors ${
                          hasVisible ? 'bg-blue-500/[0.02]' : ''
                        } ${hasResolved ? 'bg-emerald-500/[0.015]' : ''}`}
                      >
                        <td
                          className={`select-none text-right px-3 py-0 w-12 border-r border-white/[0.03] align-top text-[10px] transition-colors ${
                            hasVisible || hasResolved
                              ? 'text-zinc-500 cursor-pointer hover:text-cyan-400'
                              : 'text-zinc-700'
                          }`}
                          onClick={() => {
                            if (hasVisible || hasResolved) {
                              setExpandedLines(prev => ({
                                ...prev,
                                [String(lineNum)]: !prev[String(lineNum)],
                              }));
                            }
                          }}
                        >
                          {lineNum}
                        </td>
                        <td className="w-6 px-1 py-0 align-top text-center border-r border-white/[0.03]">
                          {hasVisible && (
                            <span className="text-blue-400">{'\u25CF'}</span>
                          )}
                          {hasResolved && !hasVisible && (
                            <span className="text-emerald-500">{'\u25CF'}</span>
                          )}
                        </td>
                        <td className="px-3 py-0 text-zinc-300 whitespace-pre-wrap align-top relative">
                          {line || ' '}
                          {(hasVisible || hasResolved) && isExpanded && (
                            <div className="mt-1.5 space-y-1.5">
                              {unfilteredFbs.map(fb => (
                                <div
                                  key={fb.id}
                                  className={`text-[9px] rounded-lg px-2.5 py-1.5 border ${
                                    fb.resolved
                                      ? 'bg-emerald-500/[0.03] border-emerald-500/10 text-zinc-500'
                                      : 'bg-blue-500/[0.04] border-blue-500/10 text-zinc-400'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className={`font-medium ${fb.resolved ? 'text-emerald-500' : 'text-blue-400'}`}>
                                        {fb.reviewer_username}
                                      </span>
                                      <span className="text-zinc-600">·</span>
                                      <span className="text-zinc-600">{timeAgo(fb.created_at)}</span>
                                    </div>
                                    {!fb.resolved && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleResolve(fb.id); }}
                                        disabled={resolving[fb.id]}
                                        className="text-[8px] px-1.5 py-0.5 rounded border border-emerald-400/20 text-emerald-400 hover:bg-emerald-400/10 transition-all cursor-pointer disabled:opacity-40 flex-shrink-0"
                                      >
                                        {resolving[fb.id] ? '...' : 'Resolve'}
                                      </button>
                                    )}
                                    {fb.resolved && (
                                      <span className="text-[8px] text-emerald-500 flex items-center gap-0.5 flex-shrink-0">
                                        <CheckCheck size={8} /> Resolved
                                      </span>
                                    )}
                                  </div>
                                  <div className={`mt-1 ${fb.resolved ? 'line-through decoration-zinc-600' : ''}`}>
                                    {fb.comment}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {(hasVisible || hasResolved) && !isExpanded && (
                            <div className="mt-0.5">
                              <button
                                onClick={() => setExpandedLines(prev => ({ ...prev, [String(lineNum)]: true }))}
                                className="text-[8px] text-zinc-600 hover:text-zinc-400 flex items-center gap-0.5 cursor-pointer"
                              >
                                <MessageSquare size={8} />
                                {unfilteredFbs.length} comment{unfilteredFbs.length > 1 ? 's' : ''}
                                {unfilteredFbs.some(fb => !fb.resolved) && (
                                  <span className="text-amber-400">· {unfilteredFbs.filter(fb => !fb.resolved).length} new</span>
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center flex-1 text-zinc-600 text-xs">
            <div className="text-center">
              <MessageSquareText size={24} className="mx-auto mb-2 text-zinc-700" />
              Select a file to view inline feedback
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

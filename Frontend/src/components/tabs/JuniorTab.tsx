import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle, AlertCircle, Info, MessageSquare,
  Loader2, FolderOpen, CheckCircle, RefreshCw, Upload,
  FileCode, X, BarChart3, Bug, File, Folder,
  LayoutDashboard, ClipboardList, GitBranch,
  ChevronRight, XCircle, Clock, Trash2,
  MessageSquareText, Send,
} from 'lucide-react';
import { User, AnalysisResult } from '../../types';
import { analysisAPI } from '../../api/analysis';
import { useNotificationSocket } from '../../hooks/useNotificationSocket';


interface JuniorTabProps {
  currentUser: User;
  history: AnalysisResult[];
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const SUB_TABS = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'upload' as const, label: 'Upload', icon: Upload },
  { id: 'results' as const, label: 'Results', icon: ClipboardList },
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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface TreeNode {
  name: string;
  isDir: boolean;
  children: TreeNode[];
  item?: any;
  key?: string;
}

export default function JuniorTab({ currentUser, history, onShowToast }: JuniorTabProps) {
  const [subTab, setSubTab] = useState<'dashboard' | 'upload' | 'results' | 'feedback'>('dashboard');
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [createdMap, setCreatedMap] = useState<Record<string, boolean>>({});

  const [feedbackNotifs, setFeedbackNotifs] = useState(0);
  const feedbackNotifsRef = useRef(0);

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
    try {
      const hist = await analysisAPI.ragHistory(500);
      const items = hist.items;
      const folderSet = new Set<string>();
      for (const item of items) {
        if (item.scan_folder) folderSet.add(item.scan_folder);
      }
      const arr = Array.from(folderSet).sort();
      setFolders(arr);
      if (arr.length > 0 && !selectedFolder) setSelectedFolder(arr[0]);
      setReports(items);
    } catch (e: any) {
      onShowToast(e?.message || 'Failed to load history reports.', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const { connect } = useNotificationSocket();
  useEffect(() => {
    const refresh = async () => {
      try {
        const data = await analysisAPI.listSubmissions();
        setSubmissions(Array.isArray(data) ? data : data.submissions || []);
      } catch { /* ignore */ }
    };
    refresh();
    connect(msg => {
      if (msg.type === 'nightly_report_ready') loadData();
      if (msg.type === 'submission_update') refresh();
      if (msg.type === 'feedback_added') {
        feedbackNotifsRef.current += 1;
        setFeedbackNotifs(feedbackNotifsRef.current);
      }
    });
  }, [connect]);

  const BATCH_SIZE = 100;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadFiles(Array.from(e.target.files));
      setFolderName('Standalone');
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
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
      const result = await analysisAPI.juniorGitImport(gitUrl.trim(), gitBranch, folderName || undefined);
      setSubmissions(prev => prev); // refresh() below will update
      onShowToast(`Imported ${result.imported} file(s) from ${result.repo_name}.`, 'success');
      setGitUrl('');
      setGitBranch('main');
      const data = await analysisAPI.listSubmissions();
      setSubmissions(data.submissions);
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

  const doneSubmissions = useMemo(() => submissions.filter(s => s.status === 'done'), [submissions]);

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
      const children: TreeNode[] = items.map((r: any) => ({
        name: r.filename.split('/').pop() || r.filename,
        isDir: false,
        children: [],
        item: r,
      }));
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
      const children: TreeNode[] = items.map(s => ({
        name: s.filename, isDir: false, children: [], item: s,
      }));
      const hasActive = items.some(s => s.status === 'pending_review' || s.status === 'analysing');
      nodes.push({
        name: folderName, isDir: true, children, key: folder,
        item: { count: items.length, hasActive },
      });
    }
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    return nodes;
  }, [submissions]);

  // Build results tree
  const resultsTree = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const s of doneSubmissions) {
      const key = s.scan_folder || 'Standalone';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const nodes: TreeNode[] = [];
    for (const [folder, items] of groups) {
      const folderName = folder.replace(/\\/g, '/').split('/').filter(Boolean).pop() || folder;
      const children: TreeNode[] = items.map((s: any) => ({
        name: s.filename, isDir: false, children: [], item: s,
      }));
      nodes.push({ name: folderName, isDir: true, children, key: folder, item: {} });
    }
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    return nodes;
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

  function renderTree(nodes: TreeNode[], depth: number, parentPath: string, renderFile: (node: TreeNode, depth: number) => React.ReactNode) {
    return nodes.map(node => {
      const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      const treeKey = node.key || fullPath;
      const isExpanded = expandedTreePaths[fullPath] ?? (depth < 1);

      if (!node.isDir) {
        return renderFile(node, depth);
      }

      return (
        <div key={treeKey}>
          <div
            onClick={() => toggleTreePath(fullPath)}
            className="flex items-center gap-1.5 py-1.5 hover:bg-white/[0.015] transition-colors cursor-pointer group"
            style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
          >
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
                {node.children.map(child => renderTree([child], depth + 1, fullPath, renderFile))}
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
            Nightly reports &middot; {new Date().toLocaleDateString()}
            <button onClick={loadData} className="ml-2 text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 cursor-pointer">
              <RefreshCw size={10} /> refresh
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
                        {submissions.slice(0, 10).map(s => {
                          const badge = statusBadge(s.status);
                          const BadgeIcon = badge.icon;
                          return (
                            <div key={s.id}
                              className="flex items-center gap-2 py-1.5 hover:bg-white/[0.015] transition-colors cursor-pointer group"
                              style={{ paddingLeft: '2.5rem' }}
                              onClick={() => { setSubTab('results'); handleViewResult(s.id); }}
                            >
                              <BadgeIcon size={10} className={`${badge.color} ${s.status === 'analysing' ? 'animate-spin' : ''} flex-shrink-0`} />
                              <span className="text-[11px] font-mono text-zinc-300 truncate flex-1 group-hover:text-cyan-400 transition-colors">{s.filename}</span>
                              <span className={`text-[8px] font-mono px-1 rounded ${badge.bg} ${badge.color} flex-shrink-0`}>{s.status}</span>
                              <span className="text-[8px] font-mono text-zinc-600 flex-shrink-0">{timeAgo(s.created_at)}</span>
                            </div>
                          );
                        })}
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
                        {renderTree(reportTree, 1, '__reports__', (node, depth) => {
                          const r = node.item;
                          const health = r.health_score ?? 100;
                          const issues = r.total_issues ?? 0;
                          const dots = issueDots(issues);
                          return (
                            <div key={node.name}
                              className="flex items-center gap-2 py-1.5 hover:bg-white/[0.015] transition-colors cursor-pointer group"
                              style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
                              onClick={() => {
                                setSelectedFolder(r.scan_folder || '');
                                toggleTreePath('__issues__');
                              }}
                            >
                              <FileCode size={11} className="text-violet-400/70 flex-shrink-0" />
                              <span className="text-[11px] font-mono text-zinc-300 truncate flex-1 group-hover:text-cyan-400 transition-colors">{node.name}</span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="w-12 h-1 rounded-full bg-zinc-800 overflow-hidden">
                                  <div className={`h-full rounded-full ${healthBarColor(health)}`} style={{ width: `${health}%` }} />
                                </div>
                                <span className={`text-[8px] font-mono w-6 text-right ${healthTextColor(health)}`}>{health}%</span>
                                <span className={`text-[9px] font-mono w-4 text-center ${dots.color}`}>{dots.dots}</span>
                              </div>
                            </div>
                          );
                        })}
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
                        {renderTree(issuesTree, 1, '__issues__', (node, depth) => {
                          const { report, issue, severity, color } = node.item;
                          const key = `${report.analysis_id}:${issue.id}`;
                          const Icon = severity === 'high' ? AlertTriangle : severity === 'medium' ? AlertCircle : Info;
                          return (
                            <div key={key}
                              className="flex items-center gap-2 py-1.5 px-3 hover:bg-white/[0.015] transition-colors"
                              style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
                            >
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
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
            )}
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
                <div className="mb-3 space-y-1.5">
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/[0.01] border border-white/[0.04] rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCode size={12} className="text-zinc-500 flex-shrink-0" />
                        <span className="text-xs font-mono text-zinc-300 truncate">{f.webkitRelativePath || f.name}</span>
                        <span className="text-[9px] text-zinc-600">({(f.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button onClick={() => removeFile(i)} className="text-zinc-600 hover:text-rose-400 cursor-pointer flex-shrink-0"><X size={12} /></button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
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
                {renderTree(submissionTree, 0, '', (node, depth) => {
                  const s = node.item;
                  const badge = statusBadge(s.status);
                  const BadgeIcon = badge.icon;
                  return (
                    <div key={s.id}
                      className="flex items-center gap-2 py-1.5 hover:bg-white/[0.015] transition-colors"
                      style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
                    >
                      <BadgeIcon size={10} className={`${badge.color} ${s.status === 'analysing' ? 'animate-spin' : ''} flex-shrink-0`} />
                      <span className="text-[11px] font-mono text-zinc-300 truncate flex-1">{s.filename}</span>
                      <span className={`text-[8px] font-mono px-1 rounded ${badge.bg} ${badge.color}`}>{s.status}</span>
                      <span className="text-[8px] font-mono text-zinc-600">{timeAgo(s.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ── RESULTS ── */}
        {subTab === 'results' && (
          <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">
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
                                return (
                                  <tr key={lineNum} className={hasIssues ? 'bg-amber-500/[0.02]' : ''}>
                                    <td className="select-none text-right px-3 py-0 text-zinc-700 w-12 border-r border-white/[0.03] align-top text-[10px]">{lineNum}</td>
                                    <td className="w-6 px-1 py-0 align-top text-center border-r border-white/[0.03]">
                                      {hasIssues && (
                                        <span className={maxSev === 'high' ? 'text-rose-400' : maxSev === 'medium' ? 'text-amber-400' : 'text-cyan-400'}>{'\u25CF'}</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-0 text-zinc-300 whitespace-pre-wrap align-top">{line || ' '}</td>
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
                        <><XCircle size={24} className="mx-auto mb-2 text-rose-400" />Analysis failed{resultDetail.error ? `: ${resultDetail.error}` : ''}</>
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
                {renderTree(resultsTree, 0, '', (node, depth) => {
                  const s = node.item;
                  return (
                    <div key={s.id}
                      className="flex items-center gap-2 py-1.5 hover:bg-white/[0.015] transition-colors cursor-pointer group"
                      style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
                      onClick={() => handleViewResult(s.id)}
                    >
                      <FileCode size={11} className="text-violet-400/70 flex-shrink-0" />
                      <span className="text-[11px] font-mono text-zinc-300 truncate flex-1 group-hover:text-cyan-400 transition-colors">{node.name}</span>
                      <span className="text-[8px] font-mono text-zinc-600 flex-shrink-0">{timeAgo(s.created_at)}</span>
                      <ChevronRight size={10} className="text-zinc-600 group-hover:text-cyan-400 flex-shrink-0 transition-colors" />
                    </div>
                  );
                })}
              </div>
            )}
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
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  const grouped = feedbacks.reduce((acc: Record<string, any[]>, fb: any) => {
    const key = fb.submission_id || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(fb);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-zinc-400">
        {feedbacks.length} feedback comment{feedbacks.length !== 1 ? 's' : ''} from reviewers
      </div>
      {Object.entries(grouped).map(([submissionId, fbs]) => (
        <div key={submissionId} className="glass-card rounded-2xl p-4">
          <div className="text-[10px] font-mono text-zinc-500 mb-3">
            Submission #{submissionId}
          </div>
          <div className="space-y-2">
            {fbs.map((fb: any) => (
              <div key={fb.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.01] border border-white/[0.04]">
                <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <MessageSquare size={10} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-blue-400">{fb.reviewer_username}</span>
                    <span className="text-[8px] font-mono text-zinc-600">
                      L{fb.line_start}{fb.line_end ? `-${fb.line_end}` : ''}
                    </span>
                    <span className="text-[8px] font-mono text-zinc-600 ml-auto">
                      {timeAgo(fb.created_at)}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-300 mt-1">{fb.comment}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Re-use timeAgo from the parent scope
// Note: timeAgo is defined at the module level and accessible here

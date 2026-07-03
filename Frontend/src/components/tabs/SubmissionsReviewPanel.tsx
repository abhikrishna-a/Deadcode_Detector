import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCode, Loader2, Clock, AlertTriangle,
  AlertCircle, Info, CheckCircle, XCircle, Search,
  User, Calendar, Timer, MessageSquare,
  Send, ChevronDown, ChevronUp, Activity,
  Play, CalendarClock, Folder, ChevronRight,
  CalendarDays, Settings,
} from 'lucide-react';
import { User as UserType } from '../../types';
import { analysisAPI } from '../../api/analysis';
import { useNotificationSocket } from '../../hooks/useNotificationSocket';
import { timeAgo } from '../../lib/time';

interface SubmissionsReviewPanelProps {
  currentUser: UserType;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface Submission {
  id: number;
  filename: string;
  relative_path?: string;
  username?: string;
  status: string;
  language?: string;
  created_at: string;
  scan_folder?: string;
  scheduled_at?: string;
  timeout_seconds?: number;
  file_content?: string;
  result?: any;
}

interface Feedback {
  id: number;
  line_start: number;
  line_end: number | null;
  comment: string;
  reviewer_username: string;
  created_at: string;
  resolved: boolean;
}

const STATUSES = [
  { key: 'pending_review', label: 'Pending Review', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  { key: 'analysing', label: 'Analysing', icon: Loader2, color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20' },
  { key: 'done', label: 'Done', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
  { key: 'failed', label: 'Failed', icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-400/20' },
];

const severityIcon = (sev: string) => {
  switch (sev) {
    case 'high': return <AlertTriangle size={12} className="text-rose-400" />;
    case 'medium': return <AlertCircle size={12} className="text-amber-400" />;
    default: return <Info size={12} className="text-cyan-400" />;
  }
};

interface ReviewTreeNode {
  name: string;
  isDir: boolean;
  children: ReviewTreeNode[];
  key: string;
  submission?: Submission;
}

function buildReviewTree(submissions: Submission[]): ReviewTreeNode[] {
  // Deduplicate by file path, keeping the newest submission
  const dedupMap = new Map<string, Submission>();
  for (const sub of submissions) {
    const p = (sub.scan_folder || 'Standalone') + '/' + (sub.relative_path || sub.filename || 'untitled');
    const normPath = p.replace(/\\/g, '/');
    const existing = dedupMap.get(normPath);
    if (!existing || new Date(sub.created_at) > new Date(existing.created_at)) {
      dedupMap.set(normPath, sub);
    }
  }
  const root: ReviewTreeNode[] = [];
  for (const submission of dedupMap.values()) {
    const displayPath = submission.relative_path || submission.filename || 'untitled';
    const path = `${submission.scan_folder || 'Standalone'}/${displayPath}`.replace(/\\/g, '/');
    const parts = path.split('/').filter(Boolean);
    let current = root;
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (isLast) {
        if (!current.some(n => !n.isDir && n.key === currentPath)) {
          current.push({ name: part, isDir: false, children: [], key: currentPath, submission });
        }
      } else {
        let dir = current.find(node => node.isDir && node.name === part);
        if (!dir) {
          dir = { name: part, isDir: true, children: [], key: currentPath };
          current.push(dir);
        }
        current = dir.children;
      }
    }
  }
  const sortNodes = (nodes: ReviewTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(root);
  return root;
}

export default function SubmissionsReviewPanel({ currentUser, onShowToast }: SubmissionsReviewPanelProps) {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [commentLine, setCommentLine] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const [codeReviewOpen, setCodeReviewOpen] = useState(false);
  const [schedulerCountdown, setSchedulerCountdown] = useState(60);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTargetId, setScheduleTargetId] = useState<number | null>(null);
  const [scheduleTargetFolder, setScheduleTargetFolder] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState(() => {
    const scheduled = new Date(Date.now() + 15 * 60 * 1000);
    const offset = scheduled.getTimezoneOffset() * 60000;
    return new Date(scheduled.getTime() - offset).toISOString().slice(0, 16);
  });
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [schedulerBusy, setSchedulerBusy] = useState(false);
  const [scheduleConfigOpen, setScheduleConfigOpen] = useState(false);
  const [globalScheduleAt, setGlobalScheduleAt] = useState('');
  const [globalScheduleExisting, setGlobalScheduleExisting] = useState<string | null>(null);
  const [schedulerProcessing, setSchedulerProcessing] = useState(false);
  const [expandedReviewPaths, setExpandedReviewPaths] = useState<Record<string, boolean>>({});
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;

  const { connect } = useNotificationSocket();

  const load = useCallback(async () => {
    try {
      const data = await analysisAPI.seniorListSubmissions();
      setSubmissions(data);
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to load submissions.', 'error');
    }
    setLoading(false);
  }, [onShowToast]);

  // Global schedule (must be declared before WebSocket effect)
  const loadGlobalSchedule = useCallback(async () => {
    try {
      const cfg = await analysisAPI.getGlobalSchedule();
      setGlobalScheduleExisting(cfg.scheduled_at);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    connect(msg => {
      if (msg.type === 'submission_update' || msg.type === 'junior.analysis_started' || msg.type === 'junior.analysis_complete' || msg.type === 'junior.analysis_failed') {
        load();
        loadGlobalSchedule();
        if (msg.submission_id === selectedIdRef.current && msg.result) {
          setDetail(prev => prev ? { ...prev, status: 'done', result: msg.result } : prev);
        }
      }
    });
  }, [connect, load, loadGlobalSchedule]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSchedulerCountdown(prev => prev > 0 ? prev - 1 : 60);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const refreshInterval = setInterval(() => { load(); }, 60000);
    return () => clearInterval(refreshInterval);
  }, [load]);

  useEffect(() => {
    setSchedulerCountdown(60);
  }, [submissions]);

  const loadDetail = async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setFeedbacks([]);
    setCodeReviewOpen(true);
    setDetailLoading(true);
    try {
      const data = await analysisAPI.getSubmissionDetail(id);
      setDetail(data);
      const fb = await analysisAPI.listSubmissionFeedback(id);
      setFeedbacks(fb);
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to load submission detail.', 'error');
    }
    setDetailLoading(false);
  };

  const addComment = async () => {
    if (!selectedId || !commentText.trim() || commentLine === null) return;
    setSubmittingComment(true);
    try {
      const fb = await analysisAPI.seniorAddFeedback(selectedId, commentLine, commentText.trim());
      setFeedbacks(prev => [...prev, fb]);
      setCommentText('');
      setCommentLine(null);
      onShowToast?.('Feedback added.', 'success');
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to add feedback.', 'error');
    }
    setSubmittingComment(false);
  };

  const pendingSubmissions = useMemo(
    () => submissions.filter(s => s.status === 'pending_review'),
    [submissions],
  );

  const selectedSubmission = useMemo(
    () => submissions.find(s => s.id === scheduleTargetId) || null,
    [scheduleTargetId, submissions],
  );

  const runNow = async (submissionId: number) => {
    setSchedulerBusy(true);
    try {
      await analysisAPI.seniorTriggerAnalysis(submissionId, undefined, timeoutSeconds);
      onShowToast?.('Analysis started.', 'success');
      await load();
      if (selectedId === submissionId) await loadDetail(submissionId);
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to start analysis.', 'error');
    }
    setSchedulerBusy(false);
  };

  const scheduleOne = async (submissionId: number) => {
    setSchedulerBusy(true);
    try {
      await analysisAPI.seniorTriggerAnalysis(
        submissionId,
        new Date(scheduleAt).toISOString(),
        timeoutSeconds,
      );
      onShowToast?.('Analysis scheduled.', 'success');
      setScheduleOpen(false);
      await load();
      if (selectedId === submissionId) await loadDetail(submissionId);
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to schedule analysis.', 'error');
    }
    setSchedulerBusy(false);
  };

  const scheduleFolder = async (scanFolder: string) => {
    setSchedulerBusy(true);
    try {
      await analysisAPI.juniorScheduleFolder(scanFolder, new Date(scheduleAt).toISOString(), timeoutSeconds);
      onShowToast?.('Folder scheduled.', 'success');
      setScheduleOpen(false);
      await load();
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to schedule folder.', 'error');
    }
    setSchedulerBusy(false);
  };

  const openScheduler = (submissionId: number) => {
    setScheduleTargetId(submissionId);
    setScheduleTargetFolder(null);
    setScheduleOpen(true);
  };

  const openFolderScheduler = (scanFolder: string) => {
    setScheduleTargetFolder(scanFolder);
    setScheduleTargetId(null);
    setScheduleOpen(true);
  };

  useEffect(() => { loadGlobalSchedule(); }, [loadGlobalSchedule]);

  const handleSetGlobalSchedule = async () => {
    if (!globalScheduleAt) return;
    setSchedulerProcessing(true);
    try {
      const iso = new Date(globalScheduleAt).toISOString();
      await analysisAPI.setGlobalSchedule(iso);
      setGlobalScheduleExisting(iso);
      setScheduleConfigOpen(false);
      onShowToast?.('Global schedule set.', 'success');
      await load();
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to set global schedule.', 'error');
    }
    setSchedulerProcessing(false);
  };

  const handleCancelGlobalSchedule = async () => {
    if (!window.confirm('Cancel this global schedule? Existing pending submissions will not be auto-analysed.')) return;
    setSchedulerProcessing(true);
    try {
      await analysisAPI.cancelGlobalSchedule();
      setGlobalScheduleExisting(null);
      setScheduleConfigOpen(false);
      onShowToast?.('Global schedule cancelled.', 'success');
      await load();
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to cancel global schedule.', 'error');
    }
    setSchedulerProcessing(false);
  };

  const handleTriggerNow = async () => {
    setSchedulerProcessing(true);
    try {
      const res = await analysisAPI.triggerGlobalSchedule();
      onShowToast?.(res.message || 'Scheduler triggered.', 'success');
      await load();
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to trigger scheduler.', 'error');
    }
    setSchedulerProcessing(false);
  };

  const toggleReviewPath = (path: string, depth: number) => {
    setExpandedReviewPaths(prev => ({
      ...prev,
      [path]: path in prev ? !prev[path] : !(depth < 1),
    }));
  };

  const renderSubmissionTree = (nodes: ReviewTreeNode[], depth = 0, parentPath = '') => (
    nodes.map(node => {
      const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.isDir) {
        const isExpanded = expandedReviewPaths[fullPath] ?? (depth < 1);
        const childCount = node.children.reduce((count, child) => count + (child.isDir ? child.children.length : 1), 0);
        const hasPending = node.children.some(child => !child.isDir && child.submission?.status === 'pending_review');
        return (
          <div key={node.key}>
            <div className="flex items-center gap-1 pr-1">
            <button
              onClick={() => toggleReviewPath(fullPath, depth)}
              className="flex items-center gap-1.5 py-1.5 rounded-lg text-left text-[10px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.015] transition-colors cursor-pointer flex-1 min-w-0"
              style={{ paddingLeft: `${depth * 0.85}rem` }}
            >
              <ChevronRight size={9} className={`text-zinc-600 transition-transform ${isExpanded ? 'rotate-90' : ''} flex-shrink-0`} />
              <Folder size={10} className="text-purple-400 flex-shrink-0" />
              <span className="truncate">{node.name}/</span>
              <span className="text-[8px] text-zinc-600 flex-shrink-0">({childCount})</span>
            </button>
            {hasPending && (
              <button
                onClick={(e) => { e.stopPropagation(); openFolderScheduler(node.key); }}
                disabled={schedulerBusy}
                className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-indigo-400/10 text-indigo-300 hover:bg-indigo-400/15 disabled:opacity-40 text-[8px] font-mono cursor-pointer flex-shrink-0"
              >
                <CalendarClock size={8} />
                Schedule
              </button>
            )}
            </div>
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden ml-2 border-l border-white/[0.03] pl-2"
                >
                  {renderSubmissionTree(node.children, depth + 1, fullPath)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      }

      const s = node.submission!;
      return (
        <motion.div
          key={s.id}
          layoutId={`card-${s.id}`}
          className={`w-full p-2.5 rounded-xl border transition-all cursor-pointer ${
            selectedId === s.id
              ? 'bg-white/[0.03] border-white/[0.1]'
              : s.status === 'failed'
                ? 'bg-rose-500/5 border-rose-400/20 hover:bg-rose-500/10 hover:border-rose-400/30'
                : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.02] hover:border-white/[0.08]'
          }`}
          style={{ marginLeft: `${depth * 0.35}rem` }}
          onClick={() => loadDetail(s.id)}
        >
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] font-mono font-medium truncate leading-tight ${s.status === 'failed' ? 'text-rose-400' : 'text-zinc-200'}`}>
                {node.name}
              </div>
            </div>
            {s.status === 'failed' && (
              <span className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[7px] font-mono text-rose-300 bg-rose-500/10 border border-rose-400/20 flex-shrink-0">
                <XCircle size={7} />
                Failed
              </span>
            )}
            {s.status === 'analysing' && (
              <Loader2 size={9} className="animate-spin text-cyan-400 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <User size={8} className="text-zinc-600" />
            <span className="text-[8px] font-mono text-zinc-500 truncate">{s.username || 'unknown'}</span>
            {s.scan_folder && (
              <span className="text-[7px] font-mono text-zinc-600 truncate max-w-[60px] bg-white/[0.02] px-1 py-0.5 rounded">
                {s.scan_folder}
              </span>
            )}
            <span className="text-[8px] font-mono text-zinc-600 ml-auto">
              {timeAgo(s.created_at)}
            </span>
          </div>
          {s.status === 'pending_review' && (
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/[0.03]">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  runNow(s.id);
                }}
                disabled={schedulerBusy}
                className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/15 disabled:opacity-40 text-[8px] font-mono cursor-pointer"
              >
                <Play size={8} />
                Now
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openScheduler(s.id);
                }}
                disabled={schedulerBusy}
                className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-indigo-400/10 text-indigo-300 hover:bg-indigo-400/15 disabled:opacity-40 text-[8px] font-mono cursor-pointer"
              >
                <CalendarClock size={8} />
                Schedule
              </button>
              {s.scheduled_at && (
                <span className="ml-auto text-[7px] font-mono text-indigo-300 truncate">
                  {new Date(s.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
        </motion.div>
      );
    })
  );

  const filtered = useMemo(() => {
    if (!searchQuery) return submissions;
    const q = searchQuery.toLowerCase();
    return submissions.filter(s =>
      s.filename.toLowerCase().includes(q) || (s.relative_path || '').toLowerCase().includes(q) || (s.username || '').toLowerCase().includes(q)
    );
  }, [submissions, searchQuery]);

  const groupedByStatus = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const s of STATUSES) groups[s.key] = [];
    for (const s of filtered) {
      const key = s.status || 'pending_review';
      if (groups[key]) groups[key].push(s);
      else groups['pending_review'].push(s);
    }
    return groups;
  }, [filtered]);

  const issueMap = useMemo(() => {
    const map: Record<number, any[]> = {};
    const issues = detail?.result?.issues || detail?.analysis?.analysis?.issues || [];
    for (const iss of issues) {
      const line = iss.line_start || iss.line || 1;
      if (!map[line]) map[line] = [];
      map[line].push(iss);
    }
    return map;
  }, [detail]);

  const feedbackMap = useMemo(() => {
    const map: Record<number, Feedback[]> = {};
    for (const fb of feedbacks) {
      const line = fb.line_start;
      if (!map[line]) map[line] = [];
      map[line].push(fb);
    }
    return map;
  }, [feedbacks]);

  const codeLines = useMemo(() => {
    return (detail?.file_content || '').split('\n');
  }, [detail]);

  const issueCount = Object.values(issueMap).reduce((s, v) => s + v.length, 0);
  const feedbackCount = feedbacks.length;

  const totalInStatus = STATUSES.map(s => ({
    ...s,
    count: groupedByStatus[s.key]?.length || 0,
  }));

  const pendingCount = pendingSubmissions.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-4 h-[calc(100vh-10rem)] text-left"
    >
      {/* Header — scheduler status bar */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileCode size={14} className="text-cyan-400" />
            <span className="text-xs font-semibold text-zinc-300">Submissions</span>
            <span className="text-[10px] font-mono text-zinc-500">{submissions.length}</span>
          </div>
          <div className="relative max-w-[200px]">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-7 pr-2 py-1.5 text-[10px] bg-white/[0.01] border border-white/[0.06] rounded-lg outline-none text-zinc-300 placeholder:text-zinc-600"
            />
          </div>
        </div>
        <div className="relative flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 text-[9px] font-mono text-zinc-500">
          <Activity size={10} className="text-emerald-400" />
          <span>Scheduler active</span>
          <span className="text-zinc-600">— next check in ~{schedulerCountdown}s</span>
          {pendingCount > 0 && (
            <span className="text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">{pendingCount} pending</span>
          )}
          {globalScheduleExisting && (
            <span className="text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded text-[8px]">
              Global: {new Date(globalScheduleExisting).toLocaleString()}
            </span>
          )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const d = new Date(Date.now() + 15 * 60 * 1000);
                setGlobalScheduleAt(d.toISOString().slice(0, 16));
                setScheduleConfigOpen(true);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-mono text-zinc-500 hover:text-cyan-400 hover:bg-cyan-400/10 border border-white/[0.04] hover:border-cyan-400/20 transition-all cursor-pointer"
              title="Schedule global analysis"
            >
              <CalendarDays size={10} />
              <span className="hidden md:inline">Schedule Global</span>
            </button>
            <button
              onClick={handleTriggerNow}
              disabled={schedulerProcessing}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-mono text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10 border border-white/[0.04] hover:border-emerald-400/20 transition-all cursor-pointer disabled:opacity-40"
              title="Run now"
            >
              <Play size={10} />
              <span className="hidden md:inline">Run Now</span>
            </button>
          </div>
        </div>

        {/* Global schedule modal */}
        <AnimatePresence>
          {scheduleConfigOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full right-0 mt-2 z-50 w-72 p-4 rounded-2xl glass-card border border-white/[0.06] shadow-xl"
            >
              <div className="flex items-center gap-2 mb-3">
                <Settings size={12} className="text-cyan-400" />
                <span className="text-[10px] font-mono font-semibold text-zinc-200">Global Analysis Schedule</span>
              </div>
              <label className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1 block">Schedule date & time</label>
              <input
                type="datetime-local"
                value={globalScheduleAt}
                onChange={e => setGlobalScheduleAt(e.target.value)}
                className="w-full px-3 py-1.5 text-[10px] bg-white/[0.01] border border-white/[0.06] rounded-lg outline-none text-zinc-300 focus:border-cyan-400/30 transition-all mb-3"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSetGlobalSchedule}
                  disabled={schedulerProcessing || !globalScheduleAt}
                  className="flex-1 px-3 py-1.5 rounded-lg text-[10px] font-mono font-semibold bg-cyan-400/10 border border-cyan-400/20 text-cyan-300 hover:bg-cyan-400/20 transition-all cursor-pointer disabled:opacity-40"
                >
                  {schedulerProcessing ? '...' : 'Set Schedule'}
                </button>
                {globalScheduleExisting && (
                  <button
                    onClick={handleCancelGlobalSchedule}
                    disabled={schedulerProcessing}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-mono text-rose-400 hover:bg-rose-500/10 border border-white/[0.04] hover:border-rose-500/20 transition-all cursor-pointer disabled:opacity-40"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => setScheduleConfigOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-mono text-zinc-500 hover:text-zinc-300 border border-white/[0.04] hover:border-white/[0.08] transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Kanban — full width */}
      <div className="flex-1 flex gap-3 overflow-x-auto pb-1 min-h-0">
        {totalInStatus.map(status => {
          const Icon = status.icon;
          const items = groupedByStatus[status.key] || [];
          const isEmpty = items.length === 0;
          return (
            <div key={status.key} className="flex-1 min-w-[110px] flex flex-col">
              <div className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border ${status.border} ${status.bg} mb-2`}>
                <Icon size={11} className={`${status.color} ${status.key === 'analysing' ? 'animate-spin' : ''}`} />
                <span className={`text-[10px] font-mono font-semibold ${status.color}`}>{status.label}</span>
                <span className="text-[9px] font-mono text-zinc-600 ml-auto">{items.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                {loading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 size={12} className="animate-spin text-zinc-500" />
                  </div>
                ) : isEmpty ? (
                  <div className="text-center py-6">
                    <span className="text-[9px] font-mono text-zinc-700">—</span>
                  </div>
                ) : items.map((s: any) => (
                  <motion.div
                    key={s.id}
                    layoutId={`card-${s.id}`}
                    className={`w-full p-2.5 rounded-xl border transition-all cursor-pointer ${
                      selectedId === s.id
                        ? 'bg-white/[0.03] border-white/[0.1]'
                        : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.02] hover:border-white/[0.08]'
                    }`}
                    onClick={() => loadDetail(s.id)}
                  >
                    <div className="flex items-center gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono text-zinc-200 font-medium truncate leading-tight">
                          {s.relative_path || s.filename}
                        </div>
                      </div>
                      {s.status === 'analysing' && (
                        <Loader2 size={9} className="animate-spin text-cyan-400 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <User size={8} className="text-zinc-600" />
                      <span className="text-[8px] font-mono text-zinc-500 truncate">{s.username || 'unknown'}</span>
                      {s.scan_folder && (
                        <span className="text-[7px] font-mono text-zinc-600 truncate max-w-[60px] bg-white/[0.02] px-1 py-0.5 rounded">
                          {s.scan_folder}
                        </span>
                      )}
                      <span className="text-[8px] font-mono text-zinc-600 ml-auto">
                        {timeAgo(s.created_at)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Code review — collapsible dropdown */}
      <AnimatePresence>
        {selectedId && codeReviewOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden flex-shrink-0"
          >
            <div className="glass-card rounded-2xl flex flex-col overflow-hidden max-h-[50vh]">
              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-cyan-400" />
                </div>
              ) : detail ? (
                <>
                  <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode size={14} className="text-cyan-400 flex-shrink-0" />
                      <span className="text-xs font-semibold text-zinc-300 truncate">{detail.filename}</span>
                      <span className="text-[9px] text-zinc-500 font-mono bg-white/[0.02] px-1.5 py-0.5 rounded">
                        {detail.language || 'txt'}
                      </span>
                      <span className="text-[9px] text-zinc-600 font-mono">
                        by {detail.username || `#${detail.user}`}
                      </span>
                      <span className="text-[9px] font-mono text-zinc-500">{codeLines.length} lines</span>
                      {issueCount > 0 && (
                        <span className="text-[9px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                          {issueCount} issue{issueCount > 1 ? 's' : ''}
                        </span>
                      )}
                      {feedbackCount > 0 && (
                        <span className="text-[9px] font-mono text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">
                          {feedbackCount} feedback
                        </span>
                      )}
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                        detail.status === 'done' ? 'text-emerald-400 bg-emerald-400/10'
                          : detail.status === 'failed' ? 'text-rose-400 bg-rose-400/10'
                          : detail.status === 'analysing' ? 'text-cyan-400 bg-cyan-400/10'
                          : 'text-amber-400 bg-amber-400/10'
                      }`}>{detail.status}</span>
                    </div>
                    <button
                      onClick={() => setCodeReviewOpen(false)}
                      className="text-zinc-500 hover:text-zinc-300 cursor-pointer flex-shrink-0"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>

                  {detail.status === 'pending_review' ? (
                    <div className="flex flex-col items-center justify-center py-8 text-zinc-500 text-xs gap-3">
                      {detail.scheduled_at && (
                        <div className="text-[10px] font-mono text-indigo-300">
                          Scheduled for {new Date(detail.scheduled_at).toLocaleString()}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                      <Clock size={14} className="text-amber-400" />
                      {detail.scheduled_at
                        ? `Waiting for scheduled analysis — next check in ~${schedulerCountdown}s`
                        : 'Pending senior review — run now or schedule this file'}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => runNow(detail.id)}
                          disabled={schedulerBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/15 disabled:opacity-40 text-[10px] font-mono cursor-pointer"
                        >
                          <Play size={11} />
                          Run Now
                        </button>
                        <button
                          onClick={() => openScheduler(detail.id)}
                          disabled={schedulerBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-400/10 text-indigo-300 hover:bg-indigo-400/15 disabled:opacity-40 text-[10px] font-mono cursor-pointer"
                        >
                          <CalendarClock size={11} />
                          Schedule Analysis
                        </button>
                      </div>
                    </div>
                  ) : detail.status === 'analysing' ? (
                    <div className="flex items-center justify-center py-8 text-zinc-500 text-xs gap-2">
                      <Loader2 size={14} className="animate-spin text-cyan-400" />
                      Currently analysing...
                    </div>
                  ) : detail.status === 'failed' ? (
                    <div className="flex items-center justify-center py-8 text-zinc-500 text-xs gap-2">
                      <XCircle size={14} className="text-rose-400" />
                      Analysis failed{detail.error ? `: ${detail.error}` : ''}
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
                        <table className="w-full border-collapse">
                          <tbody>
                            {codeLines.map((line: string, i: number) => {
                              const lineNum = i + 1;
                              const issues = issueMap[lineNum] || [];
                              const fbs = feedbackMap[lineNum] || [];
                              const hasIssues = issues.length > 0;
                              const hasFeedback = fbs.length > 0;
                              const isCommenting = commentLine === lineNum;
                              const maxSev = hasIssues
                                ? issues.some(iss => (iss.severity || '') === 'high') ? 'high'
                                  : issues.some(iss => (iss.severity || '') === 'medium') ? 'medium'
                                  : 'low'
                                : null;

                              return (
                                <tr key={lineNum}
                                  className={`group transition-colors ${
                                    hasIssues ? 'bg-amber-500/[0.02]' : ''
                                  } ${hasFeedback ? 'bg-blue-500/[0.02]' : ''}`}
                                >
                                  {isCommenting ? (
                                    <td colSpan={3} className="px-3 py-0">
                                      <div className="flex items-start gap-3">
                                        <div className="w-56 flex-shrink-0">
                                          <textarea
                                            autoFocus
                                            value={commentText}
                                            onChange={e => setCommentText(e.target.value)}
                                            placeholder="Write a comment..."
                                            rows={2}
                                            className="w-full text-[10px] bg-zinc-950 border border-white/[0.06] rounded-lg px-2 py-1 text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-cyan-400/60 resize-none"
                                          />
                                          <div className="flex gap-2 mt-1.5">
                                            <button
                                              onClick={addComment}
                                              disabled={!commentText.trim() || submittingComment}
                                              className="flex-1 text-[9px] px-2 py-1 rounded-lg bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 cursor-pointer disabled:opacity-30 flex items-center justify-center gap-1"
                                            >
                                              {submittingComment ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                                              Send
                                            </button>
                                            <button
                                              onClick={() => { setCommentLine(null); setCommentText(''); }}
                                              className="text-[9px] px-2 py-1 rounded-lg text-zinc-500 hover:text-zinc-300 cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-start gap-2">
                                            <span className="text-zinc-700 text-[10px] w-12 text-right select-none flex-shrink-0">{lineNum}</span>
                                            <span className="text-zinc-500 flex-shrink-0 mt-0.5">
                                              <MessageSquare size={10} />
                                            </span>
                                            <span className="text-zinc-300">{line || ' '}</span>
                                          </div>
                                          {hasFeedback && (
                                            <div className="mt-1 space-y-1">
                                              {fbs.slice(0, expandedComments[lineNum] ? undefined : 1).map(fb => (
                                                <div key={fb.id} className="text-[9px] bg-blue-500/[0.04] border border-blue-500/10 rounded-lg px-2 py-1 text-zinc-400">
                                                  <span className="text-blue-400 font-medium">{fb.reviewer_username}:</span>{' '}
                                                  {fb.comment}
                                                </div>
                                              ))}
                                              {fbs.length > 1 && (
                                                <button
                                                  onClick={() => setExpandedComments(p => ({ ...p, [lineNum]: !p[lineNum] }))}
                                                  className="text-[8px] text-zinc-600 hover:text-zinc-400 flex items-center gap-1 cursor-pointer"
                                                >
                                                  {expandedComments[lineNum] ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                                  {expandedComments[lineNum] ? 'Show less' : `${fbs.length - 1} more`}
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  ) : (
                                    <>
                                      <td
                                        className="select-none text-right px-3 py-0 text-zinc-700 w-12 border-r border-white/[0.03] align-top text-[10px] cursor-pointer hover:text-cyan-400 transition-colors"
                                        onClick={() => {
                                          setCommentLine(isCommenting ? null : lineNum);
                                          setCommentText('');
                                        }}
                                      >
                                        {lineNum}
                                      </td>
                                      <td className="w-6 px-1 py-0 align-top text-center border-r border-white/[0.03]">
                                        <button
                                          onClick={() => {
                                            setCommentLine(isCommenting ? null : lineNum);
                                            setCommentText('');
                                          }}
                                          className={`opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                                            isCommenting ? 'opacity-100' : ''
                                          }`}
                                          title="Add inline comment"
                                        >
                                          <MessageSquare size={10} className="text-zinc-500 hover:text-cyan-400" />
                                        </button>
                                        {hasIssues && (
                                          <span className={maxSev === 'high' ? 'text-rose-400' : maxSev === 'medium' ? 'text-amber-400' : 'text-cyan-400'}>
                                            {'\u25CF'}
                                          </span>
                                        )}
                                        {!hasIssues && hasFeedback && (
                                          <span className="text-blue-400">{'\u25CF'}</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-0 text-zinc-300 whitespace-pre-wrap align-top">
                                        {line || ' '}
                                        {hasFeedback && (
                                          <div className="mt-1 space-y-1">
                                            {fbs.slice(0, expandedComments[lineNum] ? undefined : 1).map(fb => (
                                              <div key={fb.id} className="text-[9px] bg-blue-500/[0.04] border border-blue-500/10 rounded-lg px-2 py-1 text-zinc-400">
                                                <span className="text-blue-400 font-medium">{fb.reviewer_username}:</span>{' '}
                                                {fb.comment}
                                              </div>
                                            ))}
                                            {fbs.length > 1 && (
                                              <button
                                                onClick={() => setExpandedComments(p => ({ ...p, [lineNum]: !p[lineNum] }))}
                                                className="text-[8px] text-zinc-600 hover:text-zinc-400 flex items-center gap-1 cursor-pointer"
                                              >
                                                {expandedComments[lineNum] ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                                {expandedComments[lineNum] ? 'Show less' : `${fbs.length - 1} more`}
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {(issueCount > 0 || feedbackCount > 0) && (
                        <div className="px-5 py-3 border-t border-white/[0.04] space-y-1.5 max-h-[140px] overflow-y-auto flex-shrink-0">
                          <div className="text-[10px] font-semibold text-zinc-400 mb-1">
                            Issues ({issueCount}) · Feedback ({feedbackCount})
                          </div>
                          {Object.entries(issueMap).map(([line, iss]) =>
                            iss.map((issue: any, idx: number) => (
                              <div key={`iss-${line}-${idx}`} className="flex items-start gap-2 text-[10px]">
                                {severityIcon(issue.severity || 'low')}
                                <span className="text-zinc-300 flex-1">{issue.description}</span>
                                <span className="text-zinc-600 font-mono flex-shrink-0">L{line}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center py-8 text-zinc-500 text-xs">
                  Failed to load submission.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scheduleOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => !schedulerBusy && setScheduleOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0b0b10] shadow-2xl p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-indigo-300">
                    <CalendarClock size={15} />
                    <h3 className="text-sm font-semibold text-zinc-100">Schedule Analysis</h3>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                    {scheduleTargetFolder
                      ? `Queue all files in "${scheduleTargetFolder}" for scheduled analysis.`
                      : selectedSubmission
                      ? `Queue ${selectedSubmission.filename} for scheduled analysis.`
                      : 'Select a pending submission before scheduling.'}
                  </p>
                </div>
                <button
                  onClick={() => setScheduleOpen(false)}
                  disabled={schedulerBusy}
                  className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40 cursor-pointer"
                >
                  <XCircle size={16} />
                </button>
              </div>

              <div className="grid gap-3 mt-5">
                <label className="grid gap-1.5">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Run at</span>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={e => setScheduleAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm text-zinc-200 outline-none focus:border-indigo-400/60"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Timeout seconds</span>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    value={timeoutSeconds}
                    onChange={e => setTimeoutSeconds(Number(e.target.value) || 60)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm text-zinc-200 outline-none focus:border-indigo-400/60"
                  />
                </label>
              </div>

              <div className="mt-5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-[10px] text-zinc-500 font-mono flex items-start gap-2">
                <Timer size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <span>Celery beat checks scheduled reviews every minute; queued cards stay pending until their run time.</span>
              </div>

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  onClick={() => setScheduleOpen(false)}
                  disabled={schedulerBusy}
                  className="px-3 py-2 rounded-lg text-[10px] font-mono text-zinc-500 hover:text-zinc-300 disabled:opacity-40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (scheduleTargetFolder) scheduleFolder(scheduleTargetFolder);
                    else if (selectedSubmission) scheduleOne(selectedSubmission.id);
                  }}
                  disabled={schedulerBusy || (!scheduleTargetFolder && !selectedSubmission)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-400/10 text-indigo-300 hover:bg-indigo-400/15 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-mono cursor-pointer"
                >
                  {schedulerBusy ? <Loader2 size={11} className="animate-spin" /> : <Calendar size={11} />}
                  {scheduleTargetFolder ? 'Schedule Folder' : 'Schedule Submission'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

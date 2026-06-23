import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCode, Loader2, Clock, AlertTriangle,
  AlertCircle, Info, CheckCircle, XCircle, Search,
  User, Calendar, Timer, MessageSquare,
  Send, ChevronDown, ChevronUp,
} from 'lucide-react';
import { User as UserType } from '../../types';
import { analysisAPI } from '../../api/analysis';
import { useNotificationSocket } from '../../hooks/useNotificationSocket';

interface SubmissionsReviewPanelProps {
  currentUser: UserType;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface Submission {
  id: number;
  filename: string;
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

export default function SubmissionsReviewPanel({ currentUser, onShowToast }: SubmissionsReviewPanelProps) {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [analyzing, setAnalyzing] = useState<Record<number, boolean>>({});
  const [scheduleOpen, setScheduleOpen] = useState<number | null>(null);
  const [scheduleTime, setScheduleTime] = useState('');
  const [timeoutSec, setTimeoutSec] = useState(60);
  const [commentLine, setCommentLine] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const scheduleRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    connect(msg => {
      if (msg.type === 'submission_update') load();
    });
  }, [connect, load]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (scheduleRef.current && !scheduleRef.current.contains(e.target as Node)) {
        setScheduleOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadDetail = async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setFeedbacks([]);
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

  const triggerAnalysis = async (submissionId: number, scheduledAt?: string, timeout?: number) => {
    setAnalyzing(p => ({ ...p, [submissionId]: true }));
    try {
      const res = await analysisAPI.seniorTriggerAnalysis(submissionId, scheduledAt, timeout);
      onShowToast?.(res.message || 'Analysis triggered.', 'success');
      setScheduleOpen(null);
      load();
    } catch (err: any) {
      onShowToast?.(err?.message || 'Failed to trigger analysis.', 'error');
    }
    setAnalyzing(p => ({ ...p, [submissionId]: false }));
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

  const filtered = useMemo(() => {
    if (!searchQuery) return submissions;
    const q = searchQuery.toLowerCase();
    return submissions.filter(s =>
      s.filename.toLowerCase().includes(q) || (s.username || '').toLowerCase().includes(q)
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

  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex gap-4 h-[calc(100vh-10rem)] text-left"
    >
      {/* Left panel — Linear-style kanban board */}
      <div className="w-[420px] flex-shrink-0 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <FileCode size={14} className="text-cyan-400" />
            <span className="text-xs font-semibold text-zinc-300">Submissions</span>
            <span className="text-[10px] font-mono text-zinc-500">{submissions.length}</span>
          </div>
          <div className="relative flex-1 max-w-[200px]">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-7 pr-2 py-1.5 text-[10px] bg-white/[0.01] border border-white/[0.06] rounded-lg outline-none text-zinc-300 placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div className="flex-1 flex gap-3 overflow-x-auto pb-1">
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
                            {s.filename}
                          </div>
                        </div>
                        {s.status === 'pending_review' && (
                          <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setScheduleOpen(scheduleOpen === s.id ? null : s.id);
                                setScheduleTime('');
                                setTimeoutSec(s.timeout_seconds || 60);
                              }}
                              disabled={analyzing[s.id]}
                              className="text-[8px] px-1.5 py-0.5 rounded font-mono border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/10 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                            >
                              {analyzing[s.id] ? '...' : 'Analyze'}
                            </button>
                            <AnimatePresence>
                              {scheduleOpen === s.id && (
                                <motion.div
                                  ref={scheduleRef}
                                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                  transition={{ duration: 0.12 }}
                                  className="absolute right-0 top-full mt-1 z-50 w-52 p-3 rounded-xl border border-white/[0.08] bg-zinc-900 shadow-xl"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <div className="space-y-2">
                                    <button
                                      onClick={() => triggerAnalysis(s.id)}
                                      className="w-full text-left px-2 py-1.5 rounded-lg text-[10px] font-mono text-cyan-400 hover:bg-cyan-400/10 transition-colors cursor-pointer border border-cyan-400/20"
                                    >
                                      Run Now
                                    </button>
                                    <div className="border-t border-white/[0.04] pt-2 space-y-1.5">
                                      <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
                                        <Calendar size={10} />
                                        <span>Schedule</span>
                                      </div>
                                      <input
                                        type="datetime-local"
                                        value={scheduleTime}
                                        onChange={e => setScheduleTime(e.target.value)}
                                        min={nowLocal}
                                        className="w-full px-2 py-1 text-[9px] font-mono bg-zinc-950 border border-white/[0.06] rounded-lg text-zinc-300 outline-none focus:border-cyan-400/60"
                                      />
                                      <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
                                        <Timer size={10} />
                                        <span>Timeout (s)</span>
                                      </div>
                                      <input
                                        type="number"
                                        value={timeoutSec}
                                        onChange={e => setTimeoutSec(Number(e.target.value) || 60)}
                                        min={30}
                                        max={3600}
                                        className="w-full px-2 py-1 text-[9px] font-mono bg-zinc-950 border border-white/[0.06] rounded-lg text-zinc-300 outline-none focus:border-cyan-400/60"
                                      />
                                      <button
                                        onClick={() => {
                                          if (!scheduleTime) return;
                                          triggerAnalysis(s.id, new Date(scheduleTime).toISOString(), timeoutSec);
                                        }}
                                        disabled={!scheduleTime}
                                        className="w-full text-left px-2 py-1.5 rounded-lg text-[10px] font-mono text-purple-400 hover:bg-purple-400/10 transition-colors cursor-pointer disabled:opacity-30 border border-purple-400/20 mt-1"
                                      >
                                        Schedule
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
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
      </div>

      {/* Right panel — code review with inline commenting */}
      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs gap-2">
            <FileCode size={18} className="text-zinc-700" />
            Select a submission to review
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={18} className="animate-spin text-cyan-400" />
          </div>
        ) : detail ? (
          <>
            <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode size={14} className="text-cyan-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-zinc-300 truncate">{detail.filename}</span>
                <span className="text-[9px] text-zinc-500 font-mono bg-white/[0.02] px-1.5 py-0.5 rounded">
                  {detail.language || 'txt'}
                </span>
                <span className="text-[9px] text-zinc-600 font-mono">
                  by {detail.username || `#${detail.user}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-zinc-500">
                  {codeLines.length} lines
                </span>
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
                    : 'text-cyan-400 bg-cyan-400/10'
                }`}>{detail.status}</span>
              </div>
            </div>

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
                          {!isCommenting && hasIssues && (
                            <span className={maxSev === 'high' ? 'text-rose-400' : maxSev === 'medium' ? 'text-amber-400' : 'text-cyan-400'}>
                              {'\u25CF'}
                            </span>
                          )}
                          {!isCommenting && hasFeedback && !hasIssues && (
                            <span className="text-blue-400">{'\u25CF'}</span>
                          )}
                        </td>
                        <td className="px-3 py-0 text-zinc-300 whitespace-pre-wrap align-top relative">
                          {line || ' '}
                          {isCommenting && (
                            <div className="absolute left-3 right-0 top-full z-20 mt-1">
                              <div className="bg-zinc-900 border border-white/[0.08] rounded-xl p-2 shadow-xl w-72">
                                <textarea
                                  value={commentText}
                                  onChange={e => setCommentText(e.target.value)}
                                  placeholder="Write a comment..."
                                  rows={2}
                                  className="w-full text-[10px] bg-zinc-950 border border-white/[0.06] rounded-lg px-2 py-1 text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-cyan-400/60 resize-none"
                                  autoFocus
                                />
                                <div className="flex items-center gap-1.5 mt-1.5 justify-end">
                                  <button
                                    onClick={() => { setCommentLine(null); setCommentText(''); }}
                                    className="text-[9px] px-2 py-1 rounded-lg text-zinc-500 hover:text-zinc-300 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={addComment}
                                    disabled={!commentText.trim() || submittingComment}
                                    className="text-[9px] px-2 py-1 rounded-lg bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 cursor-pointer disabled:opacity-30 flex items-center gap-1"
                                  >
                                    {submittingComment ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                                    Send
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                          {hasFeedback && !isCommenting && (
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(issueCount > 0 || feedbackCount > 0) && (
              <div className="px-5 py-3 border-t border-white/[0.04] space-y-1.5 max-h-[140px] overflow-y-auto">
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
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
            Failed to load submission.
          </div>
        )}
      </div>
    </motion.div>
  );
}

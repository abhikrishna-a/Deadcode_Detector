import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCode, Loader2, Clock, AlertTriangle,
  AlertCircle, Info, CheckCircle, XCircle, Search,
  User, Calendar, Timer,
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
  username: string;
  status: string;
  language: string;
  created_at: string;
  scan_folder?: string;
  scheduled_at?: string;
  timeout_seconds?: number;
  file_content?: string;
  analysis?: any;
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [analyzing, setAnalyzing] = useState<Record<number, boolean>>({});
  const [scheduleOpen, setScheduleOpen] = useState<number | null>(null);
  const [scheduleTime, setScheduleTime] = useState('');
  const [timeoutSec, setTimeoutSec] = useState(60);
  const scheduleRef = useRef<HTMLDivElement>(null);

  const { connect } = useNotificationSocket();

  const load = async () => {
    try {
      const data = await analysisAPI.listSubmissions();
      setSubmissions(data.submissions);
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to load submissions.', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    connect(msg => {
      if (msg.type === 'submission_update') load();
    });
  }, [connect]);

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
    setDetailLoading(true);
    try {
      const data = await analysisAPI.getSubmissionDetail(id);
      setDetail(data);
    } catch (e: any) {
      onShowToast?.(e?.message || 'Failed to load submission detail.', 'error');
    }
    setDetailLoading(false);
  };

  const triggerAnalysis = async (submissionId: number, scheduledAt?: string, timeout?: number) => {
    setAnalyzing(p => ({ ...p, [submissionId]: true }));
    try {
      const res = await analysisAPI.triggerSubmissionAnalysis(submissionId, { scheduled_at: scheduledAt, timeout_seconds: timeout });
      onShowToast?.(res.message || 'Analysis triggered.', 'success');
      setScheduleOpen(null);
      load();
    } catch (err: any) {
      onShowToast?.(err?.message || 'Failed to trigger analysis.', 'error');
    }
    setAnalyzing(p => ({ ...p, [submissionId]: false }));
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
    if (detail?.analysis?.analysis?.issues) {
      for (const iss of detail.analysis.analysis.issues) {
        const line = iss.line_start || iss.line || 1;
        if (!map[line]) map[line] = [];
        map[line].push(iss);
      }
    }
    return map;
  }, [detail]);

  const codeLines = useMemo(() => {
    return (detail?.file_content || '').split('\n');
  }, [detail]);

  const issueCount = Object.values(issueMap).reduce((s, v) => s + v.length, 0);

  const totalInStatus = STATUSES.map(s => ({
    ...s,
    count: groupedByStatus[s.key]?.length || 0,
  }));

  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex gap-4 h-[580px] text-left"
    >
      {/* Left panel — Linear-style kanban board */}
      <div className="w-[480px] flex-shrink-0 flex flex-col">
        {/* Header bar */}
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

        {/* Kanban columns */}
        <div className="flex-1 flex gap-3 overflow-x-auto pb-1">
          {totalInStatus.map(status => {
            const Icon = status.icon;
            const items = groupedByStatus[status.key] || [];
            const isEmpty = items.length === 0;
            return (
              <div key={status.key} className="flex-1 min-w-[110px] flex flex-col">
                {/* Column header */}
                <div className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border ${status.border} ${status.bg} mb-2`}>
                  <Icon size={11} className={`${status.color} ${status.key === 'analysing' ? 'animate-spin' : ''}`} />
                  <span className={`text-[10px] font-mono font-semibold ${status.color}`}>{status.label}</span>
                  <span className="text-[9px] font-mono text-zinc-600 ml-auto">{items.length}</span>
                </div>

                {/* Cards */}
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
                      className={`w-full p-2.5 rounded-xl border transition-all ${
                        selectedId === s.id
                          ? 'bg-white/[0.03] border-white/[0.1]'
                          : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.02] hover:border-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <button onClick={() => loadDetail(s.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                          <div className="text-[10px] font-mono text-zinc-200 font-medium truncate leading-tight">
                            {s.filename}
                          </div>
                        </button>
                        {s.status === 'pending_review' && (
                          <div className="relative flex-shrink-0">
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
                        <span className="text-[8px] font-mono text-zinc-500 truncate">{s.username}</span>
                        {s.scan_folder && (
                          <span className="text-[7px] font-mono text-zinc-600 truncate max-w-[60px] bg-white/[0.02] px-1 py-0.5 rounded">
                            {s.scan_folder}
                          </span>
                        )}
                        <span className="text-[8px] font-mono text-zinc-600 ml-auto">
                          {timeAgo(s.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {s.language && (
                          <span className="text-[7px] font-mono uppercase tracking-wider text-zinc-600 bg-white/[0.02] px-1 py-0.5 rounded">
                            {s.language}
                          </span>
                        )}
                        {s.scheduled_at && s.status === 'analysing' && (
                          <span className="text-[7px] font-mono text-purple-400/70 flex items-center gap-1">
                            <Calendar size={7} />
                            scheduled
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel — code review */}
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
                  by {detail.username}
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
                    const hasIssues = issues.length > 0;
                    const maxSev = hasIssues
                      ? issues.some(iss => (iss.severity || '') === 'high') ? 'high'
                        : issues.some(iss => (iss.severity || '') === 'medium') ? 'medium'
                        : 'low'
                      : null;

                    return (
                      <tr key={lineNum} className={hasIssues ? 'bg-amber-500/[0.02]' : ''}>
                        <td className="select-none text-right px-3 py-0 text-zinc-700 w-12 border-r border-white/[0.03] align-top text-[10px]">
                          {lineNum}
                        </td>
                        <td className="w-6 px-1 py-0 align-top text-center border-r border-white/[0.03]">
                          {hasIssues && (
                            <span className={maxSev === 'high' ? 'text-rose-400' : maxSev === 'medium' ? 'text-amber-400' : 'text-cyan-400'}>
                              {'\u25CF'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-0 text-zinc-300 whitespace-pre-wrap align-top">
                          {line || ' '}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {issueCount > 0 && (
              <div className="px-5 py-3 border-t border-white/[0.04] space-y-1.5 max-h-[160px] overflow-y-auto">
                <div className="text-[10px] font-semibold text-zinc-400 mb-1">Issues</div>
                {Object.entries(issueMap).map(([line, iss]) =>
                  iss.map((issue: any, idx: number) => (
                    <div key={`${line}-${idx}`} className="flex items-start gap-2 text-[10px]">
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

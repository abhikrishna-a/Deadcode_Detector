import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Search, Clock, FileCode, BarChart3, CalendarDays, Loader2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { analysisAPI } from '../../api/analysis';

interface HistoryTabProps {
  key?: string;
  onNavigateToChat: (docId: string, filename: string) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface HistoryItem {
  analysis_id: string;
  filename: string;
  language: string;
  health_score: number;
  total_issues: number;
  created_at: string;
  scan_folder?: string;
  scan_type?: string;
}

const PAGE_SIZE = 20;

export default function HistoryTab({ onNavigateToChat, onShowToast }: HistoryTabProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadHistory = async (currentOffset: number, currentSearch: string) => {
    setLoading(true);
    try {
      const result = await analysisAPI.ragHistory(PAGE_SIZE, currentOffset, currentSearch);
      setItems(result.items);
      setTotal(result.total);
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to load history', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(offset, search);
  }, [offset]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    loadHistory(0, search);
  };

  const handleDelete = async (analysisId: string) => {
    setDeleting(analysisId);
    try {
      await analysisAPI.ragDeleteAnalysis(analysisId);
      setItems(prev => prev.filter(i => i.analysis_id !== analysisId));
      setTotal(prev => prev - 1);
      onShowToast('Analysis deleted successfully', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to delete analysis', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const healthColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 text-left"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="font-display font-bold text-xl text-neutral-150 tracking-tight flex items-center gap-2">
            <Clock className="text-cyan-400" size={20} /> Analysis History
          </h2>
          <p className="text-zinc-500 text-xs font-sans">
            Browse all past code analyses. Click a result to open in the AI Inspector.
          </p>
        </div>
        {total > 0 && (
          <span className="text-[10px] font-mono text-zinc-500 bg-white/[0.02] border border-white/[0.04] px-3 py-1.5 rounded-lg">
            {total} total
          </span>
        )}
      </div>

      <form onSubmit={handleSearch} className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-650">
          <Search size={14} />
        </span>
        <input
          type="text"
          placeholder="Search by filename..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-xs text-zinc-300 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/40 rounded-xl outline-none transition-all placeholder:text-zinc-650"
        />
      </form>

      <div
        style={{
          background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
        }}
        className="rounded-2xl overflow-hidden backdrop-blur-md"
      >
        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 border-b border-white/[0.04] text-[10px] font-mono tracking-wider text-neutral-500 uppercase font-semibold">
          <div className="col-span-4">Filename</div>
          <div className="col-span-2">Language</div>
          <div className="col-span-2">Health</div>
          <div className="col-span-2">Issues</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        <div className="divide-y divide-white/[0.02]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-neutral-500 gap-2">
              <Loader2 size={16} className="animate-spin text-cyan-400" />
              <span className="text-xs font-mono">Loading history...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-neutral-600">
              <FileCode size={28} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-xs font-sans">No analysis history found.</p>
              <p className="text-[11px] text-zinc-600 font-mono mt-1">Run your first scan in the Scanner Workspace.</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.analysis_id}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/[0.01] transition-colors"
              >
                <div className="col-span-4 flex items-center gap-2">
                  <FileCode size={14} className="text-violet-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <button
                      onClick={() => onNavigateToChat(item.analysis_id, item.filename)}
                      className="text-xs font-mono text-zinc-200 hover:text-cyan-400 truncate block max-w-[200px] text-left cursor-pointer transition-colors"
                      title={item.filename}
                    >
                      {item.filename.split('/').pop() || item.filename}
                    </button>
                    {item.scan_folder && (
                      <span className="text-[9px] font-mono text-zinc-600 block truncate max-w-[200px]">
                        {item.scan_folder}
                      </span>
                    )}
                  </div>
                </div>

                <div className="col-span-2">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase bg-white/[0.02] px-2 py-0.5 rounded border border-white/[0.04]">
                    {item.language || 'unknown'}
                  </span>
                </div>

                <div className="col-span-2">
                  <span className={`text-xs font-mono font-bold ${healthColor(item.health_score)}`}>
                    {item.health_score}%
                  </span>
                </div>

                <div className="col-span-2">
                  <span className={`text-xs font-mono ${item.total_issues > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {item.total_issues > 0 ? `${item.total_issues} found` : 'Clean'}
                  </span>
                </div>

                <div className="col-span-2 text-right flex items-center justify-end gap-2">
                  <span className="text-[9px] font-mono text-zinc-600 hidden sm:inline">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleDelete(item.analysis_id)}
                    disabled={deleting === item.analysis_id}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/5 transition-colors cursor-pointer disabled:opacity-40"
                    title="Delete analysis"
                  >
                    {deleting === item.analysis_id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="bg-zinc-950/20 px-6 py-3 border-t border-white/[0.02] flex items-center justify-between text-[10px] font-mono text-zinc-600">
            <span>
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOffset(prev => Math.max(0, prev - PAGE_SIZE))}
                disabled={offset === 0}
                className="p-1.5 rounded-lg hover:bg-white/[0.03] disabled:opacity-30 cursor-pointer transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-zinc-500">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setOffset(prev => (currentPage < totalPages ? prev + PAGE_SIZE : prev))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg hover:bg-white/[0.03] disabled:opacity-30 cursor-pointer transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Search, Clock, FileCode, Loader2, Trash2, Folder, FolderOpen, ChevronRight } from 'lucide-react';
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

type FilterMode = 'all' | 'file' | 'repo' | 'folder';

const FILTERS: { mode: FilterMode; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'file', label: 'File' },
  { mode: 'repo', label: 'Repo' },
  { mode: 'folder', label: 'Folder' },
];

const MAX_ITEMS = 500;

const healthColor = (score: number) => {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-rose-400';
};

function buildTree(items: HistoryItem[]): { name: string; scanType?: string; files: HistoryItem[] }[] {
  const groups = new Map<string, { name: string; scanType?: string; files: HistoryItem[] }>();
  for (const item of items) {
    let key: string;
    let name: string;
    if (item.scan_folder) {
      key = `folder:${item.scan_folder}`;
      name = item.scan_folder;
    } else if (item.scan_type === 'single' || !item.scan_type) {
      key = '__single__';
      name = 'Single Files';
    } else {
      key = `type:${item.scan_type}`;
      name = `${item.scan_type.charAt(0).toUpperCase() + item.scan_type.slice(1)} Scans`;
    }
    if (!groups.has(key)) {
      groups.set(key, { name, scanType: item.scan_type, files: [] });
    }
    groups.get(key)!.files.push(item);
  }
  const result = Array.from(groups.values());
  result.sort((a, b) => {
    if (a.name === 'Single Files') return 1;
    if (b.name === 'Single Files') return -1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

export default function HistoryTab({ onNavigateToChat, onShowToast }: HistoryTabProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['Single Files']));

  const loadHistory = async (currentSearch: string) => {
    setLoading(true);
    try {
      const result = await analysisAPI.ragHistory(MAX_ITEMS, 0, currentSearch);
      setItems(result.items);
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to load history', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(search);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadHistory(search);
  };

  const handleDelete = async (analysisId: string) => {
    setDeleting(analysisId);
    try {
      await analysisAPI.ragDeleteAnalysis(analysisId);
      setItems(prev => prev.filter(i => i.analysis_id !== analysisId));
      onShowToast('Analysis deleted successfully', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to delete analysis', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const toggleFolder = (name: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = items;
    if (filter === 'file') result = result.filter(i => !i.scan_folder && (i.scan_type || 'single') === 'single');
    else if (filter === 'repo') result = result.filter(i => i.scan_type === 'repo');
    else if (filter === 'folder') result = result.filter(i => i.scan_type === 'folder');
    return result;
  }, [items, filter]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 text-left"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="font-display font-bold text-xl text-neutral-150 tracking-tight flex items-center gap-2">
            <Clock className="text-cyan-400" size={20} /> Analysis History
          </h2>
          <p className="text-zinc-500 text-xs font-sans">
            Browse all past code analyses. Click a file to open in the AI Inspector.
          </p>
        </div>
        {items.length > 0 && (
          <span className="text-[10px] font-mono text-zinc-500 bg-white/[0.02] border border-white/[0.04] px-3 py-1.5 rounded-lg">
            {items.length} total
          </span>
        )}
      </div>

      <div className="flex gap-2 items-center">
        <form onSubmit={handleSearch} className="relative flex-1">
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
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f.mode}
              onClick={() => setFilter(f.mode)}
              className={`px-3 py-2 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                filter === f.mode
                  ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400'
                  : 'bg-zinc-950/40 border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.12]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
        }}
        className="rounded-2xl overflow-hidden backdrop-blur-md"
      >
        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 border-b border-white/[0.04] text-[10px] font-mono tracking-wider text-neutral-500 uppercase font-semibold">
          <div className="col-span-4">Name</div>
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
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-neutral-600">
              <FileCode size={28} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-xs font-sans">No analysis history found.</p>
              <p className="text-[11px] text-zinc-600 font-mono mt-1">
                {filter !== 'all' ? 'Try a different filter.' : 'Run your first scan in the Scanner Workspace.'}
              </p>
            </div>
          ) : (
            tree.map(group => (
              <div key={group.name}>
                <button
                  onClick={() => toggleFolder(group.name)}
                  className="w-full grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-white/[0.01] transition-colors text-left cursor-pointer"
                >
                  <div className="col-span-4 flex items-center gap-2">
                    <ChevronRight
                      size={12}
                      className={`text-zinc-500 transition-transform ${expandedFolders.has(group.name) ? 'rotate-90' : ''}`}
                    />
                    {expandedFolders.has(group.name) ? (
                      <FolderOpen size={14} className="text-cyan-400 flex-shrink-0" />
                    ) : (
                      <Folder size={14} className="text-cyan-400 flex-shrink-0" />
                    )}
                    <span className="text-xs font-mono text-zinc-200 font-semibold">{group.name}</span>
                    <span className="text-[9px] font-mono text-zinc-600">({group.files.length})</span>
                  </div>
                  <div className="col-span-2">
                    {group.scanType && (
                      <span className="text-[9px] font-mono uppercase text-zinc-600 bg-white/[0.02] px-2 py-0.5 rounded border border-white/[0.04]">
                        {group.scanType}
                      </span>
                    )}
                  </div>
                  <div className="col-span-6" />
                </button>

                {expandedFolders.has(group.name) && group.files.map(item => (
                  <div
                    key={item.analysis_id}
                    className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center hover:bg-white/[0.01] transition-colors border-t border-white/[0.02]"
                    style={{ paddingLeft: '3.5rem' }}
                  >
                    <div className="col-span-4 flex items-center gap-2 min-w-0">
                      <FileCode size={12} className="text-violet-400/70 flex-shrink-0" />
                      <button
                        onClick={() => onNavigateToChat(item.analysis_id, item.filename)}
                        className="text-xs font-mono text-zinc-200 hover:text-cyan-400 truncate max-w-[220px] text-left cursor-pointer transition-colors"
                        title={item.filename}
                      >
                        {item.filename}
                      </button>
                    </div>

                    <div className="col-span-2">
                      <span className="text-[9px] font-mono text-zinc-500 uppercase bg-white/[0.02] px-1.5 py-0.5 rounded border border-white/[0.04]">
                        {item.language || 'unknown'}
                      </span>
                    </div>

                    <div className="col-span-2">
                      <span className={`text-[11px] font-mono font-bold ${healthColor(item.health_score)}`}>
                        {item.health_score}%
                      </span>
                    </div>

                    <div className="col-span-2">
                      <span className={`text-[11px] font-mono ${item.total_issues > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {item.total_issues > 0 ? `${item.total_issues} found` : 'Clean'}
                      </span>
                    </div>

                    <div className="col-span-2 text-right flex items-center justify-end gap-2">
                      <span className="text-[8px] font-mono text-zinc-600 hidden sm:inline">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => handleDelete(item.analysis_id)}
                        disabled={deleting === item.analysis_id}
                        className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/5 transition-colors cursor-pointer disabled:opacity-40"
                        title="Delete analysis"
                      >
                        {deleting === item.analysis_id ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <Trash2 size={10} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

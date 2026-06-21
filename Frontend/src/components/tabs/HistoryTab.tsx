import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Clock, FileCode, Loader2, Folder, FolderOpen, ChevronRight, ArrowUpFromLine } from 'lucide-react';
import { analysisAPI } from '../../api/analysis';

interface HistoryTabProps {
  key?: string;
  onNavigateToChat: (docId: string, filename: string) => void;
  onNavigateToWorkspace: (analysisId: string, filename: string, scanFolder?: string) => void;
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

interface HistoryTreeNode {
  name: string;
  isDir: boolean;
  children: HistoryTreeNode[];
  file?: HistoryItem;
  scanFolder?: string;
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

function buildHistoryTree(files: HistoryItem[], defaultScanFolder?: string): HistoryTreeNode[] {
  const root: HistoryTreeNode[] = [];
  for (const file of files) {
    const parts = file.filename.replace(/\\/g, '/').split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        current.push({ name: part, isDir: false, children: [], file });
      } else {
        let dir = current.find(n => n.name === part && n.isDir);
        if (!dir) {
          dir = { name: part, isDir: true, children: [], file: undefined, scanFolder: defaultScanFolder };
          current.push(dir);
        }
        current = dir.children;
      }
    }
  }
  return root;
}

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

function findFirstFile(node: HistoryTreeNode): HistoryItem | undefined {
  if (node.file) return node.file;
  for (const child of node.children) {
    const found = findFirstFile(child);
    if (found) return found;
  }
  return undefined;
}

interface HistoryTreeNodeProps {
  node: HistoryTreeNode;
  depth: number;
  parentPath: string;
  expandedTreePaths: Record<string, boolean>;
  onToggle: (path: string, depth: number) => void;
  onNavigateToWorkspace: (analysisId: string, filename: string, scanFolder?: string) => void;
  healthColor: (score: number) => string;
}

function HistoryTreeNode({
  node, depth, parentPath, expandedTreePaths, onToggle,
  onNavigateToWorkspace, healthColor,
}: HistoryTreeNodeProps) {
  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const isExpanded = expandedTreePaths[fullPath] ?? (depth < 1);

  if (!node.isDir && node.file) {
    const item = node.file;
    return (
      <div
        className="flex items-center gap-2 px-6 py-2 hover:bg-white/[0.01] transition-colors border-t border-white/[0.02]"
        style={{ paddingLeft: `${3.5 + depth * 1.5}rem` }}
      >
        <FileCode size={11} className="text-violet-400/70 flex-shrink-0" />
        <button
          onClick={() => onNavigateToWorkspace(item.analysis_id, item.filename, item.scan_folder)}
          className="text-xs font-mono text-zinc-300 hover:text-cyan-400 truncate max-w-[160px] text-left cursor-pointer transition-colors"
          title={item.filename}
        >
          {node.name}
        </button>
        <span className={`text-[10px] font-mono ${healthColor(item.health_score)}`}>
          {item.health_score}%
        </span>
        <span className={`text-[10px] font-mono ${item.total_issues > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
          {item.total_issues > 0 ? `${item.total_issues} issues` : 'Clean'}
        </span>
        <span className="text-[8px] font-mono text-zinc-700 ml-auto hidden sm:inline">
          {new Date(item.created_at).toLocaleDateString()}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => {
          const first = findFirstFile(node);
          if (first) onNavigateToWorkspace(first.analysis_id, first.filename, first.scan_folder);
        }}
        className="flex items-center gap-1.5 w-full px-6 py-2.5 hover:bg-white/[0.01] transition-colors text-left cursor-pointer border-t border-white/[0.02]"
        style={{ paddingLeft: `${3.5 + depth * 1.5}rem` }}
      >
        <ChevronRight
          size={10}
          onClick={(e) => { e.stopPropagation(); onToggle(fullPath, depth); }}
          className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
        />
        {isExpanded ? (
          <FolderOpen size={12} className="text-purple-400 flex-shrink-0" />
        ) : (
          <Folder size={12} className="text-purple-400 flex-shrink-0" />
        )}
        <span className="text-xs font-mono text-zinc-400 truncate">{node.name}/</span>
        <span className="text-[9px] font-mono text-zinc-600">({node.children.length})</span>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden ml-[3.5rem] border-l border-white/[0.03]"
          >
            {node.children.map(child => (
              <HistoryTreeNode
                key={child.file?.analysis_id || child.name}
                node={child}
                depth={depth + 1}
                parentPath={fullPath}
                expandedTreePaths={expandedTreePaths}
                onToggle={onToggle}
                onNavigateToWorkspace={onNavigateToWorkspace}
                healthColor={healthColor}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HistoryTab({ onNavigateToChat, onNavigateToWorkspace, onShowToast }: HistoryTabProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['Single Files']));
  const [expandedTreePaths, setExpandedTreePaths] = useState<Record<string, boolean>>({});

  const loadHistory = async (currentSearch: string) => {
    setLoading(true);
    try {
      const result = await analysisAPI.ragHistory(MAX_ITEMS, 0, currentSearch);
      setItems(result.items);
    } catch {
      onShowToast('Unable to load history. Refresh the page and try again.', 'error');
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

  const toggleFolder = (name: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleTreePath = (path: string, depth: number = 0) => {
    setExpandedTreePaths(prev => {
      if (!(path in prev)) return { ...prev, [path]: !(depth < 1) };
      return { ...prev, [path]: !prev[path] };
    });
  };

  const filtered = useMemo(() => {
    let result = items;
    if (filter === 'file') result = result.filter(i => !i.scan_folder && (i.scan_type || 'single') === 'single');
    else if (filter === 'repo') result = result.filter(i => i.scan_type === 'repo');
    else if (filter === 'folder') result = result.filter(i => i.scan_type === 'folder');
    return result;
  }, [items, filter]);

  const tree = useMemo(() => {
    const groups = buildTree(filtered);
    return groups.map(g => ({
      ...g,
      scanFolder: g.files[0]?.scan_folder,
      tree: buildHistoryTree(g.files, g.files[0]?.scan_folder),
    }));
  }, [filtered]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 text-left"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="font-display font-bold text-xl text-neutral-200 tracking-tight flex items-center gap-2">
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
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Search by filename..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-xs text-zinc-300 bg-zinc-950/40 border border-white/[0.06] focus:border-cyan-400/40 rounded-xl outline-none transition-all placeholder:text-zinc-500"
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
        <div>
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
                  className="flex items-center gap-2 w-full px-6 py-2.5 hover:bg-white/[0.01] transition-colors text-left cursor-pointer border-t border-white/[0.02]"
                >
                  <ChevronRight
                    size={12}
                    className={`text-zinc-500 transition-transform flex-shrink-0 ${expandedFolders.has(group.name) ? 'rotate-90' : ''}`}
                  />
                  {expandedFolders.has(group.name) ? (
                    <FolderOpen size={14} className="text-cyan-400 flex-shrink-0" />
                  ) : (
                    <Folder size={14} className="text-cyan-400 flex-shrink-0" />
                  )}
                  <span className="text-xs font-mono text-zinc-200 font-semibold">{group.name}</span>
                  <span className="text-[9px] font-mono text-zinc-600">({group.files.length})</span>
                  {group.scanType && (
                    <span className="text-[9px] font-mono uppercase text-zinc-600 bg-white/[0.02] px-2 py-0.5 rounded border border-white/[0.04]">
                      {group.scanType}
                    </span>
                  )}
                  <span className="ml-auto" />
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      const first = group.files[0];
                      if (first) onNavigateToWorkspace(first.analysis_id, first.filename, first.scan_folder);
                    }}
                    className="p-1 rounded text-zinc-600 hover:text-cyan-400 hover:bg-cyan-500/5 transition-colors cursor-pointer"
                    title="Open in Workspace"
                  >
                    <ArrowUpFromLine size={11} />
                  </span>
                </button>

                {expandedFolders.has(group.name) && group.tree.map(node => (
                  <HistoryTreeNode
                    key={node.file?.analysis_id || node.name}
                    node={node}
                    depth={0}
                    parentPath=""
                    expandedTreePaths={expandedTreePaths}
                    onToggle={toggleTreePath}
                    onNavigateToWorkspace={onNavigateToWorkspace}
                    healthColor={healthColor}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

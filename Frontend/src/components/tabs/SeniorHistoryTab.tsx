import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Clock, FileCode, Loader2, Folder, FolderOpen, ChevronRight, ArrowUpFromLine, MessageSquare, Send } from 'lucide-react';
import { analysisAPI } from '../../api/analysis';
import { Skeleton } from '../ui/Skeleton';
import { groupByTopLevelDir } from '../../lib/fileTree';
import type { Issue, User } from '../../types';

interface SeniorHistoryTabProps {
  key?: string;
  currentUser: User;
  onNavigateToChat: (docId: string, filename: string) => void;
  onNavigateToWorkspace: (analysisId: string, filename: string, scanFolder?: string) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface FeedbackItem {
  id: number;
  line_start: number;
  line_end?: number;
  comment: string;
  reviewer_username?: string;
  resolved?: boolean;
  created_at?: string;
}

interface HistoryItem {
  analysis_id: string;
  submission_id?: number;
  filename: string;
  language: string;
  health_score: number;
  total_issues: number;
  created_at: string;
  scan_folder?: string;
  scan_type?: string;
  source_content?: string;
}

interface HistoryTreeNode {
  name: string;
  isDir: boolean;
  children: HistoryTreeNode[];
  file?: HistoryItem;
  scanFolder?: string;
}

type FilterMode = 'all' | 'folder';

const FILTERS: { mode: FilterMode; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'folder', label: 'Folder' },
];

const MAX_ITEMS = 50;

const healthColor = (score: number) => {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-rose-400';
};

function buildHistoryTree(files: HistoryItem[], basePath?: string): HistoryTreeNode[] {
  const root: HistoryTreeNode[] = [];
  for (const file of files) {
    let path = file.filename.replace(/\\/g, '/');
    if (basePath && path.startsWith(basePath + '/')) {
      path = path.slice(basePath.length + 1);
    }
    const parts = path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        current.push({ name: part, isDir: false, children: [], file });
      } else {
        let dir = current.find(n => n.name === part && n.isDir);
        if (!dir) {
          dir = { name: part, isDir: true, children: [], file: undefined, scanFolder: undefined };
          current.push(dir);
        }
        current = dir.children;
      }
    }
  }
  const sortNodes = (nodes: HistoryTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children);
    }
  };
  sortNodes(root);
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
    } else {
      key = '__single__';
      name = 'Analyses';
    }
    if (!groups.has(key)) {
      groups.set(key, { name, scanType: item.scan_type, files: [] });
    }
    groups.get(key)!.files.push(item);
  }
  return Array.from(groups.values());
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
  onNavigateToChat: (docId: string, filename: string) => void;
  onInspectFile: (item: HistoryItem) => void;
  healthColor: (score: number) => string;
  connectorPrefix?: string;
  isLast?: boolean;
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

function HistoryTreeNode({
  node, depth, parentPath, expandedTreePaths, onToggle,
  onNavigateToWorkspace, onNavigateToChat, onInspectFile, healthColor,
  connectorPrefix = '', isLast = true,
}: HistoryTreeNodeProps) {
  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const isExpanded = expandedTreePaths[fullPath] ?? false;

  const branch = isLast ? '└── ' : '├── ';

  if (!node.isDir && node.file) {
    const item = node.file;
    return (
      <div
        className="flex items-center gap-2 px-6 py-2 hover:bg-white/[0.01] transition-colors border-t border-white/[0.02]"
      >
        {connectorSpan(connectorPrefix + branch)}
        <FileCode size={11} className="text-violet-400/70 flex-shrink-0" />
        <button
          onClick={() => onInspectFile(item)}
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
        <button
          onClick={(e) => { e.stopPropagation(); onNavigateToChat(item.analysis_id, item.filename); }}
          className="p-1 rounded text-zinc-600 hover:text-cyan-400 hover:bg-cyan-500/5 transition-colors cursor-pointer ml-auto hidden sm:block"
          title="Open in Chat"
        >
          <MessageSquare size={11} />
        </button>
        <span className="text-[8px] font-mono text-zinc-700 hidden sm:inline">
          {new Date(item.created_at).toLocaleDateString()}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => onToggle(fullPath, depth)}
        className="flex items-center gap-1.5 w-full px-6 py-2.5 hover:bg-white/[0.01] transition-colors text-left cursor-pointer border-t border-white/[0.02]"
      >
        {connectorSpan(connectorPrefix + branch)}
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
            className="overflow-hidden"
          >
            {node.children.map((child, i, arr) => (
              <HistoryTreeNode
                key={child.file?.analysis_id || child.name}
                node={child}
                depth={depth + 1}
                parentPath={fullPath}
                expandedTreePaths={expandedTreePaths}
                onToggle={onToggle}
                onNavigateToWorkspace={onNavigateToWorkspace}
                onNavigateToChat={onNavigateToChat}
                onInspectFile={onInspectFile}
                healthColor={healthColor}
                connectorPrefix={childConnectorPrefix(connectorPrefix, isLast)}
                isLast={i === arr.length - 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SeniorHistoryTab({ currentUser, onNavigateToChat, onNavigateToWorkspace, onShowToast }: SeniorHistoryTabProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([]));
  const [expandedTreePaths, setExpandedTreePaths] = useState<Record<string, boolean>>({});
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set([]));
  const [inspectedFile, setInspectedFile] = useState<{
    id: string;
    filename: string;
    source_content: string;
    issues: Issue[];
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [commentLine, setCommentLine] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const inspectedFileRef = useRef<string | null>(null);

  const handleInspectFile = useCallback(async (item: HistoryItem) => {
    const id = item.analysis_id;
    inspectedFileRef.current = id;
    setInspectedFile({
      id,
      filename: item.filename,
      source_content: item.source_content || '',
      issues: [],
      loading: true,
      error: null,
    });
    setFeedbacks([]);
    setSubmissionId(null);
    setCommentLine(null);
    setCommentText('');
    try {
      const data = await analysisAPI.ragGetAnalysis(id);
      if (inspectedFileRef.current !== id) return;
      const rawIssues: any[] = data.analysis?.issues || [];
      const normalizedIssues: Issue[] = rawIssues.map(i => ({
        id: i.id || '',
        type: i.type || i.category || 'unknown',
        name: i.name || null,
        file: i.file || data.filename,
        line: i.line || i.line_start || 1,
        line_start: i.line_start || i.line || 1,
        line_end: i.line_end,
        description: i.description || '',
        code_snippet: i.code_snippet || '',
        suggestion: i.suggestion || '',
        severity: i.severity || 'medium',
        confidence: i.confidence ?? 0,
        safe_to_remove: i.safe_to_remove,
      }));
      setInspectedFile({
        id,
        filename: data.filename,
        source_content: data._source_content || '',
        issues: normalizedIssues,
        loading: false,
        error: null,
      });
      try {
        const lookup = await analysisAPI.lookupSubmissionByAnalysis(id);
        if (inspectedFileRef.current !== id) return;
        setSubmissionId(lookup.submission_id);
        const fb = await analysisAPI.listSubmissionFeedback(lookup.submission_id);
        if (inspectedFileRef.current !== id) return;
        setFeedbacks(fb);
      } catch {
      }
    } catch {
      if (inspectedFileRef.current !== id) return;
      setInspectedFile({
        id,
        filename: item.filename,
        source_content: item.source_content || '',
        issues: [],
        loading: false,
        error: 'Failed to load file details. The source may no longer be available.',
      });
    }
  }, []);

  const addComment = useCallback(async () => {
    if (!submissionId || !commentText.trim() || commentLine === null) return;
    setSubmittingComment(true);
    try {
      const fb = await analysisAPI.seniorAddFeedback(submissionId, commentLine, commentText.trim());
      setFeedbacks(prev => [...prev, fb]);
      setCommentText('');
      setCommentLine(null);
      onShowToast?.('Feedback added.', 'success');
    } catch {
      onShowToast?.('Failed to add feedback.', 'error');
    }
    setSubmittingComment(false);
  }, [submissionId, commentLine, commentText, onShowToast]);

  const loadHistory = async (currentSearch: string) => {
    setLoading(true);
    try {
      const PAGE_SIZE = MAX_ITEMS;
      const first = await analysisAPI.analysisHistory(PAGE_SIZE, 0, currentSearch);
      const total = first.total || 0;
      let djangoItems = [...first.items];
      if (total > PAGE_SIZE) {
        const pages = Math.ceil(total / PAGE_SIZE);
        const promises = [];
        for (let p = 1; p < pages; p++) {
          promises.push(analysisAPI.analysisHistory(PAGE_SIZE, p * PAGE_SIZE, currentSearch));
        }
        const extras = await Promise.all(promises);
        for (const r of extras) {
          djangoItems = djangoItems.concat(r.items);
        }
      }

      // Fetch RAG folder data to get path-based filenames from all users
      const scanFolders = [...new Set(djangoItems.map(i => i.scan_folder).filter(Boolean))] as string[];
      let ragItems: HistoryItem[] = [];
      for (const sf of scanFolders) {
        try {
          const folderData = await analysisAPI.ragGetAnalysesByFolder(sf);
          for (const r of folderData.items) {
            let filename = r.filename;
            // Strip scan_folder prefix if present (e.g. "core/cart/views.py" → "cart/views.py")
            if (filename.startsWith(sf + '/')) {
              filename = filename.slice(sf.length + 1);
            }
            ragItems.push({
              analysis_id: r.analysis_id,
              filename,
              language: r.language,
              health_score: r.health_score,
              total_issues: r.total_issues,
              created_at: r.created_at,
              scan_folder: sf,
            });
          }
        } catch {
          // Silently skip if folder fetch fails
        }
      }

      // Merge: RAG items first (path-based), then Django items for new analysis_ids
      const seen = new Set<string>();
      const merged: HistoryItem[] = [];
      for (const item of [...ragItems, ...djangoItems]) {
        if (!seen.has(item.analysis_id)) {
          seen.add(item.analysis_id);
          merged.push(item);
        }
      }

      setItems(merged);
      setHasLoadedOnce(true);
    } catch {
      onShowToast('Unable to load history. Refresh the page and try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(search);
    let interval = setInterval(() => loadHistory(search), 30000);
    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        clearInterval(interval);
        loadHistory(search);
        interval = setInterval(() => loadHistory(search), 30000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [search]);

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
      if (!(path in prev)) return { ...prev, [path]: true };
      return { ...prev, [path]: !prev[path] };
    });
  };

  const toggleAppGroup = (key: string) => {
    setExpandedApps(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (filter === 'folder') return items.filter(i => i.scan_folder);
    return items;
  }, [items, filter]);

  const tree = useMemo(() => {
    const groups = buildTree(filtered);
    return groups.map(g => {
      const appGroups = groupByTopLevelDir(g.files);
      return {
        ...g,
        scanFolder: g.files[0]?.scan_folder,
        appGroups: appGroups.map(ag => ({
          appName: ag.appName,
          files: ag.items,
          tree: buildHistoryTree(ag.items, ag.appName === 'Project Root' ? undefined : ag.appName),
        })),
      };
    });
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
            <div className="space-y-0">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-6 py-3 border-t border-white/[0.02]">
                  <Skeleton className="w-3 h-3 rounded" />
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-3 w-12 ml-auto" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 && hasLoadedOnce ? (
            <div className="text-center py-16 text-neutral-600">
              <FileCode size={28} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-xs font-sans">No analysis history found.</p>
              <p className="text-[11px] text-zinc-600 font-mono mt-1">
                {filter !== 'all' ? 'Try a different filter.' : 'No analyses available.'}
              </p>
            </div>
          ) : filtered.length === 0 && !hasLoadedOnce ? (
            <div className="text-center py-16 text-neutral-600">
              <Loader2 size={24} className="mx-auto text-zinc-700 mb-3 animate-spin" />
              <p className="text-xs font-sans">Loading analysis history...</p>
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

                {expandedFolders.has(group.name) && group.appGroups.map((appGroup, agIdx, agArr) => (
                  <div key={appGroup.appName}>
                    <button
                      onClick={() => toggleAppGroup(`${group.name}:${appGroup.appName}`)}
                      className="flex items-center gap-1.5 w-full px-6 py-2 hover:bg-white/[0.01] transition-colors text-left cursor-pointer border-t border-white/[0.02]"
                    >
                      <ChevronRight
                        size={10}
                        className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${expandedApps.has(`${group.name}:${appGroup.appName}`) ? 'rotate-90' : ''}`}
                      />
                      {expandedApps.has(`${group.name}:${appGroup.appName}`) ? (
                        <FolderOpen size={12} className="text-amber-400 flex-shrink-0" />
                      ) : (
                        <Folder size={12} className="text-amber-400 flex-shrink-0" />
                      )}
                      <span className="text-xs font-mono text-zinc-400 truncate">{appGroup.appName}/</span>
                      <span className="text-[9px] font-mono text-zinc-600">({appGroup.files.length})</span>
                    </button>
                    {expandedApps.has(`${group.name}:${appGroup.appName}`) && appGroup.tree.map((node, i, arr) => (
                      <HistoryTreeNode
                        key={node.file?.analysis_id || node.name}
                        node={node}
                        depth={0}
                        parentPath=""
                        expandedTreePaths={expandedTreePaths}
                        onToggle={toggleTreePath}
                        onNavigateToWorkspace={onNavigateToWorkspace}
                        onNavigateToChat={onNavigateToChat}
                        onInspectFile={handleInspectFile}
                        healthColor={healthColor}
                        connectorPrefix=""
                        isLast={i === arr.length - 1}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <AnimatePresence>
        {inspectedFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setInspectedFile(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="w-[90vw] h-[85vh] bg-[#0a0a0d] border border-white/[0.04] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.04]">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode size={14} className="text-cyan-400 flex-shrink-0" />
                  <span className="text-sm font-mono text-zinc-200 truncate">{inspectedFile.filename}</span>
                </div>
                <button
                  onClick={() => setInspectedFile(null)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-mono text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 border border-white/[0.04] transition-all cursor-pointer flex-shrink-0"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 min-h-0 p-4">
                {inspectedFile.loading ? (
                  <div className="h-full flex items-center justify-center text-zinc-500">
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Loading file...
                  </div>
                ) : inspectedFile.error ? (
                  <div className="h-full flex items-center justify-center text-amber-300 text-xs font-mono">
                    {inspectedFile.error}
                  </div>
                ) : (() => {
                  const lines = inspectedFile.source_content.split('\n');
                  const lineIssues = new Map<number, Issue[]>();
                  inspectedFile.issues.forEach(iss => {
                    const ln = iss.line_start || iss.line || 1;
                    if (!lineIssues.has(ln)) lineIssues.set(ln, []);
                    lineIssues.get(ln)!.push(iss);
                  });
                  const lineFeedbacks = new Map<number, FeedbackItem[]>();
                  feedbacks.forEach(fb => {
                    if (!lineFeedbacks.has(fb.line_start)) lineFeedbacks.set(fb.line_start, []);
                    lineFeedbacks.get(fb.line_start)!.push(fb);
                  });
                  return (
                    <div className="h-full overflow-auto font-mono text-[13px] leading-relaxed">
                      <table className="w-full border-collapse">
                        <tbody>
                          {lines.map((lineContent, idx) => {
                            const lineNum = idx + 1;
                            const issues = lineIssues.get(lineNum);
                            const fbList = lineFeedbacks.get(lineNum);
                            const isCommenting = commentLine === lineNum;
                            return (
                              <Fragment key={lineNum}>
                                <tr
                                  className={`group ${issues ? 'bg-rose-500/[0.02]' : ''} ${isCommenting ? 'bg-cyan-500/[0.03]' : ''}`}
                                >
                                  <td
                                    onClick={() => {
                                      setCommentLine(isCommenting ? null : lineNum);
                                      setCommentText('');
                                    }}
                                    className={`w-12 text-right px-3 py-0 select-none text-zinc-600 text-[11px] border-r-2 ${
                                      issues ? 'border-rose-500/30 text-rose-400/60' : 'border-white/[0.03]'
                                    } cursor-pointer hover:text-cyan-400`}
                                  >
                                    {lineNum}
                                  </td>
                                  <td className="px-4 py-0 text-zinc-300 whitespace-pre-wrap min-w-0 break-all">
                                    <div className="flex items-start gap-2">
                                      <span className="flex-1">{lineContent || ' '}</span>
                                      <span
                                        onClick={() => {
                                          setCommentLine(isCommenting ? null : lineNum);
                                          setCommentText('');
                                        }}
                                        className={`opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex-shrink-0 mt-0.5 ${
                                          isCommenting ? 'opacity-100' : ''
                                        }`}
                                        title="Add inline comment"
                                      >
                                        <MessageSquare size={12} className="text-cyan-400 hover:text-cyan-300" />
                                      </span>
                                    </div>
                                    {issues && issues.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-0.5 mb-0.5">
                                        {issues.map(iss => (
                                          <span
                                            key={iss.id}
                                            className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300/70 font-mono uppercase tracking-wider"
                                          >
                                            {iss.type}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                                {isCommenting && (
                                  <tr>
                                    <td colSpan={2} className="px-4 pb-2">
                                      <div className="flex gap-2 items-start">
                                        <textarea
                                          autoFocus
                                          value={commentText}
                                          onChange={e => setCommentText(e.target.value)}
                                          placeholder="Write a comment..."
                                          className="flex-1 bg-zinc-900/60 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-cyan-400/40 resize-none"
                                          rows={2}
                                        />
                                        <button
                                          onClick={() => { setCommentLine(null); setCommentText(''); }}
                                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono text-zinc-500 hover:text-zinc-300 border border-white/[0.04] hover:border-white/[0.1] transition-all cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={addComment}
                                          disabled={!commentText.trim() || submittingComment}
                                          className="px-3 py-1.5 rounded-lg text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-400/20 hover:bg-cyan-500/20 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                                        >
                                          {submittingComment ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                                          Send
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                {fbList && fbList.length > 0 && (
                                  <tr>
                                    <td colSpan={2} className="px-4 pb-1">
                                      {fbList.map(fb => (
                                        <div
                                          key={fb.id}
                                          className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/[0.04] border border-blue-500/[0.06] mb-1 last:mb-0"
                                        >
                                          <span className="text-blue-300 font-semibold text-[10px]">
                                            {fb.reviewer_username || 'Reviewer'}:
                                          </span>{' '}
                                          <span className="text-zinc-300">{fb.comment}</span>
                                        </div>
                                      ))}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

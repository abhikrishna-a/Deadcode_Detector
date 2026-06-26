import { useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart3, Bug, CheckCircle, File, Folder, ChevronRight, FolderTree, PieChartIcon, ExternalLink, FileCode, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AnalysisResult } from '../../types';
import { TreeNodeData, buildFileTree } from '../../lib/fileTree';
import CodeViewer from '../CodeViewer';
import { analysisAPI } from '../../api/analysis';

const FOLDER_COLORS = ['#06b6d4', '#8b5cf6', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#84cc16'];

const CATEGORIES = [
  { key: 'unused_import', label: 'Unused Imports', color: '#8b5cf6' },
  { key: 'unused_function', label: 'Unused Functions', color: '#ec4899' },
  { key: 'unused_variable', label: 'Unused Variables', color: '#3b82f6' },
  { key: 'unreachable_code', label: 'Unreachable Logic', color: '#f43f5e' },
  { key: 'commented_code', label: 'Commented Snippets', color: '#10b981' },
];

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

function TreeNode({ node, depth, onClick, connectorPrefix = '', isLast = true }: {
  node: TreeNodeData;
  depth: number;
  onClick: (res: AnalysisResult) => void;
  connectorPrefix?: string;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const branch = isLast ? '└── ' : '├── ';

  if (!node.isDir) {
    const health = node.file?.summary?.health_score ?? 100;
    const healthColor = health > 85 ? 'text-emerald-400' : health > 60 ? 'text-amber-400' : 'text-rose-400';
    return (
      <div
        onClick={() => node.file && onClick(node.file)}
        className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.015] cursor-pointer transition-colors group"
      >
        <div className="flex items-center gap-2 min-w-0">
          {connectorSpan(connectorPrefix + branch)}
          <span className="font-mono text-[11px] text-zinc-400 truncate max-w-[160px] group-hover:text-zinc-200 transition-colors">
            {node.name}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 flex-shrink-0">
          <span>{node.file?.metrics?.total_lines || 0} lines</span>
          <span className={`font-bold w-12 text-right ${healthColor}`}>{health}%</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-white/[0.015] cursor-pointer transition-colors group"
      >
        {connectorSpan(connectorPrefix + branch)}
        <ChevronRight
          size={10}
          className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
        <Folder size={12} className="text-cyan-400 flex-shrink-0" />
        <span className="font-mono text-[11px] text-zinc-500 truncate group-hover:text-zinc-300 transition-colors">
          {node.name}/
        </span>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {node.children.map((child, i, arr) => (
              <TreeNode
                key={i}
                node={child}
                depth={depth + 1}
                onClick={onClick}
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

interface OverviewTabProps {
  key?: string;
  user?: any;
  history: AnalysisResult[];
  onNavigateToWorkspace?: (analysisId: string, filename: string, scanFolder?: string) => void;
}

export default function OverviewTab({ history, onNavigateToWorkspace }: OverviewTabProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<AnalysisResult | null>(null);
  const [selectedFileLoading, setSelectedFileLoading] = useState(false);
  const [selectedFileError, setSelectedFileError] = useState<string | null>(null);
  const selectedFileRef = useRef<string | null>(null);

  const stats = useMemo(() => {
    const singles = history.filter(r => r.scan_type === 'single').length;
    const folderWithScanId = history.filter(r => r.scan_type === 'folder' && r.scan_id);
    const folderWithoutScanId = history.filter(r => r.scan_type === 'folder' && !r.scan_id);
    const folderSessions = new Set(folderWithScanId.map(r => r.scan_id)).size + folderWithoutScanId.length;
    const repoWithScanId = history.filter(r => r.scan_type === 'repo' && r.scan_id);
    const repoWithoutScanId = history.filter(r => r.scan_type === 'repo' && !r.scan_id);
    const repoSessions = new Set(repoWithScanId.map(r => r.scan_id)).size + repoWithoutScanId.length;
    const total = singles + folderSessions + repoSessions;
    const totalIssues = history.reduce((sum, r) => sum + (r.summary?.total_issues || 0), 0);
    return {
      auditRuns: total,
      orphanedTokens: singles,
      compliantRuns: folderSessions,
      statementsScanned: repoSessions,
      sourceDirectives: totalIssues,
      totalSessions: total,
      standaloneSessionCount: singles,
      folderSessionCount: folderSessions,
      repoSessionCount: repoSessions,
      totalIssuesFound: totalIssues,
    };
  }, [history]);

  const folderGroups = useMemo(() => {
    const groups: Record<string, AnalysisResult[]> = {};
    history.forEach(r => {
      const key = r.scan_folder || '(Single Files)';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [history]);

  const folderList = useMemo(() => Object.keys(folderGroups), [folderGroups]);

  const folderColorMap = useMemo(() => {
    return Object.fromEntries(folderList.map((f, i) => [f, FOLDER_COLORS[i % FOLDER_COLORS.length]]));
  }, [folderList]);

  const chartData = useMemo(() => {
    return CATEGORIES.map(cat => {
      const row: Record<string, any> = { category: cat.label };
      for (const [folder, files] of Object.entries(folderGroups)) {
        row[folder] = files.reduce((sum, f) =>
          sum + (f.issues?.filter(i => i.type === cat.key).length || 0), 0
        );
      }
      return row;
    });
  }, [folderGroups]);

  const handleFolderNavigate = useCallback((folderKey: string) => {
    const files = folderGroups[folderKey];
    if (!files?.length) return;
    const file = files[0];
    if (folderKey === '(Single Files)') {
      onNavigateToWorkspace?.(file.document_id, file.filename);
    } else {
      onNavigateToWorkspace?.(file.document_id, file.filename, file.scan_folder);
    }
  }, [folderGroups, onNavigateToWorkspace]);

  const groupedScans = useMemo(() => {
    const folders: Record<string, AnalysisResult[]> = {};
    history.forEach(r => {
      const folderKey = r.scan_folder || '(root)';
      if (!folders[folderKey]) folders[folderKey] = [];
      folders[folderKey].push(r);
    });
    return folders;
  }, [history]);

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderName]: !prev[folderName]
    }));
  };

  const handleSelectFile = useCallback((file: AnalysisResult) => {
    const localMatch = history.find(item => item.document_id === file.document_id) || file;
    setSelectedFile(localMatch);
    setSelectedFileLoading(false);

    if (localMatch._source_content && localMatch._source_content.trim()) {
      setSelectedFileError(null);
      return;
    }

    if (!localMatch.document_id) {
      setSelectedFileError('This history entry only contains summary data, so the source code is not available here.');
      return;
    }

    const docId = localMatch.document_id;
    selectedFileRef.current = docId;
    setSelectedFileLoading(true);
    setSelectedFileError(null);

    analysisAPI.ragGetAnalysis(docId).then(data => {
      if (selectedFileRef.current !== docId) return;
      if (data && data._source_content) {
        setSelectedFile(prev => prev?.document_id === docId
          ? { ...prev, _source_content: data._source_content }
          : prev
        );
        setSelectedFileError(null);
      } else {
        setSelectedFileError('This history entry only contains summary data, so the source code is not available here.');
      }
    }).catch(() => {
      if (selectedFileRef.current !== docId) return;
      setSelectedFileError('This history entry only contains summary data, so the source code is not available here.');
    }).finally(() => {
      if (selectedFileRef.current === docId) setSelectedFileLoading(false);
    });
  }, [history]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.35 }}
      className="space-y-8"
    >
      <h2 className="font-display font-bold text-xl text-neutral-200 tracking-tight flex items-center gap-2 mb-4">
        <BarChart3 size={18} className="text-cyan-400" />
        Dashboard Overview
      </h2>
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: BarChart3, value: stats.totalSessions, label: 'Total Analyses', color: 'text-cyan-300', bg: 'bg-cyan-400/10' },
          { icon: Bug, value: stats.standaloneSessionCount, label: 'Standalone Files', color: 'text-purple-300', bg: 'bg-purple-500/10' },
          { icon: CheckCircle, value: stats.folderSessionCount, label: 'Folder Analyses', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { icon: File, value: stats.repoSessionCount, label: 'Repo Analyses', color: 'text-amber-200', bg: 'bg-amber-200/10' },
          { icon: Folder, value: stats.totalIssuesFound.toLocaleString(), label: 'Total Issues', color: 'text-rose-400', bg: 'bg-rose-400/10' }
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={idx}
              whileHover={{ scale: 1.02, y: -2 }}
              className="p-5 rounded-3xl flex flex-col text-left group transition-all duration-300 relative overflow-hidden glass-card glass-card-hover justify-between h-36"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-white/[0.01] group-hover:bg-cyan-500/[0.02] rounded-bl-full transition-all duration-300" />
              <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center mb-3 border border-white/[0.02]`}>
                <Icon size={15} className={item.color} />
              </div>
              <div>
                <span className="font-display font-light text-3xl lg:text-4xl text-zinc-100 tracking-tight leading-none block">
                  {item.value}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-2 font-semibold block">
                  {item.label}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Line chart: Issues per project folder */}
      <div className="p-6 rounded-3xl glass-card space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-4 bg-cyan-400 rounded-full" />
          <h3 className="font-display font-medium text-sm tracking-tight text-zinc-100">
            Issues per Project Folder
          </h3>
        </div>

        {folderList.length === 0 ? (
          <div className="text-center py-10 text-neutral-500">
            <BarChart3 size={28} className="mx-auto text-zinc-600 mb-3" />
            <p className="text-xs font-sans">No data to chart yet.</p>
            <p className="text-[11px] text-zinc-600 font-mono mt-1">Run analyses to see issue distribution.</p>
          </div>
        ) : folderList.length === 1 && folderList[0] === '(Single Files)' ? (
          <div className="text-center py-10 text-neutral-500">
            <BarChart3 size={28} className="mx-auto text-zinc-600 mb-3" />
            <p className="text-xs font-sans">No folder scans available.</p>
            <p className="text-[11px] text-zinc-600 font-mono mt-1">Use the directory scan in workspace to see per-folder charts.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 10, fill: '#a1a1aa' }}
                axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#a1a1aa' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#0a0a0f',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#e4e4e7', marginBottom: 4 }}
              />
            {[...new Set(folderList)].map(folder => {
                if (folder === '(Single Files)') return null;
                return (
                    <Line
                      key={folder}
                      type="monotone"
                      dataKey={folder}
                      stroke={folderColorMap[folder]}
                      strokeWidth={3}
                      onClick={() => handleFolderNavigate(folder)}
                      style={{ cursor: 'pointer' }}
                    />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Folder legend with click navigation */}
        {folderList.length > 1 && (
          <div className="flex flex-wrap gap-3 pt-1">
              {[...new Set(folderList)].map(folder => {
                if (folder === '(Single Files)') return null;
                return (
                <button
                  key={folder}
                  onClick={() => handleFolderNavigate(folder)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-colors cursor-pointer text-[11px] font-mono text-zinc-300"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: folderColorMap[folder] }}
                  />
                  <span>{folder}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Analysis History: File Tree Structure */}
      <div className="p-6 rounded-3xl glass-card space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-4 bg-cyan-400 rounded-full" />
            <h3 className="font-display font-medium text-sm tracking-tight text-zinc-100">
              Analysis History
            </h3>
          </div>
          <span className="text-[10px] font-mono tracking-widest text-neutral-500 uppercase bg-zinc-900/50 px-2 py-1 border border-white/[0.02] rounded-md font-bold">
            {history.length} files
          </span>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-10 text-neutral-500">
            <FolderTree size={28} className="mx-auto text-zinc-600 mb-3" />
            <p className="text-xs font-sans">No analysis history yet.</p>
            <p className="text-[11px] text-zinc-600 font-mono mt-1">Run your first scan in the Scanner Workspace.</p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto pr-2 space-y-1">
            {(Object.entries(groupedScans) as [string, AnalysisResult[]][]).map(([folderName, files]) => {
              const isExpanded = !!expandedFolders[folderName];
              const issuesInFolder = files.reduce((s, f) => s + (f.summary?.total_issues || 0), 0);
              const treeNodes = buildFileTree(files, folderName === '(root)' ? undefined : folderName);
              return (
                <div key={folderName}>
                  <div
                    onClick={() => toggleFolder(folderName)}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/[0.015] cursor-pointer transition-colors group"
                  >
                    <ChevronRight
                      size={12}
                      className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <Folder size={14} className="text-purple-400 flex-shrink-0" />
                    <span className="font-mono text-xs font-semibold text-zinc-300 truncate">
                      {folderName}/
                    </span>
                    <span className="text-[9px] font-mono text-zinc-600 ml-auto">
                      {files.length} {(issuesInFolder > 0) ? `• ${issuesInFolder} issues` : '• clean'}
                    </span>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        {treeNodes.map((node, ni, arr) => (
                          <TreeNode
                            key={ni}
                            node={node}
                            depth={0}
                            onClick={(res) => handleSelectFile(res)}
                            connectorPrefix=""
                            isLast={ni === arr.length - 1}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence initial={false}>
          {selectedFile && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="pt-4 border-t border-white/[0.04] space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode size={14} className="text-cyan-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-zinc-200 truncate">
                      {selectedFile.filename}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500">
                      {selectedFile.summary.total_issues} issue{selectedFile.summary.total_issues === 1 ? '' : 's'} • {selectedFile.summary.health_score}% health
                    </div>
                  </div>
                </div>

              </div>

              {selectedFileError && (
                <div className="text-[11px] font-mono text-amber-300 bg-amber-500/5 border border-amber-400/10 rounded-lg px-3 py-2">
                  {selectedFileError}
                </div>
              )}

              {selectedFileLoading ? (
                <div className="h-[420px] rounded-xl border border-white/[0.035] bg-black/20 flex items-center justify-center text-zinc-500">
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Loading code viewer...
                </div>
              ) : (
                <div className="h-[420px]">
                  <CodeViewer
                    source={selectedFile._source_content || ''}
                    issues={selectedFile.issues || []}
                    filename={selectedFile.filename}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
export {};

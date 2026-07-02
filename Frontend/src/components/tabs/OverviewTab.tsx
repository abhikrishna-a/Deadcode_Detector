import { useMemo, useState, useCallback, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart3, Bug, CheckCircle, File, Folder, ChevronRight, FolderTree, FileCode, Loader2, MessageSquare } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AnalysisResult } from '../../types';
import { groupByTopLevelDir, buildHistoryTree } from '../../lib/fileTree';
import HistoryTreeNode from '../../lib/TreeComponents';
import CodeViewer from '../CodeViewer';
import { logger } from '../../lib/logger';
import { analysisAPI } from '../../api/analysis';

const FOLDER_COLORS = ['#06b6d4', '#8b5cf6', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#84cc16'];

const CATEGORIES = [
  { key: 'unused_import', label: 'Unused Imports', color: '#8b5cf6' },
  { key: 'unused_function', label: 'Unused Functions', color: '#ec4899' },
  { key: 'unused_variable', label: 'Unused Variables', color: '#3b82f6' },
  { key: 'unreachable_code', label: 'Unreachable Logic', color: '#f43f5e' },
  { key: 'commented_code', label: 'Commented Snippets', color: '#10b981' },
];

const healthColor = (score: number) => {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-rose-400';
};

interface OverviewTabProps {
  key?: string;
  user?: any;
  currentUser?: any;
  history: AnalysisResult[];
  onNavigateToWorkspace?: (analysisId: string, filename: string, scanFolder?: string) => void;
  onNavigateToChat?: (docId: string, filename: string) => void;
}

export default function OverviewTab({ history, onNavigateToWorkspace, onNavigateToChat, currentUser }: OverviewTabProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [expandedApps, setExpandedApps] = useState<Record<string, boolean>>({});
  const [expandedTreePaths, setExpandedTreePaths] = useState<Record<string, boolean>>({});
  const [inspectedFile, setInspectedFile] = useState<{
    id: string;
    filename: string;
    source_content: string;
    issues: any[];
    loading: boolean;
    error: string | null;
  } | null>(null);
  const inspectedFileRef = useRef<string | null>(null);

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
          sum + (
            f.summary?.categories?.[cat.key] ??
            f.issues?.filter(i => i.type === cat.key).length ??
            0
          ), 0
        );
      }
      return row;
    });
  }, [folderGroups]);

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

  const toggleAppGroup = (key: string) => {
    setExpandedApps(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleTreePath = (path: string, depth: number = 0) => {
    setExpandedTreePaths(prev => {
      if (!(path in prev)) return { ...prev, [path]: true };
      return { ...prev, [path]: !prev[path] };
    });
  };

  const handleInspectFile = useCallback(async (item: AnalysisResult) => {
    const id = item.document_id;
    inspectedFileRef.current = id;
    setInspectedFile({
      id,
      filename: item.filename,
      source_content: '',
      issues: [],
      loading: true,
      error: null,
    });

    if (item._source_content && item._source_content.trim()) {
      setInspectedFile({
        id,
        filename: item.filename,
        source_content: item._source_content,
        issues: item.issues || [],
        loading: false,
        error: null,
      });
      return;
    }

    if (!id) {
      setInspectedFile(prev => prev?.id === id ? { ...prev, loading: false, error: 'Source code not available.' } : prev);
      return;
    }

    try {
      const data = await analysisAPI.ragGetAnalysis(id);
      if (inspectedFileRef.current !== id) return;
      setInspectedFile({
        id,
        filename: data.filename || item.filename,
        source_content: data._source_content || '',
        issues: data.analysis?.issues || [],
        loading: false,
        error: null,
      });
    } catch {
      if (inspectedFileRef.current !== id) return;

      // Fallback: try Django analysis endpoints
      try {
        let match: any;
        if (item.scan_folder) {
          const folderData = await analysisAPI.analysisByFolder(item.scan_folder);
          match = folderData.items.find((i: any) => i.filename === item.filename);
        } else {
          const searchData = await analysisAPI.analysisHistory(1, 0, item.filename);
          match = searchData.items.find((i: any) => i.analysis_id === id);
        }
        if (match?.source_content) {
          setInspectedFile({
            id,
            filename: match.filename,
            source_content: match.source_content,
            issues: match.analysis?.issues || match.analysis_data?.issues || [],
            loading: false,
            error: null,
          });
          return;
        }
      } catch (err) {
        logger.warn('Failed to fallback-load Django analysis data:', err);
      }

      setInspectedFile(prev => prev?.id === id
        ? { ...prev, loading: false, error: 'Failed to load file details. The source may no longer be available.' }
        : prev
      );
    }
  }, []);

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
                <div
                  key={folder}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-colors text-[11px] font-mono text-zinc-300"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: folderColorMap[folder] }}
                  />
                  <span>{folder}</span>
                </div>
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
              const stripPrefix = folderName === '(root)' ? undefined : folderName;
              const processedFiles = stripPrefix
                ? files.map(f => {
                    const normPrefix = stripPrefix.replace(/\\/g, '/').replace(/\/?$/, '/');
                    const normName = f.filename.replace(/\\/g, '/');
                    return {
                      ...f,
                      filename: normName.startsWith(normPrefix) ? normName.slice(normPrefix.length) : normName,
                    };
                  })
                : files;
              const appGroups = groupByTopLevelDir(processedFiles);
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
                        {appGroups.map((ag, agIdx) => {
                          const appKey = `${folderName}:${ag.appName}`;
                          const isAppExpanded = !!expandedApps[appKey];
                          const treeNodes = buildHistoryTree(ag.items, ag.appName === 'Project Root' ? undefined : ag.appName);
                          const appIssues = ag.items.reduce((s, f) => s + (f.summary?.total_issues || 0), 0);
                          return (
                            <div key={ag.appName}>
                              <div
                                onClick={() => toggleAppGroup(appKey)}
                                className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg hover:bg-white/[0.015] cursor-pointer transition-colors group"
                              >
                                <ChevronRight
                                  size={10}
                                  className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${isAppExpanded ? 'rotate-90' : ''}`}
                                />
                                <Folder size={12} className="text-amber-400 flex-shrink-0" />
                                <span className="font-mono text-[11px] text-zinc-400 truncate group-hover:text-zinc-200 transition-colors">
                                  {ag.appName}/
                                </span>
                                <span className="font-mono text-[9px] text-zinc-600">
                                  {ag.items.length} {appIssues > 0 ? `• ${appIssues} issues` : '• clean'}
                                </span>
                              </div>
                              <AnimatePresence initial={false}>
                                {isAppExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden pl-3"
                                  >
                                    <div
                                      style={{
                                        background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.6), rgba(8, 8, 12, 0.7))',
                                        border: '1px solid rgba(255, 255, 255, 0.03)',
                                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
                                      }}
                                      className="rounded-lg overflow-hidden"
                                    >
                                      {treeNodes.map((node, ni, arr) => (
                                        <HistoryTreeNode<AnalysisResult>
                                          key={(node.file as AnalysisResult)?.document_id || node.name}
                                          node={node}
                                          depth={0}
                                          parentPath=""
                                          expandedTreePaths={expandedTreePaths}
                                          onToggle={toggleTreePath}
                                          connectorPrefix=""
                                          isLast={ni === arr.length - 1}
                                          renderFileRow={(file, nodeName) => (
                                            <>
                                              <button
                                                onClick={() => handleInspectFile(file)}
                                                className="text-xs font-mono text-zinc-300 hover:text-cyan-400 truncate max-w-[160px] text-left cursor-pointer transition-colors"
                                                title={file.filename}
                                              >
                                                {nodeName}
                                              </button>
                                              <span className={`text-[10px] font-mono ${healthColor(file.summary?.health_score ?? 100)}`}>
                                                {file.summary?.health_score ?? 100}%
                                              </span>
                                              <span className={`text-[10px] font-mono ${(file.summary?.total_issues || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                {(file.summary?.total_issues || 0) > 0 ? `${file.summary?.total_issues || 0} issues` : 'Clean'}
                                              </span>
                                              {onNavigateToChat && (
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); onNavigateToChat(file.document_id, file.filename); }}
                                                  className="p-1 rounded text-zinc-600 hover:text-cyan-400 hover:bg-cyan-500/5 transition-colors cursor-pointer ml-auto hidden sm:block"
                                                  title="Open in Chat"
                                                >
                                                  <MessageSquare size={11} />
                                                </button>
                                              )}
                                            </>
                                          )}
                                        />
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal overlay for file inspection */}
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
                ) : (
                  <div className="h-full">
                    <CodeViewer
                      source={inspectedFile.source_content}
                      issues={inspectedFile.issues}
                      filename={inspectedFile.filename}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
export {};

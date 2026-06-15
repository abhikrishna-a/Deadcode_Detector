import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart3, Bug, CheckCircle, File, Folder, ChevronRight, FolderTree } from 'lucide-react';
import { AnalysisResult } from '../../types';
import { TreeNodeData, buildFileTree } from '../../lib/fileTree';

function TreeNode({ node, depth, onClick }: { node: TreeNodeData; depth: number; onClick: (res: AnalysisResult) => void }) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (!node.isDir) {
    const health = node.file?.summary?.health_score ?? 100;
    const color = health > 85 ? '#10b981' : health > 60 ? '#f59e0b' : '#ef4444';
    return (
      <div
        onClick={() => node.file && onClick(node.file)}
        className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.015] cursor-pointer transition-colors group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1 h-1 rounded-full bg-violet-500 flex-shrink-0" />
          <span className="font-mono text-[11px] text-zinc-400 truncate max-w-[160px] group-hover:text-zinc-200 transition-colors">
            {node.name}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 flex-shrink-0">
          <span>{node.file?.metrics?.total_lines || 0} lines</span>
          <span className="font-bold w-12 text-right" style={{ color }}>{health}%</span>
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
            className="overflow-hidden ml-4 border-l border-white/[0.03] pl-2"
          >
            {node.children.map((child, i) => (
              <TreeNode key={i} node={child} depth={depth + 1} onClick={onClick} />
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
  onViewResult: (res: AnalysisResult) => void;
}

export default function OverviewTab({ history, onViewResult }: OverviewTabProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // 1. Calculate realistic aggregate statistics from scan history
  const stats = useMemo(() => {
    const totalScans = history.length;
    const totalIssues = history.reduce((sum, r) => sum + (r.summary?.total_issues || 0), 0);
    const cleanFiles = history.filter(r => (r.summary?.total_issues || 0) === 0).length;
    const totalLinesChecked = history.reduce((sum, r) => sum + (r.metrics?.total_lines || 0), 0);

    const folderSet = new Set<string>();
    history.forEach(r => {
      if (r.scan_folder) {
        folderSet.add(r.scan_folder);
      }
    });
    const uniqueFolders = folderSet.size || (history.length > 0 ? 1 : 0);

    return {
      totalScans,
      totalIssues,
      cleanFiles,
      totalLinesChecked,
      uniqueFolders
    };
  }, [history]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      unused_import: 0,
      unused_function: 0,
      unused_variable: 0,
      unreachable_code: 0,
      commented_code: 0
    };

    history.forEach(r => {
      if (r.issues) {
        r.issues.forEach(i => {
          const cat = i.type || 'commented_code';
          if (counts[cat] !== undefined) {
            counts[cat]++;
          }
        });
      }
    });

    return [
      { label: 'Unused Imports', count: counts.unused_import, color: '#8b5cf6' },
      { label: 'Unused Functions', count: counts.unused_function, color: '#ec4899' },
      { label: 'Unused Variables', count: counts.unused_variable, color: '#3b82f6' },
      { label: 'Unreachable Logic', count: counts.unreachable_code, color: '#f43f5e' },
      { label: 'Commented Snippets', count: counts.commented_code, color: '#10b981' }
    ];
  }, [history]);

  const totalIssuesCount = useMemo(() => categoryCounts.reduce((s, c) => s + c.count, 0), [categoryCounts]);

  const donutSegments = useMemo(() => {
    const total = totalIssuesCount || 1;
    let cumulative = 0;
    return categoryCounts.map(cat => {
      const percent = cat.count / total;
      const start = cumulative;
      cumulative += percent;
      return { ...cat, percent, startPercent: start };
    });
  }, [categoryCounts, totalIssuesCount]);

  // 3. Organizes reports by directories hierarchically
  const groupedScans = useMemo(() => {
    const folders: Record<string, AnalysisResult[]> = {};
    history.forEach(r => {
      const folderKey = r.scan_folder || '(root)';
      if (!folders[folderKey]) {
        folders[folderKey] = [];
      }
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.35 }}
      className="space-y-8"
    >
      {/* Upper Statistics row with customized glass sheets */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: BarChart3, value: stats.totalScans, label: 'Audit Runs', color: 'text-cyan-300', bg: 'bg-cyan-400/10' },
          { icon: Bug, value: stats.totalIssues, label: 'Orphaned Tokens', color: 'text-purple-300', bg: 'bg-purple-500/10' },
          { icon: CheckCircle, value: stats.cleanFiles, label: 'Compliant Runs', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { icon: File, value: stats.totalLinesChecked.toLocaleString(), label: 'Statements Scanned', color: 'text-amber-200', bg: 'bg-amber-200/10' },
          { icon: Folder, value: stats.uniqueFolders, label: 'Source Directives', color: 'text-rose-400', bg: 'bg-rose-400/10' }
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={idx}
              whileHover={{ scale: 1.02, y: -2 }}
              className="p-5 rounded-3xl flex flex-col text-left group transition-all duration-300 relative overflow-hidden glass-card glass-card-hover justify-between h-36"
            >
              {/* Inner ambient hovering background glow */}
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

      {/* Donut chart for Obsolete Code Structural Breakdown */}
      <div className="p-6 rounded-3xl glass-card space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-4 bg-cyan-400 rounded-full" />
          <h3 className="font-display font-medium text-sm tracking-tight text-zinc-100">
            Obsolete Code Structural Breakdown
          </h3>
          {totalIssuesCount > 0 && (
            <span className="text-[10px] font-mono text-zinc-500 ml-auto">
              {totalIssuesCount} total
            </span>
          )}
        </div>

        {totalIssuesCount === 0 ? (
          <div className="text-center py-10 text-neutral-500">
            <CheckCircle size={28} className="mx-auto text-zinc-600 mb-3" />
            <p className="text-xs font-sans">No issues detected yet.</p>
            <p className="text-[11px] text-zinc-600 font-mono mt-1">Run an analysis to see the breakdown.</p>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* SVG Donut */}
            <div className="relative flex-shrink-0">
              <svg width="180" height="180" viewBox="0 0 180 180">
                <circle cx="90" cy="90" r="72" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="18" />
                {donutSegments.map((seg, i) => {
                  const circumference = 2 * Math.PI * 72;
                  const dashLen = seg.percent * circumference;
                  const dashGap = circumference - dashLen;
                  const offset = -seg.startPercent * circumference;
                  return (
                    <motion.circle
                      key={i}
                      cx="90" cy="90" r="72"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="18"
                      strokeDasharray={`${dashLen} ${dashGap}`}
                      strokeDashoffset={offset}
                      transform="rotate(-90 90 90)"
                      strokeLinecap="round"
                      initial={{ strokeDasharray: `0 ${circumference}` }}
                      animate={{ strokeDasharray: `${dashLen} ${dashGap}` }}
                      transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                    />
                  );
                })}
                <circle cx="90" cy="90" r="52" fill="#060608" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-lg font-display font-bold text-zinc-100">{totalIssuesCount}</span>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-3 flex-1 w-full">
              {donutSegments.map((seg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="flex items-center justify-between py-1.5"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span className="text-xs text-zinc-300 font-medium">{seg.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono text-zinc-400">{seg.count}</span>
                    <span className="text-[10px] font-mono text-zinc-600 w-10 text-right">
                      {Math.round(seg.percent * 100)}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
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
              // Build sub-tree from filename paths
              const treeNodes = buildFileTree(files);
              return (
                <div key={folderName}>
                  {/* Root folder node */}
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

                  {/* Tree children */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden ml-5 border-l border-white/[0.04] pl-3"
                      >
                        {treeNodes.map((node, ni) => (
                          <TreeNode
                            key={ni}
                            node={node}
                            depth={0}
                            onClick={onViewResult}
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
      </div>

    </motion.div>
  );
}
export {};

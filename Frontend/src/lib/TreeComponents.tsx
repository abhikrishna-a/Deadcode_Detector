import { useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Folder, FolderOpen, FileCode } from 'lucide-react';
import type { HistoryTreeNodeData } from './fileTree';

export { type HistoryTreeNodeData };

export function connectorSpan(prefix: string): React.ReactNode {
  return (
    <span className="font-mono text-zinc-600 text-[10px] select-none flex-shrink-0 leading-none">
      {prefix}
    </span>
  );
}

export function childConnectorPrefix(parentPrefix: string, parentIsLast: boolean): string {
  return parentPrefix + (parentIsLast ? '    ' : '│   ');
}

export interface HistoryTreeNodeProps<T> {
  node: HistoryTreeNodeData<T>;
  depth: number;
  parentPath: string;
  expandedTreePaths: Record<string, boolean>;
  onToggle: (path: string, depth: number) => void;
  renderFileRow: (file: T, nodeName: string) => React.ReactNode;
  connectorPrefix?: string;
  isLast?: boolean;
  renderFileIcon?: (node: HistoryTreeNodeData<T>) => React.ReactNode;
}

export default function HistoryTreeNode<T>({
  node, depth, parentPath, expandedTreePaths, onToggle,
  renderFileRow,
  connectorPrefix = '', isLast = true, renderFileIcon,
}: HistoryTreeNodeProps<T>) {
  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const isExpanded = expandedTreePaths[fullPath] ?? false;
  const branch = isLast ? '└── ' : '├── ';

  const handleToggle = useCallback(() => onToggle(fullPath, depth), [fullPath, depth, onToggle]);

  if (!node.isDir && node.file !== undefined) {
    return (
      <div className="flex items-center gap-2 px-6 py-2 hover:bg-white/[0.01] transition-colors border-t border-white/[0.02]">
        {connectorSpan(connectorPrefix + branch)}
        {renderFileIcon ? renderFileIcon(node) : <FileCode size={11} className="text-violet-400/70 flex-shrink-0" />}
        {renderFileRow(node.file, node.name)}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 w-full px-6 py-2.5 hover:bg-white/[0.01] transition-colors text-left cursor-pointer border-t border-white/[0.02]"
      >
        {connectorSpan(connectorPrefix + branch)}
        <ChevronRight
          size={10}
          onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
        />
        {isExpanded ? (
          <FolderOpen size={12} className="text-purple-400 flex-shrink-0" />
        ) : (
          <Folder size={12} className="text-purple-400 flex-shrink-0" />
        )}
        <span className="text-xs font-mono text-zinc-400 truncate">{node.name}/</span>
        <span className="text-[9px] font-mono text-zinc-600">({node.children.length})</span>
        {node.meta?.total_issues !== undefined && node.meta.total_issues > 0 && (
          <span className="text-[8px] font-mono text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded ml-1">
            {node.meta.total_issues} issues
          </span>
        )}
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
                key={child.file !== undefined ? String((child.file as any)?.analysis_id || (child.file as any)?.document_id || i) : child.name}
                node={child}
                depth={depth + 1}
                parentPath={fullPath}
                expandedTreePaths={expandedTreePaths}
                onToggle={onToggle}
                renderFileRow={renderFileRow}
                renderFileIcon={renderFileIcon}
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

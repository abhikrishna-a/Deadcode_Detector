import { useState, useMemo } from 'react';
import { Issue } from '../types';

interface CodeViewerProps {
  source: string;
  issues: Issue[];
  filename: string;
}

export default function CodeViewer({ source, issues, filename }: CodeViewerProps) {
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  // Group issues by line number for fast gutter checks
  const lineIssueMap = useMemo(() => {
    const map: Record<number, Issue[]> = {};
    issues.forEach(issue => {
      const line = issue.line || issue.line_start || 1;
      const end = issue.line_end || line;
      for (let l = line; l <= end; l++) {
        if (!map[l]) {
          map[l] = [];
        }
        map[l].push(issue);
      }
    });
    return map;
  }, [issues]);

  const lines = useMemo(() => {
    if (!source) {
      return ['# Standard procedural file placeholder', 'import os', 'import sys', ''];
    }
    const list = source.split('\n');
    if (list.length > 0 && list[list.length - 1] === '') {
      list.pop();
    }
    return list;
  }, [source]);

  const fileExtension = filename.split('.').pop() || 'py';

  return (
    <div 
      style={{
        background: 'rgba(9, 8, 12, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.035)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.02)'
      }}
      className="rounded-xl overflow-hidden font-mono text-xs flex flex-col max-h-[460px]"
    >
      {/* Code Header Tab bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.03] bg-zinc-950/40">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          <span className="text-[11px] text-zinc-400 font-semibold">{filename}</span>
        </div>
        <span className="text-[10px] text-zinc-600 uppercase font-mono">{lines.length} Lines</span>
      </div>

      {/* Code viewport container */}
      <div className="overflow-y-auto overflow-x-auto flex-1 p-3 space-y-px">
        {lines.map((codeText, index) => {
          const lineNum = index + 1;
          const listIssues = lineIssueMap[lineNum] || [];
          const isHovered = hoveredLine === lineNum;

          // Color tags
          const hasUnused = listIssues.some(i => i.type.includes('unused') || i.type === 'unreachable_code');

          let gutterBorder = 'border-transparent';
          let lineBg = 'transparent';
          let textColor = 'text-zinc-400';

          if (hasUnused) {
            gutterBorder = 'border-rose-500/50';
            lineBg = isHovered ? 'bg-rose-500/10' : 'bg-rose-500/5';
            textColor = 'text-zinc-200';
          } else if (listIssues.length > 0) {
            gutterBorder = 'border-amber-400/40';
            lineBg = isHovered ? 'bg-amber-400/10' : 'bg-amber-400/5';
            textColor = 'text-zinc-300';
          } else if (isHovered) {
            lineBg = 'bg-white/[0.02]';
          }

          return (
            <div
              key={lineNum}
              onMouseEnter={() => setHoveredLine(lineNum)}
              onMouseLeave={() => setHoveredLine(null)}
              className={`flex items-center h-5 w-full transition-all group duration-100 ${lineBg}`}
            >
              {/* Line Gutter counter */}
              <div 
                className={`w-9 text-right pr-2.5 select-none font-mono text-[10px] border-r-2 text-neutral-600 ${gutterBorder}`}
              >
                {lineNum}
              </div>

              {/* Code content statement */}
              <div className={`flex-1 pl-3 font-mono whitespace-pre ${textColor}`}>
                {codeText || ' '}
              </div>

              {/* Custom micro issue badge display next to hovering line */}
              {isHovered && listIssues.length > 0 && (
                <div className="flex gap-1.5 pr-2 flex-shrink-0 animate-fade-in font-mono text-[9px] uppercase scale-90">
                  {listIssues.slice(0, 1).map((issue, idx) => (
                    <span 
                      key={idx} 
                      className={`px-1.5 py-0.5 rounded font-bold border ${
                        issue.type === 'unused_function' || issue.type === 'unreachable_code'
                          ? 'text-rose-400 bg-rose-500/10 border-rose-500/25'
                          : 'text-amber-400 bg-amber-400/10 border-amber-400/25'
                      }`}
                    >
                      {issue.type.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

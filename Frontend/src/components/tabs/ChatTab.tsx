import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, FileCode, Search, Terminal, Folder, ChevronRight, AlertOctagon, ExternalLink } from 'lucide-react';
import { AnalysisResult, ChatMessage, Issue } from '../../types';
import { analysisAPI } from '../../api/analysis';
import { TreeNodeData, buildFileTree, groupByTopLevelDir } from '../../lib/fileTree';

function renderContentWithCitations(text: string): React.ReactNode {
  const parts = text.split(/(\[(?:File|Source|Line|L)\s*:?\s*[^\]]+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/\[(?:File|Source|Line|L)\s*:?\s*([^\]]+)\]/i);
    if (match) {
      return (
        <span key={i}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 border border-cyan-400/20 text-cyan-400 cursor-help mx-0.5"
          title={match[1].trim()}
        >
          <ExternalLink size={8} />
          {match[1].trim()}
        </span>
      );
    }
    return part;
  });
}

interface ChatTabProps {
  key?: string;
  history: AnalysisResult[];
  initialDocId?: string;
  initialFilename?: string;
}

export default function ChatTab({ history, initialDocId, initialFilename }: ChatTabProps) {
  const [selectedDoc, setSelectedDoc] = useState<AnalysisResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Synchronize initial selections from Overview/Analyzer workspace triggers
  useEffect(() => {
    if (initialDocId) {
      const found = history.find(r => r.document_id === initialDocId);
      if (found) {
        setSelectedDoc(found);
      } else {
        (async () => {
          try {
            const data = await analysisAPI.ragGetAnalysis(initialDocId);
            const issues: Issue[] = (data.analysis?.issues || []).map((i: any, idx: number) => ({
              id: i.id || `GC-${idx}`,
              type: i.type || i.category || 'unused_import',
              name: i.name || null,
              file: data.filename,
              line: i.line_start || i.line || 1,
              line_start: i.line_start || i.line || 1,
              line_end: i.line_end || i.line || 1,
              description: i.description || '',
              code_snippet: i.code_snippet || '',
              suggestion: i.suggestion || '',
              confidence: i.confidence ?? 0.9,
              safe_to_remove: i.safe_to_remove ?? true,
            }));
            setSelectedDoc({
              document_id: data.analysis_id,
              filename: data.filename,
              summary: {
                total_issues: issues.length,
                severity_counts: data.analysis?.summary?.severity_counts || { high: 0, medium: 0, low: 0 },
                categories: data.analysis?.summary?.categories || {},
                overall_health: data.analysis?.summary?.overall_health || 'clean',
                health_score: data.analysis?.summary?.health_score ?? 100,
              },
              issues,
              metrics: data.analysis?.metrics || {
                total_lines: 0, code_lines: 0, comment_lines: 0, blank_lines: 0,
                dead_lines_estimate: 0, dead_code_percentage: 0,
              },
              refactor_hints: data.analysis?.refactor_hints || [],
              scan_type: 'single',
            } as AnalysisResult);
          } catch {
            setSelectedDoc({
              document_id: initialDocId,
              filename: initialFilename || '',
              summary: { total_issues: 0,               severity_counts: { high: 0, medium: 0, low: 0 }, categories: {}, overall_health: 'unknown', health_score: 0 },
              issues: [],
              metrics: { total_lines: 0, code_lines: 0, comment_lines: 0, blank_lines: 0, dead_lines_estimate: 0, dead_code_percentage: 0 },
              scan_type: 'single',
            } as AnalysisResult);
          }
        })();
      }
    } else if (initialFilename) {
      const found = history.find(r => r.filename === initialFilename);
      if (found) setSelectedDoc(found);
    } else if (history.length > 0 && !selectedDoc) {
      setSelectedDoc(history[0]);
    }
  }, [initialDocId, initialFilename, history]);

  // Reset chat thread when the user switches targeted file
  useEffect(() => {
    if (selectedDoc) {
      setMessages([
        {
          role: 'assistant',
          content: `Connection confirmed. I have parsed the static AST report for "${selectedDoc.filename.split('/').pop()}". How can I support your refactoring or review of the identified warnings?`
        }
      ]);
    }
  }, [selectedDoc]);

  // Scroll handler to keep conversation tracking active
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const filteredDocs = useMemo(() => {
    if (!searchQuery) return history;
    const q = searchQuery.toLowerCase();
    return history.filter(h => h.filename.toLowerCase().includes(q));
  }, [history, searchQuery]);

  const unifiedTree = useMemo(() => {
    const groups: Record<string, AnalysisResult[]> = {};
    filteredDocs.forEach(doc => {
      const key = doc.scan_folder || '__single__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(doc);
    });
    return Object.entries(groups).map(([folderName, docs]) => {
      const stripFolder = folderName === '__single__' ? undefined : folderName.replace(/\\/g, '/').replace(/\/?$/, '');
      const processed = stripFolder
        ? docs.map(d => ({
            ...d,
            filename: d.filename.startsWith(stripFolder + '/') ? d.filename.slice(stripFolder.length + 1) : d.filename,
          }))
        : docs;
      const appGroups = groupByTopLevelDir(processed);
      const children = appGroups.map(ag => ({
        name: ag.appName,
        isDir: true,
        children: buildFileTree(ag.items, ag.appName === 'Project Root' ? undefined : ag.appName),
        file: undefined,
        totalIssues: 0,
      }));
      return {
        name: folderName === '__single__' ? 'Single Files' : folderName,
        isDir: true,
        children,
        file: undefined,
        totalIssues: 0,
      };
    });
  }, [filteredDocs]);

  const [expandedTreePaths, setExpandedTreePaths] = useState<Record<string, boolean>>({});

  const toggleTreePath = (path: string) => {
    setExpandedTreePaths(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const renderTreeNode = (node: TreeNodeData, depth: number, parentPath: string) => {
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;

    if (!node.isDir) {
      const isSelected = selectedDoc?.document_id === node.file?.document_id;
      const nameOnly = node.name;
      return (
        <div
          key={fullPath}
          onClick={() => node.file && setSelectedDoc(node.file)}
          className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
            isSelected
              ? 'bg-cyan-400/10 text-cyan-300 border border-cyan-400/20'
              : 'hover:bg-white/[0.015] text-zinc-400 hover:text-zinc-200'
          }`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          {node.file?.error ? (
            <AlertOctagon size={10} className="text-rose-400 flex-shrink-0" />
          ) : (
            <FileCode size={10} className={isSelected ? 'text-cyan-400' : 'text-zinc-500 flex-shrink-0'} />
          )}
          <div className="min-w-0">
            <span className="font-mono text-[10px] truncate block">{nameOnly}</span>
            {!node.file?.error && (
              <span className={`text-[9px] font-mono ${(() => { const s = node.file?.summary?.health_score ?? 0; return s >= 85 ? 'text-emerald-400' : s >= 60 ? 'text-amber-400' : 'text-rose-400'; })()}`}>
                {node.file?.issues?.length || 0} issues • {node.file?.summary?.health_score || 0}%
              </span>
            )}
          </div>
        </div>
      );
    }

    const isExpanded = expandedTreePaths[fullPath] ?? false;
    return (
      <div key={fullPath}>
        <div
          onClick={() => setExpandedTreePaths(prev => ({ ...prev, [fullPath]: !(prev[fullPath] ?? false) }))}
          className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-white/[0.015] cursor-pointer transition-colors group"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <ChevronRight
            size={10}
            className={`text-zinc-600 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          />
          <Folder size={12} className="text-purple-400 flex-shrink-0" />
          <span className="font-mono text-[10px] text-zinc-500 truncate group-hover:text-zinc-300 transition-colors">
            {node.name}/
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
              {node.children.map(child => renderTreeNode(child, depth + 1, fullPath))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const triggerStreamingResponse = async (userPrompt: string) => {
    if (!selectedDoc) return;
    setIsTyping(true);

    setMessages(prev => [...prev, { role: 'user', content: userPrompt }]);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      for await (const chunk of analysisAPI.ragChat(selectedDoc.document_id, userPrompt, chatHistory)) {
        setMessages(prev => {
          const list = [...prev];
          if (list.length > 0) {
            const last = list[list.length - 1];
            list[list.length - 1] = { role: 'assistant', content: last.content + chunk };
          }
          return list;
        });
      }
    } catch {
      setMessages(prev => {
        const list = [...prev];
        if (list.length > 0) {
          list[list.length - 1] = {
            role: 'assistant',
            content: 'The analysis engine could not process your request. Please try again.'
          };
        }
        return list;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleMessageSend = (e: React.FormEvent) => {
    e.preventDefault();
    const txt = inputText.trim();
    if (!txt || isTyping) return;

    setInputText('');
    triggerStreamingResponse(txt);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 text-left h-[540px] md:h-[580px]"
    >
      {/* Search selection sidebar */}
      <div 
        className="w-full md:w-[260px] p-5 rounded-3xl flex flex-col space-y-4 glass-card"
      >
        <h2 className="font-display font-bold text-xl text-neutral-200 tracking-tight flex items-center gap-2">
          <MessageSquare size={18} className="text-cyan-400" />
          Inspector Source
        </h2>

        {/* Filters */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
            <Search size={12} />
          </span>
          <input
            type="text"
            placeholder="Search report file..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs text-zinc-300 bg-white/[0.01] border border-white/[0.06] focus:border-cyan-400/30 rounded-xl outline-none transition-all placeholder:text-zinc-500 font-sans"
          />
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
          {filteredDocs.length === 0 ? (
            <div className="text-center py-8 text-neutral-600 font-mono text-[10px]">
              No documents active
            </div>
          ) : (
            unifiedTree.map(node => renderTreeNode(node, 0, ''))
          )}
        </div>
      </div>

      {/* Main chat window */}
      <div 
        className="flex-1 rounded-3xl p-6 flex flex-col min-h-0 glass-card"
      >
        {selectedDoc ? (
          <>
            {/* Header info */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.04] mb-4">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-cyan-400" />
                <span className="text-xs font-mono font-medium text-zinc-300">
                  REF: {selectedDoc.filename}
                </span>
              </div>
              <span className="text-[9px] font-mono tracking-wider uppercase text-neutral-500 bg-white/[0.02] border border-white/[0.04] px-2 py-0.5 rounded-lg font-bold">
                AST_CONTEXT_ATTACHED
              </span>
            </div>

            {/* Bubble logs */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 select-text">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed font-sans border shadow-md ${
                      msg.role === 'user' 
                        ? 'bg-cyan-500/10 border-cyan-400/20 text-zinc-200' 
                        : 'bg-white/[0.01] border-white/[0.04] text-neutral-300'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">
                      {msg.role === 'assistant' ? renderContentWithCitations(msg.content) : msg.content}
                    </p>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-500 mt-1 uppercase tracking-widest px-1">
                    {msg.role === 'user' ? 'audit_lead' : 'inspec_kernel'}
                  </span>
                </div>
              ))}

              {isTyping && (
                <div className="flex flex-col items-start animate-pulse">
                  <div className="bg-white/[0.01] border border-white/[0.04] text-neutral-500 rounded-2xl p-4 text-xs font-mono italic">
                    Reading AST node values...
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message input triggers */}
            <form onSubmit={handleMessageSend} className="flex gap-2">
              <input
                required
                type="text"
                placeholder="Ask inspector, e.g., 'What dead code was found?'..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                className="flex-1 py-2.5 px-4 text-xs text-zinc-300 bg-white/[0.01] border border-white/[0.06] focus:border-cyan-400/40 rounded-xl outline-none transition-all placeholder:text-zinc-500 font-sans"
              />
              <button
                type="submit"
                disabled={isTyping}
                className="w-10 h-10 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-600 text-white flex items-center justify-center cursor-pointer transition-all disabled:opacity-40 shadow-lg shadow-cyan-500/10"
              >
                <Send size={14} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500">
            <MessageSquare size={32} className="text-zinc-700 mb-3 animate-pulse" />
            <p className="text-xs font-sans">No code node selected for inspector.</p>
            <p className="text-[11px] text-zinc-500 font-mono mt-1">Deploy analyses first, then activate inspector target.</p>
          </div>
        )}
      </div>

    </motion.div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Send, Folder, Trash2, Bot, User } from 'lucide-react';
import { analysisAPI } from '../../api/analysis';
import { User as UserType } from '../../types';

interface AIInspectorTabProps {
  currentUser: UserType;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIInspectorTab({ currentUser, onShowToast }: AIInspectorTabProps) {
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        let hist;
        try {
          hist = await analysisAPI.analysisHistory(500);
        } catch {
          hist = await analysisAPI.ragHistory(500);
        }
        const folderSet = new Set<string>();
        for (const item of hist.items) {
          if (item.scan_folder) folderSet.add(item.scan_folder);
        }
        const arr = Array.from(folderSet).sort();
        setFolders(arr);
        if (arr.length > 0) setSelectedFolder(arr[0]);
      } catch {
        // silent
      }
    })();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleFolderChange = (folder: string) => {
    setSelectedFolder(folder);
    setMessages([{
      role: 'assistant',
      content: `Folder "${folder}" selected. I have access to all analyzed code in this folder. Ask me anything about the code, dead code issues, or suggestions for improvement.`,
    }]);
  };

  const handleClear = () => {
    setMessages([]);
    setInputText('');
  };

  const triggerStreamingResponse = async (userPrompt: string) => {
    if (!selectedFolder) return;
    setIsTyping(true);

    setMessages(prev => [...prev, { role: 'user', content: userPrompt }]);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      for await (const chunk of analysisAPI.ragFolderChat(selectedFolder, userPrompt, chatHistory)) {
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
            content: 'The analysis engine could not process your request. Please try again.',
          };
        }
        return list;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const txt = inputText.trim();
    if (!txt || isTyping || !selectedFolder) return;
    setInputText('');
    triggerStreamingResponse(txt);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col min-h-0 text-left h-[calc(100vh-10rem)]"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center">
            <Bot size={16} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="font-display font-semibold text-sm text-zinc-100 tracking-tight">AI Inspector</h2>
            <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Folder-level code analysis</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 border border-white/[0.04] hover:border-rose-500/20 transition-all cursor-pointer"
          >
            <Trash2 size={10} />
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* Folder selector */}
        <div className="glass-card p-4 rounded-2xl">
          <label className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-semibold mb-2 block">
            <Folder size={10} className="inline mr-1 text-purple-400" />
            Scan Folder
          </label>
          {folders.length === 0 ? (
            <p className="text-[10px] font-mono text-zinc-600 italic">No analyzed folders found. Run an analysis first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {folders.map(f => (
                <button
                  key={f}
                  onClick={() => handleFolderChange(f)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all cursor-pointer ${
                    selectedFolder === f
                      ? 'bg-cyan-400/10 border border-cyan-400/20 text-cyan-300'
                      : 'bg-white/[0.02] border border-white/[0.04] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 glass-card rounded-2xl p-5 flex flex-col min-h-0">
          {selectedFolder ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3 select-text">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
                    <MessageSquare size={28} className="text-zinc-700 mb-2" />
                    <p className="text-xs font-sans">Select a folder above and ask a question</p>
                    <p className="text-[10px] font-mono text-zinc-600 mt-1">e.g. "What dead code issues exist?"</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center flex-shrink-0 mt-1">
                        <Bot size={10} className="text-cyan-400" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed font-sans border ${
                        msg.role === 'user'
                          ? 'bg-cyan-500/10 border-cyan-400/20 text-zinc-200'
                          : 'bg-white/[0.01] border-white/[0.04] text-neutral-300'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-400/20 flex items-center justify-center flex-shrink-0 mt-1">
                        <User size={10} className="text-purple-400" />
                      </div>
                    )}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot size={10} className="text-cyan-400" />
                    </div>
                    <div className="bg-white/[0.01] border border-white/[0.04] text-neutral-500 rounded-2xl p-3 text-xs font-mono italic animate-pulse">
                      Analyzing folder context...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  required
                  type="text"
                  placeholder="Ask about code in this folder..."
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
              <Folder size={32} className="text-zinc-700 mb-3" />
              <p className="text-xs font-sans">No folder selected</p>
              <p className="text-[10px] font-mono text-zinc-600 mt-1">Select a folder above to begin inspecting code.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

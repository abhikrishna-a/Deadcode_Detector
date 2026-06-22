import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  MessageSquare, Send, CheckCircle, User, Bot, Loader2,
} from 'lucide-react';
import { User as UserType } from '../../types';
import { analysisAPI } from '../../api/analysis';

interface TeamChatTabProps {
  currentUser: UserType;
}

export default function TeamChatTab({ currentUser }: TeamChatTabProps) {
  const [threads, setThreads] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const data = await analysisAPI.listThreads(false);
      setThreads(data.threads);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeId, threads]);

  const active = threads.find(t => t.id === activeId) || null;

  const handleSend = async (content?: string) => {
    const text = content ?? replyText.trim();
    if (!active || !text || sending) return;
    setSending(true);
    try {
      await analysisAPI.postMessage(active.id, text);
      setReplyText('');
      await load();
    } catch { /* ignore */ }
    setSending(false);
  };

  const handleResolve = async (id: number) => {
    await analysisAPI.resolveThread(id);
    setActiveId(null);
    await load();
  };

  const aiHint = active?.messages.find((m: any) => m.is_ai_hint);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex gap-4 h-[580px] text-left"
    >
      <div className="w-72 glass-card rounded-2xl flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
          <MessageSquare size={14} className="text-cyan-400" />
          <span className="text-xs font-semibold text-zinc-300">Open Threads</span>
          <span className="ml-auto text-[10px] text-zinc-500 font-mono">{threads.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.02]">
          {threads.length === 0 ? (
            <div className="p-6 text-center text-zinc-500 text-xs">No open threads.</div>
          ) : threads.map(t => (
            <button key={t.id} onClick={() => setActiveId(t.id)}
              className={`w-full text-left px-4 py-3 transition-all cursor-pointer ${
                activeId === t.id ? 'bg-cyan-400/5' : 'hover:bg-white/[0.01]'
              }`}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-cyan-400">{t.issue_id}</span>
                <span className="text-[9px] text-zinc-600 ml-auto">
                  {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-[11px] text-zinc-300 truncate mt-1">{t.filename}</div>
              <div className="text-[9px] text-zinc-500 mt-0.5">by {t.created_by.username}</div>
              {t.messages.length > 1 && (
                <div className="text-[9px] text-zinc-600 mt-1">{t.messages.length} messages</div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs gap-2">
            <MessageSquare size={18} className="text-zinc-700" />
            Select a thread to view
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-300">{active.filename}</span>
                <span className="ml-2 text-[9px] font-mono text-zinc-500 bg-white/[0.02] px-1.5 py-0.5 rounded">{active.issue_id}</span>
                <span className="ml-2 text-[9px] text-zinc-600 font-mono">by {active.created_by.username}</span>
              </div>
              <button onClick={() => handleResolve(active.id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold border border-emerald-400/20 text-emerald-400 hover:bg-emerald-400/5 transition-all cursor-pointer">
                <CheckCircle size={10} /> Resolve
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {active.messages.map((m: any) => (
                <div key={m.id} className={`flex gap-3 ${m.author_id === currentUser.id ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                    m.is_ai_hint ? 'bg-purple-500/10 text-purple-400' : 'bg-cyan-500/10 text-cyan-400'
                  }`}>
                    {m.is_ai_hint ? <Bot size={12} /> : <User size={12} />}
                  </div>
                  <div className={`max-w-[75%] rounded-2xl p-3 text-xs border ${
                    m.author_id === currentUser.id
                      ? 'bg-cyan-500/10 border-cyan-400/20'
                      : m.is_ai_hint
                        ? 'bg-purple-500/5 border-purple-400/10'
                        : 'bg-white/[0.01] border-white/[0.04]'
                  }`}>
                    {m.is_ai_hint && (
                      <div className="text-[9px] text-purple-400 font-mono mb-1 flex items-center gap-1">
                        <Bot size={9} /> AI SUGGESTED ANSWER
                      </div>
                    )}
                    <p className="whitespace-pre-wrap text-zinc-300 leading-relaxed">{m.content}</p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="px-5 py-3 border-t border-white/[0.04] space-y-2">
              {aiHint && active.messages.length <= 2 && (
                <div className="flex gap-2">
                  <button onClick={() => handleSend(aiHint.content)}
                    className="flex-1 py-2 px-4 rounded-xl text-[10px] font-semibold bg-emerald-500/10 border border-emerald-400/20 text-emerald-400 hover:bg-emerald-500/15 transition-all cursor-pointer">
                    Approve AI Answer &rarr;
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input value={replyText} onChange={e => setReplyText(e.target.value)}
                  placeholder={aiHint ? 'Or type a custom response...' : 'Type your reply...'}
                  className="flex-1 py-2 px-3 text-xs text-zinc-300 bg-white/[0.01] border border-white/[0.06] focus:border-cyan-400/40 rounded-xl outline-none"
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button onClick={() => handleSend()} disabled={sending || !replyText.trim()}
                  className="w-9 h-9 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-600 text-white flex items-center justify-center disabled:opacity-40 cursor-pointer flex-shrink-0">
                  {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

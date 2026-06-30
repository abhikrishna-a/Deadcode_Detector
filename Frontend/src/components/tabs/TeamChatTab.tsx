import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  MessageSquare, Send, Hash, Folder, Loader2, Plus,
  CheckCheck, RefreshCw,
} from 'lucide-react';
import { User as UserType } from '../../types';
import { analysisAPI } from '../../api/analysis';
import { useChatSocket, ConnectionStatus } from '../../hooks/useChatSocket';
import { timeAgo } from '../../lib/time';
import { Skeleton } from '../ui/Skeleton';

interface TeamChatTabProps {
  currentUser: UserType;
}

interface ChatMsg {
  id: number;
  author_id: number;
  author_username: string;
  content: string;
  created_at: string;
}

interface RoomData {
  id: number;
  name: string;
  scan_folder: string | null;
  created_by: string;
  created_at: string;
  message_count: number;
  last_message: { content: string; author_username: string; created_at: string } | null;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export default function TeamChatTab({ currentUser }: TeamChatTabProps) {
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [activeRoom, setActiveRoom] = useState<string>('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [scanFolders, setScanFolders] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const pendingTxRef = useRef(false);
  const loadRoomsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deliveredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<number, string>>(new Map());

  const { connect, disconnect, sendMessage, sendTyping, sendStopTyping, connectionStatus } = useChatSocket();

  const loadRooms = async () => {
    try {
      const data = await analysisAPI.listChatRooms();
      setRooms(Array.isArray(data) ? data : data.rooms || []);
    } catch { /* ignore */ }
    setLoadingRooms(false);
  };

  const loadScanFolders = async () => {
    try {
      const result = await analysisAPI.ragHistory(200, 0);
      const items = Array.isArray(result) ? result : result.items || [];
      const folders = new Set<string>();
      for (const item of items) {
        if (item.scan_folder) folders.add(item.scan_folder);
      }
      const arr = Array.from(folders).sort();
      setScanFolders(arr);
      if (arr.length === 0) {
        setTimeout(async () => {
          try {
            const retry = await analysisAPI.ragHistory(200, 0);
            const retryItems = Array.isArray(retry) ? retry : retry.items || [];
            const retryFolders = new Set<string>();
            for (const item of retryItems) {
              if (item.scan_folder) retryFolders.add(item.scan_folder);
            }
            setScanFolders(Array.from(retryFolders).sort());
          } catch { /* ignore */ }
        }, 2000);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadRooms();
    loadScanFolders();
  }, []);

  const debouncedReloadRooms = () => {
    if (loadRoomsTimerRef.current) clearTimeout(loadRoomsTimerRef.current);
    loadRoomsTimerRef.current = setTimeout(loadRooms, 2000);
  };

  const handleRoomSelect = async (roomName: string) => {
    setActiveRoom(roomName);
    setMessages([]);
    setLoadingMsgs(true);

    disconnect();
    try {
      const data = await analysisAPI.getRoomMessages(roomName, undefined, 50);
      setMessages(data.messages || []);
    } catch { /* ignore */ }
    setLoadingMsgs(false);

    connect(roomName, (msg) => {
      if (msg.type === 'chat_message') {
        setMessages(prev => [...prev, {
          id: msg.id,
          author_id: msg.author_id,
          author_username: msg.author_username,
          content: msg.content,
          created_at: msg.created_at,
        }]);
        if (msg.author_id === currentUser.id) {
          pendingTxRef.current = false;
          setSending(false);
          setDelivered(true);
          if (deliveredTimerRef.current) clearTimeout(deliveredTimerRef.current);
          deliveredTimerRef.current = setTimeout(() => setDelivered(false), 2000);
        }
        setTypingUsers(prev => { const m = new Map(prev); m.delete(msg.author_id); return m; });
        debouncedReloadRooms();
      } else if (msg.type === 'typing') {
        if (msg.author_id !== currentUser.id) {
          setTypingUsers(prev => { const m = new Map(prev); m.set(msg.author_id, msg.author_username); return m; });
        }
      } else if (msg.type === 'stop_typing') {
        setTypingUsers(prev => { const m = new Map(prev); m.delete(msg.author_id); return m; });
      }
    });
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (value: string) => {
    setInputText(value);
    if (!activeRoom) return;
    if (typingThrottleRef.current) clearTimeout(typingThrottleRef.current);
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    sendTyping();
    typingThrottleRef.current = setTimeout(() => { }, 3000);
    typingStopRef.current = setTimeout(() => {
      sendStopTyping();
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (deliveredTimerRef.current) clearTimeout(deliveredTimerRef.current);
      if (typingThrottleRef.current) clearTimeout(typingThrottleRef.current);
      if (typingStopRef.current) clearTimeout(typingStopRef.current);
    };
  }, []);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || sending || !activeRoom) return;
    setSending(true);
    setDelivered(false);
    pendingTxRef.current = true;
    sendMessage(text);
    setInputText('');
    setTimeout(() => {
      if (pendingTxRef.current) {
        pendingTxRef.current = false;
        setSending(false);
      }
    }, 5000);
  };

  const handleCreateRoom = async (folder: string) => {
    try {
      const room = await analysisAPI.createChatRoom(folder, folder);
      if (room.id) {
        await loadRooms();
        handleRoomSelect(folder);
      }
    } catch { /* ignore */ }
  };

  const existingRoomNames = useMemo(() => new Set(rooms.map(r => r.name)), [rooms]);
  const availableFolders = scanFolders.filter(f => !existingRoomNames.has(f));

  const activeRoomData = rooms.find(r => r.name === activeRoom);

  const statusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return <span className="text-emerald-400 text-[8px]">● Connected</span>;
      case 'connecting':
        return <span className="text-amber-400 text-[8px] animate-pulse">● Connecting...</span>;
      default:
        return <span className="text-zinc-600 text-[8px]">● Disconnected</span>;
    }
  };

  const isSameGroup = (prev: ChatMsg | undefined, curr: ChatMsg): boolean => {
    if (!prev) return false;
    if (prev.author_id !== curr.author_id) return false;
    const diff = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
    return diff < FIVE_MINUTES_MS;
  };

  const sendIcon = () => {
    if (sending) return <Loader2 size={12} className="animate-spin" />;
    if (delivered) return <CheckCheck size={12} />;
    return <Send size={12} />;
  };

  const sendButtonColor = delivered ? 'from-emerald-400 to-emerald-600' : 'from-cyan-400 to-purple-600';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex gap-4 h-[580px] text-left"
    >
      {/* Room list sidebar */}
      <div className="w-72 glass-card rounded-2xl flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
          <MessageSquare size={14} className="text-cyan-400" />
          <span className="text-xs font-semibold text-zinc-300">Chat Rooms</span>
          <span className="ml-auto text-[10px] text-zinc-500 font-mono">{rooms.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.02]">
          {loadingRooms ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-7 h-7 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : rooms.length === 0 && availableFolders.length === 0 ? (
            <div className="p-6 text-center text-zinc-500 text-xs">
              No rooms yet. Scan a folder to create one.
            </div>
          ) : (
            <>
              {rooms.map(r => (
                <button
                  key={r.id}
                  onClick={() => handleRoomSelect(r.name)}
                  className={`w-full text-left px-4 py-3 transition-all cursor-pointer ${
                    activeRoom === r.name ? 'bg-cyan-400/5' : 'hover:bg-white/[0.01]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Hash size={10} className="text-cyan-400 flex-shrink-0" />
                    <span className="text-xs font-mono text-zinc-200 truncate">{r.name}</span>
                    <span className="text-[9px] text-zinc-600 ml-auto font-mono">{r.message_count}</span>
                  </div>
                  {r.last_message && (
                    <div className="text-[9px] text-zinc-500 truncate mt-1 ml-4">
                      {r.last_message.author_username}: {r.last_message.content}
                    </div>
                  )}
                </button>
              ))}
              {availableFolders.length > 0 && (
                <div className="px-4 py-2 border-t border-white/[0.04]">
                  <div className="text-[9px] text-zinc-600 font-mono mb-2 uppercase tracking-wider flex items-center gap-2">
                    Available scan folders
                    <button
                      onClick={loadScanFolders}
                      className="text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                      title="Refresh folders"
                    >
                      <RefreshCw size={10} />
                    </button>
                  </div>
                  {availableFolders.map(f => (
                    <button
                      key={f}
                      onClick={() => handleCreateRoom(f)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02] transition-all cursor-pointer"
                    >
                      <Folder size={10} className="text-purple-400 flex-shrink-0" />
                      <span className="truncate">{f}</span>
                      <Plus size={10} className="ml-auto text-zinc-600" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">
        {!activeRoom ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs gap-2">
            <MessageSquare size={18} className="text-zinc-700" />
            Select a room to start chatting
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2">
              <Hash size={12} className="text-cyan-400" />
              <span className="text-xs font-semibold text-zinc-300">{activeRoom}</span>
              {activeRoomData?.scan_folder && (
                <span className="text-[9px] text-zinc-600 font-mono bg-white/[0.02] px-1.5 py-0.5 rounded">
                  {activeRoomData.scan_folder}
                </span>
              )}
              <div className="ml-auto flex items-center gap-3">
                {statusBadge()}
                <span className="text-[9px] text-zinc-600 font-mono">
                  {messages.length} messages
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-1">
              {loadingMsgs ? (
                <div className="space-y-4 py-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={`flex gap-3 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
                      <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
                      <div className={`space-y-1.5 ${i % 2 === 0 ? 'items-end' : ''}`}>
                        <Skeleton className="h-8 w-40 rounded-2xl" />
                        <Skeleton className="h-2 w-12" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-zinc-500 text-xs">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((m, idx) => {
                  const prev = idx > 0 ? messages[idx - 1] : undefined;
                  const grouped = isSameGroup(prev, m);
                  return (
                    <div
                      key={m.id}
                      className={`flex gap-3 ${m.author_id === currentUser.id ? 'flex-row-reverse' : ''} ${grouped ? 'mt-0.5' : 'mt-2'}`}
                    >
                      {!grouped && (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 bg-cyan-500/10 text-cyan-400">
                          {m.author_username[0].toUpperCase()}
                        </div>
                      )}
                      {grouped && <div className="w-7 flex-shrink-0" />}
                      <div className="max-w-[75%]">
                        {!grouped && m.author_id !== currentUser.id && (
                          <div className="text-[9px] text-cyan-400 font-mono mb-0.5 ml-1">{m.author_username}</div>
                        )}
                        <div
                          className={`rounded-2xl p-3 text-xs border ${
                            m.author_id === currentUser.id
                              ? 'bg-cyan-500/10 border-cyan-400/20'
                              : 'bg-white/[0.01] border-white/[0.04]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-zinc-300 leading-relaxed">{m.content}</p>
                        </div>
                        <div className={`flex mt-0.5 ${m.author_id === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-[8px] text-zinc-600 font-mono">{timeAgo(m.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            {typingUsers.size > 0 && (
              <div className="px-5 py-1.5 border-t border-white/[0.02]">
                <div className="flex items-center gap-2 text-[9px] text-zinc-500 font-mono animate-pulse">
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  {Array.from(typingUsers.values()).join(', ')} typing...
                </div>
              </div>
            )}
            <div className="px-5 py-3 border-t border-white/[0.04]">
              <div className="flex gap-2">
                <input
                  value={inputText}
                  onChange={e => handleInputChange(e.target.value)}
                  placeholder={`Message #${activeRoom}...`}
                  className="flex-1 py-2 px-3 text-xs text-zinc-300 bg-white/[0.01] border border-white/[0.06] focus:border-cyan-400/40 rounded-xl outline-none"
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  onBlur={() => { if (typingUsers.size > 0) sendStopTyping(); }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !inputText.trim()}
                  className={`w-9 h-9 rounded-xl bg-gradient-to-r ${sendButtonColor} text-white flex items-center justify-center disabled:opacity-40 cursor-pointer flex-shrink-0 transition-all`}
                >
                  {sendIcon()}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

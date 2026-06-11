import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { analysisAPI } from '../../../api/analysis';

const docRowStyle = (selected) => ({
  background: selected ? 'rgba(5,150,105,0.08)' : 'transparent',
  border: selected
    ? '1px solid rgba(5,150,105,0.35)'
    : '1px solid #44403c',
  borderRadius: 10,
  padding: '12px 14px',
  cursor: 'pointer',
  transition: 'all 0.2s',
});

const extColor = (lang) => {
  const m = {
    python: '#3572A5',
    javascript: '#f7df1e',
    typescript: '#3178c6',
    jsx: '#61dafb',
    tsx: '#3178c6',
  };
  return m[lang?.toLowerCase()] || '#6b7280';
};

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default function ChatTab({ initialDocumentId, initialFilename }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const autoSelectDone = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    (async () => {
      setLoadingDocs(true);
      try {
        const docs = await analysisAPI.ragListDocuments();
        setDocuments(docs);
        if (initialDocumentId && !autoSelectDone.current) {
          const match = docs.find(d => d.id === initialDocumentId);
          if (match) {
            setSelectedDoc(match);
            autoSelectDone.current = true;
          }
        }
      } catch (err) {
        setError(err.message || 'Failed to load documents');
      } finally {
        setLoadingDocs(false);
      }
    })();
  }, [initialDocumentId]);

  const handleSelectDoc = (doc) => {
    setSelectedDoc(doc);
    setMessages([]);
  };

  const handleSend = async () => {
    const q = input.trim();
    if (!q || !selectedDoc || streaming) return;

    setInput('');
    const userMsg = { role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const assistantMsg = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      for await (const delta of analysisAPI.ragChat(selectedDoc.id, q, history)) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + delta };
          }
          return updated;
        });
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          updated.pop();
        }
        return updated;
      });
      setToast({ message: err.message || 'Chat failed', type: 'error' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start', height: 'calc(100vh - 180px)' }}>
        {/* Document sidebar */}
        <div style={{
          background: '#1c1917',
          border: '1px solid #44403c',
          borderRadius: 16,
          padding: 20,
          height: '100%',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <p style={{
            fontSize: 11, color: '#34d399', fontFamily: "'Inter', sans-serif",
            fontWeight: 600, letterSpacing: 0.5, marginBottom: 6,
          }}>
            DOCUMENTS ({documents.length})
          </p>

          {loadingDocs && (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: '#78716c', fontFamily: "'Inter', sans-serif" }}>Loading...</p>
            </div>
          )}

          {!loadingDocs && documents.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: '#78716c', fontFamily: "'Inter', sans-serif" }}>
                No documents yet.
              </p>
              <p style={{ fontSize: 11, color: '#57534e', marginTop: 4 }}>
                Analyze a file first.
              </p>
            </div>
          )}

          {!loadingDocs && documents.map((doc) => {
            const isSelected = selectedDoc?.id === doc.id;
            return (
              <div
                key={doc.id}
                style={docRowStyle(isSelected)}
                onClick={() => handleSelectDoc(doc)}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = '#353230';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: extColor(doc.language),
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 13, color: '#e7e5e4', fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {doc.filename}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
                  <span style={{
                    fontSize: 10, color: '#78716c', fontFamily: "'Inter', sans-serif",
                  }}>
                    {formatDate(doc.created_at)}
                  </span>
                  <span style={{
                    fontSize: 10, color: '#78716c', fontFamily: "'Inter', sans-serif",
                  }}>
                    {doc.chunk_count} chunks
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chat area */}
        <div style={{
          background: '#1c1917',
          border: '1px solid #44403c',
          borderRadius: 16,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {!selectedDoc ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 12,
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth={1.5} style={{ opacity: 0.4 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p style={{ fontSize: 14, color: '#78716c', fontFamily: "'Inter', sans-serif" }}>
                Select a document to start chatting
              </p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid #44403c',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: extColor(selectedDoc.language),
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 13, color: '#e7e5e4', fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                }}>
                  {selectedDoc.filename}
                </span>
                <span style={{
                  fontSize: 10, color: '#78716c', fontFamily: "'Inter', sans-serif",
                  marginLeft: 'auto',
                }}>
                  {selectedDoc.chunk_count} chunks
                </span>
              </div>

              {/* Messages */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: 20,
                display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                {messages.length === 0 && (
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <p style={{ fontSize: 13, color: '#78716c', fontFamily: "'Inter', sans-serif", textAlign: 'center' }}>
                      Ask a question about this file<br />
                      <span style={{ fontSize: 11, color: '#57534e' }}>
                        e.g. "What dead code was found?" or "Explain issue #1"
                      </span>
                    </p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div style={{
                      maxWidth: '80%',
                      background: msg.role === 'user'
                        ? 'rgba(5,150,105,0.1)'
                        : '#292524',
                      border: msg.role === 'user'
                        ? '1px solid rgba(5,150,105,0.2)'
                        : '1px solid #44403c',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: '12px 16px',
                    }}>
                      <p style={{
                        fontSize: 13,
                        color: msg.role === 'user' ? '#34d399' : '#e7e5e4',
                        fontFamily: "'Inter', sans-serif",
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {msg.content}
                        {msg.role === 'assistant' && i === messages.length - 1 && streaming && (
                          <span style={{ animation: 'pulse 1s infinite', marginLeft: 2 }}>▊</span>
                        )}
                      </p>
                    </div>
                    <span style={{
                      fontSize: 10, color: '#57534e', fontFamily: "'Inter', sans-serif",
                      marginTop: 4, padding: '0 4px',
                    }}>
                      {msg.role === 'user' ? 'You' : 'GhostCode'}
                    </span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{
                padding: '14px 20px',
                borderTop: '1px solid #44403c',
                display: 'flex', gap: 10, alignItems: 'flex-end',
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about this file..."
                  rows={1}
                  style={{
                    flex: 1,
                    background: '#292524',
                    border: '1px solid rgba(5,150,105,0.2)',
                    borderRadius: 12,
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#e7e5e4',
                    fontFamily: "'Inter', sans-serif",
                    outline: 'none',
                    resize: 'none',
                    lineHeight: 1.5,
                    maxHeight: 120,
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'rgba(5,150,105,0.6)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(5,150,105,0.2)'; }}
                  onInput={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  disabled={streaming}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  style={{
                    background: !input.trim() || streaming
                      ? 'rgba(5,150,105,0.2)'
                      : 'linear-gradient(135deg, #047857, #059669)',
                    border: 'none',
                    borderRadius: 12,
                    padding: '10px 18px',
                    color: !input.trim() || streaming ? '#78716c' : '#fff',
                    cursor: !input.trim() || streaming ? 'not-allowed' : 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 40,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {streaming ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 12, height: 12, borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        animation: 'spin 0.6s linear infinite',
                        display: 'inline-block',
                      }} />
                      Sending
                    </span>
                  ) : (
                    <>
                      Send
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'rgba(248,113,113,0.12)',
          border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: 12, padding: '12px 20px',
          color: '#f87171', fontSize: 13,
          fontFamily: "'Inter', sans-serif",
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {toast.message}
        </div>
      )}
    </motion.div>
  );
}

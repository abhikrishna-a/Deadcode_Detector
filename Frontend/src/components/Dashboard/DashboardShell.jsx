import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import OverviewTab from './tabs/OverviewTab';
import AnalyzerTab from './tabs/AnalyzerTab';
import HistoryTab from './tabs/HistoryTab';
import AdminTab from './tabs/AdminTab';
import ChatTab from './tabs/ChatTab';

const STORAGE_KEY = 'dashboard-shell';

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.activeTab === 'profile') parsed.activeTab = 'history';
      return {
        activeTab: parsed.activeTab || 'overview',
        results: parsed.results || null,
        history: parsed.history || [],
      };
    }
  } catch {}
  return {};
}

const tabs = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'analyzer', label: 'Analyzer' },
  { key: 'history', label: 'History' },
  { key: 'chat', label: 'Chat' },
];

const adminTab = { key: 'admin', label: 'Admin' };

export default function DashboardShell({ session, onLogout }) {
  const saved = loadSaved();
  const [activeTab, setActiveTab] = useState(saved.activeTab || 'overview');
  const [results, setResults] = useState(saved.results || null);
  const [history, setHistory] = useState(saved.history || []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeTab, results, history }));
  }, [activeTab, results, history]);

  const user = session?.user || useAuthStore((s) => s.user);
  const visibleTabs = user?.role === 'admin' ? [...tabs, adminTab] : tabs;

  const handleViewResult = (result) => {
    const wrapped = {
      document_id: result.document_id || result.analysis_id,
      filename: result.filename,
      analysis: result.analysis || result._full || result,
      _batch_results: result._batch_results || (result.filename ? [{
        filename: result.filename,
        document_id: result.document_id || result.analysis_id,
        analysis: result.analysis || result._full || result,
        scan_folder: result.scan_folder || '',
        scan_type: result.scan_type || 'single',
      }] : []),
      _batch_errors: result._batch_errors || [],
      _source_content: result._source_content || '',
    };
    setResults(wrapped);
    setActiveTab('analyzer');
  };

  const handleResultsChange = (newResults) => {
    if (newResults) {
      const batchItems = newResults._batch_results;
      if (Array.isArray(batchItems) && batchItems.length > 0) {
        setHistory(prev => {
          const existing = new Set(prev.map(h => h.filename + '|' + (h.document_id || '')));
          const newItems = batchItems
            .filter(r => !existing.has(r.filename + '|' + (r.document_id || '')))
            .map(r => ({
              filename: r.filename,
              document_id: r.document_id,
              scan_folder: r.scan_folder || '',
              scan_type: r.scan_type || '',
              error: r.error || (r.analysis ? undefined : 'Analysis failed'),
              ...(r.analysis || {}),
            }));
          return [...prev, ...newItems];
        });
      } else {
        setHistory(prev => {
          const filtered = prev.filter(h => h.filename !== newResults.filename);
          return [...filtered, { ...newResults, scan_type: 'single' }];
        });
      }
    }
    setResults(newResults);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0c0a09' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(12,10,9,0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(5,150,105,0.08)',
        padding: '0 32px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
           <span style={{
            background: 'linear-gradient(135deg, #047857, #059669)',
            borderRadius: 10, padding: '6px 12px',
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 16, color: '#fff',
           }}>GC</span>
           <span style={{ color: '#ecfdf5', fontSize: 18, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
             className="brand-text">GhostCode</span>
           <span style={{ color: '#a8a29e', fontSize: 12, fontFamily: "'Inter', sans-serif", fontWeight: 400 }}
             className="brand-subtitle">static analysis</span>
         </div>

        <nav style={{ display: 'flex', gap: 0, height: '100%', alignItems: 'stretch' }}>
          {visibleTabs.map(t => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  background: 'none', border: 'none', borderBottom: isActive ? '2px solid #059669' : '2px solid transparent',
                  color: isActive ? '#34d399' : '#78716c',
                  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: isActive ? 600 : 400,
                  padding: '0 20px', cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#e7e5e4'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#78716c'; }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user && (
            <>
              <span style={{ color: '#34d399', fontSize: 12, fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                {user.username}
              </span>
              <span style={{
                background: 'rgba(5,150,105,0.12)',
                border: '1px solid rgba(5,150,105,0.25)',
                borderRadius: 12, padding: '2px 10px',
                fontSize: 10, color: '#34d399',
                fontFamily: "'Inter', sans-serif", fontWeight: 500,
              }}>
                {user.role}
              </span>
            </>
          )}
          <button
            onClick={onLogout}
            style={{
              background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444',
              borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
              fontFamily: "'Inter', sans-serif", fontWeight: 500, transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Content Area */}
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 32px' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <OverviewTab
              key="overview"
              session={session}
              history={history}
              results={results}
              onViewResult={handleViewResult}
            />
          )}
          {activeTab === 'analyzer' && (
            <AnalyzerTab
              key="analyzer"
              results={results}
              onResultsChange={handleResultsChange}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTab
              key="history"
              history={history}
              results={results}
              onViewResult={handleViewResult}
            />
          )}
          {activeTab === 'chat' && (
            <ChatTab
              key="chat"
            />
          )}
          {activeTab === 'admin' && (
            <AdminTab
              key="admin"
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

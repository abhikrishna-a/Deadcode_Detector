import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import OverviewTab from './tabs/OverviewTab';
import AnalyzerTab from './tabs/AnalyzerTab';
import SettingsTab from './tabs/SettingsTab';
import AdminTab from './tabs/AdminTab';

const tabs = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'analyzer', label: 'Analyzer' },
  { key: 'profile', label: 'Profile' },
];

const adminTab = { key: 'admin', label: 'Admin' };

export default function DashboardShell({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [file, setFile] = useState(null);

  const user = session?.user || useAuthStore((s) => s.user);
  const visibleTabs = user?.role === 'admin' ? [...tabs, adminTab] : tabs;

  const handleViewResult = (result) => {
    setResults(result);
    setActiveTab('analyzer');
  };

  const handleResultsChange = (newResults) => {
    if (newResults) {
      setHistory(prev => [...prev, newResults]);
    }
    setResults(newResults);
  };

  const handleFileChange = (f) => setFile(f);

  return (
    <div style={{ minHeight: '100vh', background: '#080808' }}>
      {/* Sticky Top Nav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(8,8,8,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(249,115,22,0.08)',
        padding: '0 32px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
         {/* Left */}
         <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
           <span style={{
             background: 'linear-gradient(135deg, #ea580c, #f97316)',
             borderRadius: 10, padding: '6px 12px',
             fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: '#fff',
           }}>GC</span>
           <span style={{ color: '#f5ede0', fontSize: 18, fontWeight: 800, fontFamily: "'Syne', sans-serif" }}
             className="brand-text">GhostCode</span>
           <span style={{ color: '#9ca3af', fontSize: 12, fontFamily: "'Geist', sans-serif", fontWeight: 400 }}
             className="brand-subtitle">static analysis</span>
         </div>

        {/* Center Tabs */}
        <nav style={{ display: 'flex', gap: 0, height: '100%', alignItems: 'stretch' }}>
          {visibleTabs.map(t => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  background: 'none', border: 'none', borderBottom: isActive ? '2px solid #f97316' : '2px solid transparent',
                  color: isActive ? '#fb923c' : '#6b7280',
                  fontFamily: "'DM Mono', monospace", fontSize: 13,
                  padding: '0 20px', cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#f5ede0'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#6b7280'; }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user && (
            <>
              <span style={{ color: '#fb923c', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                {user.username}
              </span>
              <span style={{
                background: 'rgba(249,115,22,0.15)',
                border: '1px solid rgba(249,115,22,0.3)',
                borderRadius: 12, padding: '2px 10px',
                fontSize: 10, color: '#fb923c',
                fontFamily: "'DM Mono', monospace",
              }}>
                {user.role}
              </span>
            </>
          )}
          <button
            onClick={onLogout}
            style={{
              background: 'none', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171',
              borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
              fontFamily: "'DM Mono', monospace", transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; }}
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
              file={file}
              onFileChange={handleFileChange}
            />
          )}
          {activeTab === 'profile' && (
            <SettingsTab
              key="profile"
              session={session}
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

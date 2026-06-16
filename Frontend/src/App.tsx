import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AnalysisResult } from './types';
import { useAuthStore } from './store/authStore';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import DashboardShell from './components/DashboardShell';
import OverviewTab from './components/tabs/OverviewTab';
import AnalyzerTab from './components/tabs/AnalyzerTab';
import ChatTab from './components/tabs/ChatTab';
import AdminTab from './components/tabs/AdminTab';
import HistoryTab from './components/tabs/HistoryTab';
import SettingsTab from './components/tabs/SettingsTab';
import Toast from './components/ui/Toast';

export default function App() {
  const { user, isAuthenticated, isLoading, checkSession, logout } = useAuthStore();
  const [screen, setScreen] = useState<'landing' | 'auth' | 'dashboard'>(() => {
    const token = document.cookie.includes('ghostcode_access=');
    return token ? 'dashboard' : 'landing';
  });
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [chatTarget, setChatTarget] = useState<{ docId: string; filename: string } | null>(null);
  const [viewTarget, setViewTarget] = useState<{ analysisId: string; filename: string; scanFolder?: string } | null>(null);

  useEffect(() => {
    if (screen === 'dashboard' && !user) {
      checkSession();
    }
  }, [screen]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const handleAuthSuccess = () => {
    setScreen('dashboard');
    showToast(`Welcome back! Secure session initialized.`, 'success');
  };

  const handleLogout = async () => {
    await logout();
    setScreen('landing');
    setChatTarget(null);
    setViewTarget(null);
    showToast('Session disconnected successfully.', 'info');
  };

  const addHistoryReport = useCallback((report: AnalysisResult) => {
    setHistory(prev => {
      const exists = prev.some(r => r.document_id === report.document_id);
      if (exists) return prev;
      return [report, ...prev];
    });
  }, []);

  const handleNavigateToWorkspace = useCallback((analysisId: string, filename: string, scanFolder?: string, onNavigate?: (tab: string) => void) => {
    setViewTarget({ analysisId, filename, scanFolder });
    onNavigate?.('analyzer');
  }, []);

  const currentUser = user || undefined;

  return (
    <div className="min-h-screen bg-[#060608] selection:bg-violet-500/20 text-neutral-200">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={clearToast} />
      )}

      <AnimatePresence mode="wait">
        {screen === 'landing' && (
          <motion.div
            key="landing_view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <LandingPage onStart={() => setScreen('auth')} />
          </motion.div>
        )}

        {screen === 'auth' && (
          <motion.div
            key="auth_view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <AuthScreen
              onSuccess={handleAuthSuccess}
              onBack={() => setScreen('landing')}
            />
          </motion.div>
        )}

        {screen === 'dashboard' && currentUser && (
          <motion.div
            key="dashboard_shell"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <DashboardShell
              user={currentUser}
              onLogout={handleLogout}
            >
              {(activeTab, onNavigate) => (
                <div className="flex-1 flex flex-col justify-start min-h-0">
                  {activeTab !== 'analyzer' && (
                    <AnimatePresence mode="wait">
                      {activeTab === 'overview' && (
                        <OverviewTab
                          key="overview"
                          history={history}
                          onViewResult={() => onNavigate('analyzer')}
                        />
                      )}

                      {activeTab === 'chat' && (
                        <ChatTab
                          key="chat"
                          history={history}
                          initialDocId={chatTarget?.docId}
                          initialFilename={chatTarget?.filename}
                        />
                      )}

                      {activeTab === 'history' && (
                        <HistoryTab
                          key="history"
                          onNavigateToChat={(docId, filename) => {
                            setChatTarget({ docId, filename });
                            onNavigate('chat');
                          }}
                          onNavigateToWorkspace={(analysisId, filename, scanFolder) => {
                            handleNavigateToWorkspace(analysisId, filename, scanFolder, onNavigate);
                          }}
                          onShowToast={showToast}
                        />
                      )}

                      {activeTab === 'settings' && (
                        <SettingsTab
                          key="settings"
                          currentUser={currentUser}
                          onShowToast={showToast}
                        />
                      )}

                      {activeTab === 'admin' && currentUser.role === 'admin' && (
                        <AdminTab
                          key="admin"
                          currentUser={currentUser}
                          onShowToast={showToast}
                        />
                      )}
                    </AnimatePresence>
                  )}

                  <div style={{ display: activeTab === 'analyzer' ? '' : 'none' }}>
                    <AnalyzerTab
                      key="analyzer"
                      history={history}
                      onAddResult={addHistoryReport}
                      onNavigateToChat={(docId, filename) => {
                        setChatTarget({ docId, filename });
                        onNavigate('chat');
                      }}
                      viewTarget={viewTarget}
                      onClearViewTarget={() => setViewTarget(null)}
                    />
                  </div>
                </div>
              )}
            </DashboardShell>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

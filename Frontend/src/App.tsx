import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from './store/authStore';
import { useAnalysisStore } from './store/analysisStore';
import { analysisAPI } from './api/analysis';
import type { AnalysisResult } from './types';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import DashboardShell from './components/DashboardShell';
import OverviewTab from './components/tabs/OverviewTab';
import AdminTab from './components/tabs/AdminTab';
import HistoryTab from './components/tabs/HistoryTab';
import JuniorTab from './components/tabs/JuniorTab';
import SubmissionsReviewPanel from './components/tabs/SubmissionsReviewPanel';
import TeamChatTab from './components/tabs/TeamChatTab';
import SettingsTab from './components/tabs/SettingsTab';
import Toast from './components/ui/Toast';

export default function App() {
  const { user, checkSession, logout } = useAuthStore();
  const history = useAnalysisStore(s => s.history);
  const setViewTarget = useAnalysisStore(s => s.setViewTarget);
  const setChatTarget = useAnalysisStore(s => s.setChatTarget);
  const resetWorkspace = useAnalysisStore(s => s.resetWorkspace);
  const [screen, setScreen] = useState<'landing' | 'auth' | 'dashboard'>('landing');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    checkSession().then(() => {
      if (useAuthStore.getState().user) {
        setScreen('dashboard');
      }
    });
  }, []);

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
    setViewTarget(null);
    setChatTarget(null);
    resetWorkspace();
    setScreen('landing');
    showToast('Session disconnected successfully.', 'info');
  };

  const handleNavigateToWorkspace = useCallback((analysisId: string, filename: string, scanFolder?: string, onNavigate?: (tab: string) => void) => {
    setViewTarget({ analysisId, filename, scanFolder });
    onNavigate?.('junior');
  }, [setViewTarget]);

  // Hydrate history from backend once dashboard is active
  useEffect(() => {
    if (screen !== 'dashboard') return;
    (async () => {
      try {
        const result = await analysisAPI.ragHistory(50);
        const store = useAnalysisStore.getState();
        if (!result.items || result.items.length === 0) {
          return;
        }
        for (const item of result.items) {
          store.addHistoryReport({
            document_id: item.analysis_id,
            filename: item.filename,
            summary: {
              total_issues: item.total_issues || 0,
              severity_counts: { high: 0, medium: 0, low: 0 },
              categories: {},
              overall_health: (item.total_issues || 0) === 0 ? 'clean' : 'needs_attention',
              health_score: item.health_score ?? 100,
            },
            issues: [],
            metrics: { total_lines: 0, code_lines: 0, comment_lines: 0, blank_lines: 0, dead_lines_estimate: 0, dead_code_percentage: 0 },
            scan_folder: item.scan_folder,
            scan_type: item.scan_type || 'single',
            scan_id: item.scan_id || item.analysis_id,
          } as AnalysisResult);
        }
      } catch {
        // Silent — history stays as persisted
      }
    })();
  }, [screen]);

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
                  <AnimatePresence mode="wait">
                    {activeTab === 'overview' && (
                      <OverviewTab
                        key="overview"
                        history={history}
                        onNavigateToWorkspace={(analysisId, filename, scanFolder) => {
                          handleNavigateToWorkspace(analysisId, filename, scanFolder, onNavigate);
                        }}
                      />
                    )}

                    {activeTab === 'history' && (
                      <HistoryTab
                        key="history"
                        onNavigateToChat={(docId, filename) => {
                          setChatTarget({ docId, filename });
                        }}
                        onNavigateToWorkspace={(analysisId, filename, scanFolder) => {
                          handleNavigateToWorkspace(analysisId, filename, scanFolder, onNavigate);
                        }}
                        onShowToast={showToast}
                      />
                    )}

                    {activeTab === 'junior' && (
                      <JuniorTab
                        key="junior"
                        currentUser={currentUser}
                        history={history}
                        onShowToast={showToast}
                        onNavigateToChat={(docId, filename) => {
                          setChatTarget({ docId, filename });
                        }}
                        onNavigateToWorkspace={(analysisId, filename, scanFolder) => {
                          handleNavigateToWorkspace(analysisId, filename, scanFolder, onNavigate);
                        }}
                      />
                    )}

                    {activeTab === 'review' && currentUser.role === 'senior' && (
                      <SubmissionsReviewPanel
                        key="review"
                        currentUser={currentUser}
                        onShowToast={showToast}
                      />
                    )}

                    {activeTab === 'team' && (
                      <TeamChatTab
                        key="team"
                        currentUser={currentUser}
                      />
                    )}

                    {activeTab === 'settings' && (
                      <SettingsTab
                        key="settings"
                        currentUser={currentUser}
                        onShowToast={showToast}
                      />
                    )}

                    {activeTab === 'admin' && currentUser.role === 'senior' && (
                      <AdminTab
                        key="admin"
                        currentUser={currentUser}
                        onShowToast={showToast}
                      />
                    )}
                  </AnimatePresence>
                </div>
              )}
            </DashboardShell>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from './store/authStore';
import Landing from './components/Landing';
import Auth from './components/Auth';
import MFASetupPage from './components/MFASetupPage';
import DashboardShell from './components/Dashboard/DashboardShell';
import Toast from './components/ui/Toast';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [mfaPending, setMfaPending] = useState(null);
  const [toast, setToast] = useState(null);

  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      setScreen('dashboard');
    }
  }, []);

  const handleAuthSuccess = useCallback((data) => {
    if (data && data.mfa_required) {
      setMfaPending(data);
      setScreen('mfa');
    } else {
      setScreen('dashboard');
    }
  }, []);

  const handleLogout = useCallback(() => {
    useAuthStore.getState().logout();
    setScreen('landing');
    setMfaPending(null);
  }, []);

  const handleNav = useCallback((target) => {
    if (target === 'landing') {
      useAuthStore.getState().logout();
    }
    setScreen(target);
  }, []);

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <AnimatePresence mode="wait">
        {screen === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Landing onNav={handleNav} />
          </motion.div>
        )}

        {screen === 'auth' && (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Auth
              onSuccess={handleAuthSuccess}
              onBack={() => setScreen('landing')}
            />
          </motion.div>
        )}

        {screen === 'mfa' && mfaPending && (
          <motion.div
            key="mfa"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <MFASetupPage
              mfaData={mfaPending}
              onSuccess={handleAuthSuccess}
              onBack={() => setScreen('auth')}
            />
          </motion.div>
        )}

        {screen === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <DashboardShell
              session={{ user: useAuthStore.getState().user }}
              onLogout={handleLogout}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

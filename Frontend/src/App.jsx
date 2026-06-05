import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from './store/authStore';
import Landing from './components/Landing';
import Auth from './components/Auth';
import MFASetupPage from './components/MFASetupPage';
import MFAVerify from './components/MFAVerify';
import ResetPassword from './components/ResetPassword';
import DashboardShell from './components/Dashboard/DashboardShell';
import Toast from './components/ui/Toast';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [mfaPending, setMfaPending] = useState(null);
  const [toast, setToast] = useState(null);
  const [resetToken, setResetToken] = useState(null);

  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setResetToken(token);
      setScreen('reset_password');
    } else if (isAuthenticated) {
      setScreen('dashboard');
    }
  }, []);

  const handleAuthSuccess = useCallback((data) => {
    if (data && data.mfa_required) {
      setMfaPending(data);
      if (data.is_mfa_enabled) {
        setScreen('mfa_verify');
      } else {
        setScreen('mfa_setup');
      }
    } else {
      setScreen('dashboard');
    }
  }, []);

  const handleLogout = useCallback(() => {
    useAuthStore.getState().logout();
    localStorage.removeItem('dashboard-shell');
    localStorage.removeItem('dashboard-file');
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

        {screen === 'reset_password' && resetToken && (
          <motion.div
            key="reset_password"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <ResetPassword
              token={resetToken}
              onBack={() => {
                window.history.replaceState({}, '', '/');
                setScreen('auth');
              }}
            />
          </motion.div>
        )}

        {screen === 'mfa_setup' && mfaPending && (
          <motion.div
            key="mfa_setup"
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

        {screen === 'mfa_verify' && mfaPending && (
          <motion.div
            key="mfa_verify"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <MFAVerify
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

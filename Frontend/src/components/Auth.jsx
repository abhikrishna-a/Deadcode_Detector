import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authAPI } from '../api/auth';
import GridBg from './ui/GridBg';
import GlowOrb from './ui/GlowOrb';
import NoiseSVG from './ui/NoiseSVG';
import Btn from './ui/Btn';
import Input from './ui/Input';
import Select from './ui/Select';
import Toast from './ui/Toast';
import { useAuthStore } from '../store/authStore';

export default function Auth({ onSuccess, onBack }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const login = useAuthStore((s) => s.login);

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast(null);

  const extractErr = async (err) => {
    try {
      if (err.response?.data) {
        const d = err.response.data;
        return d.detail || d.error ||
          Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
      }
      return err.message || 'An error occurred';
    } catch { return 'An error occurred'; }
  };

  const handleLogin = async () => {
    if (!username || !password) { showToast('Please fill in all fields.', 'error'); return; }
    setLoading(true);
    try {
      const data = await authAPI.login({ username, password });
      if (data.mfa_required) {
        login(data);
        onSuccess({ ...data, username });
      } else {
        login(data);
        onSuccess(data);
      }
    } catch (err) {
      const msg = await extractErr(err);
      showToast(msg, 'error');
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!username || !email || !password) { showToast('Please fill in all fields.', 'error'); return; }
    setLoading(true);
    try {
      await authAPI.register({ username, email, password, role });
      showToast('Account created successfully! Please log in.', 'success');
      setMode('login');
      setPassword('');
    } catch (err) {
      const msg = await extractErr(err);
      showToast(msg, 'error');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <NoiseSVG />
      <GridBg />
      <GlowOrb primary="#f97316" secondary="#7c2d12" top="50%" left="50%" size={500} />

      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 440, margin: '0 16px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(249,115,22,0.2)',
          borderRadius: 20,
          backdropFilter: 'blur(20px)',
          padding: 40,
        }}
      >
        {/* Back */}
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: '#6b7280',
            cursor: 'pointer', fontSize: 13, fontFamily: "'DM Mono', monospace",
            marginBottom: 20, padding: 0,
          }}
        >
          ← Back
        </button>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{
            background: 'linear-gradient(135deg, #ea580c, #f97316)',
            borderRadius: 10, padding: '6px 12px',
            fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 18, color: '#fff',
            display: 'inline-block', marginBottom: 12,
          }}>DC</span>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#fff5eb' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
        </div>

        {/* Mode Toggle */}
        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, marginBottom: 28,
        }}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setToast(null); }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10,
                background: mode === m ? 'rgba(234,88,12,0.7)' : 'transparent',
                border: 'none', color: mode === m ? '#fff' : '#6b7280',
                fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {m === 'login' ? 'Login' : 'Register'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {mode === 'login' ? (
              <>
                <Input label="Username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" />
                <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" />
                <Btn variant="solid" disabled={loading} onClick={handleLogin} style={{ width: '100%', marginTop: 8 }}>
                  {loading ? 'Signing in…' : 'Sign In →'}
                </Btn>
              </>
            ) : (
              <>
                <Input label="Username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Choose a username" />
                <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
                <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a password" />
                <Select label="Role" value={role} onChange={e => setRole(e.target.value)} options={[{ value: 'viewer', label: 'Viewer' }, { value: 'admin', label: 'Admin' }]} />
                <Btn variant="solid" disabled={loading} onClick={handleRegister} style={{ width: '100%', marginTop: 8 }}>
                  {loading ? 'Creating…' : 'Create Account →'}
                </Btn>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

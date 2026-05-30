import { useState } from 'react';
import { motion } from 'framer-motion';
import { authAPI } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import GridBg from './ui/GridBg';
import GlowOrb from './ui/GlowOrb';
import NoiseSVG from './ui/NoiseSVG';
import Btn from './ui/Btn';
import Toast from './ui/Toast';
import { parseApiError } from '../lib/apiError';

export default function MFAVerify({ mfaData, onSuccess, onBack }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const login = useAuthStore((s) => s.login);

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast(null);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const data = await authAPI.verifyMFALogin({ token: code }, mfaData.pre_auth_token);
      login(data);
      onSuccess(data);
    } catch (err) {
      showToast(parseApiError(err), 'error');
      setCode('');
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
          width: '100%', maxWidth: 400, margin: '0 16px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(249,115,22,0.2)',
          borderRadius: 20,
          backdropFilter: 'blur(20px)',
          padding: 40,
          textAlign: 'center',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: '#6b7280',
            cursor: 'pointer', fontSize: 13, fontFamily: "'DM Mono', monospace",
            marginBottom: 24, padding: 0, display: 'block',
          }}
        >
          ← Back
        </button>

        <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#fff5eb', marginBottom: 8 }}>
          Two-factor auth
        </h2>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#9ca3af', marginBottom: 32, lineHeight: 1.6 }}>
          Enter the 6-digit code from your authenticator app for <strong style={{ color: '#fb923c' }}>{mfaData?.username || mfaData?.user?.username}</strong>
        </p>

        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
          }}
          placeholder="000000"
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            border: `2px solid ${code.length === 6 ? 'rgba(249,115,22,0.7)' : 'rgba(249,115,22,0.25)'}`,
            borderRadius: 14,
            padding: '14px 16px',
            fontSize: 28,
            letterSpacing: '0.4em',
            textAlign: 'center',
            color: '#fb923c',
            fontFamily: "'DM Mono', monospace",
            outline: 'none',
            transition: 'border-color 0.2s',
            marginBottom: 24,
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(249,115,22,0.7)'; }}
          onBlur={e => { e.target.style.borderColor = code.length === 6 ? 'rgba(249,115,22,0.7)' : 'rgba(249,115,22,0.25)'; }}
          onKeyDown={e => { if (e.key === 'Enter') handleVerify(); }}
          autoFocus
        />

        <Btn
          variant="solid"
          disabled={code.length !== 6 || loading}
          onClick={handleVerify}
          style={{ width: '100%' }}
        >
          {loading ? 'Verifying…' : 'Verify →'}
        </Btn>
      </motion.div>
    </div>
  );
}

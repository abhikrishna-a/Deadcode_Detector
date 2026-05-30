import { useState } from 'react';
import { motion } from 'framer-motion';
import { authAPI } from '../api/auth';
import { parseApiError } from '../lib/apiError';
import GridBg from './ui/GridBg';
import GlowOrb from './ui/GlowOrb';
import NoiseSVG from './ui/NoiseSVG';
import Btn from './ui/Btn';
import Input from './ui/Input';
import Toast from './ui/Toast';

export default function ResetPassword({ token, onBack }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast(null);

  const handleReset = async () => {
    if (!newPassword || !confirmPassword) {
      showToast('Please fill in all fields.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    setLoading(true);
    try {
      await authAPI.confirmPasswordReset(token, newPassword);
      setSuccess(true);
    } catch (err) {
      showToast(parseApiError(err), 'error');
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

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{
            background: 'linear-gradient(135deg, #ea580c, #f97316)',
            borderRadius: 10, padding: '8px 16px',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#fff',
            display: 'inline-block', marginBottom: 12,
          }}>GC</span>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#fff5eb' }}>
            {success ? 'Password reset' : 'Set new password'}
          </h2>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#9ca3af', marginBottom: 24, lineHeight: 1.6 }}>
              Your password has been reset successfully. You can now log in with your new password.
            </p>
            <Btn variant="solid" onClick={onBack} style={{ width: '100%' }}>
              Back to Login
            </Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input label="New Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" />
            <Input label="Confirm Password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
            <Btn variant="solid" disabled={loading} onClick={handleReset} style={{ width: '100%', marginTop: 8 }}>
              {loading ? 'Resetting…' : 'Reset Password →'}
            </Btn>
          </div>
        )}
      </motion.div>
    </div>
  );
}

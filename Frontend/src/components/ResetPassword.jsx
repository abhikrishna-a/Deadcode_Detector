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
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0c0a09', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <NoiseSVG />
      <GridBg />
      <GlowOrb primary="#059669" secondary="#022c22" top="50%" left="50%" size={500} />

      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 440, margin: '0 16px',
          background: '#1c1917',
          border: '1px solid #353230',
           borderRadius: 16,
          backdropFilter: 'blur(20px)',
          padding: 40,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: '#78716c',
            cursor: 'pointer', fontSize: 13, fontFamily: "'Inter', sans-serif",
            marginBottom: 20, padding: 0,
          }}
        >
          ← Back
        </button>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{
            background: 'linear-gradient(135deg, #047857, #059669)',
            borderRadius: 10, padding: '8px 16px',
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 24, color: '#fff',
            display: 'inline-block', marginBottom: 12,
          }}>GC</span>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 24, color: '#e7e5e4' }}>
            {success ? 'Password reset' : 'Set new password'}
          </h2>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#a8a29e', marginBottom: 24, lineHeight: 1.6 }}>
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

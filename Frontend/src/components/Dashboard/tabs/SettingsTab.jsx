import { motion } from 'framer-motion';
import Toast from '../../ui/Toast';
import { useState } from 'react';

export default function SettingsTab({ session }) {
  const [toast, setToast] = useState(null);

  const showToast = (message, type) => setToast({ message, type });
  const clearToast = () => setToast(null);

  const user = session?.user || {};
  const isMfaEnabled = user.is_mfa_enabled;

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ maxWidth: 600, margin: '0 auto' }}
    >
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}

      {/* Profile Card */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(249,115,22,0.1)',
        borderRadius: 16, padding: 24, marginBottom: 24,
      }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: '#fb923c', marginBottom: 16, letterSpacing: 0.5 }}>
          PROFILE
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Username', value: user.username || '-' },
            { label: 'Email', value: user.email || '-' },
            { label: 'Role', value: user.role || '-' },
            { label: 'MFA', value: isMfaEnabled ? 'Enabled' : 'Not enabled' },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 12, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>{f.label}</span>
              <span style={{ fontSize: 13, color: '#f5ede0', fontFamily: "'DM Mono', monospace" }}>{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

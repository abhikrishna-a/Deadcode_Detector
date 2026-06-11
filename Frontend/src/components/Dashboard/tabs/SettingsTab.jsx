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
         background: '#1c1917', border: '1px solid #44403c',
         borderRadius: 16, padding: 24, marginBottom: 24,
       }}>
       <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 20, color: '#e7e5e4', marginBottom: 24, letterSpacing: -0.5 }}>
         PROFILE
       </h2>
         <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
           {[
             { label: 'Username', value: user.username || '-' },
             { label: 'Email', value: user.email || '-' },
             { label: 'Role', value: user.role || '-' },
             { label: 'MFA Status', value: isMfaEnabled ? 'Enabled' : 'Not enabled' },
           ].map((f, index) => (
             <div key={f.label} style={{ 
               display: 'flex', 
               justifyContent: 'space-between', 
               alignItems: 'center', 
               padding: '12px 16px',
                background: index === 0 ? 'rgba(5,150,105,0.08)' : '#292524',
                borderRadius: 12,
                border: index === 0 ? '1px solid rgba(5,150,105,0.3)' : '1px solid #44403c',
               marginBottom: index === 3 ? 0 : 4
             }}>
               <div style={{ display: 'flex', flexDirection: 'column' }}>
                 <span style={{ fontSize: 13, fontWeight: 600, color: '#e7e5e4', fontFamily: "'Inter', sans-serif", letterSpacing: 0.5 }}>
                   {f.label}
                 </span>
                 {f.label === 'MFA Status' && (
                   <span style={{ fontSize: 11, color: isMfaEnabled ? '#4ade80' : '#f87171', fontFamily: "'Inter', sans-serif", fontWeight: 500, marginTop: 2 }}>
                     {isMfaEnabled ? '● Active' : '○ Inactive'}
                     </span>
                    )}
               </div>
               <span style={{ fontSize: 14, fontWeight: 500, color: '#e7e5e4', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.25 }}>
                 {f.value}
               </span>
             </div>
           ))}
         </div>
      </div>
    </motion.div>
  );
}

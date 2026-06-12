import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const colors = {
  success: { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)', text: '#4ade80', icon: CheckCircle },
  error: { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', text: '#f87171', icon: AlertCircle },
  info: { bg: 'rgba(5,150,105,0.12)', border: 'rgba(5,150,105,0.3)', text: '#34d399', icon: Info },
};

export default function Toast({ message, type = 'info', onClose, duration = 4000 }) {
  const c = colors[type] || colors.info;

  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, x: 100, y: 20 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 100 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            padding: '12px 20px',
            color: c.text,
            fontSize: 13,
            fontFamily: "'Inter', sans-serif",
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            maxWidth: 380,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <c.icon size={18} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{message}</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: c.text,
              cursor: 'pointer',
              opacity: 0.6,
              padding: 2,
              display: 'flex',
              lineHeight: 1,
            }}
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

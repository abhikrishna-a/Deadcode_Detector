import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

const colors = {
  success: {
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.25)',
    text: '#34d399',
    accent: '#10b981',
    icon: CheckCircle
  },
  error: {
    bg: 'rgba(244, 63, 94, 0.08)',
    border: 'rgba(244, 63, 94, 0.25)',
    text: '#fb7185',
    accent: '#f43f5e',
    icon: AlertCircle
  },
  info: {
    bg: 'rgba(139, 92, 246, 0.08)',
    border: 'rgba(139, 92, 246, 0.25)',
    text: '#a78bfa',
    accent: '#8b5cf6',
    icon: Info
  }
};

export default function Toast({ message, type = 'info', onClose, duration = 4000 }: ToastProps) {
  const c = colors[type] || colors.info;
  const Icon = c.icon;

  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        style={{
          background: 'rgba(12, 11, 16, 0.85)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${c.border}`,
          boxShadow: `0 8px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
        }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3.5 px-4 py-3.5 rounded-xl max-w-sm"
      >
        {/* Glow indicator */}
        <div 
          className="absolute -inset-px rounded-xl pointer-events-none" 
          style={{
            background: `linear-gradient(220deg, transparent 70%, ${c.accent}1c 100%)`
          }}
        />

        <div className="flex-shrink-0" style={{ color: c.text }}>
          <Icon size={18} strokeWidth={2.2} />
        </div>

        <p className="text-[13px] text-zinc-300 font-medium leading-normal flex-1 font-sans">
          {message}
        </p>

        <button
          onClick={onClose}
          className="p-1 rounded-md text-zinc-500 hover:text-white transition-all cursor-pointer focus:outline-none"
        >
          <X size={15} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

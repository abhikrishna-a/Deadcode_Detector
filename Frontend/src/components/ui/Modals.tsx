import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop blur overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-neutral-950/70 backdrop-blur-md cursor-pointer"
          />

          {/* Dialog bubble */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            style={{
              background: 'linear-gradient(135deg, rgba(16, 15, 23, 0.95), rgba(10, 9, 14, 0.98))',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(139, 92, 246, 0.15)',
            }}
            className="relative w-full max-w-lg rounded-2xl p-6 overflow-hidden z-10"
          >
            {/* Upper reflective ambient glow border */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-base text-zinc-100 tracking-tight">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer focus:outline-none"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="relative text-sm text-neutral-400 font-sans">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

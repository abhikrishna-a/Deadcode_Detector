import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Modal({ open, onClose, title, children, width = 520 }) {
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const previousFocus = useRef(null);

  // Trap focus inside modal
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !contentRef.current) return;
    const focusable = contentRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onClose]);

  // Manage open/close focus and body scroll lock
  useEffect(() => {
    if (open) {
      document.body.classList.add('modal-open');
      previousFocus.current = document.activeElement;
      requestAnimationFrame(() => {
        const first = contentRef.current?.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        first?.focus();
      });
    } else {
      document.body.classList.remove('modal-open');
      if (previousFocus.current) {
        previousFocus.current.focus();
        previousFocus.current = null;
      }
    }
  }, [open]);

  // Global keydown listener
  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
            padding: 20,
          }}
        >
          <motion.div
            ref={contentRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.15 }}
            style={{
              width, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto',
              background: '#0f0f0f',
              border: '1px solid rgba(249,115,22,0.15)',
              borderRadius: 16,
              padding: 24,
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                position: 'absolute', top: 12, right: 12,
                background: 'none', border: 'none', color: '#6b7280',
                cursor: 'pointer', fontSize: 18, lineHeight: 1,
                padding: '4px 8px', borderRadius: 6,
                fontFamily: "'DM Mono', monospace",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6b7280'; }}
            >
              ✕
            </button>

            {/* Title */}
            {title && (
              <p style={{
                fontSize: 12, color: '#fb923c', fontFamily: "'DM Mono', monospace",
                fontWeight: 600, letterSpacing: 0.5, marginBottom: 16, paddingRight: 30,
              }}>
                {title}
              </p>
            )}

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

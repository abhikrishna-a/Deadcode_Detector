import { motion } from 'framer-motion';
import { text } from '../../lib/styles';

const variants = {
  solid: {
    background: 'linear-gradient(135deg, #047857, #059669)',
    color: '#fff',
    boxShadow: '0 0 20px rgba(5,150,105,0.3)',
  },
  ghost: {
    background: 'transparent',
    color: '#34d399',
    border: '1px solid rgba(5,150,105,0.35)',
  },
  danger: {
    background: 'transparent',
    color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.3)',
  },
};

export default function Btn({ children, variant = 'solid', disabled, onClick, style, ...props }) {
  const base = variants[variant] || variants.solid;
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...base,
        padding: '10px 24px',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 600,
        fontFamily: text.mono.fontFamily,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.2s',
        ...style,
      }}
      {...props}
    >
      {children}
    </motion.button>
  );
}

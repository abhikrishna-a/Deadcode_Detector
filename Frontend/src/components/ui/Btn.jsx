import { motion } from 'framer-motion';

const variants = {
  solid: {
    background: 'linear-gradient(135deg, #ea580c, #f97316)',
    color: '#fff',
    boxShadow: '0 0 20px rgba(249,115,22,0.35)',
  },
  ghost: {
    background: 'transparent',
    color: '#fb923c',
    border: '1px solid rgba(249,115,22,0.35)',
  },
  danger: {
    background: 'transparent',
    color: '#f87171',
    border: '1px solid rgba(248,113,113,0.3)',
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
        fontFamily: "'DM Mono', monospace",
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

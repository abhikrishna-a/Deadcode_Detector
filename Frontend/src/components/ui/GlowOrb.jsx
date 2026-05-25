export default function GlowOrb({ primary = '#f97316', secondary = '#7c2d12', top, left, size = 600 }) {
  return (
    <div
      style={{
        position: 'fixed',
        top,
        left,
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle at center, ${primary} 0%, ${secondary} 40%, transparent 70%)`,
        opacity: 0.15,
        pointerEvents: 'none',
        zIndex: 0,
        transform: 'translate(-50%, -50%)',
      }}
    />
  );
}

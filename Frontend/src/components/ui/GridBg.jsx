export default function GridBg() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.3,
        backgroundImage: `
          linear-gradient(rgba(5,150,105,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(5,150,105,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }}
    />
  );
}

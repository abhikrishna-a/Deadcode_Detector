export default function PlacementHero() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0c0f',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '80px 64px',
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid rgba(74, 222, 80, 0.4)',
          borderRadius: 100,
          padding: '6px 18px',
          marginBottom: 32,
          background: 'rgba(74, 222, 80, 0.04)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#4ade50', display: 'inline-block',
          }} />
          <span style={{
            fontSize: 12, color: '#4ade50',
            fontWeight: 600, letterSpacing: 1.5,
            textTransform: 'uppercase',
          }}>
            Placement Foundry 2026
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          margin: 0, padding: 0,
          fontSize: 92,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: '-2px',
          textTransform: 'uppercase',
        }}>
          <span style={{ color: '#ffffff', display: 'block' }}>Engineering</span>
          <span style={{ color: '#4ade50', display: 'block' }}>400+ Success</span>
          <span style={{ color: '#ffffff', display: 'block' }}>Stories.</span>
        </h1>

        {/* Subtitle */}
        <p style={{
          margin: '24px 0 0',
          fontSize: 16,
          color: '#78716c',
          fontWeight: 400,
          lineHeight: 1.6,
          maxWidth: 480,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: 'normal',
          textTransform: 'none',
        }}>
          From campus to corporate — we engineer careers that matter.
          Join the network that turns ambition into achievement.
        </p>

        {/* CTA */}
        <div style={{ display: 'flex', gap: 12, marginTop: 36 }}>
          <button style={{
            background: '#4ade50',
            border: 'none',
            borderRadius: 8,
            padding: '14px 32px',
            fontSize: 14,
            fontWeight: 700,
            color: '#0a0c0f',
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            transition: 'opacity 0.2s',
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Get Started
          </button>
          <button style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '14px 32px',
            fontSize: 14,
            fontWeight: 600,
            color: '#e7e5e4',
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#e7e5e4'; }}
          >
            View Programs
          </button>
        </div>

        {/* Stats panel */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1,
          marginTop: 80,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          {[
            { value: '400+', label: 'Careers Launched', color: '#60a5fa' },
            { value: '150+', label: 'Partner Network', color: '#4ade50' },
            { value: '140%', label: 'Avg. Salary Hike', color: '#fbbf24' },
            { value: '12 LPA', label: 'Highest Package', color: '#22d3ee' },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                padding: '28px 24px',
                background: 'rgba(255,255,255,0.02)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <span style={{
                fontSize: 36,
                fontWeight: 900,
                color: stat.color,
                lineHeight: 1,
                letterSpacing: '-1px',
              }}>
                {stat.value}
              </span>
              <span style={{
                fontSize: 12,
                color: '#a8a29e',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                fontFamily: "'Inter', sans-serif",
              }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

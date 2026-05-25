export default function Select({ label, value, onChange, options, style, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && (
        <label style={{ fontSize: 12, color: '#fb923c', fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(249,115,22,0.25)',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 14,
          color: '#f5ede0',
          fontFamily: "'DM Mono', monospace",
          outline: 'none',
          cursor: 'pointer',
          transition: 'border-color 0.2s',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'rgba(249,115,22,0.7)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(249,115,22,0.25)'; }}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: '#161616' }}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function Input({ label, value, onChange, type = 'text', placeholder, maxLength, style, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && (
        <label style={{ fontSize: 12, color: '#fb923c', fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(249,115,22,0.25)',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 14,
          color: '#f5ede0',
          fontFamily: "'DM Mono', monospace",
          outline: 'none',
          transition: 'border-color 0.2s',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'rgba(249,115,22,0.7)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(249,115,22,0.25)'; }}
        {...props}
      />
    </div>
  );
}

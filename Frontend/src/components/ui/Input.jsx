export default function Input({ label, value, onChange, type = 'text', placeholder, maxLength, style, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && (
        <label style={{ fontSize: 12, color: '#34d399', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
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
          background: '#292524',
          border: '1px solid #44403c',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 14,
          color: '#e7e5e4',
          fontFamily: "'Inter', sans-serif",
          outline: 'none',
          transition: 'border-color 0.2s',
        }}
        onFocus={(e) => { e.target.style.borderColor = '#059669'; }}
        onBlur={(e) => { e.target.style.borderColor = '#44403c'; }}
        {...props}
      />
    </div>
  );
}

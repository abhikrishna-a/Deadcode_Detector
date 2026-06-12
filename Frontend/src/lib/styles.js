export const sectionCard = {
  background: '#1c1917',
  border: '1px solid rgba(5,150,105,0.12)',
  borderRadius: 16,
};

export const sectionCardSubtle = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(5,150,105,0.1)',
  borderRadius: 16,
};

export const sectionCardElevated = {
  background: 'rgba(5,150,105,0.04)',
  border: '1px solid rgba(5,150,105,0.15)',
  borderRadius: 16,
};

export const flexCenter = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const flexBetween = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export const flexRow = {
  display: 'flex',
  alignItems: 'center',
};

export const text = {
  display: { fontFamily: "'Plus Jakarta Sans', sans-serif" },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
  ui: { fontFamily: "'Inter', sans-serif" },
  hero: { color: '#ecfdf5' },
  muted: { color: '#78716c' },
  dimmed: { color: '#57534e' },
  accent: { color: '#34d399' },
};

export function healthColor(score) {
  if (score == null) return '#57534e';
  return score > 80 ? '#4ade80' : score > 50 ? '#fb923c' : '#f87171';
}

export function extColor(lang) {
  const m = { python: '#3572A5', javascript: '#f7df1e', typescript: '#3178c6', jsx: '#61dafb', tsx: '#3178c6' };
  return m[lang?.toLowerCase()] || '#78716c';
}

export const sectionHeader = {
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontWeight: 700,
  fontSize: 16,
  color: '#e7e5e4',
  marginBottom: 16,
};

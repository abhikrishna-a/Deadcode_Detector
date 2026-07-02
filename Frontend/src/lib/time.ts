export function timeAgo(date: string | number): string {
  const dateObj = typeof date === 'number' ? new Date(date) : new Date(date);
  if (isNaN(dateObj.getTime())) return 'just now';
  const diff = Date.now() - dateObj.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

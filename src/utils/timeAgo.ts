export const timeAgo = (ts: any): string => {
  const ms: number | undefined = ts?.toMillis?.();
  if (!ms) return 'الآن';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60);
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} س`;
  return `منذ ${Math.floor(h / 24)} يوم`;
};

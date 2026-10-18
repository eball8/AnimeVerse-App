export const timeAgo = (ts: any, lang: string = 'ar'): string => {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
  const ms: number | undefined = ts?.toMillis?.();
  if (!ms) return rtf.format(0, 'second');
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return rtf.format(0, 'second');
  const m = Math.floor(s / 60);
  if (m < 60) return rtf.format(-m, 'minute');
  const h = Math.floor(m / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  return rtf.format(-Math.floor(h / 24), 'day');
};

// نطاق موقعك على Cloudflare Pages (بدون https://)
export const WEB_HOST = 'animeverse.pages.dev';
export const APP_URL = `https://${WEB_HOST}`;

const baseUrl = (): string => APP_URL.replace(/\/+$/, '');

export const profileLink = (uid: string) => `${baseUrl()}/user/${uid}`;
export const postLink = (id: string) => `${baseUrl()}/post/${id}`;
// الفيديو منشور أيضاً، والتطبيق يحوّله تلقائياً إلى شاشة الريلز
export const reelLink = (id: string) => `${baseUrl()}/post/${id}`;

export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

// يفتح نافذة المشاركة، وإن لم تتوفر ينسخ الرابط
export const shareLink = async (
  url: string,
  title: string
): Promise<'shared' | 'copied' | 'failed'> => {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'failed';
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
};

// صورة مصغّرة خفيفة لفيديو Cloudinary (بدل تحميل الفيديو نفسه)
export const videoThumb = (url?: string): string | undefined => {
  if (!url || !url.includes('/video/upload/')) return undefined;
  return url
    .replace('/video/upload/', '/video/upload/so_0,w_360,h_640,c_fill,q_auto/')
    .replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg');
};

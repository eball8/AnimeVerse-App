//
// https://animeverse-btn.pages.dev/download  →  تنزيل ملف APK مباشرة
// الأولوية: APK_URL (متغير في Cloudflare) ثم آخر إصدار على GitHub Releases.
const DEFAULT_APK =
  'https://github.com/eball8/AnimeVerse-App/releases/download/latest/AnimeVerse.apk';

export async function onRequestGet({ env }) {
  const target =
    typeof env.APK_URL === 'string' && env.APK_URL.startsWith('https://')
      ? env.APK_URL
      : DEFAULT_APK;
  return new Response(null, {
    status: 302,
    headers: { Location: target, 'Cache-Control': 'no-store' },
  });
}

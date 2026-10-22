// الصفحة الرئيسية لموقع AnimeVerse: https://animeverse-btn.pages.dev/

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const FEATURES = [
  { icon: '▶', title: 'ريلز وقصص', text: 'شارك لحظاتك بالفيديو' },
  { icon: '✉', title: 'مجتمع ودردشة', text: 'تابع وراسل محبي الأنمي' },
  { icon: '☰', title: 'مكتبة الأنمي', text: 'ابحث وشاهد وقيّم الحلقات' },
];

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const apk = env.APK_URL || `${origin}/download`;
  const mediafire =
    typeof env.MEDIAFIRE_URL === 'string' && env.MEDIAFIRE_URL.startsWith('https://')
      ? env.MEDIAFIRE_URL
      : '';
  const title = 'AnimeVerse — مجتمع الأنمي العربي';
  const desc = 'شارك منشوراتك وريلزك وقصصك، وتابع أصدقاءك وراسلهم. حمّل تطبيق AnimeVerse مجاناً.';

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(origin)}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AnimeVerse">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(origin)}/web-app-manifest-512x512.png">
<meta property="og:url" content="${esc(origin)}/">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0f0f14">
<link rel="icon" href="/web-app-manifest-192x192.png">
<style>
*{box-sizing:border-box}
body{margin:0;background:#0f0f14;color:#f1f1f5;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;display:flex;justify-content:center;padding:24px 20px 40px}
.wrap{width:100%;max-width:520px}
.brand{display:flex;align-items:center;gap:12px;margin:6px 0 32px}
.logo{width:44px;height:44px;border-radius:12px;background:#7c3aed}
.brand span{font-size:22px;font-weight:800;color:#a78bfa}
h1{font-size:30px;line-height:1.4;margin:0 0 12px}
.sub{font-size:16px;line-height:1.8;color:#9a9ab0;margin:0 0 26px}
.btn{display:block;text-align:center;padding:16px;border-radius:16px;font-size:17px;font-weight:700;text-decoration:none}
.p{background:#7c3aed;color:#fff}
.s{background:#2a2a38;color:#f1f1f5;margin-top:10px;font-size:15px}
.note{font-size:13px;text-align:center;color:#9a9ab0;margin:12px 0 34px}
.card{display:flex;align-items:center;gap:14px;background:#1a1a24;border:1px solid #2a2a38;border-radius:16px;padding:14px 16px;margin-bottom:10px}
.ic{width:40px;height:40px;border-radius:12px;background:#2a2a38;color:#a78bfa;display:flex;align-items:center;justify-content:center;font-size:18px;flex:none}
.card b{display:block;font-size:15px}
.card small{color:#9a9ab0;font-size:13px}
.foot{text-align:center;color:#6b6b80;font-size:12px;margin-top:30px}
</style>
</head>
<body>
<div class="wrap">
<div class="brand"><img class="logo" src="/web-app-manifest-192x192.png" alt=""><span>AnimeVerse</span></div>
<h1>مجتمع الأنمي العربي في جيبك</h1>
<p class="sub">شارك منشوراتك وريلزك وقصصك، وتابع أصدقاءك وراسلهم.</p>
<a class="btn p" href="${esc(apk)}">تنزيل مجاني</a>
${mediafire ? `<a class="btn s" href="${esc(mediafire)}">تنزيل عبر ميديا فاير</a>` : ''}
<p class="note">أندرويد • مجاني • تنزيل مباشر</p>
${FEATURES.map(
  (f) =>
    `<div class="card"><div class="ic">${f.icon}</div><div><b>${esc(f.title)}</b><small>${esc(f.text)}</small></div></div>`
).join('\n')}
<p class="foot">© AnimeVerse</p>
</div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=300',
    },
  });
}

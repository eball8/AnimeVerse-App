// صفحة ويب عامة للروابط المشتركة (منشور / ملف شخصي) مع معاينة وزر تنزيل التطبيق.
// تعمل على Cloudflare Pages Functions، وتقرأ Firestore عبر REST بدون أي مفتاح سري إضافي.

const PACKAGE_NAME = 'com.animeverse.app';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const text = (fields, key) => (fields && fields[key] && fields[key].stringValue) || '';

const safeImg = (url) => (typeof url === 'string' && url.startsWith('https://') ? url : '');

// صورة مصغّرة: للفيديو نأخذ لقطة من Cloudinary، وللصورة نستعمل الرابط نفسه
const thumb = (url) => {
  const u = safeImg(url);
  if (!u) return '';
  if (u.includes('/video/upload/')) {
    return u
      .replace('/video/upload/', '/video/upload/so_0,w_720,h_720,c_fill,q_auto/')
      .replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg');
  }
  return u;
};

const api = async (url, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const getPost = async (db, key, id) => {
  const d = await api(`${db}/posts/${encodeURIComponent(id)}?key=${key}`);
  return d && d.fields ? d.fields : null;
};

// الملفات الشخصية محمية بالقواعد، لذلك نأخذ الاسم والصورة من أول منشور عام للمستخدم
const getAuthor = async (db, key, uid) => {
  const rows = await api(`${db}:runQuery?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'posts' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'authorId' },
            op: 'EQUAL',
            value: { stringValue: uid },
          },
        },
        limit: 1,
      },
    }),
  });
  const f = Array.isArray(rows) && rows[0] && rows[0].document && rows[0].document.fields;
  if (!f) return null;
  return { name: text(f, 'authorName'), photo: text(f, 'authorPhotoURL') };
};

const page = ({ origin, path, apk, mediafire, title, desc, image, bodyHtml, found }) => {
  const url = `${origin}${path}`;
  const intent =
    `intent://${origin.replace('https://', '')}${path}#Intent;scheme=https;` +
    `package=${PACKAGE_NAME};S.browser_fallback_url=${encodeURIComponent(apk)};end`;
  const img = image || `${origin}/web-app-manifest-512x512.png`;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${found ? 'index,follow' : 'noindex'}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AnimeVerse">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<meta name="theme-color" content="#0f0f14">
<style>
*{box-sizing:border-box}
body{margin:0;background:#0f0f14;color:#f1f1f5;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;display:flex;justify-content:center;padding:20px}
.wrap{width:100%;max-width:520px}
.brand{font-weight:800;font-size:22px;margin:8px 0 18px;color:#a78bfa}
.card{background:#1a1a24;border:1px solid #2a2a38;border-radius:20px;overflow:hidden}
.head{display:flex;align-items:center;gap:12px;padding:14px}
.av{width:44px;height:44px;border-radius:50%;object-fit:cover;background:#2a2a38;flex:none}
.name{font-weight:700}
.txt{padding:0 14px 14px;line-height:1.7;white-space:pre-wrap;word-break:break-word}
.media{position:relative;background:#000}
.media img{display:block;width:100%;max-height:520px;object-fit:cover}
.play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:56px;color:#fff;text-shadow:0 2px 12px #000}
.btns{display:flex;flex-direction:column;gap:10px;margin-top:18px}
.btn{display:block;text-align:center;padding:14px;border-radius:14px;font-weight:700;text-decoration:none}
.p{background:#7c3aed;color:#fff}
.s{background:#2a2a38;color:#f1f1f5}
.hint{color:#9a9ab0;font-size:13px;text-align:center;margin-top:14px}
</style>
</head>
<body>
<div class="wrap">
<div class="brand">AnimeVerse</div>
${bodyHtml}
<div class="btns">
<a id="open" class="btn s" style="display:none" href="#">افتح في التطبيق</a>
<a class="btn p" href="${esc(apk)}">تنزيل مجاني</a>
${mediafire ? `<a class="btn s" href="${esc(mediafire)}">تنزيل عبر ميديا فاير</a>` : ''}
</div>
<p class="hint">للحصول على أفضل تجربة، حمّل تطبيق AnimeVerse</p>
</div>
<script>
if(/android/i.test(navigator.userAgent)){
  var a=document.getElementById('open');
  a.style.display='block';
  a.href=${JSON.stringify(intent).replace(/</g, '\\u003c')};
}
</script>
</body>
</html>`;
};

const html = (body, status, cache) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cache ? 'public, max-age=60, s-maxage=300' : 'no-store',
    },
  });

export async function renderShare(type, id, request, env) {
  const origin = new URL(request.url).origin;
  const path = `/${type}/${id}`;
  const project = env.VITE_FIREBASE_PROJECT_ID;
  const key = env.VITE_FIREBASE_API_KEY;
  const apk = env.APK_URL || `${origin}/download`;
  const mediafire =
    typeof env.MEDIAFIRE_URL === 'string' && env.MEDIAFIRE_URL.startsWith('https://')
      ? env.MEDIAFIRE_URL
      : '';
  const db = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

  const notFound = () =>
    html(
      page({
        origin,
        path: '/',
        apk,
        mediafire,
        title: 'AnimeVerse',
        desc: 'منصة الأنمي العربية الشاملة',
        image: '',
        found: false,
        bodyHtml: '<div class="card"><p class="txt">هذا المحتوى غير متاح أو تم حذفه.</p></div>',
      }),
      404,
      false
    );

  if (!project || !key || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) return notFound();

  if (type === 'post') {
    const f = await getPost(db, key, id);
    if (!f) return notFound();

    const author = text(f, 'authorName') || 'AnimeVerse';
    const content = text(f, 'content');
    const photo = safeImg(text(f, 'authorPhotoURL'));
    const isVideo = text(f, 'mediaType') === 'video';
    const image = thumb(text(f, 'mediaUrl'));
    const desc = content ? content.slice(0, 160) : `شاهد منشور ${author} على AnimeVerse`;

    const bodyHtml = `<div class="card">
<div class="head">${photo ? `<img class="av" src="${esc(photo)}" alt="">` : '<div class="av"></div>'}<div class="name">${esc(author)}</div></div>
${content ? `<div class="txt">${esc(content)}</div>` : ''}
${image ? `<div class="media"><img src="${esc(image)}" alt="">${isVideo ? '<div class="play">▶</div>' : ''}</div>` : ''}
</div>`;

    return html(
      page({ origin, path, apk, mediafire, title: `${author} على AnimeVerse`, desc, image, bodyHtml, found: true }),
      200,
      true
    );
  }

  const a = await getAuthor(db, key, id);
  const name = (a && a.name) || 'مستخدم AnimeVerse';
  const photo = a ? safeImg(a.photo) : '';
  const bodyHtml = `<div class="card"><div class="head">${
    photo ? `<img class="av" src="${esc(photo)}" alt="">` : '<div class="av"></div>'
  }<div class="name">${esc(name)}</div></div><p class="txt">تابع ${esc(name)} على AnimeVerse.</p></div>`;

  return html(
    page({
      origin,
      path,
      apk,
      mediafire,
      title: `${name} على AnimeVerse`,
      desc: `تابع ${name} على AnimeVerse`,
      image: photo,
      bodyHtml,
      found: true,
    }),
    200,
    true
  );
          }

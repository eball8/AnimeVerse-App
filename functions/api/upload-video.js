// POST https://animeverse-btn.pages.dev/api/upload-video
// يستقبل فيديو من التطبيق ويحفظه في Cloudflare R2 ثم يعيد الرابط العام.
// المتطلبات في Cloudflare Pages (Settings):
//   - Binding من نوع R2 bucket باسم VIDEOS
//   - متغير R2_PUBLIC_URL (بدون / في النهاية)
//   - متغير FIREBASE_PROJECT_ID
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_THUMB_BYTES = 400 * 1024;
const MAX_UPLOADS_PER_HOUR = 20; // حد الرفع لكل مستخدم
// مصادر مفاتيح Google العامة لتوقيع توكن Firebase (نجرّبها بالترتيب)
const JWKS_URLS = [
  'https://www.googleapis.com/service_account/v1/jwk/securetoken@system.gserviceaccount.com',
  'https://www.googleapis.com/service_account/v1/jwk/securetoken%40system.gserviceaccount.com',
];
const X509_URLS = [
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken%40system.gserviceaccount.com',
];
const CF_CACHE = { cacheTtlByStatus: { '200-299': 3600, '400-599': 0 } };
let keyCache = { at: 0, jwks: [], certs: {} };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Thumb-For',
  'Access-Control-Max-Age': '86400',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

const b64urlToBytes = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

// قراءة DER بسيطة لاستخراج المفتاح العام (SPKI) من شهادة X.509
function derRead(buf, pos) {
  const tag = buf[pos];
  let len = buf[pos + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[pos + 2 + i];
    hdr = 2 + n;
  }
  return { tag, start: pos + hdr, end: pos + hdr + len, full: [pos, pos + hdr + len] };
}
function spkiFromCertPem(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  const cert = derRead(der, 0);
  const tbs = derRead(der, cert.start);
  let pos = tbs.start;
  if (der[pos] === 0xa0) pos = derRead(der, pos).end; // version
  for (let i = 0; i < 5; i++) pos = derRead(der, pos).end; // serial, sigalg, issuer, validity, subject
  const spki = derRead(der, pos);
  return der.slice(spki.full[0], spki.full[1]);
}

async function fetchFirst(urls) {
  let last = 'no url';
  for (const u of urls) {
    try {
      const r = await fetch(u, { cf: CF_CACHE });
      if (r.ok) return await r.json();
      last = String(r.status);
    } catch (e) {
      last = (e && e.message) || 'network';
    }
  }
  throw new Error(last);
}

async function loadKeys() {
  if (Date.now() - keyCache.at < 3600 * 1000 && (keyCache.jwks.length || Object.keys(keyCache.certs).length)) return keyCache;
  let jwks = [];
  let certs = {};
  let e1 = '', e2 = '';
  try { jwks = (await fetchFirst(JWKS_URLS)).keys || []; } catch (e) { e1 = e.message; }
  if (!jwks.length) {
    try { certs = await fetchFirst(X509_URLS); } catch (e) { e2 = e.message; }
  }
  if (!jwks.length && !Object.keys(certs).length) throw new Error(`keys fetch failed (jwk ${e1}, x509 ${e2})`);
  keyCache = { at: Date.now(), jwks, certs };
  return keyCache;
}

async function importKeyFor(kid) {
  const algo = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const { jwks, certs } = await loadKeys();
  const jwk = jwks.find((k) => k.kid === kid);
  if (jwk) return crypto.subtle.importKey('jwk', jwk, algo, false, ['verify']);
  if (certs[kid]) return crypto.subtle.importKey('spki', spkiFromCertPem(certs[kid]), algo, false, ['verify']);
  throw new Error('unknown key id');
}

// التحقق من Firebase ID token (RS256) بدون أي مكتبات
async function verifyFirebaseToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = b64urlToJson(parts[0]);
  const payload = b64urlToJson(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('bad header alg');

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error(`project id mismatch (token=${payload.aud}, server=${projectId})`);
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('bad issuer');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('bad sub');
  if (payload.exp <= now) throw new Error('token expired');
  if (payload.iat > now + 300) throw new Error('bad iat');

  const key = await importKeyFor(header.kid);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) throw new Error('bad signature');
  return payload.sub;
}

const EXT = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/x-matroska': 'mkv',
  'video/ogg': 'ogv',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

const VIDEO_KEY = /^videos\/([A-Za-z0-9]+)\/[\w-]+\.(mp4|webm|mov|3gp|mkv|ogv)$/;

async function authenticate(request, env) {
  if (!env.VIDEOS || !env.R2_PUBLIC_URL || !env.FIREBASE_PROJECT_ID) {
    return { error: json({ error: 'server not configured' }, 500) };
  }
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  try {
    return { uid: await verifyFirebaseToken(token, String(env.FIREBASE_PROJECT_ID).trim()) };
  } catch (e) {
    return { error: json({ error: `unauthorized: ${e && e.message ? e.message : 'invalid token'}` }, 401) };
  }
}

// رفع صورة مصغّرة بجانب الفيديو (نفس الاسم بامتداد jpg)
async function handleThumb({ request, env }, uid) {
  const videoKey = request.headers.get('X-Thumb-For') || '';
  const m = VIDEO_KEY.exec(videoKey);
  if (!m || m[1] !== uid) return json({ error: 'bad key' }, 403);
  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_THUMB_BYTES) return json({ error: 'bad thumb size' }, 413);
  await env.VIDEOS.put(videoKey.replace(/\.[a-z0-9]+$/, '.jpg'), body, {
    httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' },
  });
  return json({ ok: true });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const a = await authenticate(request, env);
  if (a.error) return a.error;
  const uid = a.uid;

  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (type === 'image/jpeg' && request.headers.get('X-Thumb-For')) return handleThumb(ctx, uid);
  if (!type.startsWith('video/')) return json({ error: 'video only' }, 415);

  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BYTES) return json({ error: 'too large' }, 413);

  // حد الرفع: عدد ملفات المستخدم خلال آخر ساعة (المفاتيح مرتبة بالوقت)
  const since = Date.now() - 3600 * 1000;
  const recent = await env.VIDEOS.list({
    prefix: `videos/${uid}/`,
    startAfter: `videos/${uid}/${since}`,
    limit: 100,
  });
  const recentVideos = recent.objects.filter((o) => !o.key.endsWith('.jpg')).length;
  if (recentVideos >= MAX_UPLOADS_PER_HOUR) return json({ error: 'rate limit' }, 429);

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: 'empty' }, 400);
  if (body.byteLength > MAX_BYTES) return json({ error: 'too large' }, 413);

  const ext = EXT[type] || 'mp4';
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const key = `videos/${uid}/${Date.now()}-${rand}.${ext}`;

  await env.VIDEOS.put(key, body, {
    httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
  });

  return json({ url: `${env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}` });
}

// حذف فيديو (وصورته المصغّرة) — صاحب الملف فقط
export async function onRequestDelete({ request, env }) {
  const a = await authenticate(request, env);
  if (a.error) return a.error;
  let key = '';
  try {
    const { url } = await request.json();
    key = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const m = VIDEO_KEY.exec(key);
  if (!m || m[1] !== a.uid) return json({ error: 'forbidden' }, 403);
  await env.VIDEOS.delete([key, key.replace(/\.[a-z0-9]+$/, '.jpg')]);
  return json({ ok: true });
}

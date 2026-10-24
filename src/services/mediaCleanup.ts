// POST https://animeverse-btn.pages.dev/api/upload-video
// يستقبل فيديو من التطبيق ويحفظه في Cloudflare R2 ثم يعيد الرابط العام.
// المتطلبات في Cloudflare Pages (Settings):
//   - Binding من نوع R2 bucket باسم VIDEOS
//   - متغير R2_PUBLIC_URL (بدون / في النهاية)
//   - متغير FIREBASE_PROJECT_ID
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_THUMB_BYTES = 400 * 1024;
const MAX_UPLOADS_PER_HOUR = 20; // حد الرفع لكل مستخدم
const JWKS_URL =
  'https://www.googleapis.com/service_account/v1/jwk/securetoken@system.gserviceaccount.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
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

// التحقق من Firebase ID token (RS256) بدون أي مكتبات
async function verifyFirebaseToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const header = b64urlToJson(parts[0]);
  const payload = b64urlToJson(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('bad header');

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error('bad aud');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('bad iss');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('bad sub');
  if (payload.exp <= now) throw new Error('expired');
  if (payload.iat > now + 300) throw new Error('bad iat');

  const res = await fetch(JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error('jwks');
  const jwk = (await res.json()).keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown kid');

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
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
    return { uid: await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID) };
  } catch {
    return { error: json({ error: 'unauthorized' }, 401) };
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

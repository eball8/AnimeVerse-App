// v3
// v2
// صفحة تشخيص مؤقتة (احذفها بعد الانتهاء):
//   https://animeverse-btn.pages.dev/debug?post=POST_ID
//   https://animeverse-btn.pages.dev/debug?user=USER_ID
// لا تعرض أي مفتاح، فقط حالة الاتصال برسالة الخطأ.
const short = (s) => String(s).replace(/\s+/g, ' ').slice(0, 300);
const ID = /^[A-Za-z0-9_-]{1,200}$/;

const probe = async (url, init) => {
  try {
    const r = await fetch(url, init);
    const t = await r.text();
    let msg = '';
    try {
      const j = JSON.parse(t);
      const e = j.error || (Array.isArray(j) && j[0] && j[0].error);
      if (e) msg = `${e.status || ''}: ${e.message || ''}`;
      else if (Array.isArray(j)) {
        const docs = j.filter((x) => x.document);
        msg = `rows=${docs.length}`;
        if (docs[0]) msg += ` fields=${Object.keys(docs[0].document.fields || {}).join(',')}`;
      } else if (j.fields) msg = `document found, fields=${Object.keys(j.fields).join(',')}`;
    } catch {}
    return `${r.status} ${short(msg)}`;
  } catch (e) {
    return `fetch failed: ${short(e && e.message)}`;
  }
};

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const project = env.VITE_FIREBASE_PROJECT_ID;
  const key = env.VITE_FIREBASE_API_KEY;
  const out = [
    `project var: ${project ? 'set' : 'MISSING'}`,
    `api key var: ${key ? 'set' : 'MISSING'}`,
  ];

  if (project && key) {
    const db = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
    const post = u.searchParams.get('post');
    const user = u.searchParams.get('user');

    if (post && ID.test(post)) {
      out.push('post: ' + (await probe(`${db}/posts/${post}?key=${key}`)));
    }
    if (user && ID.test(user)) {
      out.push(
        'user posts query: ' +
          (await probe(`${db}:runQuery?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              structuredQuery: {
                from: [{ collectionId: 'posts' }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: 'authorId' },
                    op: 'EQUAL',
                    value: { stringValue: user },
                  },
                },
                limit: 1,
              },
            }),
          }))
      );
    }
  }

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

import { registerEpisode } from '../services/episodeService';
import React, { useCallback, useEffect, useState } from 'react';
import {
  collection, query, orderBy, limit, getDocs, getDoc, doc, where, updateDoc, deleteDoc, setDoc,
  addDoc, writeBatch, serverTimestamp, increment, getCountFromServer, Timestamp,
} from 'firebase/firestore';
import {
  Shield, Users, FileText, Flag, Server, Search, Trash2, Ban, BadgeCheck, Loader2,
  BarChart3, Megaphone, Film, ScrollText, Rocket,
} from 'lucide-react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { logAdmin } from '../services/adminLog';
import { uploadVideoToCloudinary } from '../services/cloudinaryService';
import type { BadgeType, UserProfile, UserRole } from '../types';
import { badgeOf } from '../types';
import VerifiedBadge from '../components/VerifiedBadge';
import { useConfirm } from '../components/ConfirmDialog';
import { PickerField } from '../components/OptionPicker';
import AdminUpdateTab from '../components/AdminUpdateTab';

type Tab = 'stats' | 'users' | 'posts' | 'reports' | 'episodes' | 'anime' | 'announce' | 'update' | 'logs';

const input =
  'w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500';
const smallBtn = 'px-3 py-1.5 rounded-xl text-xs font-bold border active:scale-95 flex items-center gap-1';
const Spinner = () => <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto my-10" />;

// يعرض رسالة الخطأ بلغة المستخدم
const useErr = () => {
  const { t } = useI18n();
  return useCallback((e: any) => alert(t('adm.err', { msg: e?.message || e })), [t]);
};

/* -------------------------------- الإحصائيات -------------------------------- */
const StatsTab: React.FC = () => {
  const { t } = useI18n();
  const [stats, setStats] = useState<{ key: string; value: string }[] | null>(null);

  useEffect(() => {
    (async () => {
      const count = async (q: any) => (await getCountFromServer(q)).data().count;
      const week = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const defs: [string, any][] = [
        ['adm.st.users', collection(db, 'users')],
        ['adm.st.newUsers', query(collection(db, 'users'), where('createdAt', '>=', week))],
        ['adm.st.banned', query(collection(db, 'users'), where('isBanned', '==', true))],
        ['adm.st.posts', collection(db, 'posts')],
        ['adm.st.comments', collection(db, 'comments')],
        ['adm.st.pendingReports', query(collection(db, 'reports'), where('status', '==', 'pending'))],
        ['adm.st.follows', collection(db, 'follows')],
        ['adm.st.libraryItems', collection(db, 'library')],
        ['adm.st.ratings', collection(db, 'episodeRatings')],
        ['adm.st.customAnime', collection(db, 'customAnime')],
      ];
      const res = await Promise.allSettled(defs.map(([, q]) => count(q)));
      setStats(defs.map(([key], i) => ({
        key,
        value: res[i].status === 'fulfilled' ? String((res[i] as PromiseFulfilledResult<number>).value) : '—',
      })));
    })();
  }, []);

  if (!stats) return <Spinner />;
  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((s) => (
        <div key={s.key} className="card p-4 text-center">
          <p className="text-2xl font-black text-primary-400">{s.value}</p>
          <p className="text-[11px] text-slate-400 mt-1">{t(s.key)}</p>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------ المستخدمون ------------------------------ */
const UsersTab: React.FC = () => {
  const { t } = useI18n();
  const errMsg = useErr();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200)));
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile)));
    } catch (e) { errMsg(e); }
    setLoading(false);
  }, [errMsg]);
  useEffect(() => { load(); }, [load]);

  const patch = async (u: UserProfile, data: Partial<UserProfile>, action: string, details = '') => {
    try {
      await updateDoc(doc(db, 'users', u.uid), { ...data, updatedAt: serverTimestamp() });
      setUsers((us) => us.map((x) => (x.uid === u.uid ? { ...x, ...data } : x)));
      logAdmin(action, 'user', u.uid, details || u.username);
    } catch (e) { errMsg(e); }
  };

  const showEmail = async (uid: string) => {
    setOpen(open === uid ? null : uid);
    if (emails[uid] !== undefined) return;
    try {
      const s = await getDoc(doc(db, 'userPrivate', uid));
      setEmails((m) => ({ ...m, [uid]: s.exists() ? s.data().email : '—' }));
    } catch { setEmails((m) => ({ ...m, [uid]: '—' })); }
  };

  const remove = async (u: UserProfile) => {
    if (!(await confirm({ title: t('adm.confirmDeleteProfile', { name: u.displayName }) }))) return;
    try {
      await deleteDoc(doc(db, 'users', u.uid));
      setUsers((us) => us.filter((x) => x.uid !== u.uid));
      logAdmin('delete_user_profile', 'user', u.uid, u.username);
    } catch (e) { errMsg(e); }
  };

  const filtered = users.filter((u) => (u.displayName + ' ' + u.username).toLowerCase().includes(search.toLowerCase()));
  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute start-3 top-3.5" />
        <input className={input + ' ps-9'} placeholder={t('adm.searchUser')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <p className="text-[11px] text-slate-500">{t('adm.userCount', { n: filtered.length })}</p>
      {filtered.map((u) => (
        <div key={u.uid} className="card p-3 space-y-3">
          <button onClick={() => showEmail(u.uid)} className="w-full flex items-center gap-3 text-start">
            <img src={u.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.uid}`} alt="" className="w-10 h-10 rounded-full bg-dark-900" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate"><span className="inline-flex items-center gap-1.5">{u.displayName} <VerifiedBadge badge={badgeOf(u)} /></span></p>
              <p className="text-[11px] text-slate-500 truncate">@{u.username} · {u.role}{u.isBanned ? ` · ${t('adm.bannedTag')}` : ''}</p>
            </div>
          </button>
          {open === u.uid && (
            <div className="space-y-3 pt-2 border-t border-white/5">
              <p className="text-[11px] text-slate-400 break-all">{t('adm.email', { email: emails[u.uid] ?? '...' })}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={u.uid === user?.uid}
                  onClick={() => patch(u, { isBanned: !u.isBanned }, u.isBanned ? 'unban_user' : 'ban_user')}
                  className={`${smallBtn} ${u.isBanned ? 'border-emerald-500/40 text-emerald-400' : 'border-red-500/40 text-red-400'} disabled:opacity-40`}
                >
                  <Ban className="w-3.5 h-3.5" /> {u.isBanned ? t('adm.unban') : t('adm.ban')}
                </button>
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary-400">
                  <BadgeCheck className="w-3.5 h-3.5" /> {t('adm.badge')}
                  <PickerField
                    title={t('adm.badge')}
                    value={badgeOf(u) ?? ''}
                    options={[
                      { value: '', label: t('adm.badgeNone') },
                      { value: 'gold', label: t('adm.badgeGold'), color: '#facc15' },
                      { value: 'red', label: t('adm.badgeRed'), color: '#f87171' },
                    ]}
                    onSelect={(val) => {
                      const v = (val || null) as BadgeType | null;
                      patch(
                        u,
                        { verifiedBadge: v, isVerified: v !== null },
                        v ? 'verify_user' : 'unverify_user',
                        `${u.username} → ${v ?? 'none'}`
                      );
                    }}
                  />
                </div>
                <PickerField
                  title="Role"
                  value={u.role}
                  disabled={u.uid === user?.uid}
                  options={[
                    { value: 'user', label: 'user' },
                    { value: 'moderator', label: 'moderator' },
                    { value: 'admin', label: 'admin' },
                  ]}
                  onSelect={(val) => patch(u, { role: val as UserRole }, 'change_role', `${u.role} → ${val}`)}
                />
                <button disabled={u.uid === user?.uid} onClick={() => remove(u)} className={`${smallBtn} border-red-500/40 text-red-400 disabled:opacity-40`}>
                  <Trash2 className="w-3.5 h-3.5" /> {t('adm.deleteProfile')}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/* ------------------------------- المنشورات ------------------------------- */
const PostsTab: React.FC = () => {
  const { t } = useI18n();
  const errMsg = useErr();
  const confirm = useConfirm();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100)));
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) { errMsg(e); }
      setLoading(false);
    })();
  }, []);

  const remove = async (p: any) => {
    if (!(await confirm({ title: t('adm.confirmDeletePost') }))) return;
    try {
      const [cs, ls] = await Promise.all([
        getDocs(query(collection(db, 'comments'), where('postId', '==', p.id), limit(300))),
        getDocs(query(collection(db, 'likes'), where('postId', '==', p.id), limit(190))),
      ]);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'posts', p.id));
      cs.forEach((d) => batch.delete(d.ref));
      ls.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      updateDoc(doc(db, 'users', p.authorId), { postsCount: increment(-1) }).catch(() => {});
      logAdmin('delete_post', 'post', p.id, (p.content || '').slice(0, 80));
      setPosts((ps) => ps.filter((x) => x.id !== p.id));
    } catch (e) { errMsg(e); }
  };

  if (loading) return <Spinner />;
  if (!posts.length) return <p className="text-center text-sm text-slate-500 py-10">{t('adm.noPosts')}</p>;

  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <div key={p.id} className="card p-3 space-y-2">
          <p className="text-xs font-bold text-white">{p.authorName} <span className="text-slate-500 font-normal">· ❤ {p.likesCount} · 💬 {p.commentsCount}</span></p>
          {p.content && <p className="text-sm text-slate-300 break-words">{p.content}</p>}
          {p.mediaUrl && (p.mediaType === 'video'
            ? <video src={p.mediaUrl} controls className="w-full max-h-52 rounded-xl" />
            : <img src={p.mediaUrl} alt="" className="w-full max-h-52 object-cover rounded-xl" />)}
          <button onClick={() => remove(p)} className={`${smallBtn} border-red-500/40 text-red-400`}>
            <Trash2 className="w-3.5 h-3.5" /> {t('adm.delete')}
          </button>
        </div>
      ))}
    </div>
  );
};

/* -------------------------------- البلاغات -------------------------------- */
const ReportsTab: React.FC = () => {
  const { t } = useI18n();
  const errMsg = useErr();
  const { user } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100)));
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) { errMsg(e); }
      setLoading(false);
    })();
  }, []);

  const setStatus = async (id: string, status: 'resolved' | 'dismissed') => {
    try {
      await updateDoc(doc(db, 'reports', id), { status, resolvedBy: user?.uid, resolvedAt: serverTimestamp() });
      logAdmin(status === 'resolved' ? 'resolve_report' : 'dismiss_report', 'report', id);
      setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e) { errMsg(e); }
  };
  const remove = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'reports', id));
      logAdmin('delete_report', 'report', id);
      setReports((rs) => rs.filter((r) => r.id !== id));
    } catch (e) { errMsg(e); }
  };

  if (loading) return <Spinner />;
  if (!reports.length) return <p className="text-center text-sm text-slate-500 py-10">{t('adm.noReports')}</p>;

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className="card p-3 space-y-2">
          <p className="text-xs text-slate-400">{r.type} · {r.targetType} · <span className="text-white">{r.status}</span></p>
          <p className="text-sm text-slate-200 break-words">{r.reason}</p>
          {r.reportedUsername && (
            <p className="text-xs text-slate-300 break-all" dir="ltr">
              المُبلَّغ عنه: <span className="text-white font-bold">@{r.reportedUsername}</span>
            </p>
          )}
          {r.contentType && <p className="text-[11px] text-slate-400">نوع الرسالة: {r.contentType}</p>}
          {r.contactUsername && (
            <p className="text-xs text-slate-300 break-all" dir="ltr">
              مستخدم أرسل المشكلة: <span className="text-white font-bold">@{r.contactUsername}</span>
            </p>
          )}
          {r.appVersion && <p className="text-[11px] text-slate-400">الإصدار: {r.appVersion}</p>}
          {r.link && (
            <a href={r.link} target="_blank" rel="noopener noreferrer" className="block text-xs text-primary-400 underline break-all" dir="ltr">
              {r.link}
            </a>
          )}
          {Array.isArray(r.screenshots) && r.screenshots.length > 0 && (
            <div className="flex gap-2">
              {r.screenshots.map((u: string, i: number) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-xl overflow-hidden border border-white/10">
                  <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-500 break-all">{t('adm.target', { id: r.targetId })}</p>
          <div className="flex gap-2">
            {r.status === 'pending' && (
              <>
                <button onClick={() => setStatus(r.id, 'resolved')} className={`${smallBtn} border-emerald-500/40 text-emerald-400`}>{t('adm.resolved')}</button>
                <button onClick={() => setStatus(r.id, 'dismissed')} className={`${smallBtn} border-white/20 text-slate-300`}>{t('adm.dismiss')}</button>
              </>
            )}
            <button onClick={() => remove(r.id)} className={`${smallBtn} border-red-500/40 text-red-400`}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
    </div>
  );
};

/* -------------------------- الحلقات والسيرفرات -------------------------- */
const EpisodesTab: React.FC = () => {
  const { t } = useI18n();
  const errMsg = useErr();
  const confirm = useConfirm();
  const [animeId, setAnimeId] = useState('');
  const [ep, setEp] = useState('');
  const [servers, setServers] = useState<any[] | null>(null);
  const [name, setName] = useState('');
  const [quality, setQuality] = useState('');
  const [link, setLink] = useState('');
  const key = () => `${animeId.trim()}_${ep.trim()}`;
  const epPath = () => doc(db, 'episodes', key());

  const load = async () => {
    if (!animeId.trim() || !ep.trim()) return;
    try {
      const snap = await getDocs(collection(epPath(), 'servers'));
      setServers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { errMsg(e); }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\//.test(link)) return alert(t('adm.linkInvalid'));
    const id = name.replace(/[\/\s]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || `s_${Date.now()}`;
    try {
      await setDoc(doc(epPath(), 'servers', id), { name, quality: quality || 'HD', link });
      await registerEpisode(animeId.trim(), Number(ep.trim())).catch((e) => console.error(e));
      logAdmin('add_server', 'episode', key(), name);
      setName(''); setQuality(''); setLink('');
      load();
    } catch (err) { errMsg(err); }
  };

  const remove = async (id: string) => {
    if (!(await confirm({ title: t('adm.confirmDeleteServer') }))) return;
    try {
      await deleteDoc(doc(epPath(), 'servers', id));
      logAdmin('delete_server', 'episode', key(), id);
      load();
    } catch (err) { errMsg(err); }
  };

  return (
    <div className="space-y-4">
      <div className="card p-3 space-y-2">
        <input className={input} placeholder={t('adm.animeIdPh')} value={animeId} onChange={(e) => setAnimeId(e.target.value)} />
        <input className={input} placeholder={t('adm.epPh')} value={ep} onChange={(e) => setEp(e.target.value)} inputMode="numeric" />
        <button onClick={load} className="btn-primary w-full py-2 text-sm">{t('adm.showServers')}</button>
      </div>
      {servers && (
        <>
          <div className="space-y-2">
            {servers.length === 0 && <p className="text-center text-xs text-slate-500">{t('adm.noServers')}</p>}
            {servers.map((s) => (
              <div key={s.id} className="card p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{s.name} <span className="text-[10px] text-slate-400">{s.quality}</span></p>
                  <p className="text-[10px] text-slate-500 truncate">{s.link}</p>
                </div>
                <button onClick={() => remove(s.id)} className="p-2 text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <form onSubmit={add} className="card p-3 space-y-2">
            <p className="text-xs font-bold text-white">{t('adm.addServer')}</p>
            <input required className={input} placeholder={t('adm.serverName')} value={name} onChange={(e) => setName(e.target.value)} />
            <input className={input} placeholder={t('adm.qualityPh')} value={quality} onChange={(e) => setQuality(e.target.value)} />
            <input required className={input} placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" />
            <button className="btn-primary w-full py-2 text-sm">{t('adm.add')}</button>
          </form>
        </>
      )}
    </div>
  );
};

/* ------------------------------- أنمي خاص ------------------------------- */
const emptyAnime = {
  title: '', titleEnglish: '', synopsis: '', imageUrl: '', trailerUrl: '',
  type: 'TV', episodes: '12', year: '', score: '', airing: false, genres: '',
};

const AnimeTab: React.FC = () => {
  const { t } = useI18n();
  const errMsg = useErr();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyAnime });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'customAnime'), orderBy('createdAt', 'desc'), limit(100)));
      setList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { errMsg(e); }
    setLoading(false);
  }, [errMsg]);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof typeof emptyAnime, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try { set('imageUrl', await uploadVideoToCloudinary(file)); } catch (e) { errMsg(e); }
    setUploading(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.imageUrl) return alert(t('adm.coverRequired'));
    setSaving(true);
    const data = {
      title: form.title.trim(),
      titleEnglish: form.titleEnglish.trim(),
      synopsis: form.synopsis.trim(),
      imageUrl: form.imageUrl.trim(),
      trailerUrl: form.trailerUrl.trim(),
      type: form.type,
      episodes: Number(form.episodes) || 0,
      year: Number(form.year) || null,
      score: Number(form.score) || null,
      airing: form.airing,
      genres: form.genres.split(/[,،]/).map((g) => g.trim()).filter(Boolean),
    };
    try {
      if (editId) {
        await updateDoc(doc(db, 'customAnime', editId), { ...data, updatedAt: serverTimestamp() });
        logAdmin('edit_anime', 'anime', editId, data.title);
      } else {
        const id = `c_${Date.now().toString(36)}`;
        await setDoc(doc(db, 'customAnime', id), { ...data, createdAt: serverTimestamp() });
        logAdmin('add_anime', 'anime', id, data.title);
      }
      setForm({ ...emptyAnime }); setEditId(null);
      load();
    } catch (err) { errMsg(err); }
    setSaving(false);
  };

  const edit = (a: any) => {
    setEditId(a.id);
    setForm({
      title: a.title || '', titleEnglish: a.titleEnglish || '', synopsis: a.synopsis || '',
      imageUrl: a.imageUrl || '', trailerUrl: a.trailerUrl || '', type: a.type || 'TV',
      episodes: String(a.episodes ?? ''), year: a.year ? String(a.year) : '', score: a.score ? String(a.score) : '',
      airing: !!a.airing, genres: (a.genres || []).join(', '),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (a: any) => {
    if (!(await confirm({ title: t('adm.confirmDeleteAnime', { title: a.title }) }))) return;
    try {
      await deleteDoc(doc(db, 'customAnime', a.id));
      logAdmin('delete_anime', 'anime', a.id, a.title);
      setList((l) => l.filter((x) => x.id !== a.id));
    } catch (err) { errMsg(err); }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card p-3 space-y-2">
        <p className="text-xs font-bold text-white">{editId ? t('adm.editing', { id: editId }) : t('adm.addAnime')}</p>
        <input required className={input} placeholder={t('adm.titlePh')} value={form.title} onChange={(e) => set('title', e.target.value)} />
        <input className={input} placeholder={t('adm.titleEnPh')} value={form.titleEnglish} onChange={(e) => set('titleEnglish', e.target.value)} />
        <textarea className={input} rows={3} placeholder={t('adm.synopsisPh')} value={form.synopsis} onChange={(e) => set('synopsis', e.target.value)} />
        <div className="flex gap-2 items-center">
          <input className={input} placeholder={t('adm.coverPh')} value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} />
          <label className={`${smallBtn} border-primary-500/40 text-primary-400 whitespace-nowrap cursor-pointer`}>
            {uploading ? '...' : t('adm.upload')}
            <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
        {form.imageUrl && <img src={form.imageUrl} alt="" className="h-32 rounded-xl object-cover" />}
        <input className={input} placeholder={t('adm.trailerPh')} value={form.trailerUrl} onChange={(e) => set('trailerUrl', e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <PickerField
            title="Type"
            full
            value={form.type}
            options={['TV', 'Movie', 'OVA', 'ONA', 'Special'].map((x) => ({ value: x, label: x }))}
            onSelect={(v) => set('type', v)}
          />
          <input className={input} inputMode="numeric" placeholder={t('adm.episodesPh')} value={form.episodes} onChange={(e) => set('episodes', e.target.value)} />
          <input className={input} inputMode="numeric" placeholder={t('adm.yearPh')} value={form.year} onChange={(e) => set('year', e.target.value)} />
          <input className={input} inputMode="decimal" placeholder={t('adm.scorePh')} value={form.score} onChange={(e) => set('score', e.target.value)} />
        </div>
        <input className={input} placeholder={t('adm.genresPh')} value={form.genres} onChange={(e) => set('genres', e.target.value)} />
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={form.airing} onChange={(e) => set('airing', e.target.checked)} /> {t('adm.airing')}
        </label>
        <div className="flex gap-2">
          <button disabled={saving} className="btn-primary flex-1 py-2 text-sm disabled:opacity-50">{editId ? t('adm.saveEdit') : t('adm.add')}</button>
          {editId && <button type="button" onClick={() => { setEditId(null); setForm({ ...emptyAnime }); }} className={`${smallBtn} border-white/20 text-slate-300`}>{t('adm.cancel')}</button>}
        </div>
      </form>

      {loading ? <Spinner /> : list.map((a) => (
        <div key={a.id} className="card p-3 flex items-center gap-3">
          <img src={a.imageUrl} alt="" className="w-12 h-16 rounded-lg object-cover bg-dark-900" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{a.title}</p>
            <p className="text-[10px] text-slate-500">{a.id} · {t('adm.epCount', { n: a.episodes })}</p>
          </div>
          <button onClick={() => edit(a)} className={`${smallBtn} border-primary-500/40 text-primary-400`}>{t('adm.edit')}</button>
          <button onClick={() => remove(a)} className="p-2 text-red-400"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
};

/* -------------------------------- الإعلانات -------------------------------- */
const AnnounceTab: React.FC = () => {
  const { t } = useI18n();
  const errMsg = useErr();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(50)));
      setList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { errMsg(e); }
    setLoading(false);
  }, [errMsg]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const ref = await addDoc(collection(db, 'announcements'), {
        title: title.trim(), body: body.trim(), active: true, createdAt: serverTimestamp(),
      });
      logAdmin('add_announcement', 'announcement', ref.id, title.trim());
      setTitle(''); setBody('');
      load();
    } catch (err) { errMsg(err); }
  };
  const toggle = async (a: any) => {
    try {
      await updateDoc(doc(db, 'announcements', a.id), { active: !(a.active !== false) });
      logAdmin('toggle_announcement', 'announcement', a.id, a.title);
      load();
    } catch (err) { errMsg(err); }
  };
  const remove = async (a: any) => {
    if (!(await confirm({ title: t('adm.confirmDeleteAnn') }))) return;
    try {
      await deleteDoc(doc(db, 'announcements', a.id));
      logAdmin('delete_announcement', 'announcement', a.id, a.title);
      load();
    } catch (err) { errMsg(err); }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card p-3 space-y-2">
        <p className="text-xs font-bold text-white">{t('adm.newAnnounce')}</p>
        <input required maxLength={100} className={input} placeholder={t('adm.titlePh')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea required maxLength={500} rows={3} className={input} placeholder={t('adm.bodyPh')} value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn-primary w-full py-2 text-sm">{t('adm.publish')}</button>
      </form>
      {loading ? <Spinner /> : list.map((a) => (
        <div key={a.id} className="card p-3 space-y-2">
          <p className="text-sm font-bold text-white">{a.title} {a.active === false && <span className="text-[10px] text-slate-500">{t('adm.paused')}</span>}</p>
          <p className="text-xs text-slate-300 break-words">{a.body}</p>
          <div className="flex gap-2">
            <button onClick={() => toggle(a)} className={`${smallBtn} border-white/20 text-slate-300`}>{a.active === false ? t('adm.enable') : t('adm.disable')}</button>
            <button onClick={() => remove(a)} className={`${smallBtn} border-red-500/40 text-red-400`}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ---------------------------------- السجل ---------------------------------- */
const LogsTab: React.FC = () => {
  const { t, lang } = useI18n();
  const errMsg = useErr();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'adminLogs'), orderBy('createdAt', 'desc'), limit(100)));
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) { errMsg(e); }
      setLoading(false);
    })();
  }, []);

  if (loading) return <Spinner />;
  if (!logs.length) return <p className="text-center text-sm text-slate-500 py-10">{t('adm.logEmpty')}</p>;
  return (
    <div className="space-y-2">
      {logs.map((l) => (
        <div key={l.id} className="card p-3 space-y-1">
          <p className="text-xs font-bold text-white">{l.action} <span className="text-slate-500 font-normal">· {l.targetType}</span></p>
          <p className="text-[11px] text-slate-400 break-all">{l.targetId}{l.details ? ` — ${l.details}` : ''}</p>
          <p className="text-[10px] text-slate-500">{l.adminName} · {l.createdAt?.toDate?.().toLocaleString(lang) ?? ''}</p>
        </div>
      ))}
    </div>
  );
};

/* --------------------------------- الصفحة --------------------------------- */
const Admin: React.FC = () => {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('stats');
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'stats', label: t('adm.tab.stats'), icon: BarChart3 },
    { id: 'users', label: t('adm.tab.users'), icon: Users },
    { id: 'posts', label: t('adm.tab.posts'), icon: FileText },
    { id: 'reports', label: t('adm.tab.reports'), icon: Flag },
    { id: 'episodes', label: t('adm.tab.episodes'), icon: Server },
    { id: 'anime', label: t('adm.tab.anime'), icon: Film },
    { id: 'announce', label: t('adm.tab.announce'), icon: Megaphone },
    { id: 'update', label: t('adm.tab.update'), icon: Rocket },
    { id: 'logs', label: t('adm.tab.logs'), icon: ScrollText },
  ];
  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-primary-400" />
        <h2 className="text-xl font-black text-white">{t('adm.title')}</h2>
      </div>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-[10px] font-bold whitespace-nowrap ${tab === x.id ? 'bg-primary-500/20 text-primary-400' : 'text-slate-500'}`}
          >
            <x.icon className="w-4 h-4" /> {x.label}
          </button>
        ))}
      </div>
      {tab === 'stats' && <StatsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'posts' && <PostsTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'episodes' && <EpisodesTab />}
      {tab === 'anime' && <AnimeTab />}
      {tab === 'announce' && <AnnounceTab />}
      {tab === 'update' && <AdminUpdateTab />}
      {tab === 'logs' && <LogsTab />}
    </div>
  );
};

export default Admin;

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Play, Server, Plus, X, Loader2, Pencil, Trash2 } from 'lucide-react';
import { db } from '../config/firebase';
import { collection, query, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { registerEpisode } from '../services/episodeService';
import { logAdmin } from '../services/adminLog';
import EpisodeRating from '../components/EpisodeRating';
import { getPlayerPref } from '../services/settingsService';
import { EZV_STORE_URL, openExternal, playInEzv } from '../services/ezvPlayer';

const Watch: React.FC = () => {
  const { t } = useI18n();
  const { animeId, episodeNumber } = useParams<{ animeId: string; episodeNumber: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newServerName, setNewServerName] = useState('');
  const [newQuality, setNewQuality] = useState('');
  const [newLink, setNewLink] = useState('');
  const [saving, setSaving] = useState(false);

  const epKey = `${animeId}_${episodeNumber}`;

  useEffect(() => {
    const fetchServers = async () => {
      if (!animeId || !episodeNumber) return;
      setLoading(true);
      try {
        const q = query(collection(db, 'episodes', `${animeId}_${episodeNumber}`, 'servers'));
        const snap = await getDocs(q);
        const fetched: any[] = [];
        snap.forEach((d) => fetched.push({ id: d.id, ...d.data() }));
        setServers(fetched);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchServers();
  }, [animeId, episodeNumber]);

  const resetForm = () => {
    setEditingId(null);
    setNewServerName('');
    setNewQuality('');
    setNewLink('');
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const openAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (server: any) => {
    setEditingId(server.id);
    setNewServerName(server.name || '');
    setNewQuality(server.quality || '');
    setNewLink(server.link || '');
    setShowModal(true);
  };

  const handleSaveServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animeId || !episodeNumber || !newServerName || !newLink) return;
    setSaving(true);

    // التحقق من صحة الرابط
    if (!newLink.startsWith('https://') && !newLink.startsWith('http://')) {
      alert(t('wt.invalidLink'));
      setSaving(false);
      return;
    }

    try {
      const episodeRef = doc(db, 'episodes', epKey);

      if (editingId) {
        // تعديل سيرفر موجود (نفس المعرّف، نغيّر الاسم والجودة والرابط)
        await updateDoc(doc(episodeRef, 'servers', editingId), {
          name: newServerName,
          quality: newQuality || 'HD',
          link: newLink,
        });
        logAdmin('edit_server', 'episode', epKey, newServerName);
        setServers((prev) =>
          prev.map((s) =>
            s.id === editingId
              ? { ...s, name: newServerName, quality: newQuality || 'HD', link: newLink }
              : s
          )
        );
      } else {
        // تنظيف اسم السيرفر لكي لا يكسر مسار Firestore
        const serverId =
          newServerName.replace(/[\/\s]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || `s_${Date.now()}`;

        await setDoc(doc(episodeRef, 'servers', serverId), {
          name: newServerName,
          quality: newQuality || 'HD',
          link: newLink,
        });
        await registerEpisode(animeId, Number(episodeNumber)).catch((e) => console.error(e));
        logAdmin('add_server', 'episode', epKey, newServerName);

        setServers((prev) => [
          ...prev.filter((s) => s.id !== serverId),
          { id: serverId, name: newServerName, quality: newQuality || 'HD', link: newLink },
        ]);
      }
      closeModal();
    } catch (error: any) {
      console.error('Firebase Error:', error);
      alert(t('wt.errorPrefix', { msg: error.message || t('wt.checkPerms') }));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteServer = async (server: any) => {
    if (!window.confirm(t('wt.confirmDeleteServer'))) return;
    try {
      await deleteDoc(doc(db, 'episodes', epKey, 'servers', server.id));
      logAdmin('delete_server', 'episode', epKey, server.name || server.id);
      setServers((prev) => prev.filter((s) => s.id !== server.id));
    } catch (error: any) {
      console.error('Firebase Error:', error);
      alert(t('wt.errorPrefix', { msg: error.message || t('wt.checkPerms') }));
    }
  };

  // تشغيل السيرفر: يفتح الرابط مباشرة داخل EZV Player، أو في المتصفح حسب اختيار المستخدم
  const handlePlayServer = async (link: string, serverName = '') => {
    if (!link || link === '#') {
      alert(t('wt.noLink'));
      return;
    }

    if (getPlayerPref() === 'browser') {
      await openExternal(link);
      return;
    }

    const title = `${t('wt.title')} - ${t('wt.episode', { n: episodeNumber ?? '' })} ${serverName}`.trim();
    const result = await playInEzv(link, title);
    if (result === 'opened') return;

    if (result === 'not-installed') {
      if (window.confirm(t('wt.ezvMissing'))) await openExternal(EZV_STORE_URL);
      else await openExternal(link);
      return;
    }
    // فشل غير متوقع (أو تشغيل من المتصفح): ننتقل للمتصفح بدل ترك المستخدم بلا شيء
    await openExternal(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 pb-10 relative">
      <div className="sticky top-0 z-40 bg-dark-950/90 backdrop-blur-md px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/10 text-slate-300">
          <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
        </button>
        <div>
          <h1 className="text-sm font-black text-white">{t('wt.title')}</h1>
          <p className="text-[10px] text-slate-400">{t('wt.episode', { n: episodeNumber ?? '' })}</p>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div className="w-full aspect-video bg-black rounded-2xl flex flex-col items-center justify-center border border-white/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-dark-950/80 to-transparent" />
          <Play className="w-12 h-12 text-white/50 mb-2" />
          <p className="text-xs text-slate-400">{t('wt.playerHint')}</p>
        </div>

        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary-400" />
              <h3 className="text-sm font-black text-white">{t('wt.servers')}</h3>
            </div>
            {isAdmin && (
              <button
                onClick={openAdd}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary-500/20 text-primary-400 text-xs font-bold border border-primary-500/30 active:scale-95"
              >
                <Plus className="w-4 h-4" /> {t('wt.add')}
              </button>
            )}
          </div>
          {servers.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-4">
              {t('wt.noServers')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {servers.map((server) => (
                <div key={server.id} className="space-y-1">
                  <button
                    onClick={() => handlePlayServer(server.link, server.name)}
                    className="w-full flex flex-col items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition active:scale-95"
                  >
                    <span className="text-xs font-bold text-white mb-1">{server.name}</span>
                    <span className="text-[10px] text-slate-400">{server.quality}</span>
                  </button>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(server)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary-500/15 text-primary-400 text-[10px] font-bold border border-primary-500/30 active:scale-95"
                        aria-label={t('wt.edit')}
                      >
                        <Pencil className="w-3.5 h-3.5" /> {t('wt.edit')}
                      </button>
                      <button
                        onClick={() => handleDeleteServer(server)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-bold border border-red-500/30 active:scale-95"
                        aria-label={t('wt.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {t('wt.delete')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* تقييم حقيقي للحلقة */}
        <EpisodeRating episodeKey={`${animeId}_${episodeNumber}`} />
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-white/10 rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black text-white">
                {editingId ? t('wt.editServer') : t('wt.addServer')}
              </h3>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg text-slate-400 hover:bg-white/10"
                aria-label={t('wt.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveServer} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">{t('wt.serverName')}</label>
                <input
                  required
                  type="text"
                  placeholder={t('wt.serverNameEx')}
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">{t('wt.quality')}</label>
                <input
                  type="text"
                  placeholder={t('wt.qualityEx')}
                  value={newQuality}
                  onChange={(e) => setNewQuality(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">{t('wt.directLink')}</label>
                <input
                  required
                  type="text"
                  placeholder="https://..."
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500"
                  dir="ltr"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full btn-primary py-3 mt-2 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('wt.saveServer')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Watch;

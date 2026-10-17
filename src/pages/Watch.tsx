import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Play, Star, AlertCircle, Server, Plus, X, Loader2 } from 'lucide-react';
import { db } from '../config/firebase';
import { collection, query, getDocs, doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const Watch: React.FC = () => {
  const { animeId, episodeNumber } = useParams<{ animeId: string, episodeNumber: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [rating, setRating] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newQuality, setNewQuality] = useState('');
  const [newLink, setNewLink] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.email === 'eball8361@gmail.com') setIsAdmin(true);
  }, [user]);

  useEffect(() => {
    const fetchServers = async () => {
      if (!animeId || !episodeNumber) return;
      setLoading(true);
      try {
        const q = query(collection(db, 'episodes', `${animeId}_${episodeNumber}`, 'servers'));
        const snap = await getDocs(q);
        const fetched: any[] = [];
        snap.forEach((doc) => fetched.push({ id: doc.id, ...doc.data() }));
        
        if (fetched.length === 0) {
          setServers([{ id: '1', name: 'سيرفر MF', quality: '1080p', link: 'https://test.com' }, { id: '2', name: 'سيرفر ST', quality: '720p', link: 'https://test.com' }]);
        } else {
          setServers(fetched);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchServers();
  }, [animeId, episodeNumber]);

  const handleSaveServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animeId || !episodeNumber || !newServerName || !newLink) return;
    setSaving(true);
    
    try {
      const episodeRef = doc(db, 'episodes', `${animeId}_${episodeNumber}`);
      const serverId = newServerName.replace(/\s+/g, '_');
      
      await setDoc(doc(episodeRef, 'servers', serverId), {
        name: newServerName,
        quality: newQuality || 'HD',
        link: newLink
      });

      setServers([...servers, { id: serverId, name: newServerName, quality: newQuality || 'HD', link: newLink }]);
      setShowModal(false);
      setNewServerName(''); setNewQuality(''); setNewLink('');
    } catch (error: any) {
      console.error("Firebase Error:", error);
      alert('حدث خطأ: ' + (error.message || 'تأكد من الصلاحيات'));
    } finally {
      setSaving(false);
    }
  };

  // وظيفة تشغيل السيرفر (استخدام Intent لفتح EZV Player)
  const handlePlayServer = (link: string) => {
    if (!link || link === '#') {
      alert('لم يتم إضافة رابط لهذا السيرفر بعد.');
      return;
    }

    // اسم حزمة EZV Player الصحيح
    const packageName = 'com.player.easy';
    // إنشاء رابط الـ Intent
    const intentUrl = `intent://${link.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=${packageName};end`;

    try {
      // محاولة فتح التطبيق
      window.location.href = intentUrl;

      // خطة بديلة: إذا لم يفتح التطبيق خلال 1.5 ثانية، افتح المتصفح
      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          window.open(link, '_blank');
        }
      }, 1500);
      
    } catch (e) {
      window.open(link, '_blank');
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-dark-950"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
  }

  return (
    <div className="min-h-screen bg-dark-950 pb-10 relative">
      <div className="sticky top-0 z-40 bg-dark-950/90 backdrop-blur-md px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/10 text-slate-300"><ArrowRight className="w-5 h-5" /></button>
        <div>
          <h1 className="text-sm font-black text-white">مشاهدة الأنمي</h1>
          <p className="text-[10px] text-slate-400">الحلقة {episodeNumber}</p>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div className="w-full aspect-video bg-black rounded-2xl flex flex-col items-center justify-center border border-white/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-dark-950/80 to-transparent" />
          <Play className="w-12 h-12 text-white/50 mb-2" />
          <p className="text-xs text-slate-400">سيتم فتح المشغل الخارجي (EZV Player) هنا</p>
        </div>

        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary-400" />
              <h3 className="text-sm font-black text-white">السيرفرات المتاحة</h3>
            </div>
            {isAdmin && (
              <button onClick={() => setShowModal(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary-500/20 text-primary-400 text-xs font-bold border border-primary-500/30 active:scale-95">
                <Plus className="w-4 h-4" /> إضافة
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {servers.map((server) => (
              <div key={server.id} className="relative group">
                <button 
                  onClick={() => handlePlayServer(server.link)}
                  className="w-full flex flex-col items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition active:scale-95"
                >
                  <span className="text-xs font-bold text-white mb-1">{server.name}</span>
                  <span className="text-[10px] text-slate-400">{server.quality}</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white flex items-center gap-2"><Star className="w-4 h-4 text-yellow-400" /> قيّم هذه الحلقة</h3>
            <span className="text-xs text-slate-400">8.99/10 من 576 شخص</span>
          </div>
          {!hasVoted ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400">0</span>
                <input type="range" min="1" max="10" value={rating || 5} onChange={(e) => setRating(Number(e.target.value))} className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-500" />
                <span className="text-xs font-bold text-slate-400">10</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary-400">{rating || 5} / 10</span>
                <button onClick={() => setHasVoted(true)} className="btn-primary px-4 py-2 text-xs">إرسال التقييم</button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <AlertCircle className="w-4 h-4" /> شكراً لتقييمك! لقد سجلت {rating} نجوم.
            </div>
          )}
        </section>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-white/10 rounded-3xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black text-white">إضافة سيرفر</h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg text-slate-400 hover:bg-white/10"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSaveServer} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">اسم السيرفر</label>
                <input required type="text" placeholder="مثال: سيرفر MF" value={newServerName} onChange={e => setNewServerName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">الجودة</label>
                <input type="text" placeholder="مثال: 1080p" value={newQuality} onChange={e => setNewQuality(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">الرابط المباشر</label>
                <input required type="text" placeholder="https://..." value={newLink} onChange={e => setNewLink(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500" dir="ltr" />
              </div>
              
              <button type="submit" disabled={saving} className="w-full btn-primary py-3 mt-2 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ السيرفر'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Watch;

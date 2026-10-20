import React, { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { Star } from 'lucide-react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';

// تقييم حقيقي لكل حلقة (1-10)، كل مستخدم له تقييم واحد يمكنه تغييره
const EpisodeRating: React.FC<{ episodeKey: string }> = ({ episodeKey }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [mine, setMine] = useState<number | null>(null);
  const [value, setValue] = useState(5);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'episodeRatings'), where('episodeKey', '==', episodeKey), limit(1000))
      );
      let sum = 0;
      let my: number | null = null;
      snap.forEach((d) => {
        const r = d.data();
        sum += Number(r.rating) || 0;
        if (r.userId === user?.uid) my = Number(r.rating);
      });
      setCount(snap.size);
      setAvg(snap.size ? sum / snap.size : 0);
      setMine(my);
      if (my) setValue(my);
    } catch (e) {
      console.error('ratings load failed:', e);
    }
  }, [episodeKey, user?.uid]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'episodeRatings', `${episodeKey}_${user.uid}`), {
        episodeKey,
        userId: user.uid,
        rating: value,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e: any) {
      alert(t('wt.rateFail', { msg: e?.message || '' }));
    }
    setSaving(false);
  };

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-400" /> {t('wt.rateTitle')}
        </h3>
        <span className="text-xs text-slate-400">{t('wt.rateSummary', { avg: avg.toFixed(1), count })}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-slate-400">1</span>
        <input
          type="range" min="1" max="10" value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-500"
        />
        <span className="text-xs font-bold text-slate-400">10</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-primary-400">{value} / 10</span>
        <button onClick={submit} disabled={saving} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
          {mine ? t('wt.rateUpdate') : t('wt.rateSend')}
        </button>
      </div>
    </section>
  );
};

export default EpisodeRating;

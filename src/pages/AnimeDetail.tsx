import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Star, PlayCircle, Loader2, Info, ListVideo, BarChart2, Users } from 'lucide-react';
import { average, collection, count, getAggregateFromServer, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getAnimeById } from '../services/animeService';
import type { Anime } from '../services/animeService';
import { isCustomId, getCustomAnime } from '../services/customAnimeService';
import { getAnimeExtra } from '../services/malService';
import { listAnimeEpisodeNumbers } from '../services/episodeService';
import { useAuth } from '../context/AuthContext';
import type { AnimeExtra } from '../services/malService';
import { useI18n } from '../i18n/I18nContext';
import LibraryControls from '../components/LibraryControls';

const EP_PAGE = 100;

const AnimeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const [addedEps, setAddedEps] = useState<number[]>([]);
  const [newEp, setNewEp] = useState('');
  const [anime, setAnime] = useState<Anime | null>(null);
  const [extra, setExtra] = useState<AnimeExtra | null>(null);
  const [appRating, setAppRating] = useState<{ avg: number; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleEps, setVisibleEps] = useState(EP_PAGE);
  const [activeTab, setActiveTab] = useState<'details' | 'episodes' | 'stats' | 'characters'>('details');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setExtra(null);
    setAppRating(null);
    setVisibleEps(EP_PAGE);
    const request = isCustomId(id) ? getCustomAnime(id) : getAnimeById(Number(id));
    request
      .then((data) => setAnime(data))
      .catch((e) => {
        console.error(e);
        setAnime(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // بيانات MyAnimeList الحقيقية (عدد الحلقات + التقييم)
  useEffect(() => {
    if (!id || isCustomId(id)) return;
    let cancelled = false;
    getAnimeExtra(Number(id)).then((d) => {
      if (!cancelled) setExtra(d);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // حلقات الأنمي المستمر: فقط ما أضافه الأدمن يدوياً (لا نعتمد على أرقام الـ API)
  useEffect(() => {
    if (!anime) return;
    let cancelled = false;
    setAddedEps([]);
    listAnimeEpisodeNumbers(String(anime.mal_id))
      .then((n) => {
        if (!cancelled) setAddedEps(n);
      })
      .catch((e) => console.error('added episodes failed:', e));
    return () => {
      cancelled = true;
    };
  }, [anime]);

  // متوسط تقييمات مستخدمي التطبيق لكل حلقات هذا الأنمي (قراءة مجمّعة رخيصة)
  useEffect(() => {
    if (!anime) return;
    const key = String(anime.mal_id);
    let cancelled = false;
    getAggregateFromServer(
      query(
        collection(db, 'episodeRatings'),
        where('episodeKey', '>=', `${key}_`),
        where('episodeKey', '<', `${key}_\uf8ff`)
      ),
      { avg: average('rating'), n: count() }
    )
      .then((s) => {
        if (cancelled) return;
        const d = s.data();
        setAppRating({ avg: d.avg ?? 0, count: d.n });
      })
      .catch((e) => console.error('app rating failed:', e));
    return () => {
      cancelled = true;
    };
  }, [anime]);

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center py-24 bg-dark-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!anime) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-dark-950">
        <p className="text-slate-400 mb-4">{t('anime.loadFail')}</p>
        <button onClick={() => navigate(-1)} className="btn-primary px-6 py-2">{t('common.back')}</button>
      </div>
    );
  }

  const imageUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;

  const status = extra?.status && extra.status !== 'unknown' ? extra.status : anime.airing ? 'airing' : 'finished';
  const total = extra?.totalEpisodes ?? anime.episodes ?? null;
  const isAiring = status === 'airing';
  // المنتهي: حلقاته الحقيقية كاملة (لن تتغير). المستمر: لا نعرض إلا الحلقات التي أضافها الأدمن.
  const episodeList: number[] = isAiring
    ? addedEps
    : status === 'upcoming'
    ? []
    : Array.from({ length: total ?? 0 }, (_, i) => i + 1);
  const listCount = episodeList.length;

  const episodesText =
    status === 'upcoming' ? String(total ?? t('anime.tba')) : String(total ?? '?');

  const statusLabel =
    status === 'airing' ? t('anime.airing') : status === 'upcoming' ? t('anime.upcoming') : t('anime.finished');
  const statusCls =
    status === 'airing'
      ? 'bg-emerald-500/20 text-emerald-400'
      : status === 'upcoming'
      ? 'bg-amber-500/20 text-amber-400'
      : 'bg-slate-500/20 text-slate-400';

  return (
    <div className="min-h-screen bg-dark-950 pb-10">
      {/* Hero Image */}
      <div className="relative h-[35vh] w-full">
        <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/70 to-transparent z-10" />
        <img src={imageUrl} alt={anime.title} className="w-full h-full object-cover" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 end-4 z-20 p-2 rounded-xl bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition"
        >
          <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
        </button>
      </div>

      {/* Info Header */}
      <div className="px-4 relative z-20 -mt-16 space-y-4">
        <div className="flex items-end gap-4">
          <img
            src={imageUrl}
            alt={anime.title}
            className="w-24 h-36 rounded-2xl object-cover border-2 border-white/10 shadow-2xl bg-dark-900"
          />
          <div className="flex-1 pb-1">
            <h1 className="text-xl font-black text-white leading-tight mb-1">
              {anime.title_english || anime.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              {extra?.malScore != null && (
                <span className="flex items-center gap-1 text-yellow-400 font-bold">
                  <Star className="w-3.5 h-3.5 fill-yellow-400" /> {extra.malScore.toFixed(2)}
                  <span className="text-[9px] text-slate-500 font-normal">MAL</span>
                </span>
              )}
              {anime.type && <span>• {anime.type}</span>}
              {anime.year && <span>• {anime.year}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-block px-2 py-0.5 rounded-md ${statusCls} text-[10px] font-bold`}>
                {statusLabel}
              </span>
              <span className="inline-block px-2 py-0.5 rounded-md bg-white/10 text-white text-[10px] font-bold">
                {t('anime.episodes')}: {episodesText}
              </span>
            </div>
          </div>
        </div>

        {/* التقييمات */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3 text-center">
            <p className="text-[10px] text-slate-500 font-bold mb-1">{t('anime.malScore')}</p>
            <p className="text-lg font-black text-yellow-400">
              {extra?.malScore != null ? extra.malScore.toFixed(2) : '—'}
              <span className="text-[10px] text-slate-500 font-normal"> /10</span>
            </p>
            {extra?.malScoredBy != null && (
              <p className="text-[10px] text-slate-500">{t('anime.ratingsCount', { n: extra.malScoredBy.toLocaleString() })}</p>
            )}
          </div>
          <div className="card p-3 text-center">
            <p className="text-[10px] text-slate-500 font-bold mb-1">{t('anime.appScore')}</p>
            {appRating && appRating.count > 0 ? (
              <>
                <p className="text-lg font-black text-primary-400">
                  {appRating.avg.toFixed(1)}
                  <span className="text-[10px] text-slate-500 font-normal"> /10</span>
                </p>
                <p className="text-[10px] text-slate-500">{t('anime.ratingsCount', { n: appRating.count })}</p>
              </>
            ) : (
              <p className="text-[10px] text-slate-500 leading-relaxed pt-1">{t('anime.noRatings')}</p>
            )}
          </div>
        </div>

        {/* المفضلة وحالة المشاهدة */}
        <LibraryControls
          animeId={String(anime.mal_id)}
          title={anime.title_english || anime.title}
          imageUrl={imageUrl}
        />

        {/* Tabs */}
        <div className="flex border-b border-white/10 mt-6 overflow-x-auto no-scrollbar">
          {[
            { id: 'details', label: t('anime.details'), icon: Info },
            { id: 'episodes', label: t('anime.episodes'), icon: ListVideo },
            { id: 'stats', label: t('anime.stats'), icon: BarChart2 },
            { id: 'characters', label: t('anime.characters'), icon: Users },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors border-b-2 whitespace-nowrap px-2 ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="pt-4">
          {activeTab === 'details' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-black text-white mb-2">{t('anime.synopsis')}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{anime.synopsis || t('anime.noSynopsis')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(anime.genres || []).map((g, i) => (
                  <span
                    key={`${g.mal_id}-${i}`}
                    className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
              {anime.trailer?.url && (
                <a
                  href={anime.trailer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/20 transition"
                >
                  <PlayCircle className="w-5 h-5" /> {t('anime.trailer')}
                </a>
              )}
            </div>
          )}

          {activeTab === 'episodes' && (
            <div className="space-y-2">
              <h3 className="text-sm font-black text-white mb-3">
                {t('anime.listTitle')} ({listCount})
              </h3>
              {isAiring && (
                <p className="text-[11px] text-slate-500 leading-relaxed">{t('anime.airingEpsNote')}</p>
              )}
              {isAiring && isAdmin && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = parseInt(newEp, 10);
                    if (n > 0) navigate(`/watch/${anime.mal_id}/${n}`);
                  }}
                  className="card p-3 flex items-center gap-2"
                >
                  <input
                    inputMode="numeric"
                    value={newEp}
                    onChange={(e) => setNewEp(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('anime.addEpisodePh')}
                    className="flex-1 px-3 py-2 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500"
                  />
                  <button className="btn-primary px-4 py-2 text-xs font-bold">{t('anime.go')}</button>
                </form>
              )}
              {listCount === 0 && (
                <p className="text-center text-xs text-slate-500 py-6">{t('anime.notAired')}</p>
              )}
              {episodeList.slice(0, visibleEps).map((ep) => (
                <button
                  key={ep}
                  onClick={() => navigate(`/watch/${anime.mal_id}/${ep}`)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-start"
                >
                  <span className="text-sm font-bold text-white">{t('anime.episodeN', { n: ep })}</span>
                  <PlayCircle className="w-4 h-4 text-primary-400" />
                </button>
              ))}
              {listCount > visibleEps && (
                <button
                  onClick={() => setVisibleEps((v) => v + EP_PAGE)}
                  className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-primary-400 text-xs font-bold"
                >
                  {t('common.more')}
                </button>
              )}
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="card p-6 text-center">
              <BarChart2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{t('anime.statsSoon')}</p>
            </div>
          )}

          {activeTab === 'characters' && (
            <div className="card p-6 text-center">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{t('anime.charsSoon')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnimeDetail;

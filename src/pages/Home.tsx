import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, RefreshCw, PlayCircle, Clapperboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { listLatestEpisodes } from '../services/episodeService';
import type { EpisodeItem } from '../services/episodeService';
import AnimeSearchBar from '../components/AnimeSearchBar';
import AnnouncementBanner from '../components/AnnouncementBanner';

// بطاقة حلقة جديدة: البوستر + رقم الحلقة، واسم الأنمي تحته
const EpisodeCard: React.FC<{ ep: EpisodeItem }> = ({ ep }) => {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <button
      onClick={() => navigate(`/watch/${ep.animeId}/${ep.episodeNumber}`)}
      className="text-right group flex flex-col gap-1 active:scale-95 transition-transform"
    >
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-dark-900 border border-white/5">
        <img
          src={ep.imageUrl}
          alt={ep.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute top-2 start-2 px-2 py-0.5 rounded-lg bg-primary-600/95 backdrop-blur-sm flex items-center gap-1">
          <PlayCircle className="w-3 h-3 text-white" />
          <span className="text-[10px] font-black text-white">{t('wt.episode', { n: ep.episodeNumber })}</span>
        </div>
      </div>
      <div className="px-1 mt-1">
        <h3 className="text-xs font-bold text-white line-clamp-1 leading-tight group-hover:text-primary-400 transition-colors">
          {ep.title}
        </h3>
      </div>
    </button>
  );
};

const Home: React.FC = () => {
  const { loading: authLoading } = useAuth();
  const { t } = useI18n();

  const [episodes, setEpisodes] = useState<EpisodeItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setEpisodes(null);
    setFailed(false);
    listLatestEpisodes(30)
      .then((d) => {
        if (!cancelled) setEpisodes(d);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) {
          setEpisodes([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (authLoading) {
    return (
      <div className="py-24 flex justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <AnimeSearchBar />

      <AnnouncementBanner />

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Clapperboard className="w-5 h-5 text-primary-400" />
          <h3 className="text-lg font-black text-white">{t('home.newEpisodes')}</h3>
        </div>

        {episodes === null ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : failed ? (
          <div className="card p-6 text-center space-y-4">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
            <p className="text-sm text-slate-300">{t('home.newFail')}</p>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="btn-primary px-6 py-2 inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> {t('common.retry')}
            </button>
          </div>
        ) : episodes.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">{t('home.newEmpty')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {episodes.map((ep) => (
              <EpisodeCard key={ep.id} ep={ep} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;

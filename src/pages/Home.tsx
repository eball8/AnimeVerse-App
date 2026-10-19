import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, LogIn, UserPlus, Zap, Loader2, AlertCircle, RefreshCw, Film } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { Anime } from '../services/animeService';
import { getTopAnime, getSeasonNow } from '../services/animeService';
import { listCustomAnime } from '../services/customAnimeService';
import AnimeCard from '../components/AnimeCard';
import AnimeSearchBar from '../components/AnimeSearchBar';
import AnnouncementBanner from '../components/AnnouncementBanner';

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  to: string;
  items: Anime[] | null;
}

const Section: React.FC<SectionProps> = ({ title, icon, to, items }) => {
  const { t } = useI18n();
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-lg font-black text-white">{title}</h3>
        </div>
        <Link to={to} className="text-xs text-primary-400 font-bold">
          {t('common.viewAll')}
        </Link>
      </div>

      {items === null ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map((anime) => (
            <AnimeCard key={String(anime.mal_id)} anime={anime} />
          ))}
        </div>
      )}
    </section>
  );
};

const Home: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const { t } = useI18n();

  const [topAnime, setTopAnime] = useState<Anime[] | null>(null);
  const [seasonAnime, setSeasonAnime] = useState<Anime[] | null>(null);
  const [customAnime, setCustomAnime] = useState<Anime[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTopAnime(null);
    setSeasonAnime(null);

    getTopAnime(1, 10)
      .then((d) => {
        if (!cancelled) setTopAnime(d);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setTopAnime([]);
      });

    getSeasonNow(10)
      .then((d) => {
        if (!cancelled) setSeasonAnime(d);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setSeasonAnime([]);
      });

    listCustomAnime(10)
      .then((d) => {
        if (!cancelled) setCustomAnime(d);
      })
      .catch((e) => console.error(e));

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const failed =
    topAnime !== null && seasonAnime !== null && topAnime.length === 0 && seasonAnime.length === 0;

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

      <div className="card p-5 bg-gradient-to-br from-primary-500/20 via-accent-500/10 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-primary-400" />
          <span className="text-[10px] text-emerald-400 font-bold">{t('home.safe')}</span>
        </div>
        <h2 className="text-xl font-black text-white mb-1">
          {profile ? t('home.welcome', { name: profile.displayName }) : t('home.welcomeGuest')}
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed mb-3">
          {profile ? t('home.subUser') : t('home.subGuest')}
        </p>
        {!user && (
          <div className="flex gap-2">
            <Link
              to="/login"
              className="flex-1 btn-primary py-2 flex items-center justify-center gap-1.5 text-xs"
            >
              <LogIn className="w-3.5 h-3.5" /> {t('home.login')}
            </Link>
            <Link
              to="/signup"
              className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" /> {t('home.signup')}
            </Link>
          </div>
        )}
      </div>

      {failed ? (
        <div className="card p-6 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-sm text-slate-300">{t('home.connFail')}</p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="btn-primary px-6 py-2 inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> {t('common.retry')}
          </button>
        </div>
      ) : (
        <>
          {customAnime.length > 0 && (
            <Section
              title={t('home.exclusive')}
              icon={<Film className="w-5 h-5 text-primary-400" />}
              to="/list/custom"
              items={customAnime}
            />
          )}

          <Section
            title={t('home.trending')}
            icon={<Zap className="w-5 h-5 text-accent-400" />}
            to="/list/top"
            items={topAnime}
          />

          <Section
            title={t('home.airing')}
            icon={<Zap className="w-5 h-5 text-primary-400" />}
            to="/list/season"
            items={seasonAnime}
          />
        </>
      )}
    </div>
  );
};

export default Home;

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Star, PlayCircle, Loader2, Info, ListVideo, BarChart2, Users } from 'lucide-react';
import { getAnimeById } from '../services/animeService';
import type { Anime } from '../services/animeService';
import { isCustomId, getCustomAnime } from '../services/customAnimeService';
import LibraryControls from '../components/LibraryControls';

const AnimeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'episodes' | 'stats' | 'characters'>('details');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const request = isCustomId(id) ? getCustomAnime(id) : getAnimeById(Number(id));
    request
      .then((data) => setAnime(data))
      .catch((e) => {
        console.error(e);
        setAnime(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

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
        <p className="text-slate-400 mb-4">فشل تحميل الأنمي.</p>
        <button onClick={() => navigate(-1)} className="btn-primary px-6 py-2">رجوع</button>
      </div>
    );
  }

  const imageUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
  const episodeCount = Math.min(anime.episodes || 12, 200);

  return (
    <div className="min-h-screen bg-dark-950 pb-10">
      {/* Hero Image */}
      <div className="relative h-[35vh] w-full">
        <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/70 to-transparent z-10" />
        <img src={imageUrl} alt={anime.title} className="w-full h-full object-cover" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 right-4 z-20 p-2 rounded-xl bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition"
        >
          <ArrowRight className="w-5 h-5" />
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
              {anime.score && (
                <span className="flex items-center gap-1 text-yellow-400 font-bold">
                  <Star className="w-3.5 h-3.5 fill-yellow-400" /> {anime.score}
                </span>
              )}
              {anime.type && <span>• {anime.type}</span>}
              {anime.year && <span>• {anime.year}</span>}
            </div>
            <span
              className={`inline-block mt-2 px-2 py-0.5 rounded-md ${
                anime.airing ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
              } text-[10px] font-bold`}
            >
              {anime.airing ? 'مستمر' : 'مكتمل'}
            </span>
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
            { id: 'details', label: 'التفاصيل', icon: Info },
            { id: 'episodes', label: 'الحلقات', icon: ListVideo },
            { id: 'stats', label: 'الإحصائيات', icon: BarChart2 },
            { id: 'characters', label: 'الشخصيات', icon: Users },
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
                <h3 className="text-sm font-black text-white mb-2">القصة</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{anime.synopsis || 'لا يوجد وصف.'}</p>
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
                  <PlayCircle className="w-5 h-5" /> مشاهدة التريلر
                </a>
              )}
            </div>
          )}

          {activeTab === 'episodes' && (
            <div className="space-y-2">
              <h3 className="text-sm font-black text-white mb-3">الحلقات المتاحة</h3>
              {Array.from({ length: episodeCount }, (_, i) => i + 1).map((ep) => (
                <button
                  key={ep}
                  onClick={() => navigate(`/watch/${anime.mal_id}/${ep}`)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-right"
                >
                  <span className="text-sm font-bold text-white">الحلقة {ep}</span>
                  <PlayCircle className="w-4 h-4 text-primary-400" />
                </button>
              ))}
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="card p-6 text-center">
              <BarChart2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">إحصائيات المشاهدة والتفاعل ستظهر هنا.</p>
            </div>
          )}

          {activeTab === 'characters' && (
            <div className="card p-6 text-center">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">شخصيات الأنمي والمؤدون الصوتيون سيظهرون هنا.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnimeDetail;

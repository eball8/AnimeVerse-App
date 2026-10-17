import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Star, PlayCircle, Loader2, Info, ListVideo, BarChart2, Users } from 'lucide-react';

const MOCK_ANIME = {
  id: 1, title: "Jujutsu Kaisen", titleJapanese: "呪術廻戦",
  synopsis: "A boy swallows a cursed talisman and enters the world of sorcery. He must now balance his high school life with battling curses.",
  image: "https://cdn.myanimelist.net/images/anime/1171/109222.jpg",
  score: 8.6, type: "TV", year: 2020, status: "مستمر",
  trailer: "https://www.youtube.com/watch?v=pkKu9hLT-t8",
  genres: ["Action", "Supernatural", "School"]
};

const AnimeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'details' | 'episodes' | 'stats' | 'characters'>('details');
  const [loading] = useState(false);
  const anime = MOCK_ANIME;

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center py-24 bg-dark-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 pb-10">
      <div className="relative h-[35vh] w-full">
        <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/70 to-transparent z-10" />
        <img src={anime.image} alt={anime.title} className="w-full h-full object-cover" />
        <button onClick={() => navigate(-1)} className="absolute top-4 right-4 z-20 p-2 rounded-xl bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition">
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 relative z-20 -mt-16 space-y-4">
        <div className="flex items-end gap-4">
          <img src={anime.image} alt={anime.title} className="w-24 h-36 rounded-2xl object-cover border-2 border-white/10 shadow-2xl bg-dark-900" />
          <div className="flex-1 pb-1">
            <h1 className="text-xl font-black text-white leading-tight mb-1">{anime.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="flex items-center gap-1 text-yellow-400 font-bold"><Star className="w-3.5 h-3.5 fill-yellow-400" /> {anime.score}</span>
              <span>• {anime.type}</span>
              <span>• {anime.year}</span>
            </div>
            <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">{anime.status}</span>
          </div>
        </div>

        <div className="flex border-b border-white/10 mt-6 overflow-x-auto no-scrollbar">
          {[
            { id: 'details', label: 'التفاصيل', icon: Info },
            { id: 'episodes', label: 'الحلقات', icon: ListVideo },
            { id: 'stats', label: 'الإحصائيات', icon: BarChart2 },
            { id: 'characters', label: 'الشخصيات', icon: Users },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors border-b-2 whitespace-nowrap px-2 ${activeTab === tab.id ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="pt-4">
          {activeTab === 'details' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-black text-white mb-2">القصة</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{anime.synopsis}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {anime.genres.map((g) => (<span key={g} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300">{g}</span>))}
              </div>
              {anime.trailer && (
                <a href={anime.trailer} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/20 transition">
                  <PlayCircle className="w-5 h-5" /> مشاهدة التريلر
                </a>
              )}
            </div>
          )}

          {activeTab === 'episodes' && (
            <div className="space-y-2">
              <h3 className="text-sm font-black text-white mb-3">الحلقات المتاحة</h3>
              {[1, 2, 3, 4, 5].map((ep) => (
                <button
                  key={ep}
                  onClick={() => navigate(`/watch/${anime.id}/${ep}`)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-right"
                >
                  <span className="text-sm font-bold text-white">الحلقة {ep}</span>
                  <PlayCircle className="w-4 h-4 text-primary-400" />
                </button>
              ))}
            </div>
          )}

          {activeTab === 'stats' && (<div className="card p-6 text-center"><BarChart2 className="w-10 h-10 text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">إحصائيات المشاهدة والتفاعل ستظهر هنا.</p></div>)}
          {activeTab === 'characters' && (<div className="card p-6 text-center"><Users className="w-10 h-10 text-slate-600 mx-auto mb-3" /><p className="text-sm text-slate-400">شخصيات الأنمي والمؤدون الصوتيون سيظهرون هنا.</p></div>)}
        </div>
      </div>
    </div>
  );
};

export default AnimeDetail;

import React from 'react';
import { ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Home: React.FC = () => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Welcome Card */}
      <div className="card p-6 bg-gradient-to-br from-primary-500/20 via-accent-500/10 to-transparent">
        <div className="flex items-center gap-3 mb-3">
          <ShieldCheck className="w-6 h-6 text-primary-400" />
          <span className="text-xs text-emerald-400 font-bold">منصة آمنة</span>
        </div>
        <h2 className="text-2xl font-black text-white mb-2">
          {profile ? `أهلاً ${profile.displayName}!` : 'أهلاً بك في AnimeVerse'}
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          {profile
            ? 'استمتع بمشاهدة الأنمي، اكتشف الجديد، وتواصل مع مجتمعك.'
            : 'سجّل دخولك لتجربة كاملة: مشاهدة الأنمي، المجتمع، والرسائل المشفّرة.'}
        </p>
      </div>

      {/* Sections placeholder */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-accent-400" />
          <h3 className="text-lg font-black text-white">الأكثر رواجاً</h3>
        </div>
        <div className="card p-6 text-center text-slate-500 text-sm">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-primary-500/40" />
          <p>سيتم تحميل الأنمي هنا قريباً...</p>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-black text-white mb-3">✨ أحدث الحلقات</h3>
        <div className="card p-6 text-center text-slate-500 text-sm">
          <p>قيد الإنشاء...</p>
        </div>
      </section>
    </div>
  );
};

export default Home;

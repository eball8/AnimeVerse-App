import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Compass, User, Users, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Layout: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // تعريف نوع التبويب بشكل صريح لحل مشكلة TypeScript
  type Tab = {
    to?: string;
    icon?: any;
    label?: string;
    isCenter?: boolean;
  };

  const tabs: Tab[] = [
    { to: '/', icon: Home, label: 'الرئيسية' },
    { to: '/explore', icon: Compass, label: 'استكشاف' },
    { isCenter: true }, // زر المنتصف
    { to: '/community', icon: Users, label: 'المجتمع' },
    { to: '/profile', icon: User, label: 'حسابي' },
  ];

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col relative overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-dark-950/80 border-b border-white/10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-black bg-gradient-to-r from-primary-400 via-accent-400 to-primary-400 bg-clip-text text-transparent">
            AnimeVerse
          </h1>
          {profile && (
            <NavLink to="/profile" className="flex items-center gap-2">
              <span className="text-xs text-slate-400 hidden sm:block">{profile.displayName}</span>
              <img
                src={profile.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.uid}`}
                alt=""
                className="w-9 h-9 rounded-full object-cover ring-2 ring-primary-500/40"
              />
            </NavLink>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full pb-24">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl bg-dark-950/90 border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto grid grid-cols-5 relative">
          {tabs.map((tab, index) => {
            if (tab.isCenter) {
              return (
                <div key="center" className="flex justify-center items-center relative -top-4">
                  <button
                    onClick={() => navigate('/create-post')}
                    className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 text-white flex items-center justify-center shadow-lg shadow-primary-500/40 active:scale-95 transition-transform"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              );
            }
            return (
              <NavLink
                key={tab.to}
                to={tab.to!}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
                    isActive ? 'text-primary-400' : 'text-slate-500 hover:text-slate-300'
                  }`
                }
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold">{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Layout;

import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Compass, User, Users, Plus, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeNotifications } from '../services/notificationService';

const Layout: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    return subscribeNotifications(user.uid, (items) => {
      setUnread(items.filter((n) => !n.read).length);
    });
  }, [user]);

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
            <div className="flex items-center gap-2">
              <NavLink
                to="/notifications"
                className="relative p-2 text-slate-300"
                aria-label="الإشعارات"
              >
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                  <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </NavLink>
              <NavLink to="/profile" className="flex items-center gap-2">
                <span className="text-xs text-slate-400 hidden sm:block">{profile.displayName}</span>
                <img
                  src={profile.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.uid}`}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover ring-2 ring-primary-500/40"
                />
              </NavLink>
            </div>
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
          {tabs.map((tab) => {
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

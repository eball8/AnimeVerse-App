import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, User, Users, Plus, Bell, MessageCircle, Search, Clapperboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { subscribeNotifications } from '../services/notificationService';
import { initE2EE } from '../services/cryptoService';

const Layout: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // داخل المحادثة نخفي الشريط السفلي ليظهر صندوق الكتابة كاملاً
  const inChat = /^\/messages\/[^/]+/.test(pathname);

  // نقيس ارتفاع الهيدر والشريط السفلي ونشاركه كمتغيرات CSS لباقي الصفحات
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty('--app-header-h', `${headerRef.current?.offsetHeight ?? 0}px`);
      root.style.setProperty('--app-nav-h', `${navRef.current?.offsetHeight ?? 0}px`);
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    if (ro) {
      if (headerRef.current) ro.observe(headerRef.current);
      if (navRef.current) ro.observe(navRef.current);
    }
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [inChat, !!user]);

  useEffect(() => {
    if (!user) return;
    return subscribeNotifications(user.uid, (items) => {
      setUnread(items.filter((n) => !n.read).length);
    });
  }, [user]);

  // تجهيز مفاتيح التشفير بصمت حتى يستطيع الجميع استقبال الرسائل المشفّرة
  useEffect(() => {
    if (!user) return;
    initE2EE(user.uid).catch((e) => console.error('E2EE init failed:', e));
  }, [user?.uid]);

  type Tab = {
    to?: string;
    icon?: any;
    label?: string;
    isCenter?: boolean;
  };

  const tabs: Tab[] = [
    { to: '/', icon: Home, label: t('nav.home') },
    { to: '/explore', icon: Compass, label: t('nav.explore') },
    { to: '/reels', icon: Clapperboard, label: t('nav.reels') },
    { isCenter: true },
    { to: '/community', icon: Users, label: t('nav.community') },
    { to: '/profile', icon: User, label: t('nav.profile') },
  ];

  const iconBtn = 'relative p-2 text-slate-300 active:scale-90 transition-transform';

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col relative overflow-x-hidden">
      {/* Header */}
      {/* ثابت دائماً في الأعلى (fixed). sticky كان يتعطل بسبب overflow-x-hidden على الحاوية */}
      <header
        ref={headerRef}
        className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-dark-950/90 border-b border-white/10 pt-[env(safe-area-inset-top)]"
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-black bg-gradient-to-r from-primary-400 via-accent-400 to-primary-400 bg-clip-text text-transparent">
            AnimeVerse
          </h1>
          {user && (
            <div className="flex items-center gap-1">
              <NavLink to="/notifications" className={iconBtn} aria-label={t('header.notifications')}>
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                  <span className="absolute top-0 end-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </NavLink>
              <NavLink to="/messages" className={iconBtn} aria-label={t('header.messages')}>
                <MessageCircle className="w-5 h-5" />
              </NavLink>
              <NavLink to="/search" className={iconBtn} aria-label={t('header.search')}>
                <Search className="w-5 h-5" />
              </NavLink>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main
        className={`flex-1 max-w-2xl mx-auto w-full ${inChat ? '' : 'pb-24'}`}
        style={{ paddingTop: 'var(--app-header-h, calc(env(safe-area-inset-top) + 3.75rem))' }}
      >
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      {!inChat && (
      <nav
        ref={navRef}
        className="fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl bg-dark-950/90 border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-2xl mx-auto grid grid-cols-6 relative">
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
                <span className="text-[10px] font-semibold truncate max-w-full px-0.5">{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
      )}
    </div>
  );
};

export default Layout;

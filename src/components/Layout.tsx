import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, User, Users, Plus, Bell, MessageCircle, Search, Clapperboard, Menu, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeConversations, isUnread } from '../services/chatService';
import type { Conversation } from '../services/chatService';
import { subscribeChatPrefs } from '../services/chatPrefsService';
import type { ChatPrefMap } from '../services/chatPrefsService';
import { sendHeartbeat, HEARTBEAT_MS } from '../services/presenceService';
import { useI18n } from '../i18n/I18nContext';
import { subscribeNotifications } from '../services/notificationService';
import { initE2EE } from '../services/cryptoService';
import { setShareLikesWithFriends } from '../services/postService';
import { getMutualFriendIds } from '../services/followService';
import SettingsMenu from './SettingsMenu';

const Layout: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);
  const [convItems, setConvItems] = useState<Conversation[]>([]);
  const [chatPrefs, setChatPrefs] = useState<ChatPrefMap>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // داخل المحادثة نخفي الشريط السفلي ليظهر صندوق الكتابة كاملاً
  const inChat = /^\/messages\/[^/]+/.test(pathname);
  // شاشة الريلز: ملء الشاشة بدون الهيدر العام (الشعار/الإشعارات/الرسائل/البحث)
  const isReels = /^\/reels(\/|$)/.test(pathname);
  // شاشة صندوق الرسائل: هيدر نظيف (اسم المستخدم + بحث + إشعارات + رسائل) بلا شعار ولا ☰
  const isInbox = pathname === '/messages';
  // شاشة الملف الشخصي الرئيسية: هنا فقط يظهر زر ☰
  const isProfileHome = pathname === '/profile';
  const showUsername = isInbox || isProfileHome;

  // نغلق القائمة الجانبية عند أي تنقّل
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
  }, [inChat, isReels, !!user]);

  useEffect(() => {
    if (!user) return;
    return subscribeNotifications(user.uid, (items) => {
      setUnread(items.filter((n) => !n.read).length);
    });
  }, [user]);

  // المحادثات + إعدادات الكتم (المحادثات المكتومة لا تُظهر نقطة حمراء)
  useEffect(() => {
    if (!user) return;
    return subscribeConversations(user.uid, setConvItems);
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    return subscribeChatPrefs(user.uid, setChatPrefs);
  }, [user?.uid]);

  const unreadChats = useMemo(
    () => !!user && convItems.some((c) => isUnread(c, user.uid) && !chatPrefs[c.id]?.muted),
    [convItems, chatPrefs, user]
  );

  // حالة النشاط (متصل الآن): نبضة كل دقيقة طالما التطبيق مفتوح والمستخدم لم يخفِ نشاطه
  const showActivity = profile?.showActivity !== false;
  useEffect(() => {
    if (!user || !showActivity) return;
    const beat = () => { if (document.visibilityState === 'visible') sendHeartbeat(user.uid); };
    beat();
    const id = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', beat); };
  }, [user?.uid, showActivity]);

  // إعداد "إظهار الفيديوهات التي أُعجبت بها للأصدقاء"
  const shareLikes = profile?.showLikedReels !== false;
  useEffect(() => {
    setShareLikesWithFriends(shareLikes);
  }, [shareLikes]);

  // تسخين قائمة الأصدقاء مسبقاً ليكون الإعجاب في الريلز فورياً
  useEffect(() => {
    if (!user) return;
    getMutualFriendIds(user.uid).catch(() => undefined);
  }, [user?.uid]);

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
      {/* Header: يختفي بالكامل في شاشة الريلز */}
      {!isReels && (
        <header
          ref={headerRef}
          className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-dark-950/90 border-b border-white/10 pt-[env(safe-area-inset-top)]"
        >
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            {showUsername && user ? (
              <h1 className="flex items-center gap-1.5 min-w-0 text-lg font-black text-white">
                <span className="truncate" dir="ltr">{profile?.username || ''}</span>
                {isProfileHome && profile?.accountType === 'private' && <Lock className="w-4 h-4 shrink-0 text-slate-400" />}
              </h1>
            ) : (
              <h1 className="text-xl font-black bg-gradient-to-r from-primary-400 via-accent-400 to-primary-400 bg-clip-text text-transparent">
                AnimeVerse
              </h1>
            )}
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
                  {unreadChats && <span className="absolute top-1 end-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-dark-950" />}
                </NavLink>
                <NavLink to="/search" className={iconBtn} aria-label={t('header.search')}>
                  <Search className="w-5 h-5" />
                </NavLink>
                {isProfileHome && (
                  <button onClick={() => setMenuOpen(true)} className={iconBtn} aria-label={t('ui.menu')}>
                    <Menu className="w-6 h-6 text-white" />
                  </button>
                )}
              </div>
            )}
          </div>
        </header>
      )}

      <SettingsMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Main Content */}
      <main
        className={`flex-1 max-w-2xl mx-auto w-full ${inChat || isReels ? '' : 'pb-24'}`}
        style={{
          paddingTop: isReels ? 0 : 'var(--app-header-h, calc(env(safe-area-inset-top) + 3.75rem))',
        }}
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

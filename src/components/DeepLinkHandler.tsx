import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../context/AuthContext';
import { routeFromUrl, savePendingRoute, takePendingRoute } from '../services/deepLinks';

// يستقبل روابط الملفات الشخصية والمنشورات والريلز من خارج التطبيق ويفتحها مباشرة
const DeepLinkHandler: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const ready = useRef(false);
  const last = useRef({ route: '', at: 0 });
  ready.current = !loading && !!user;

  const open = useRef((url: string) => {});
  open.current = (url: string) => {
    const route = routeFromUrl(url);
    if (!route) return;
    // نفس الرابط قد يصل مرتين (إطلاق بارد + حدث) فنتجاهل التكرار
    const now = Date.now();
    if (last.current.route === route && now - last.current.at < 2000) return;
    last.current = { route, at: now };
    if (ready.current) navigate(route);
    else savePendingRoute(route);
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let off = false;
    CapApp.getLaunchUrl()
      .then((r) => {
        if (!off && r?.url) open.current(r.url);
      })
      .catch(() => undefined);
    const sub = CapApp.addListener('appUrlOpen', (e) => open.current(e.url));
    return () => {
      off = true;
      sub.then((h) => h.remove()).catch(() => undefined);
    };
  }, []);

  // بعد انتهاء التحميل/تسجيل الدخول نفتح الوجهة المحفوظة
  useEffect(() => {
    if (loading || !user) return;
    const route = takePendingRoute();
    if (route) navigate(route);
  }, [loading, user, navigate]);

  return null;
};

export default DeepLinkHandler;

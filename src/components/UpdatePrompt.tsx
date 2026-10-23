import React, { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { APK_URL, getInstalledBuild, subscribePublishedBuild } from '../services/updateService';
import { openExternal } from '../services/ezvPlayer';

const UpdatePrompt: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [installed, setInstalled] = useState(0);
  const [published, setPublished] = useState(0);
  const [dismissed, setDismissed] = useState(0);

  // رقم النسخة المثبّتة على هذا الهاتف
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    getInstalledBuild().then(setInstalled);
  }, []);

  // مراقبة لحظية لما ينشره الأدمن (فقط بعد تسجيل الدخول)
  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;
    return subscribePublishedBuild(setPublished);
  }, [user?.uid]);

  // عند الرجوع للتطبيق تظهر اللوحة مرة أخرى إن لم يحدّث المستخدم بعد
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) setDismissed(0);
    });
    return () => {
      handle.then((h) => h.remove()).catch(() => undefined);
    };
  }, []);

  if (!installed || published <= installed || dismissed === published) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-white/10 rounded-3xl w-full max-w-sm p-6 space-y-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary-500/20 flex items-center justify-center mx-auto">
          <Download className="w-7 h-7 text-primary-400" />
        </div>
        <h3 className="text-lg font-black text-white">{t('upd.title')}</h3>
        <p className="text-sm text-slate-300">{t('upd.body')}</p>
        <button
          onClick={() => openExternal(APK_URL)}
          className="w-full btn-primary py-3 flex items-center justify-center gap-2"
        >
          {t('upd.now')}
        </button>
        <button onClick={() => setDismissed(published)} className="w-full py-2 text-xs text-slate-400">
          {t('upd.later')}
        </button>
      </div>
    </div>
  );
};

export default UpdatePrompt;

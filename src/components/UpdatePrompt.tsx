import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Download } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { APK_URL, getInstalledBuild, getLatestBuild } from '../services/updateService';
import { openExternal } from '../services/ezvPlayer';

const CHECK_MS = 10 * 60 * 1000;

const UpdatePrompt: React.FC = () => {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const dismissedBuild = useRef(0);

  const check = useCallback(async () => {
    const installed = await getInstalledBuild();
    if (!installed) return;
    const latest = await getLatestBuild();
    if (latest > installed && latest !== dismissedBuild.current) {
      dismissedBuild.current = 0;
      setShow(true);
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    check();
    const id = window.setInterval(check, CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    const handle = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) check();
    });
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      handle.then((h) => h.remove()).catch(() => undefined);
    };
  }, [check]);

  const later = async () => {
    dismissedBuild.current = await getLatestBuild();
    setShow(false);
  };

  if (!show) return null;

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
        <button onClick={later} className="w-full py-2 text-xs text-slate-400">
          {t('upd.later')}
        </button>
      </div>
    </div>
  );
};

export default UpdatePrompt;

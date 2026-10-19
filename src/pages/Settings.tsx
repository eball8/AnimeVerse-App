import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, User, Lock, Shield, Smartphone, PlayCircle,
  Palette, Trash2, MessageSquare, Info, LogOut, ChevronLeft,
  CheckCircle2, AlertCircle, Loader2, Globe, Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { clearAppCache } from '../services/nativeCache';
import { useI18n } from '../i18n/I18nContext';
import { LANGUAGES } from '../i18n/translations';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { t, pref, setPref, systemLang } = useI18n();

  const [activeSection, setActiveSection] = useState<string>('main');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleClearCache = async () => {
    setLoading(true);
    try {
      await clearAppCache();
      setMessage(t('settings.cacheOk'));
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setMessage(t('settings.cacheFail'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const rowCls = 'w-full flex items-center justify-between p-4 hover:bg-white/5 text-start';

  const Row: React.FC<{ icon: any; label: string; onClick: () => void; right?: React.ReactNode; disabled?: boolean }> = ({
    icon: Icon, label, onClick, right, disabled,
  }) => (
    <button onClick={onClick} disabled={disabled} className={rowCls}>
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-slate-400" />
        <span className="text-sm font-bold text-white">{label}</span>
      </div>
      {right ?? <ChevronLeft className="w-4 h-4 text-slate-500 rtl:rotate-0 ltr:rotate-180" />}
    </button>
  );

  const currentLangName =
    pref === 'system'
      ? t('settings.langSystem')
      : LANGUAGES.find((l) => l.code === pref)?.name || '';

  const renderContent = () => {
    if (activeSection === 'main') {
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('settings.sec.account')}</h3>
            <div className="card divide-y divide-white/5">
              <Row icon={User} label={t('settings.personal')} onClick={() => setActiveSection('account')} />
              <Row icon={Shield} label={t('settings.security')} onClick={() => setActiveSection('security')} />
              <Row icon={Smartphone} label={t('settings.devices')} onClick={() => setActiveSection('devices')} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('settings.sec.privacy')}</h3>
            <div className="card divide-y divide-white/5">
              <Row icon={Lock} label={t('settings.privacy')} onClick={() => setActiveSection('privacy')} />
              <Row icon={MessageSquare} label={t('settings.e2ee')} onClick={() => setActiveSection('e2ee')} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('settings.sec.app')}</h3>
            <div className="card divide-y divide-white/5">
              <Row
                icon={Globe}
                label={t('settings.language')}
                onClick={() => setActiveSection('language')}
                right={<span className="text-xs text-slate-400">{currentLangName}</span>}
              />
              <Row icon={PlayCircle} label={t('settings.player')} onClick={() => setActiveSection('player')} />
              <Row icon={Palette} label={t('settings.theme')} onClick={() => setActiveSection('theme')} />
              <Row
                icon={Trash2}
                label={t('settings.clearCache')}
                onClick={handleClearCache}
                disabled={loading}
                right={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
              />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('settings.sec.support')}</h3>
            <div className="card divide-y divide-white/5">
              <Row icon={AlertCircle} label={t('settings.report')} onClick={() => setActiveSection('support')} />
              <Row icon={Info} label={t('settings.about')} onClick={() => setActiveSection('about')} />
            </div>
          </div>

          <button onClick={handleSignOut} className="w-full py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-500/20 transition">
            <LogOut className="w-4 h-4" /> {t('settings.logout')}
          </button>
        </div>
      );
    }

    if (activeSection === 'language') {
      const options: { value: 'system' | (typeof LANGUAGES)[number]['code']; label: string; sub?: string }[] = [
        {
          value: 'system',
          label: t('settings.langSystem'),
          sub: LANGUAGES.find((l) => l.code === systemLang)?.name,
        },
        ...LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
      ];
      return (
        <div className="space-y-4">
          <button onClick={() => setActiveSection('main')} className="flex items-center gap-2 text-sm text-primary-400 font-bold">
            <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" /> {t('settings.backToSettings')}
          </button>
          <h2 className="text-lg font-black text-white">{t('settings.langTitle')}</h2>
          <p className="text-xs text-slate-400 leading-relaxed">{t('settings.langHint')}</p>
          <div className="card divide-y divide-white/5">
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => setPref(o.value)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-start"
              >
                <div>
                  <p className="text-sm font-bold text-white">{o.label}</p>
                  {o.sub && <p className="text-[11px] text-slate-500">{o.sub}</p>}
                </div>
                {pref === o.value && <Check className="w-5 h-5 text-primary-400" />}
              </button>
            ))}
          </div>
        </div>
      );
    }

    const titles: Record<string, string> = {
      account: t('settings.personal'),
      security: t('settings.security'),
      devices: t('settings.devices'),
      privacy: t('settings.privacy'),
      e2ee: t('settings.e2ee'),
      player: t('settings.player'),
      theme: t('settings.theme'),
      support: t('settings.report'),
      about: t('settings.about'),
    };

    return (
      <div className="space-y-4">
        <button onClick={() => setActiveSection('main')} className="flex items-center gap-2 text-sm text-primary-400 font-bold mb-4">
          <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" /> {t('settings.backToSettings')}
        </button>
        <div className="card p-6 text-center">
          <h2 className="text-lg font-black text-white mb-2">{titles[activeSection]}</h2>
          <p className="text-sm text-slate-400">{t('settings.soon')}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        {activeSection === 'main' ? (
          <button onClick={() => navigate('/profile')} className="p-2 rounded-xl hover:bg-white/10 text-slate-300">
            <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
          </button>
        ) : null}
        <h2 className="text-xl font-black text-white">{activeSection === 'main' ? t('settings.title') : ''}</h2>
      </div>

      {message && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-xs text-emerald-300">{message}</p>
        </div>
      )}

      {renderContent()}
    </div>
  );
};

export default Settings;

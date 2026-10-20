import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Pencil, Bookmark, Shield, Lock, ShieldCheck, Settings as SettingsIcon, LogOut, Users, Link2, Share2, Check, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { updateUserProfile } from '../services/userService';
import { copyText, profileLink, shareLink } from '../utils/links';
import Avatar from './Avatar';

interface RowProps {
  icon: React.ElementType;
  label: string;
  sub?: string;
  onClick: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

const Row: React.FC<RowProps> = ({ icon: Icon, label, sub, onClick, right, danger, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/10 transition text-start disabled:opacity-50 ${
      danger ? 'text-red-400' : 'text-white'
    }`}
  >
    <Icon className={`w-5 h-5 shrink-0 ${danger ? 'text-red-400' : 'text-primary-400'}`} />
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-bold truncate">{label}</span>
      {sub && <span className="block text-[11px] text-slate-500 truncate">{sub}</span>}
    </span>
    {right ?? (!danger && <ChevronLeft className="w-4 h-4 text-slate-600 rtl:rotate-0 ltr:rotate-180" />)}
  </button>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="text-[11px] font-black text-primary-400 mb-2 px-1">{title}</h3>
    <div className="card divide-y divide-white/5 overflow-hidden">{children}</div>
  </div>
);

const SettingsMenu: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { user, profile, signOut, refreshProfile, isAdmin } = useAuth();
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open || !user) return null;

  const isPrivate = profile?.accountType === 'private';
  const link = profileLink(user.uid);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const togglePrivacy = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateUserProfile(user.uid, { accountType: isPrivate ? 'public' : 'private' });
      await refreshProfile();
    } catch (e) {
      console.error(e);
      alert(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const flash = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShare = async () => {
    const r = await shareLink(link, t('profile.shareText', { name: profile?.displayName || '' }));
    if (r === 'copied') flash();
  };

  const handleCopy = async () => {
    if (await copyText(link)) flash();
  };

  const handleLogout = async () => {
    onClose();
    await signOut();
    navigate('/login');
  };

  // تبديل الحساب: نخرج من الحساب الحالي ونعرض قائمة الحسابات المحفوظة (الحساب يبقى محفوظاً)
  const handleSwitch = async () => {
    onClose();
    await signOut();
    navigate('/login');
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={t('ui.menu')}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <aside className="absolute top-0 bottom-0 start-0 w-[86%] max-w-sm bg-dark-950 border-e border-white/10 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <Avatar
            src={profile?.photoURL}
            seed={user.uid}
            name={profile?.displayName}
            className="w-11 h-11 rounded-full object-cover ring-2 ring-primary-500/40"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">{profile?.displayName}</p>
            <p className="text-[11px] text-slate-500 truncate">@{profile?.username}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-300" aria-label={t('common.cancel')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <Section title={t('ui.accountProfile')}>
            <Row icon={Pencil} label={t('profile.edit')} onClick={() => go('/edit-profile')} />
            <Row icon={Bookmark} label={t('profile.library')} onClick={() => go('/library')} />
            <Row
              icon={copied ? Check : Link2}
              label={t('common.copyLink')}
              onClick={handleCopy}
              right={<span />}
            />
            <Row icon={Share2} label={t('ui.shareProfile')} onClick={handleShare} right={<span />} />
            {isAdmin && <Row icon={Shield} label={t('profile.admin')} onClick={() => go('/admin')} />}
          </Section>

          <Section title={t('ui.privacy')}>
            <Row
              icon={Lock}
              label={t('profile.private')}
              sub={t('ui.privateSub')}
              onClick={togglePrivacy}
              disabled={saving}
              right={
                <span
                  className={`relative w-11 h-6 rounded-full transition-colors ${isPrivate ? 'bg-emerald-500' : 'bg-white/15'}`}
                  aria-hidden
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                      isPrivate ? 'start-[22px]' : 'start-0.5'
                    }`}
                  />
                </span>
              }
            />
            <Row
              icon={ShieldCheck}
              label={t('ui.securityLabel')}
              sub={t('ui.securitySub')}
              onClick={() => go('/settings')}
            />
          </Section>

          <Section title={t('ui.app')}>
            <Row
              icon={SettingsIcon}
              label={t('ui.allSettings')}
              sub={t('ui.allSettingsSub')}
              onClick={() => go('/settings')}
            />
          </Section>
        </div>

        <div className="p-4 border-t border-white/10 space-y-2">
          <button
            onClick={handleSwitch}
            className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition"
          >
            <Users className="w-4 h-4 text-primary-400" /> {t('ui.switchAccount')}
          </button>
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-500/20 transition"
          >
            <LogOut className="w-4 h-4" /> {t('profile.logout')}
          </button>
        </div>
      </aside>
    </div>
  );
};

export default SettingsMenu;

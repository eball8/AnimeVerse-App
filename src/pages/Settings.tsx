import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowRight, User, Lock, Shield, Smartphone, PlayCircle,
  Palette, Trash2, MessageSquare, Info, LogOut, ChevronLeft,
  CheckCircle2, AlertCircle, Loader2, Globe, Check, Mail, KeyRound,
  ShieldCheck, ShieldAlert, Moon, Sun, MonitorSmartphone, ExternalLink, UserX, PauseCircle, Archive,
  Flag,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { clearAppCache } from '../services/nativeCache';
import { useI18n } from '../i18n/I18nContext';
import { LANGUAGES } from '../i18n/translations';
import { updateUserProfile } from '../services/userService';
import { acceptRequest, rejectRequest, subscribeFollowRequests } from '../services/followService';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import {
  checkPin, initE2EE, resetKeysWithPin, sanitizePin, setupPin,
} from '../services/cryptoService';
import type { E2EEInit } from '../services/cryptoService';
import {
  TRUST_DAYS, addEmailPassword, authErrorText, changePassword, getPlayerPref, getProviderEmail, hasProvider,
  syncPrivateEmail, isCurrentTrusted, loadDevices, removeDevice, sendProblemReport, setPlayerPref,
} from '../services/settingsService';
import type { DeviceItem, PlayerPref } from '../services/settingsService';
import { clearMyFriendActivity } from '../services/postService';
import Avatar from '../components/Avatar';
import ReportFlow from '../components/ReportFlow';
import { searchUsers } from '../services/searchService';
import { profileLink } from '../utils/links';
import type { UserProfile } from '../types';
import DatePickerSheet from '../components/DatePickerSheet';
import { calcAge } from '../utils/age';
import { deactivateAccount, deleteAccount } from '../services/accountService';
import SecuritySection from '../components/SecuritySection';

// ---------- عناصر مشتركة ----------
const inputCls =
  'w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 disabled:opacity-50';
const btnCls =
  'w-full py-2.5 rounded-xl bg-primary-500/20 border border-primary-500/30 text-primary-300 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]';
const dangerBtnCls =
  'w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]';

const Notice: React.FC<{ kind: 'ok' | 'err' | 'warn'; text: string }> = ({ kind, text }) => {
  const color =
    kind === 'ok'
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
      : kind === 'warn'
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      : 'bg-red-500/10 border-red-500/30 text-red-300';
  const Icon = kind === 'ok' ? CheckCircle2 : AlertCircle;
  return (
    <div className={`p-3 rounded-2xl border flex items-start gap-2 ${color}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <p className="text-xs leading-relaxed">{text}</p>
    </div>
  );
};

const SUPPORT_EMAIL = 'support@animeverse.com';

const dayUnit = (t: (k: string) => string, n: number) => (n === 1 ? t('sx.unitDay') : t('sx.unitDays'));

const BackLabel: React.FC = () => {
  const { t } = useI18n();
  return <>{t('settings.backToSettings')}</>;
};

const SubPage: React.FC<{ title: string; onBack: () => void; children: React.ReactNode }> = ({
  title, onBack, children,
}) => (
  <div className="space-y-4">
    <button onClick={onBack} className="flex items-center gap-2 text-sm text-primary-400 font-bold">
      <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" /> <BackLabel />
    </button>
    <h2 className="text-lg font-black text-white">{title}</h2>
    {children}
  </div>
);

const InfoRow: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 p-4">
    <span className="text-xs text-slate-400">{label}</span>
    <span className="text-sm font-bold text-white text-end break-all">{value ?? '—'}</span>
  </div>
);

const Row: React.FC<{
  icon: any; label: string; onClick: () => void; right?: React.ReactNode; disabled?: boolean;
}> = ({ icon: Icon, label, onClick, right, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-start"
  >
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-slate-400" />
      <span className="text-sm font-bold text-white">{label}</span>
    </div>
    {right ?? <ChevronLeft className="w-4 h-4 text-slate-500 rtl:rotate-0 ltr:rotate-180" />}
  </button>
);

// ---------- الأجهزة والثقة ----------
const useDevices = (uid: string) => {
  const [devices, setDevices] = useState<DeviceItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setDevices(await loadDevices(uid));
      setFailed(false);
    } catch (e) {
      console.error(e);
      setFailed(true);
      setDevices([]);
    }
  }, [uid]);

  useEffect(() => {
    reload();
  }, [reload]);

  const trusted = devices !== null && !failed && isCurrentTrusted(devices);
  const current = devices?.find((d) => d.current);
  return { devices, reload, trusted, current, loaded: devices !== null, failed };
};

const TrustBanner: React.FC<{ loaded: boolean; trusted: boolean; failed: boolean; daysLeft?: number }> = ({
  loaded, trusted, failed, daysLeft,
}) => {
  const { t } = useI18n();
  if (!loaded || trusted) return null;
  if (failed) return <Notice kind="warn" text={t('sx.trustFailed')} />;
  return (
    <Notice
      kind="warn"
      text={t('sx.untrusted', {
        days: TRUST_DAYS,
        left: daysLeft ? ' ' + t('sx.untrustedLeft', { n: daysLeft, unit: dayUnit(t, daysLeft) }) : '',
      })}
    />
  );
};

// ---------- البيانات الشخصية ----------
const PersonalSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const navigate = useNavigate();
  const { user, profile, resendVerification, refreshProfile, refreshUser } = useAuth();
  const { lang, t } = useI18n();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // تحديث بيانات الحساب من السيرفر عند فتح الصفحة حتى يظهر أي بريد أُضيف حديثاً
  useEffect(() => {
    syncPrivateEmail()
      .then(() => refreshUser())
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;
  const googleEmail = hasProvider(user, 'google.com') ? getProviderEmail(user, 'google.com') : null;
  const loginEmail = hasProvider(user, 'password')
    ? getProviderEmail(user, 'password') || user.email
    : null;
  const created = (profile?.createdAt as any)?.toDate?.() as Date | undefined;
  const age = profile?.birthDate ? calcAge(profile.birthDate) : profile?.age;

  const saveBirth = async (iso: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await updateUserProfile(user.uid, { birthDate: iso, age: calcAge(iso) });
      await refreshProfile();
      setMsg({ kind: 'ok', text: t('sx.birthSaved') });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: t('sx.birthFail') });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      await resendVerification();
      setMsg({ kind: 'ok', text: t('sx.verifySent') });
    } catch (e) {
      setMsg({ kind: 'err', text: authErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubPage title={t('sx.personalTitle')} onBack={onBack}>
      <div className="card flex items-center gap-3 p-4">
        <Avatar
          src={profile?.photoURL}
          seed={user.uid}
          name={profile?.displayName || ''}
          className="w-14 h-14 rounded-full object-cover bg-dark-900"
        />
        <div className="min-w-0">
          <p className="text-sm font-black text-white truncate">{profile?.displayName}</p>
          <p className="text-xs text-slate-400 truncate" dir="ltr">@{profile?.username}</p>
        </div>
      </div>

      <div className="card divide-y divide-white/5">
        <InfoRow label={t('sx.email')} value={<span dir="ltr">{user.email || loginEmail || googleEmail || '—'}</span>} />
        <InfoRow
          label={t('sc.google')}
          value={googleEmail ? <span dir="ltr">{googleEmail}</span> : <span className="text-slate-500">{t('sc.notAdded')}</span>}
        />
        <InfoRow
          label={t('sc.emailPw')}
          value={loginEmail ? <span dir="ltr">{loginEmail}</span> : <span className="text-slate-500">{t('sc.notAdded')}</span>}
        />
        <InfoRow
          label={t('sx.emailStatus')}
          value={
            user.emailVerified ? (
              <span className="text-emerald-400">{t('sx.verified')}</span>
            ) : (
              <span className="text-amber-400">{t('sx.unverified')}</span>
            )
          }
        />
        <InfoRow label={t('sx.created')} value={created ? created.toLocaleDateString(lang) : undefined} />
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white">{t('sx.birth')}</h3>
          {typeof age === 'number' && <span className="text-xs text-slate-400">{t('sx.age', { age })}</span>}
        </div>
        <DatePickerSheet
          value={profile?.birthDate || ''}
          onChange={saveBirth}
          minAge={13}
          placeholder={t('sx.addBirth')}
        />
      </div>

      {!user.emailVerified && user.email && (
        <button onClick={resend} disabled={busy} className={btnCls}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          {t('sx.sendVerify')}
        </button>
      )}
      {msg && <Notice kind={msg.kind} text={msg.text} />}

      <button onClick={() => navigate('/edit-profile')} className={btnCls}>
        <User className="w-4 h-4" /> {t('sx.editProfile')}
      </button>
    </SubPage>
  );
};

// ---------- الأجهزة النشطة ----------
const DevicesSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const { devices, reload, trusted, current, loaded, failed } = useDevices(user!.uid);
  const { lang, t } = useI18n();
  const [busyId, setBusyId] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!user) return null;

  const remove = async (d: DeviceItem) => {
    if (!confirm(t('sx.removeConfirm', { name: d.label }))) return;
    setBusyId(d.id);
    setMsg(null);
    try {
      await removeDevice(user.uid, d.id);
      await reload();
      setMsg({ kind: 'ok', text: t('sx.removed') });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: t('sx.removeFail') });
    } finally {
      setBusyId('');
    }
  };

  return (
    <SubPage title={t('sx.devicesTitle')} onBack={onBack}>
      <TrustBanner loaded={loaded} trusted={trusted} failed={failed} daysLeft={current?.daysLeft} />
      <p className="text-xs text-slate-400 leading-relaxed">
        {t('sx.devicesInfo', { days: TRUST_DAYS })}
      </p>

      {!loaded && <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" />}

      <div className="space-y-2">
        {devices?.map((d) => (
          <div key={d.id} className="card p-4 flex items-center gap-3">
            {d.trusted ? (
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate">
                {d.label} {d.current && <span className="text-[10px] text-primary-400">{t('sx.thisDevice')}</span>}
              </p>
              <p className="text-[11px] text-slate-400">
                {d.trusted ? t('sx.trusted') : t('sx.untrustedIn', { n: d.daysLeft, unit: dayUnit(t, d.daysLeft) })}
                {' • '}
                {new Date(d.createdAt).toLocaleDateString(lang)}
              </p>
            </div>
            {!d.current && (
              <button
                onClick={() => remove(d)}
                disabled={!trusted || busyId === d.id}
                className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                aria-label={t('sx.remove')}
              >
                {busyId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        ))}
      </div>

      {msg && <Notice kind={msg.kind} text={msg.text} />}
      <p className="text-[11px] text-slate-500 leading-relaxed">
        {t('sx.removeNote')}
      </p>
    </SubPage>
  );
};

// ---------- مفتاح تبديل (Switch) مشترك لإعدادات الخصوصية ----------
interface ToggleRowProps {
  title: string;
  sub: string;
  on: boolean;
  loading: boolean;
  disabled: boolean;
  onToggle: () => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ title, sub, on, loading, disabled, onToggle }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={title}
    onClick={onToggle}
    disabled={disabled || loading}
    className="w-full flex items-center justify-between gap-4 p-4 hover:bg-white/5 text-start disabled:opacity-60"
  >
    <div className="min-w-0">
      <p className="text-sm font-bold text-white">{title}</p>
      <p className="text-[11px] text-slate-500 leading-relaxed">{sub}</p>
    </div>
    {loading ? (
      <Loader2 className="w-5 h-5 text-primary-400 animate-spin shrink-0" />
    ) : (
      <span className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-primary-500' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'start-[22px]' : 'start-0.5'}`} />
      </span>
    )}
  </button>
);

// ---------- نوع الحساب وطلبات المراسلة ----------
type MsgPrivacy = 'everyone' | 'following' | 'nobody';

const PrivacySection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const [reqs, setReqs] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const briefs = useUserBriefs(reqs);

  useEffect(() => {
    if (!user) return;
    return subscribeFollowRequests(user.uid, setReqs);
  }, [user]);

  if (!user || !profile) return null;
  const accountType = profile.accountType === 'private' ? 'private' : 'public';
  const msgPrivacy: MsgPrivacy = ((profile as any).messagePrivacy as MsgPrivacy) || 'everyone';
  const showActivity = profile.showActivity !== false;
  const showLikedReels = profile.showLikedReels !== false;

  // يعيد true عند نجاح الحفظ. key = اسم العملية الجارية (لإظهار مؤشر التحميل في المفتاح المعني)
  const save = async (updates: Record<string, unknown>, okText: string, key = 'save'): Promise<boolean> => {
    setBusy(key);
    setMsg(null);
    try {
      await updateUserProfile(user.uid, updates as any);
      await refreshProfile();
      setMsg({ kind: 'ok', text: okText });
      return true;
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: t('sx.saveFail') });
      return false;
    } finally {
      setBusy('');
    }
  };

  const toggleActivity = async () => {
    const next = !showActivity;
    await save(
      { showActivity: next },
      next ? t('sx.activityOn') : t('sx.activityOff'),
      'toggle:activity'
    );
  };

  const toggleLikedReels = async () => {
    const next = !showLikedReels;
    const ok = await save(
      { showLikedReels: next },
      next ? t('sx.likedOn') : t('sx.likedOff'),
      'toggle:liked'
    );
    if (ok && !next) {
      // عند الإيقاف نحذف النشاط المنشور سابقاً حتى لا يبقى ظاهراً في تبويب Friends
      try {
        await clearMyFriendActivity(user.uid);
      } catch (e) {
        console.error('clear friend activity failed:', e);
        setMsg({ kind: 'err', text: t('sx.likedClearFail') });
      }
    }
  };

  const decide = async (fid: string, accept: boolean) => {
    setBusy(fid);
    try {
      if (accept) await acceptRequest(fid, user.uid);
      else await rejectRequest(fid, user.uid);
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: t('sx.requestFail') });
    } finally {
      setBusy('');
    }
  };

  const choice = (active: boolean, title: string, sub: string, onClick: () => void) => (
    <button
      key={title}
      onClick={onClick}
      disabled={busy !== ''}
      className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-start disabled:opacity-60"
    >
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-[11px] text-slate-500">{sub}</p>
      </div>
      {active && <Check className="w-5 h-5 text-primary-400 shrink-0" />}
    </button>
  );

  return (
    <SubPage title={t('sx.privacyTitle')} onBack={onBack}>
      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('sx.accountType')}</h3>
        <div className="card divide-y divide-white/5">
          {choice(accountType === 'public', t('sx.public'), t('sx.publicSub'), () =>
            accountType !== 'public' && save({ accountType: 'public' }, t('sx.nowPublic'))
          )}
          {choice(accountType === 'private', t('sx.private'), t('sx.privateSub'), () =>
            accountType !== 'private' && save({ accountType: 'private' }, t('sx.nowPrivate'))
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('sx.whoMsg')}</h3>
        <div className="card divide-y divide-white/5">
          {choice(msgPrivacy === 'everyone', t('sx.everyone'), t('sx.everyoneSub'), () =>
            save({ messagePrivacy: 'everyone' }, t('sx.saved'))
          )}
          {choice(msgPrivacy === 'following', t('sx.followingOnly'), t('sx.followingOnlySub'), () =>
            save({ messagePrivacy: 'following' }, t('sx.saved'))
          )}
          {choice(msgPrivacy === 'nobody', t('sx.nobody'), t('sx.nobodySub'), () =>
            save({ messagePrivacy: 'nobody' }, t('sx.saved'))
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('sx.visibility')}</h3>
        <div className="card divide-y divide-white/5">
          <ToggleRow
            title={t('sx.showActivity')}
            sub={t('sx.showActivitySub')}
            on={showActivity}
            loading={busy === 'toggle:activity'}
            disabled={busy !== ''}
            onToggle={toggleActivity}
          />
          <ToggleRow
            title={t('sx.showLiked')}
            sub={t('sx.showLikedSub')}
            on={showLikedReels}
            loading={busy === 'toggle:liked'}
            disabled={busy !== ''}
            onToggle={toggleLikedReels}
          />
        </div>
      </div>

      {msg && <Notice kind={msg.kind} text={msg.text} />}

      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('sx.followReqs', { n: reqs.length })}</h3>
        {reqs.length === 0 ? (
          <p className="text-xs text-slate-500 px-1">{t('sx.noReqs')}</p>
        ) : (
          <div className="card divide-y divide-white/5">
            {reqs.map((fid) => {
              const a = pickAuthor(briefs, fid, '...');
              return (
                <div key={fid} className="p-3 flex items-center gap-3">
                  <Avatar src={a.photo} seed={fid} name={a.name} className="w-10 h-10 rounded-full object-cover bg-dark-900" />
                  <p className="flex-1 text-sm font-bold text-white truncate">{a.name}</p>
                  <button
                    onClick={() => decide(fid, true)}
                    disabled={busy === fid}
                    className="px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-300 text-xs font-bold disabled:opacity-50"
                  >
                    {t('sx.accept')}
                  </button>
                  <button
                    onClick={() => decide(fid, false)}
                    disabled={busy === fid}
                    className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs font-bold disabled:opacity-50"
                  >
                    {t('sx.reject')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SubPage>
  );
};

// ---------- التشفير التام ----------
const E2EESection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { trusted, current, loaded, failed } = useDevices(user!.uid);
  const { t } = useI18n();
  const [state, setState] = useState<E2EEInit['state'] | 'loading' | 'error'>('loading');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let off = false;
    initE2EE(user.uid)
      .then((r) => !off && setState(r.state))
      .catch((e) => {
        console.error(e);
        if (!off) setState('error');
      });
    return () => {
      off = true;
    };
  }, [user]);

  if (!user) return null;

  const pinProblem = (): string | null => {
    const c = checkPin(pin);
    if (c === 'invalid') return t('sx.pinInvalid');
    if (c === 'weak') return t('sx.pinWeak');
    if (pin !== pin2) return t('sx.pinMismatch');
    return null;
  };

  const doSetup = async () => {
    const bad = pinProblem();
    if (bad) return setMsg({ kind: 'err', text: bad });
    setBusy(true);
    setMsg(null);
    try {
      await setupPin(user.uid, pin);
      setState('ready');
      setPin('');
      setPin2('');
      setMsg({ kind: 'ok', text: t('sx.pinSaved') });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: t('sx.pinSaveFail') });
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    const bad = pinProblem();
    if (bad) return setMsg({ kind: 'err', text: bad });
    if (!confirm(t('sx.resetConfirm'))) return;
    setBusy(true);
    setMsg(null);
    try {
      await resetKeysWithPin(user.uid, pin);
      setState('ready');
      setShowReset(false);
      setPin('');
      setPin2('');
      setMsg({ kind: 'ok', text: t('sx.resetDone') });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: t('sx.resetFail') });
    } finally {
      setBusy(false);
    }
  };

  const pinInputs = (
    <>
      <input
        dir="ltr"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(sanitizePin(e.target.value))}
        placeholder={t('sx.pinNew')}
        className={inputCls}
        disabled={busy}
      />
      <input
        dir="ltr"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin2}
        onChange={(e) => setPin2(sanitizePin(e.target.value))}
        placeholder={t('sx.pinRepeat')}
        className={inputCls}
        disabled={busy}
      />
    </>
  );

  return (
    <SubPage title={t('sx.e2eeTitle')} onBack={onBack}>
      <p className="text-xs text-slate-400 leading-relaxed">
        {t('sx.e2eeIntro')}
      </p>

      {state === 'loading' && <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" />}
      {state === 'error' && <Notice kind="err" text={t('sx.e2eeReadFail')} />}

      {state === 'ready' && (
        <div className="card p-4 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
          <p className="text-sm font-bold text-white">{t('sx.e2eeOn')}</p>
        </div>
      )}

      {state === 'setup' && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-black text-white">{t('sx.createPin')}</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('sx.pinWarn')}
          </p>
          {pinInputs}
          <button onClick={doSetup} disabled={busy} className={btnCls}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t('sx.savePin')}
          </button>
        </div>
      )}

      {(state === 'restore' || state === 'migrate') && (
        <div className="card p-4 space-y-3">
          <p className="text-xs text-slate-300 leading-relaxed">
            {t('sx.restoreNeed')}
          </p>
          <button onClick={() => navigate('/messages')} className={btnCls}>
            <MessageSquare className="w-4 h-4" /> {t('sx.openMessages')}
          </button>
        </div>
      )}

      {state === 'reset' && (
        <Notice kind="warn" text={t('sx.noBackup')} />
      )}

      {state !== 'loading' && state !== 'error' && state !== 'setup' && (
        <div className="space-y-3">
          <TrustBanner loaded={loaded} trusted={trusted} failed={failed} daysLeft={current?.daysLeft} />
          {!showReset ? (
            <button
              onClick={() => setShowReset(true)}
              disabled={state !== 'reset' && !trusted}
              className={dangerBtnCls}
            >
              {t('sx.forgot')}
            </button>
          ) : (
            <div className="card p-4 space-y-3 border-red-500/30">
              <p className="text-xs text-red-300 leading-relaxed">
                {t('sx.resetWarn')}
              </p>
              {pinInputs}
              <button onClick={doReset} disabled={busy} className={dangerBtnCls}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t('sx.confirmReset')}
              </button>
              <button onClick={() => setShowReset(false)} disabled={busy} className={btnCls}>
                {t('sx.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {msg && <Notice kind={msg.kind} text={msg.text} />}
    </SubPage>
  );
};

// ---------- المشغل ----------
const PlayerSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { t } = useI18n();
  const [pref, setPref] = useState<PlayerPref>(getPlayerPref);
  const pick = (p: PlayerPref) => {
    setPref(p);
    setPlayerPref(p);
  };
  const opt = (value: PlayerPref, title: string, sub: string) => (
    <button
      onClick={() => pick(value)}
      className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-start"
    >
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-[11px] text-slate-500">{sub}</p>
      </div>
      {pref === value && <Check className="w-5 h-5 text-primary-400 shrink-0" />}
    </button>
  );
  return (
    <SubPage title={t('sx.playerTitle')} onBack={onBack}>
      <p className="text-xs text-slate-400 leading-relaxed">{t('sx.playerHint')}</p>
      <div className="card divide-y divide-white/5">
        {opt('ezv', 'EZV Player', t('sx.ezvSub'))}
        {opt('browser', t('sx.browser'), t('sx.browserSub'))}
      </div>
      <a
        href="https://play.google.com/store/apps/details?id=com.player.easy"
        target="_blank"
        rel="noreferrer"
        className={btnCls}
      >
        <ExternalLink className="w-4 h-4" /> {t('sx.downloadEzv')}
      </a>
    </SubPage>
  );
};

// ---------- المظهر ----------
const ThemeSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const opts: { value: 'dark' | 'light' | 'system'; label: string; icon: any }[] = [
    { value: 'dark', label: t('sx.themeDark'), icon: Moon },
    { value: 'light', label: t('sx.themeLight'), icon: Sun },
    { value: 'system', label: t('sx.themeSystem'), icon: MonitorSmartphone },
  ];
  return (
    <SubPage title={t('sx.themeTitle')} onBack={onBack}>
      <div className="card divide-y divide-white/5">
        {opts.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 text-start"
          >
            <div className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-slate-400" />
              <span className="text-sm font-bold text-white">{label}</span>
            </div>
            {theme === value && <Check className="w-5 h-5 text-primary-400" />}
          </button>
        ))}
      </div>
    </SubPage>
  );
};

// ---------- الإصدار ----------
const useAppVersion = (): string => {
  const [v, setV] = useState('1.0.1');
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    CapApp.getInfo()
      .then((i) => setV(i.version))
      .catch(() => undefined);
  }, []);
  return v;
};

// ---------- الإبلاغ عن مشكلة / عن أحدهم ----------
const SupportSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const version = useAppVersion();
  const { lang } = useI18n();
  const { user } = useAuth();
  const L = (ar: string, en: string, fr: string) => (lang === 'ar' ? ar : lang === 'fr' ? fr : en);

  const [mode, setMode] = useState<'menu' | 'someone'>('menu');
  const [reportApp, setReportApp] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [target, setTarget] = useState<UserProfile | null>(null);

  const runSearch = async () => {
    if (term.trim().replace(/^@/, '').length < 2 || searching) return;
    setSearching(true);
    try {
      const list = await searchUsers(term);
      setResults(list.filter((u) => u.uid !== user?.uid));
    } finally {
      setSearched(true);
      setSearching(false);
    }
  };

  return (
    <SubPage
      title={mode === 'menu' ? L('الإبلاغ والدعم', 'Reports & support', 'Signalements et aide') : L('الإبلاغ عن أحدهم', 'Report someone', "Signaler quelqu'un")}
      onBack={mode === 'menu' ? onBack : () => setMode('menu')}
    >
      {mode === 'menu' ? (
        <div className="card divide-y divide-white/5">
          <Row
            icon={AlertCircle}
            label={L('الإبلاغ عن مشكلة في التطبيق', 'Report a problem with the app', "Signaler un problème de l'appli")}
            onClick={() => setReportApp(true)}
          />
          <Row
            icon={UserX}
            label={L('الإبلاغ عن أحدهم', 'Report someone', "Signaler quelqu'un")}
            onClick={() => setMode('someone')}
          />
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400 leading-relaxed">
            {L(
              'ابحث عن المستخدم باسمه أو اسم المستخدم ثم اخترْه لتبلّغ عنه. بلاغك مجهول الهوية.',
              'Search for the user by name or username, then pick them to report. Your report is anonymous.',
              "Recherchez l'utilisateur par nom ou pseudo puis choisissez-le pour le signaler. Votre signalement est anonyme."
            )}
          </p>
          <div className="flex gap-2">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value.slice(0, 40))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch();
              }}
              placeholder={L('اسم المستخدم', 'Username', "Nom d'utilisateur")}
              className={inputCls}
            />
            <button
              onClick={runSearch}
              disabled={searching}
              className="px-4 rounded-xl bg-primary-500/20 border border-primary-500/30 text-primary-300 text-sm font-bold disabled:opacity-50 flex items-center"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : L('بحث', 'Search', 'Chercher')}
            </button>
          </div>
          {searched && results.length === 0 && (
            <p className="text-center text-xs text-slate-500 py-6">{L('لا نتائج', 'No results', 'Aucun résultat')}</p>
          )}
          {results.length > 0 && (
            <div className="card divide-y divide-white/5">
              {results.map((u) => (
                <button
                  key={u.uid}
                  onClick={() => setTarget(u)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-start active:bg-white/5"
                >
                  <Avatar src={u.photoURL} seed={u.uid} name={u.displayName} className="w-10 h-10 rounded-full object-cover bg-dark-900" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white truncate">{u.displayName}</span>
                    <span className="block text-[11px] text-slate-500 truncate" dir="ltr">@{u.username}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {reportApp && (
        <ReportFlow targetType="app" targetId="app" appVersion={version} onClose={() => setReportApp(false)} />
      )}
      {target && (
        <ReportFlow
          targetType="user"
          targetId={target.uid}
          reportedUid={target.uid}
          reportedName={target.displayName}
          link={profileLink(target.uid)}
          onClose={() => setTarget(null)}
        />
      )}
    </SubPage>
  );
};

// ---------- حول التطبيق ----------
const AboutSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const version = useAppVersion();
  const { t } = useI18n();
  return (
    <SubPage title={t('sx.aboutTitle')} onBack={onBack}>
      <div className="card p-6 text-center space-y-1">
        <h3 className="text-xl font-black text-white">AnimeVerse</h3>
        <p className="text-xs text-slate-400">{t('sx.communityTag')}</p>
      </div>
      <div className="card divide-y divide-white/5">
        <InfoRow label={t('sx.version')} value={<span dir="ltr">{version}</span>} />
        <InfoRow label={t('sx.platform')} value={Capacitor.isNativePlatform() ? t('sx.androidApp') : t('sx.web')} />
      </div>
    </SubPage>
  );
};

// ---------- إدارة الحساب: تعطيل مؤقت / حذف نهائي ----------
const ManageAccountSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { trusted, current, loaded, failed } = useDevices(user!.uid);
  const { t } = useI18n();
  const deleteWord = t('sx.deleteWord');
  const [mode, setMode] = useState<'none' | 'deactivate' | 'delete'>('none');
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!user) return null;
  const hasPassword = hasProvider(user, 'password');
  const canEdit = loaded && trusted;

  const reset = () => {
    setMode('none');
    setPassword('');
    setTyped('');
    setMsg(null);
  };

  const doDeactivate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await deactivateAccount(user.uid);
      navigate('/login', { replace: true });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: t('sx.deactivateFail') });
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (typed.trim().toLowerCase() !== deleteWord.toLowerCase())
      return setMsg({ kind: 'err', text: t('sx.typeWord', { word: deleteWord }) });
    if (hasPassword && !password) return setMsg({ kind: 'err', text: t('sx.needPassword') });
    setBusy(true);
    setMsg(null);
    try {
      await deleteAccount(user, hasPassword ? password : undefined, setStep);
      navigate('/login', { replace: true });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: authErrorText(e) });
      setBusy(false);
      setStep('');
    }
  };

  return (
    <SubPage title={t('sx.manageTitle')} onBack={onBack}>
      <TrustBanner loaded={loaded} trusted={trusted} failed={failed} daysLeft={current?.daysLeft} />

      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PauseCircle className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-black text-white">{t('sx.deactivateHead')}</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t('sx.deactivateDesc')}
        </p>
        {mode === 'deactivate' ? (
          <div className="space-y-2">
            <button onClick={doDeactivate} disabled={!canEdit || busy} className={btnCls}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t('sx.confirmDeactivate')}
            </button>
            <button onClick={reset} disabled={busy} className={btnCls}>{t('sx.cancel')}</button>
          </div>
        ) : (
          <button
            onClick={() => { reset(); setMode('deactivate'); }}
            disabled={!canEdit || busy}
            className={btnCls}
          >
            <PauseCircle className="w-4 h-4" /> {t('sx.deactivateBtn')}
          </button>
        )}
      </div>

      <div className="card p-4 space-y-3 border-red-500/30">
        <div className="flex items-center gap-2">
          <UserX className="w-5 h-5 text-red-400" />
          <h3 className="text-sm font-black text-white">{t('sx.deleteHead')}</h3>
        </div>
        <p className="text-xs text-red-300 leading-relaxed">
          {t('sx.deleteDesc')}
        </p>
        {mode === 'delete' ? (
          <div className="space-y-2">
            {hasPassword && (
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('sx.currentPassword')}
                className={inputCls}
                disabled={busy}
              />
            )}
            {!hasPassword && (
              <p className="text-[11px] text-slate-400">{t('sx.googleConfirm')}</p>
            )}
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t('sx.typePlaceholder', { word: deleteWord })}
              className={inputCls}
              disabled={busy}
            />
            <button onClick={doDelete} disabled={!canEdit || busy} className={dangerBtnCls}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {busy && step ? step : t('sx.deleteForever')}
            </button>
            <button onClick={reset} disabled={busy} className={btnCls}>{t('sx.cancel')}</button>
          </div>
        ) : (
          <button
            onClick={() => { reset(); setMode('delete'); }}
            disabled={!canEdit || busy}
            className={dangerBtnCls}
          >
            <Trash2 className="w-4 h-4" /> {t('sx.deleteBtn')}
          </button>
        )}
      </div>

      {msg && <Notice kind={msg.kind} text={msg.text} />}
    </SubPage>
  );
};

// ---------- الصفحة الرئيسية ----------
const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { t, lang, pref, setPref, systemLang } = useI18n();

  const [activeSection, setActiveSection] = useState<string>('main');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!user) return <Navigate to="/login" replace />;

  const back = () => setActiveSection('main');

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

  const currentLangName =
    pref === 'system' ? t('settings.langSystem') : LANGUAGES.find((l) => l.code === pref)?.name || '';

  const myReportsLabel =
    lang === 'ar' ? 'بلاغاتك' : lang === 'fr' ? 'Vos signalements' : 'Your reports';

  const renderContent = () => {
    switch (activeSection) {
      case 'account':
        return <PersonalSection onBack={back} />;
      case 'security':
        return <SecuritySection onBack={back} />;
      case 'devices':
        return <DevicesSection onBack={back} />;
      case 'manage':
        return <ManageAccountSection onBack={back} />;
      case 'privacy':
        return <PrivacySection onBack={back} />;
      case 'e2ee':
        return <E2EESection onBack={back} />;
      case 'player':
        return <PlayerSection onBack={back} />;
      case 'theme':
        return <ThemeSection onBack={back} />;
      case 'support':
        return <SupportSection onBack={back} />;
      case 'about':
        return <AboutSection onBack={back} />;
      case 'language': {
        const options: { value: 'system' | (typeof LANGUAGES)[number]['code']; label: string; sub?: string }[] = [
          { value: 'system', label: t('settings.langSystem'), sub: LANGUAGES.find((l) => l.code === systemLang)?.name },
          ...LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
        ];
        return (
          <div className="space-y-4">
            <button onClick={back} className="flex items-center gap-2 text-sm text-primary-400 font-bold">
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
      default:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('settings.sec.account')}</h3>
              <div className="card divide-y divide-white/5">
                <Row icon={User} label={t('settings.personal')} onClick={() => setActiveSection('account')} />
                <Row icon={Shield} label={t('settings.security')} onClick={() => setActiveSection('security')} />
                <Row icon={Smartphone} label={t('settings.devices')} onClick={() => setActiveSection('devices')} />
                <Row icon={UserX} label={t('sx.manageTitle')} onClick={() => setActiveSection('manage')} />
              </div>
            </div>

            <div>
              <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('settings.sec.privacy')}</h3>
              <div className="card divide-y divide-white/5">
                <Row icon={Lock} label={t('settings.privacy')} onClick={() => setActiveSection('privacy')} />
                <Row icon={MessageSquare} label={t('settings.e2ee')} onClick={() => setActiveSection('e2ee')} />
                <Row icon={Archive} label={t('archive.settingsRow')} onClick={() => navigate('/archive')} />
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
                <Row icon={Flag} label={myReportsLabel} onClick={() => navigate('/my-reports')} />
                <Row
                  icon={Mail}
                  label={t('settings.supportEmail')}
                  onClick={() => { window.location.href = `mailto:${SUPPORT_EMAIL}`; }}
                  right={<span dir="ltr" className="text-xs text-slate-400">{SUPPORT_EMAIL}</span>}
                />
                <Row icon={Info} label={t('settings.about')} onClick={() => setActiveSection('about')} />
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-500/20 transition"
            >
              <LogOut className="w-4 h-4" /> {t('settings.logout')}
            </button>
          </div>
        );
    }
  };

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        {activeSection === 'main' && (
          <button onClick={() => navigate('/profile')} className="p-2 rounded-xl hover:bg-white/10 text-slate-300">
            <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
          </button>
        )}
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

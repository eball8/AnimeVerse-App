import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowRight, User, Lock, Shield, Smartphone, PlayCircle,
  Palette, Trash2, MessageSquare, Info, LogOut, ChevronLeft,
  CheckCircle2, AlertCircle, Loader2, Globe, Check, Mail, KeyRound,
  ShieldCheck, ShieldAlert, Moon, Sun, MonitorSmartphone, ExternalLink, UserX, PauseCircle,
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
  TRUST_DAYS, addEmailPassword, authErrorText, changePassword, getPlayerPref, hasProvider,
  isCurrentTrusted, loadDevices, removeDevice, sendProblemReport, setPlayerPref,
} from '../services/settingsService';
import type { DeviceItem, PlayerPref } from '../services/settingsService';
import { clearMyFriendActivity } from '../services/postService';
import Avatar from '../components/Avatar';
import DatePickerSheet from '../components/DatePickerSheet';
import { calcAge } from '../utils/age';
import { deactivateAccount, deleteAccount } from '../services/accountService';

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

const SubPage: React.FC<{ title: string; onBack: () => void; children: React.ReactNode }> = ({
  title, onBack, children,
}) => (
  <div className="space-y-4">
    <button onClick={onBack} className="flex items-center gap-2 text-sm text-primary-400 font-bold">
      <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" /> رجوع للإعدادات
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
  if (!loaded || trusted) return null;
  if (failed) return <Notice kind="warn" text="تعذّر التحقق من حالة هذا الجهاز. تحقق من الاتصال ثم أعد فتح الصفحة." />;
  return (
    <Notice
      kind="warn"
      text={`هذا الجهاز غير موثوق بعد، فلا يمكن تغيير الإعدادات الحساسة منه. يصبح موثوقاً تلقائياً بعد ${TRUST_DAYS} أيام من تسجيله${
        daysLeft ? ` (متبقٍ ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'})` : ''
      } بشرط ألا تحذف التطبيق أو الحساب خلالها.`}
    />
  );
};

// ---------- البيانات الشخصية ----------
const PersonalSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const navigate = useNavigate();
  const { user, profile, resendVerification, refreshProfile } = useAuth();
  const { lang } = useI18n();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const created = (profile?.createdAt as any)?.toDate?.() as Date | undefined;
  const age = profile?.birthDate ? calcAge(profile.birthDate) : profile?.age;

  const saveBirth = async (iso: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await updateUserProfile(user.uid, { birthDate: iso, age: calcAge(iso) });
      await refreshProfile();
      setMsg({ kind: 'ok', text: 'تم حفظ تاريخ الميلاد.' });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: 'تعذّر حفظ تاريخ الميلاد.' });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      await resendVerification();
      setMsg({ kind: 'ok', text: 'أرسلنا رابط التفعيل إلى بريدك.' });
    } catch (e) {
      setMsg({ kind: 'err', text: authErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubPage title="البيانات الشخصية" onBack={onBack}>
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
        <InfoRow label="البريد الإلكتروني" value={<span dir="ltr">{user.email || '—'}</span>} />
        <InfoRow
          label="حالة البريد"
          value={
            user.emailVerified ? (
              <span className="text-emerald-400">مفعّل</span>
            ) : (
              <span className="text-amber-400">غير مفعّل</span>
            )
          }
        />
        <InfoRow label="تاريخ إنشاء الحساب" value={created ? created.toLocaleDateString(lang) : undefined} />
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white">تاريخ الميلاد</h3>
          {typeof age === 'number' && <span className="text-xs text-slate-400">العمر: {age} سنة</span>}
        </div>
        <DatePickerSheet
          value={profile?.birthDate || ''}
          onChange={saveBirth}
          minAge={13}
          placeholder="أضف تاريخ ميلادك"
        />
      </div>

      {!user.emailVerified && user.email && (
        <button onClick={resend} disabled={busy} className={btnCls}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          إرسال رابط تفعيل البريد
        </button>
      )}
      {msg && <Notice kind={msg.kind} text={msg.text} />}

      <button onClick={() => navigate('/edit-profile')} className={btnCls}>
        <User className="w-4 h-4" /> تعديل الاسم والصورة واسم المستخدم
      </button>
    </SubPage>
  );
};

// ---------- الأمان وكلمة السر ----------
const SecuritySection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user, refreshUser } = useAuth();
  const { devices, trusted, current, loaded, failed } = useDevices(user!.uid);
  const [, bump] = useState(0);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [cur, setCur] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!user) return null;
  const hasGoogle = hasProvider(user, 'google.com');
  const hasPassword = hasProvider(user, 'password');
  const canEdit = loaded && trusted && devices !== null;

  const validNew = (): string | null => {
    if (pw.length < 6) return 'كلمة السر يجب أن تكون 6 أحرف أو أكثر.';
    if (pw !== pw2) return 'كلمتا السر غير متطابقتين.';
    return null;
  };

  const onAdd = async () => {
    const bad = validNew();
    if (bad) return setMsg({ kind: 'err', text: bad });
    if (!user.email) return setMsg({ kind: 'err', text: 'لا يوجد بريد مرتبط بالحساب.' });
    setBusy(true);
    setMsg(null);
    try {
      await addEmailPassword(user.email, pw);
      refreshUser();
      bump((n) => n + 1);
      setPw('');
      setPw2('');
      setMsg({ kind: 'ok', text: 'تمت إضافة تسجيل الدخول بالبريد وكلمة السر.' });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: authErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const onChange = async () => {
    if (!cur) return setMsg({ kind: 'err', text: 'اكتب كلمة السر الحالية.' });
    const bad = validNew();
    if (bad) return setMsg({ kind: 'err', text: bad });
    if (cur === pw) return setMsg({ kind: 'err', text: 'كلمة السر الجديدة مطابقة للحالية.' });
    setBusy(true);
    setMsg(null);
    try {
      await changePassword(cur, pw);
      setCur('');
      setPw('');
      setPw2('');
      setMsg({ kind: 'ok', text: 'تم تغيير كلمة السر.' });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: authErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubPage title="الأمان وتغيير كلمة السر" onBack={onBack}>
      <TrustBanner loaded={loaded} trusted={trusted} failed={failed} daysLeft={current?.daysLeft} />

      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">طرق تسجيل الدخول</h3>
        <div className="card divide-y divide-white/5">
          <InfoRow
            label="جوجل"
            value={hasGoogle ? <span className="text-emerald-400">مضاف</span> : <span className="text-slate-500">غير مضاف</span>}
          />
          <InfoRow
            label="البريد وكلمة السر"
            value={hasPassword ? <span className="text-emerald-400">مضاف</span> : <span className="text-slate-500">غير مضاف</span>}
          />
        </div>
      </div>

      {!hasPassword && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">إضافة تسجيل الدخول بالبريد وكلمة السر</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            الخطوة 1: البريد الذي ستسجّل به. الخطوة 2: اختر كلمة سر. بعدها تدخل بجوجل أو بالبريد وكلمة السر.
          </p>
          <input value={user.email || ''} disabled dir="ltr" className={inputCls} aria-label="البريد" />
          <input
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="كلمة السر الجديدة"
            className={inputCls}
            disabled={!canEdit || busy}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="أعد كتابة كلمة السر"
            className={inputCls}
            disabled={!canEdit || busy}
          />
          <button onClick={onAdd} disabled={!canEdit || busy || !user.email} className={btnCls}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} إضافة الطريقة
          </button>
        </div>
      )}

      {hasPassword && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">تغيير كلمة السر</h3>
          </div>
          <input
            type="password"
            autoComplete="current-password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            placeholder="كلمة السر الحالية"
            className={inputCls}
            disabled={!canEdit || busy}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="كلمة السر الجديدة"
            className={inputCls}
            disabled={!canEdit || busy}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="أعد كتابة كلمة السر الجديدة"
            className={inputCls}
            disabled={!canEdit || busy}
          />
          <button onClick={onChange} disabled={!canEdit || busy} className={btnCls}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} حفظ كلمة السر
          </button>
        </div>
      )}

      {msg && <Notice kind={msg.kind} text={msg.text} />}
    </SubPage>
  );
};

// ---------- الأجهزة النشطة ----------
const DevicesSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const { devices, reload, trusted, current, loaded, failed } = useDevices(user!.uid);
  const { lang } = useI18n();
  const [busyId, setBusyId] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!user) return null;

  const remove = async (d: DeviceItem) => {
    if (!confirm(`إزالة الجهاز "${d.label}" من القائمة؟`)) return;
    setBusyId(d.id);
    setMsg(null);
    try {
      await removeDevice(user.uid, d.id);
      await reload();
      setMsg({ kind: 'ok', text: 'تمت إزالة الجهاز من القائمة.' });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: 'تعذّرت إزالة الجهاز.' });
    } finally {
      setBusyId('');
    }
  };

  return (
    <SubPage title="الأجهزة النشطة والثقة" onBack={onBack}>
      <TrustBanner loaded={loaded} trusted={trusted} failed={failed} daysLeft={current?.daysLeft} />
      <p className="text-xs text-slate-400 leading-relaxed">
        الجهاز الأول الذي أنشأت منه الحساب موثوق مباشرة. أي جهاز جديد يصبح موثوقاً بعد {TRUST_DAYS} أيام من تسجيله.
        الجهاز غير الموثوق لا يستطيع تغيير كلمة السر أو الإعدادات الحساسة.
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
                {d.label} {d.current && <span className="text-[10px] text-primary-400">(هذا الجهاز)</span>}
              </p>
              <p className="text-[11px] text-slate-400">
                {d.trusted ? 'موثوق' : `غير موثوق، يصبح موثوقاً بعد ${d.daysLeft} ${d.daysLeft === 1 ? 'يوم' : 'أيام'}`}
                {' • '}
                {new Date(d.createdAt).toLocaleDateString(lang)}
              </p>
            </div>
            {!d.current && (
              <button
                onClick={() => remove(d)}
                disabled={!trusted || busyId === d.id}
                className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                aria-label="إزالة"
              >
                {busyId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        ))}
      </div>

      {msg && <Notice kind={msg.kind} text={msg.text} />}
      <p className="text-[11px] text-slate-500 leading-relaxed">
        إزالة جهاز من القائمة لا تُسجّل خروجه فوراً. إذا شككت في جهاز، غيّر كلمة السر من قسم الأمان.
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
      setMsg({ kind: 'err', text: 'تعذّر حفظ الإعداد.' });
      return false;
    } finally {
      setBusy('');
    }
  };

  const toggleActivity = async () => {
    const next = !showActivity;
    await save(
      { showActivity: next },
      next ? 'تم إظهار حالة النشاط.' : 'تم إخفاء حالة النشاط.',
      'toggle:activity'
    );
  };

  const toggleLikedReels = async () => {
    const next = !showLikedReels;
    const ok = await save(
      { showLikedReels: next },
      next ? 'سيظهر ما تُعجب به من فيديوهات لأصدقائك.' : 'تم إخفاء إعجاباتك عن الأصدقاء.',
      'toggle:liked'
    );
    if (ok && !next) {
      // عند الإيقاف نحذف النشاط المنشور سابقاً حتى لا يبقى ظاهراً في تبويب Friends
      try {
        await clearMyFriendActivity(user.uid);
      } catch (e) {
        console.error('clear friend activity failed:', e);
        setMsg({ kind: 'err', text: 'تم حفظ الإعداد لكن تعذّر حذف الإعجابات المنشورة سابقاً.' });
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
      setMsg({ kind: 'err', text: 'تعذّرت معالجة الطلب.' });
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
    <SubPage title="نوع الحساب وطلبات المراسلة" onBack={onBack}>
      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">نوع الحساب</h3>
        <div className="card divide-y divide-white/5">
          {choice(accountType === 'public', 'عام', 'أي شخص يتابعك مباشرة ويرى منشوراتك.', () =>
            accountType !== 'public' && save({ accountType: 'public' }, 'أصبح حسابك عاماً.')
          )}
          {choice(accountType === 'private', 'خاص', 'المتابعة تحتاج موافقتك على الطلب.', () =>
            accountType !== 'private' && save({ accountType: 'private' }, 'أصبح حسابك خاصاً.')
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">من يستطيع مراسلتك أول مرة؟</h3>
        <div className="card divide-y divide-white/5">
          {choice(msgPrivacy === 'everyone', 'الجميع', 'أي مستخدم يستطيع بدء محادثة معك.', () =>
            save({ messagePrivacy: 'everyone' }, 'تم حفظ الإعداد.')
          )}
          {choice(msgPrivacy === 'following', 'من أتابعهم فقط', 'فقط الأشخاص الذين تتابعهم يبدأون محادثة معك.', () =>
            save({ messagePrivacy: 'following' }, 'تم حفظ الإعداد.')
          )}
          {choice(msgPrivacy === 'nobody', 'لا أحد', 'لا تصلك محادثات جديدة. المحادثات الحالية تستمر.', () =>
            save({ messagePrivacy: 'nobody' }, 'تم حفظ الإعداد.')
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">الظهور والنشاط</h3>
        <div className="card divide-y divide-white/5">
          <ToggleRow
            title="إظهار حالة النشاط"
            sub="إظهار أنك متصل الآن وآخر ظهور لك. عند الإيقاف لن يرى الآخرون حالتك، ولن ترى أنت حالتهم."
            on={showActivity}
            loading={busy === 'toggle:activity'}
            disabled={busy !== ''}
            onToggle={toggleActivity}
          />
          <ToggleRow
            title="إظهار الفيديوهات والريلز التي أعجبتني للأصدقاء"
            sub="تظهر الفيديوهات التي تُعجب بها في تبويب الأصدقاء لدى من تتابعهم ويتابعونك. عند الإيقاف تُحذف الإعجابات المنشورة سابقاً."
            on={showLikedReels}
            loading={busy === 'toggle:liked'}
            disabled={busy !== ''}
            onToggle={toggleLikedReels}
          />
        </div>
      </div>

      {msg && <Notice kind={msg.kind} text={msg.text} />}

      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">طلبات المتابعة ({reqs.length})</h3>
        {reqs.length === 0 ? (
          <p className="text-xs text-slate-500 px-1">لا توجد طلبات حالياً.</p>
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
                    قبول
                  </button>
                  <button
                    onClick={() => decide(fid, false)}
                    disabled={busy === fid}
                    className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs font-bold disabled:opacity-50"
                  >
                    رفض
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
    if (c === 'invalid') return 'يجب أن يتكوّن الكود من 6 أرقام.';
    if (c === 'weak') return 'الكود سهل التخمين، تجنّب الأرقام المكررة أو المتسلسلة.';
    if (pin !== pin2) return 'الكودان غير متطابقين.';
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
      setMsg({ kind: 'ok', text: 'تم حفظ كود الأمان. رسائلك محمية.' });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: 'تعذّر حفظ الكود، حاول مرة أخرى.' });
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    const bad = pinProblem();
    if (bad) return setMsg({ kind: 'err', text: bad });
    if (!confirm('سيتم إنشاء مفاتيح جديدة وحذف رسائلك القديمة نهائياً. هل تريد المتابعة؟')) return;
    setBusy(true);
    setMsg(null);
    try {
      await resetKeysWithPin(user.uid, pin);
      setState('ready');
      setShowReset(false);
      setPin('');
      setPin2('');
      setMsg({ kind: 'ok', text: 'تم إنشاء مفاتيح وكود جديد. المحادثات الجديدة محمية.' });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: 'تعذّرت إعادة التعيين، حاول مرة أخرى.' });
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
        placeholder="الكود الجديد (6 أرقام)"
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
        placeholder="أعد كتابة الكود"
        className={inputCls}
        disabled={busy}
      />
    </>
  );

  return (
    <SubPage title="التشفير التام (E2EE)" onBack={onBack}>
      <p className="text-xs text-slate-400 leading-relaxed">
        رسائلك تُشفَّر على جهازك ولا يستطيع أحد قراءتها، ولا حتى نحن. كود الأمان (6 أرقام) يحفظ لك نسخة احتياطية
        من مفتاحك، وتحتاجه فقط عند تغيير الهاتف أو إعادة تثبيت التطبيق.
      </p>

      {state === 'loading' && <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" />}
      {state === 'error' && <Notice kind="err" text="تعذّر قراءة حالة التشفير. تحقق من الاتصال وأعد المحاولة." />}

      {state === 'ready' && (
        <div className="card p-4 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
          <p className="text-sm font-bold text-white">التشفير مفعّل على هذا الجهاز</p>
        </div>
      )}

      {state === 'setup' && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-black text-white">أنشئ كود الأمان</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            لا يمكننا استرجاع الكود لك، فاحفظه جيداً. إن نسيته لن تُستعاد رسائلك القديمة.
          </p>
          {pinInputs}
          <button onClick={doSetup} disabled={busy} className={btnCls}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} حفظ الكود
          </button>
        </div>
      )}

      {(state === 'restore' || state === 'migrate') && (
        <div className="card p-4 space-y-3">
          <p className="text-xs text-slate-300 leading-relaxed">
            هذا الجهاز يحتاج كود الأمان لاستعادة رسائلك. افتح الرسائل واكتب الكود.
          </p>
          <button onClick={() => navigate('/messages')} className={btnCls}>
            <MessageSquare className="w-4 h-4" /> فتح الرسائل
          </button>
        </div>
      )}

      {state === 'reset' && (
        <Notice kind="warn" text="لا توجد نسخة احتياطية صالحة لمفتاحك. أنشئ كوداً جديداً من الأسفل لبدء محادثات جديدة." />
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
              نسيت الكود؟ إنشاء كود ومفاتيح جديدة
            </button>
          ) : (
            <div className="card p-4 space-y-3 border-red-500/30">
              <p className="text-xs text-red-300 leading-relaxed">
                تحذير: سيتم حذف رسائلك القديمة نهائياً، وتبدأ كود جديد ومحادثات جديدة.
              </p>
              {pinInputs}
              <button onClick={doReset} disabled={busy} className={dangerBtnCls}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} تأكيد وإعادة التعيين
              </button>
              <button onClick={() => setShowReset(false)} disabled={busy} className={btnCls}>
                إلغاء
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
    <SubPage title="المشغل الافتراضي (EZV)" onBack={onBack}>
      <p className="text-xs text-slate-400 leading-relaxed">اختر كيف تُفتح روابط السيرفرات عند مشاهدة الحلقات.</p>
      <div className="card divide-y divide-white/5">
        {opt('ezv', 'EZV Player', 'يفتح الرابط مباشرة في تطبيق EZV إن كان مثبتاً.')}
        {opt('browser', 'المتصفح', 'يفتح الرابط في المتصفح بدل المشغل الخارجي.')}
      </div>
      <a
        href="https://play.google.com/store/apps/details?id=com.player.easy"
        target="_blank"
        rel="noreferrer"
        className={btnCls}
      >
        <ExternalLink className="w-4 h-4" /> تحميل EZV Player
      </a>
    </SubPage>
  );
};

// ---------- المظهر ----------
const ThemeSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { theme, setTheme } = useTheme();
  const opts: { value: 'dark' | 'light' | 'system'; label: string; icon: any }[] = [
    { value: 'dark', label: 'داكن', icon: Moon },
    { value: 'light', label: 'فاتح', icon: Sun },
    { value: 'system', label: 'حسب النظام', icon: MonitorSmartphone },
  ];
  return (
    <SubPage title="المظهر" onBack={onBack}>
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

// ---------- الإبلاغ عن مشكلة ----------
const SupportSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const version = useAppVersion();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const send = async () => {
    if (text.trim().length < 5) return setMsg({ kind: 'err', text: 'اشرح المشكلة بجملة واضحة.' });
    setBusy(true);
    setMsg(null);
    try {
      await sendProblemReport(text, version);
      setText('');
      setMsg({ kind: 'ok', text: 'وصلنا بلاغك، شكراً لك.' });
    } catch (e) {
      console.error(e);
      setMsg({ kind: 'err', text: 'تعذّر إرسال البلاغ حالياً.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubPage title="الإبلاغ عن مشكلة" onBack={onBack}>
      <p className="text-xs text-slate-400 leading-relaxed">
        اكتب ما حدث وفي أي صفحة. نُرفق تلقائياً رقم الإصدار واسم الجهاز لتسهيل الحل.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 400))}
        rows={6}
        placeholder="اشرح المشكلة هنا..."
        className={inputCls}
        disabled={busy}
      />
      <p className="text-[11px] text-slate-500 text-end">{text.length}/400</p>
      <button onClick={send} disabled={busy} className={btnCls}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} إرسال البلاغ
      </button>
      {msg && <Notice kind={msg.kind} text={msg.text} />}
    </SubPage>
  );
};

// ---------- حول التطبيق ----------
const AboutSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const version = useAppVersion();
  return (
    <SubPage title="حول التطبيق والإصدار" onBack={onBack}>
      <div className="card p-6 text-center space-y-1">
        <h3 className="text-xl font-black text-white">AnimeVerse</h3>
        <p className="text-xs text-slate-400">مجتمع الأنمي</p>
      </div>
      <div className="card divide-y divide-white/5">
        <InfoRow label="الإصدار" value={<span dir="ltr">{version}</span>} />
        <InfoRow label="المنصة" value={Capacitor.isNativePlatform() ? 'تطبيق أندرويد' : 'الويب'} />
      </div>
    </SubPage>
  );
};

// ---------- إدارة الحساب: تعطيل مؤقت / حذف نهائي ----------
const DELETE_WORD = 'حذف';

const ManageAccountSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { trusted, current, loaded, failed } = useDevices(user!.uid);
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
      setMsg({ kind: 'err', text: 'تعذّر تعطيل الحساب، حاول مرة أخرى.' });
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (typed.trim() !== DELETE_WORD) return setMsg({ kind: 'err', text: `اكتب كلمة "${DELETE_WORD}" للتأكيد.` });
    if (hasPassword && !password) return setMsg({ kind: 'err', text: 'اكتب كلمة السر لتأكيد هويتك.' });
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
    <SubPage title="تعطيل الحساب أو حذفه" onBack={onBack}>
      <TrustBanner loaded={loaded} trusted={trusted} failed={failed} daysLeft={current?.daysLeft} />

      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PauseCircle className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-black text-white">تعطيل الحساب مؤقتاً</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          يختفي ملفك الشخصي من البحث ومن زوار صفحتك، وتبقى بياناتك محفوظة كما هي. يعاد تفعيل حسابك تلقائياً
          عند تسجيل الدخول في أي وقت.
        </p>
        {mode === 'deactivate' ? (
          <div className="space-y-2">
            <button onClick={doDeactivate} disabled={!canEdit || busy} className={btnCls}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} تأكيد التعطيل وتسجيل الخروج
            </button>
            <button onClick={reset} disabled={busy} className={btnCls}>إلغاء</button>
          </div>
        ) : (
          <button
            onClick={() => { reset(); setMode('deactivate'); }}
            disabled={!canEdit || busy}
            className={btnCls}
          >
            <PauseCircle className="w-4 h-4" /> تعطيل حسابي
          </button>
        )}
      </div>

      <div className="card p-4 space-y-3 border-red-500/30">
        <div className="flex items-center gap-2">
          <UserX className="w-5 h-5 text-red-400" />
          <h3 className="text-sm font-black text-white">حذف الحساب نهائياً</h3>
        </div>
        <p className="text-xs text-red-300 leading-relaxed">
          لا يمكن التراجع. تُحذف منشوراتك وتعليقاتك وقصصك وإعجاباتك ومتابعاتك ورسائلك المرسلة ومفاتيح التشفير
          واسم المستخدم وحساب الدخول نفسه. إن أردت العودة لاحقاً فعطّل الحساب بدل حذفه.
        </p>
        {mode === 'delete' ? (
          <div className="space-y-2">
            {hasPassword && (
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة السر الحالية"
                className={inputCls}
                disabled={busy}
              />
            )}
            {!hasPassword && (
              <p className="text-[11px] text-slate-400">سيُطلب منك تأكيد الهوية بحساب جوجل.</p>
            )}
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`اكتب "${DELETE_WORD}" للتأكيد`}
              className={inputCls}
              disabled={busy}
            />
            <button onClick={doDelete} disabled={!canEdit || busy} className={dangerBtnCls}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {busy && step ? step : 'حذف حسابي نهائياً'}
            </button>
            <button onClick={reset} disabled={busy} className={btnCls}>إلغاء</button>
          </div>
        ) : (
          <button
            onClick={() => { reset(); setMode('delete'); }}
            disabled={!canEdit || busy}
            className={dangerBtnCls}
          >
            <Trash2 className="w-4 h-4" /> حذف حسابي
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
  const { t, pref, setPref, systemLang } = useI18n();

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
                <Row icon={UserX} label="تعطيل الحساب أو حذفه" onClick={() => setActiveSection('manage')} />
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

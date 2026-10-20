import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight, Lock, KeyRound, Mail, Loader2, CheckCircle2, AlertCircle, Pencil, Trash2, Plus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { checkEmail } from '../utils/emailValidation';
import {
  TRUST_DAYS, addEmailPassword, addGoogleAccount, changeEmail, changeGoogleAccount,
  changePassword, getProviderEmail, hasProvider, isCurrentTrusted, loadDevices, removeEmailMethod,
  removeGoogleAccount, syncPrivateEmail,
} from '../services/settingsService';
import type { DeviceItem } from '../services/settingsService';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

// ---------- عناصر مشتركة ----------
const inputCls =
  'w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 disabled:opacity-50';
const btnCls =
  'w-full py-2.5 rounded-xl bg-primary-500/20 border border-primary-500/30 text-primary-300 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]';
const dangerBtnCls =
  'w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]';
const ghostBtnCls =
  'w-full py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-bold disabled:opacity-50 active:scale-[0.98]';
const miniBtnCls =
  'px-3 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 disabled:opacity-40 active:scale-95';

// يحوّل أخطاء الأمان إلى نص بلغة المستخدم الحالية
const errorText = (e: any, t: TFn): string => {
  const code = String(e?.code ?? e?.message ?? '');
  if (/untrusted-device/.test(code)) return t('sc.err.untrusted');
  if (/trust-check-failed/.test(code)) return t('sc.err.trustCheck');
  if (/last-method/.test(code)) return t('sc.err.lastMethod');
  if (/same-email/.test(code)) return t('sc.err.sameEmail');
  if (/same-google/.test(code)) return t('sc.err.sameGoogle');
  if (/need-email-method/.test(code)) return t('sc.err.needEmail');
  if (/no-such-provider/.test(code)) return t('sc.err.noProvider');
  if (/invalid-email/.test(code)) return t('sc.err.invalidEmail');
  if (/wrong-password|invalid-credential|invalid-login/.test(code)) return t('sc.err.wrongPassword');
  if (/weak-password/.test(code)) return t('sc.err.weakPassword');
  if (/email-already-in-use/.test(code)) return t('sc.err.emailInUse');
  if (/credential-already-in-use/.test(code)) return t('sc.err.credentialInUse');
  if (/provider-already-linked/.test(code)) return t('sc.err.alreadyLinked');
  if (/user-mismatch/.test(code)) return t('sc.err.userMismatch');
  if (/too-many-requests/.test(code)) return t('sc.err.tooMany');
  if (/network/.test(code)) return t('sc.err.network');
  if (/cancel|12501|12502|popup-closed/i.test(code)) return t('sc.err.cancelled');
  if (/requires-recent-login/.test(code)) return t('sc.err.recentLogin');
  return t('sc.err.generic');
};

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
}) => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-primary-400 font-bold">
        <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" /> {t('settings.backToSettings')}
      </button>
      <h2 className="text-lg font-black text-white">{title}</h2>
      {children}
    </div>
  );
};

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
  return { devices, trusted, current, loaded: devices !== null, failed };
};

const TrustBanner: React.FC<{ loaded: boolean; trusted: boolean; failed: boolean; daysLeft?: number }> = ({
  loaded, trusted, failed, daysLeft,
}) => {
  const { t } = useI18n();
  if (!loaded || trusted) return null;
  if (failed) return <Notice kind="warn" text={t('sc.trustFailed')} />;
  const left = daysLeft
    ? daysLeft === 1
      ? t('sc.daysLeftOne')
      : t('sc.daysLeftMany', { n: daysLeft })
    : '';
  return <Notice kind="warn" text={`${t('sc.untrusted', { days: TRUST_DAYS })}${left}`} />;
};

// ---------- صف طريقة الدخول ----------
const MethodRow: React.FC<{
  label: string;
  added: boolean;
  email?: string | null;
  children?: React.ReactNode;
}> = ({ label, added, email, children }) => {
  const { t } = useI18n();
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">{label}</span>
        <span className={`text-sm font-bold ${added ? 'text-emerald-400' : 'text-slate-500'}`}>
          {added ? t('sc.added') : t('sc.notAdded')}
        </span>
      </div>
      {added && email && (
        <p dir="ltr" className="text-sm font-bold text-white text-start break-all">{email}</p>
      )}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
};

type Panel =
  | null
  | 'addEmail'
  | 'changeEmail'
  | 'removeEmail'
  | 'addGoogle'
  | 'changeGoogle'
  | 'removeGoogle';

// ---------- الأمان وكلمة السر ----------
const SecuritySection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { t } = useI18n();
  const { user, refreshUser } = useAuth();
  const { devices, trusted, current, loaded, failed } = useDevices(user!.uid);
  const [panel, setPanel] = useState<Panel>(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [cur, setCur] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // مزامنة البريد (بعد تأكيد رابط تغيير البريد مثلاً) وتحديث بيانات المستخدم
  useEffect(() => {
    syncPrivateEmail()
      .then(() => refreshUser())
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  const hasGoogle = hasProvider(user, 'google.com');
  const hasPassword = hasProvider(user, 'password');
  const googleEmail = getProviderEmail(user, 'google.com');
  const passwordEmail = getProviderEmail(user, 'password') || (hasPassword ? user.email : null);
  const canEdit = loaded && trusted && devices !== null;

  const resetFields = () => {
    setEmail('');
    setPw('');
    setPw2('');
    setCur('');
  };

  const openPanel = (p: Panel) => {
    resetFields();
    setMsg(null);
    setPanel(panel === p ? null : p);
  };

  const validNewPassword = (): string | null => {
    if (pw.length < 6) return t('sc.pwShort');
    if (pw !== pw2) return t('sc.pwMismatch');
    return null;
  };

  // نص خطأ التحقق من البريد بلغة المستخدم
  const emailError = (chk: { message: string; key?: string; vars?: Record<string, string> }) =>
    chk.key ? t(chk.key, chk.vars) : chk.message;

  // يشغّل عملية ويعرض نتيجتها ويحدّث الواجهة
  const run = async (task: () => Promise<void>, okText: string, closePanel = true) => {
    setBusy(true);
    setMsg(null);
    try {
      await task();
      refreshUser();
      resetFields();
      if (closePanel) setPanel(null);
      setMsg({ kind: 'ok', text: okText });
    } catch (e) {
      console.error(e);
      refreshUser();
      setMsg({ kind: 'err', text: errorText(e, t) });
    } finally {
      setBusy(false);
    }
  };

  // ---- البريد وكلمة السر ----
  const onAddEmail = () => {
    const chk = checkEmail(email);
    if (!chk.ok) return setMsg({ kind: 'err', text: emailError(chk) });
    const bad = validNewPassword();
    if (bad) return setMsg({ kind: 'err', text: bad });
    run(() => addEmailPassword(email, pw), t('sc.addEmailOk'));
  };

  const onChangeEmail = () => {
    const chk = checkEmail(email);
    if (!chk.ok) return setMsg({ kind: 'err', text: emailError(chk) });
    if (!cur) return setMsg({ kind: 'err', text: t('sc.needCurrent') });
    run(() => changeEmail(cur, email), t('sc.changeEmailOk'));
  };

  const onRemoveEmail = () => run(() => removeEmailMethod(), t('sc.removeEmailOk'));

  const onChangePassword = () => {
    if (!cur) return setMsg({ kind: 'err', text: t('sc.needCurrent') });
    const bad = validNewPassword();
    if (bad) return setMsg({ kind: 'err', text: bad });
    if (cur === pw) return setMsg({ kind: 'err', text: t('sc.samePw') });
    run(() => changePassword(cur, pw), t('sc.pwChanged'), false);
  };

  // ---- جوجل ----
  const onAddGoogle = () => {
    if (!cur) return setMsg({ kind: 'err', text: t('sc.needCurrent') });
    run(() => addGoogleAccount(cur), t('sc.googleLinked'));
  };

  const onChangeGoogle = () => run(() => changeGoogleAccount(), t('sc.googleChanged'));

  const onRemoveGoogle = () => {
    if (!cur) return setMsg({ kind: 'err', text: t('sc.needCurrent') });
    run(() => removeGoogleAccount(cur), t('sc.googleRemoved'));
  };

  const passwordField = (
    <input
      type="password"
      autoComplete="current-password"
      value={cur}
      onChange={(e) => setCur(e.target.value)}
      placeholder={t('sc.currentPw')}
      className={inputCls}
      disabled={!canEdit || busy}
    />
  );

  const spinner = busy && <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <SubPage title={t('sc.title')} onBack={onBack}>
      <TrustBanner loaded={loaded} trusted={trusted} failed={failed} daysLeft={current?.daysLeft} />

      {/* ---------- طرق تسجيل الدخول ---------- */}
      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">{t('sc.methods')}</h3>
        <div className="card divide-y divide-white/5">
          <MethodRow label={t('sc.google')} added={hasGoogle} email={googleEmail}>
            {hasGoogle ? (
              <>
                <button
                  onClick={() => openPanel('changeGoogle')}
                  disabled={!canEdit || busy || !hasPassword}
                  className={`${miniBtnCls} border-primary-500/30 bg-primary-500/10 text-primary-300`}
                >
                  <Pencil className="w-3 h-3" /> {t('sc.changeAccount')}
                </button>
                <button
                  onClick={() => openPanel('removeGoogle')}
                  disabled={!canEdit || busy || !hasPassword}
                  className={`${miniBtnCls} border-red-500/30 bg-red-500/10 text-red-400`}
                >
                  <Trash2 className="w-3 h-3" /> {t('sc.delete')}
                </button>
              </>
            ) : (
              <button
                onClick={() => openPanel('addGoogle')}
                disabled={!canEdit || busy}
                className={`${miniBtnCls} border-primary-500/30 bg-primary-500/10 text-primary-300`}
              >
                <Plus className="w-3 h-3" /> {t('sc.linkGoogle')}
              </button>
            )}
          </MethodRow>

          <MethodRow label={t('sc.emailPw')} added={hasPassword} email={passwordEmail}>
            {hasPassword ? (
              <>
                <button
                  onClick={() => openPanel('changeEmail')}
                  disabled={!canEdit || busy}
                  className={`${miniBtnCls} border-primary-500/30 bg-primary-500/10 text-primary-300`}
                >
                  <Pencil className="w-3 h-3" /> {t('sc.editEmail')}
                </button>
                <button
                  onClick={() => openPanel('removeEmail')}
                  disabled={!canEdit || busy || !hasGoogle}
                  className={`${miniBtnCls} border-red-500/30 bg-red-500/10 text-red-400`}
                >
                  <Trash2 className="w-3 h-3" /> {t('sc.delete')}
                </button>
              </>
            ) : (
              <button
                onClick={() => openPanel('addEmail')}
                disabled={!canEdit || busy}
                className={`${miniBtnCls} border-primary-500/30 bg-primary-500/10 text-primary-300`}
              >
                <Plus className="w-3 h-3" /> {t('sc.addEmailPw')}
              </button>
            )}
          </MethodRow>
        </div>

        {hasGoogle && !hasPassword && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2 px-1">
            {t('sc.noteGoogleOnly')}
          </p>
        )}
        {hasPassword && !hasGoogle && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2 px-1">
            {t('sc.noteEmailOnly')}
          </p>
        )}
        {hasPassword && hasGoogle && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2 px-1">
            {t('sc.noteBoth')}
          </p>
        )}
      </div>

      {/* ---------- إضافة البريد وكلمة السر ---------- */}
      {panel === 'addEmail' && !hasPassword && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">{t('sc.addEmailHead')}</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('sc.addEmailDesc')}
          </p>
          <input
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('sc.emailPlaceholder')}
            className={inputCls}
            disabled={!canEdit || busy}
          />
          {googleEmail && (
            <button
              type="button"
              onClick={() => setEmail(googleEmail)}
              disabled={!canEdit || busy}
              className={ghostBtnCls}
            >
              {t('sc.useGoogleEmail', { email: googleEmail })}
            </button>
          )}
          <input
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={t('sc.newPw')}
            className={inputCls}
            disabled={!canEdit || busy}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder={t('sc.repeatPw')}
            className={inputCls}
            disabled={!canEdit || busy}
          />
          <button onClick={onAddEmail} disabled={!canEdit || busy} className={btnCls}>
            {spinner} {t('sc.addMethod')}
          </button>
        </div>
      )}

      {/* ---------- تعديل البريد ---------- */}
      {panel === 'changeEmail' && hasPassword && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">{t('sc.changeEmailHead')}</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('sc.changeEmailDesc')}
          </p>
          <input
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('sc.newEmail')}
            className={inputCls}
            disabled={!canEdit || busy}
          />
          {passwordField}
          <button onClick={onChangeEmail} disabled={!canEdit || busy} className={btnCls}>
            {spinner} {t('sc.sendConfirm')}
          </button>
        </div>
      )}

      {/* ---------- حذف البريد ---------- */}
      {panel === 'removeEmail' && hasPassword && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-black text-white">{t('sc.removeEmailHead')}</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('sc.removeEmailDesc')}
          </p>
          <button onClick={onRemoveEmail} disabled={!canEdit || busy || !hasGoogle} className={dangerBtnCls}>
            {spinner} {t('sc.confirmDelete')}
          </button>
        </div>
      )}

      {/* ---------- ربط جوجل ---------- */}
      {panel === 'addGoogle' && !hasGoogle && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">{t('sc.linkGoogleHead')}</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('sc.linkGoogleDesc')}
          </p>
          {passwordField}
          <button onClick={onAddGoogle} disabled={!canEdit || busy} className={btnCls}>
            {spinner} {t('sc.pickGoogle')}
          </button>
        </div>
      )}

      {/* ---------- تغيير جوجل ---------- */}
      {panel === 'changeGoogle' && hasGoogle && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">{t('sc.changeGoogleHead')}</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('sc.changeGoogleDesc')}
          </p>
          <button onClick={onChangeGoogle} disabled={!canEdit || busy || !hasPassword} className={btnCls}>
            {spinner} {t('sc.start')}
          </button>
        </div>
      )}

      {/* ---------- حذف جوجل ---------- */}
      {panel === 'removeGoogle' && hasGoogle && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-black text-white">{t('sc.removeGoogleHead')}</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('sc.removeGoogleDesc')}
          </p>
          {passwordField}
          <button onClick={onRemoveGoogle} disabled={!canEdit || busy || !hasPassword} className={dangerBtnCls}>
            {spinner} {t('sc.confirmDelete')}
          </button>
        </div>
      )}

      {/* ---------- تغيير كلمة السر ---------- */}
      {hasPassword && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">{t('sc.changePwHead')}</h3>
          </div>
          <input
            type="password"
            autoComplete="current-password"
            value={panel ? '' : cur}
            onChange={(e) => setCur(e.target.value)}
            placeholder={t('sc.currentPw')}
            className={inputCls}
            disabled={!canEdit || busy || panel !== null}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={panel ? '' : pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={t('sc.newPw')}
            className={inputCls}
            disabled={!canEdit || busy || panel !== null}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={panel ? '' : pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder={t('sc.repeatNewPw')}
            className={inputCls}
            disabled={!canEdit || busy || panel !== null}
          />
          <button onClick={onChangePassword} disabled={!canEdit || busy || panel !== null} className={btnCls}>
            {spinner} {t('sc.savePw')}
          </button>
        </div>
      )}

      {msg && <Notice kind={msg.kind} text={msg.text} />}
    </SubPage>
  );
};

export default SecuritySection;

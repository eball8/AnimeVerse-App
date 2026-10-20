import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight, Lock, KeyRound, Mail, Loader2, CheckCircle2, AlertCircle, Pencil, Trash2, Plus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { checkEmail } from '../utils/emailValidation';
import {
  TRUST_DAYS, addEmailPassword, addGoogleAccount, authErrorText, changeEmail, changeGoogleAccount,
  changePassword, getProviderEmail, hasProvider, isCurrentTrusted, loadDevices, removeEmailMethod,
  removeGoogleAccount, syncPrivateEmail,
} from '../services/settingsService';
import type { DeviceItem } from '../services/settingsService';

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

// ---------- صف طريقة الدخول ----------
const MethodRow: React.FC<{
  label: string;
  added: boolean;
  email?: string | null;
  children?: React.ReactNode;
}> = ({ label, added, email, children }) => (
  <div className="p-4 space-y-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-bold ${added ? 'text-emerald-400' : 'text-slate-500'}`}>
        {added ? 'مضاف' : 'غير مضاف'}
      </span>
    </div>
    {added && email && (
      <p dir="ltr" className="text-sm font-bold text-white text-start break-all">{email}</p>
    )}
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

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
    if (pw.length < 6) return 'كلمة السر يجب أن تكون 6 أحرف أو أكثر.';
    if (pw !== pw2) return 'كلمتا السر غير متطابقتين.';
    return null;
  };

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
      setMsg({ kind: 'err', text: authErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  // ---- البريد وكلمة السر ----
  const onAddEmail = () => {
    const chk = checkEmail(email);
    if (!chk.ok) return setMsg({ kind: 'err', text: chk.message });
    const bad = validNewPassword();
    if (bad) return setMsg({ kind: 'err', text: bad });
    run(() => addEmailPassword(email, pw), 'تمت إضافة تسجيل الدخول بالبريد وكلمة السر. أرسلنا رسالة تأكيد إلى بريدك.');
  };

  const onChangeEmail = () => {
    const chk = checkEmail(email);
    if (!chk.ok) return setMsg({ kind: 'err', text: chk.message });
    if (!cur) return setMsg({ kind: 'err', text: 'اكتب كلمة السر الحالية.' });
    run(
      () => changeEmail(cur, email),
      'أرسلنا رابط تأكيد إلى البريد الجديد. يتغيّر البريد بعد فتح الرابط، وسيُطلب منك تسجيل الدخول به.'
    );
  };

  const onRemoveEmail = () => run(() => removeEmailMethod(), 'تم حذف تسجيل الدخول بالبريد وكلمة السر.');

  const onChangePassword = () => {
    if (!cur) return setMsg({ kind: 'err', text: 'اكتب كلمة السر الحالية.' });
    const bad = validNewPassword();
    if (bad) return setMsg({ kind: 'err', text: bad });
    if (cur === pw) return setMsg({ kind: 'err', text: 'كلمة السر الجديدة مطابقة للحالية.' });
    run(() => changePassword(cur, pw), 'تم تغيير كلمة السر.', false);
  };

  // ---- جوجل ----
  const onAddGoogle = () => {
    if (!cur) return setMsg({ kind: 'err', text: 'اكتب كلمة السر الحالية.' });
    run(() => addGoogleAccount(cur), 'تم ربط حساب جوجل.');
  };

  const onChangeGoogle = () =>
    run(() => changeGoogleAccount(), 'تم تغيير حساب جوجل المرتبط.');

  const onRemoveGoogle = () => {
    if (!cur) return setMsg({ kind: 'err', text: 'اكتب كلمة السر الحالية.' });
    run(() => removeGoogleAccount(cur), 'تم حذف حساب جوجل من طرق الدخول.');
  };

  const passwordField = (
    <input
      type="password"
      autoComplete="current-password"
      value={cur}
      onChange={(e) => setCur(e.target.value)}
      placeholder="كلمة السر الحالية"
      className={inputCls}
      disabled={!canEdit || busy}
    />
  );

  const spinner = busy && <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <SubPage title="الأمان وتغيير كلمة السر" onBack={onBack}>
      <TrustBanner loaded={loaded} trusted={trusted} failed={failed} daysLeft={current?.daysLeft} />

      {/* ---------- طرق تسجيل الدخول ---------- */}
      <div>
        <h3 className="text-xs font-black text-primary-400 mb-2 px-1">طرق تسجيل الدخول</h3>
        <div className="card divide-y divide-white/5">
          <MethodRow label="جوجل" added={hasGoogle} email={googleEmail}>
            {hasGoogle ? (
              <>
                <button
                  onClick={() => openPanel('changeGoogle')}
                  disabled={!canEdit || busy || !hasPassword}
                  className={`${miniBtnCls} border-primary-500/30 bg-primary-500/10 text-primary-300`}
                >
                  <Pencil className="w-3 h-3" /> تغيير الحساب
                </button>
                <button
                  onClick={() => openPanel('removeGoogle')}
                  disabled={!canEdit || busy || !hasPassword}
                  className={`${miniBtnCls} border-red-500/30 bg-red-500/10 text-red-400`}
                >
                  <Trash2 className="w-3 h-3" /> حذف
                </button>
              </>
            ) : (
              <button
                onClick={() => openPanel('addGoogle')}
                disabled={!canEdit || busy}
                className={`${miniBtnCls} border-primary-500/30 bg-primary-500/10 text-primary-300`}
              >
                <Plus className="w-3 h-3" /> ربط حساب جوجل
              </button>
            )}
          </MethodRow>

          <MethodRow label="البريد وكلمة السر" added={hasPassword} email={passwordEmail}>
            {hasPassword ? (
              <>
                <button
                  onClick={() => openPanel('changeEmail')}
                  disabled={!canEdit || busy}
                  className={`${miniBtnCls} border-primary-500/30 bg-primary-500/10 text-primary-300`}
                >
                  <Pencil className="w-3 h-3" /> تعديل البريد
                </button>
                <button
                  onClick={() => openPanel('removeEmail')}
                  disabled={!canEdit || busy || !hasGoogle}
                  className={`${miniBtnCls} border-red-500/30 bg-red-500/10 text-red-400`}
                >
                  <Trash2 className="w-3 h-3" /> حذف
                </button>
              </>
            ) : (
              <button
                onClick={() => openPanel('addEmail')}
                disabled={!canEdit || busy}
                className={`${miniBtnCls} border-primary-500/30 bg-primary-500/10 text-primary-300`}
              >
                <Plus className="w-3 h-3" /> إضافة بريد وكلمة سر
              </button>
            )}
          </MethodRow>
        </div>

        {hasGoogle && !hasPassword && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2 px-1">
            لتغيير حساب جوجل أو حذفه أضف البريد وكلمة السر أولاً، حتى تبقى لديك طريقة دخول دائماً.
          </p>
        )}
        {hasPassword && !hasGoogle && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2 px-1">
            لا يمكن حذف البريد وكلمة السر قبل ربط حساب جوجل، حتى تبقى لديك طريقة دخول دائماً.
          </p>
        )}
        {hasPassword && hasGoogle && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2 px-1">
            لا يمكن حذف الطريقتين معاً: يجب أن تبقى إحداهما على الأقل.
          </p>
        )}
      </div>

      {/* ---------- إضافة البريد وكلمة السر ---------- */}
      {panel === 'addEmail' && !hasPassword && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">إضافة تسجيل الدخول بالبريد وكلمة السر</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            اكتب البريد الذي ستسجّل به، ويمكن أن يكون نفس بريد حساب جوجل أو بريداً آخر. ثم اختر كلمة سر.
          </p>
          <input
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="البريد الإلكتروني"
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
              استخدام بريد جوجل ({googleEmail})
            </button>
          )}
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
          <button onClick={onAddEmail} disabled={!canEdit || busy} className={btnCls}>
            {spinner} إضافة الطريقة
          </button>
        </div>
      )}

      {/* ---------- تعديل البريد ---------- */}
      {panel === 'changeEmail' && hasPassword && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">تعديل البريد الإلكتروني</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            سنرسل رابط تأكيد إلى البريد الجديد، ولا يتغيّر بريدك إلا بعد فتح الرابط.
          </p>
          <input
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="البريد الجديد"
            className={inputCls}
            disabled={!canEdit || busy}
          />
          {passwordField}
          <button onClick={onChangeEmail} disabled={!canEdit || busy} className={btnCls}>
            {spinner} إرسال رابط التأكيد
          </button>
        </div>
      )}

      {/* ---------- حذف البريد ---------- */}
      {panel === 'removeEmail' && hasPassword && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-black text-white">حذف البريد وكلمة السر</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            ستدخل بعدها بحساب جوجل فقط. سنطلب منك تأكيد حساب جوجل الحالي قبل الحذف.
          </p>
          <button onClick={onRemoveEmail} disabled={!canEdit || busy || !hasGoogle} className={dangerBtnCls}>
            {spinner} تأكيد الحذف
          </button>
        </div>
      )}

      {/* ---------- ربط جوجل ---------- */}
      {panel === 'addGoogle' && !hasGoogle && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">ربط حساب جوجل</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            اكتب كلمة السر الحالية ثم اختر حساب جوجل الذي تريد ربطه.
          </p>
          {passwordField}
          <button onClick={onAddGoogle} disabled={!canEdit || busy} className={btnCls}>
            {spinner} اختيار حساب جوجل
          </button>
        </div>
      )}

      {/* ---------- تغيير جوجل ---------- */}
      {panel === 'changeGoogle' && hasGoogle && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">تغيير حساب جوجل</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            الخطوة 1: أكّد حساب جوجل الحالي. الخطوة 2: اختر الحساب الجديد. إن فشل الربط يعود حسابك القديم تلقائياً.
          </p>
          <button onClick={onChangeGoogle} disabled={!canEdit || busy || !hasPassword} className={btnCls}>
            {spinner} البدء
          </button>
        </div>
      )}

      {/* ---------- حذف جوجل ---------- */}
      {panel === 'removeGoogle' && hasGoogle && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-black text-white">حذف حساب جوجل</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            ستدخل بعدها بالبريد وكلمة السر فقط. اكتب كلمة السر الحالية للتأكيد.
          </p>
          {passwordField}
          <button onClick={onRemoveGoogle} disabled={!canEdit || busy || !hasPassword} className={dangerBtnCls}>
            {spinner} تأكيد الحذف
          </button>
        </div>
      )}

      {/* ---------- تغيير كلمة السر ---------- */}
      {hasPassword && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-black text-white">تغيير كلمة السر</h3>
          </div>
          <input
            type="password"
            autoComplete="current-password"
            value={panel ? '' : cur}
            onChange={(e) => setCur(e.target.value)}
            placeholder="كلمة السر الحالية"
            className={inputCls}
            disabled={!canEdit || busy || panel !== null}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={panel ? '' : pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="كلمة السر الجديدة"
            className={inputCls}
            disabled={!canEdit || busy || panel !== null}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={panel ? '' : pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="أعد كتابة كلمة السر الجديدة"
            className={inputCls}
            disabled={!canEdit || busy || panel !== null}
          />
          <button onClick={onChangePassword} disabled={!canEdit || busy || panel !== null} className={btnCls}>
            {spinner} حفظ كلمة السر
          </button>
        </div>
      )}

      {msg && <Notice kind={msg.kind} text={msg.text} />}
    </SubPage>
  );
};

export default SecuritySection;

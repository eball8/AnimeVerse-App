import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, KeyRound, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import {
  checkPin, getPinLock, initE2EE, resetKeysWithPin, restoreKeys, sanitizePin, setupPin,
} from '../services/cryptoService';
import type { E2EEInit } from '../services/cryptoService';

type GateState = 'loading' | 'error' | E2EEInit['state'];

const PinInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
  toggleLabel: string;
  disabled?: boolean;
}> = ({ value, onChange, placeholder, show, onToggle, toggleLabel, disabled }) => (
  <div dir="ltr" className="relative">
    <input
      type={show ? 'text' : 'password'}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      maxLength={6}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(sanitizePin(e.target.value))}
      placeholder={placeholder}
      className="w-full pl-3 pr-11 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-center text-lg tracking-[0.4em] outline-none focus:border-primary-500 placeholder:text-xs placeholder:tracking-normal"
    />
    <button
      type="button"
      onClick={onToggle}
      aria-label={toggleLabel}
      className="absolute inset-y-0 right-3 flex items-center text-slate-400"
    >
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  </div>
);

const E2EEGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState<GateState>('loading');
  const [legacy, setLegacy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [legacyCode, setLegacyCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lockLeft, setLockLeft] = useState(0);

  const clearFields = () => {
    setPin('');
    setPin2('');
    setLegacyCode('');
    setErr('');
    setShow(false);
  };

  const load = useCallback(async () => {
    if (!user) return;
    setState('loading');
    try {
      const r = await initE2EE(user.uid);
      setLegacy(!!r.legacy);
      setForgot(false);
      setPin('');
      setPin2('');
      setLegacyCode('');
      setErr('');
      setShow(false);
      setState(r.state);
    } catch (e) {
      console.error(e);
      setState('error');
    }
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    setLockLeft(getPinLock(user.uid).lockedSeconds);
  }, [user?.uid, state]);

  useEffect(() => {
    if (!user || lockLeft <= 0) return;
    const id = setTimeout(() => setLockLeft(getPinLock(user.uid).lockedSeconds), 1000);
    return () => clearTimeout(id);
  }, [lockLeft, user?.uid]);

  if (!user) return null;
  const uid = user.uid;

  const handleError = (e: any) => {
    const m = e?.message;
    if (m === 'LOCKED') {
      setLockLeft(getPinLock(uid).lockedSeconds);
      setErr('');
    } else if (m === 'BAD_CODE') {
      const l = getPinLock(uid);
      if (l.lockedSeconds > 0) {
        setLockLeft(l.lockedSeconds);
        setErr('');
      } else {
        setErr(t('pin.wrong', { n: l.attemptsLeft }));
      }
    } else if (m === 'NO_BACKUP') {
      setErr(t('pin.noBackup'));
      setForgot(false);
      setState('reset');
    } else if (m === 'BAD_PIN') {
      setErr(t('pin.invalid'));
    } else {
      console.error(e);
      setErr(t('common.error'));
    }
  };

  const validateNew = (): boolean => {
    const c = checkPin(pin);
    if (c === 'invalid') {
      setErr(t('pin.invalid'));
      return false;
    }
    if (c === 'weak') {
      setErr(t('pin.weak'));
      return false;
    }
    if (pin !== pin2) {
      setErr(t('pin.mismatch'));
      return false;
    }
    return true;
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await fn();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const toggleLabel = show ? t('pin.hide') : t('pin.show');
  const toggle = () => setShow((v) => !v);
  const lockedMsg = lockLeft > 0 ? t('pin.locked', { s: lockLeft }) : '';

  const newPinFields = (
    <div className="space-y-3">
      <PinInput value={pin} onChange={setPin} placeholder={t('pin.new')} show={show} onToggle={toggle} toggleLabel={toggleLabel} disabled={busy} />
      <PinInput value={pin2} onChange={setPin2} placeholder={t('pin.confirm')} show={show} onToggle={toggle} toggleLabel={toggleLabel} disabled={busy} />
    </div>
  );

  const messages = (
    <>
      {lockedMsg && <p className="text-xs text-amber-400 bg-amber-500/10 p-2 rounded-lg">{lockedMsg}</p>}
      {err && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{err}</p>}
    </>
  );

  const spinnerOr = (label: string) => (busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : label);

  if (state === 'loading') {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary-500" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="card p-6 text-center space-y-3">
        <p className="text-sm text-slate-300">{t('chat.errorGate')}</p>
        <button onClick={load} className="btn-primary px-6 py-2">{t('common.retry')}</button>
      </div>
    );
  }

  // ---- نسيان الكود (أو عدم وجود نسخة احتياطية): PIN جديد ومسح الرسائل القديمة ----
  if (state === 'reset' || (forgot && (state === 'restore' || state === 'migrate'))) {
    const onSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateNew()) return;
      if (!confirm(t('pin.forgotConfirm'))) return;
      run(async () => {
        await resetKeysWithPin(uid, pin);
        await load();
      });
    };
    return (
      <form onSubmit={onSubmit} className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary-400" />
          <h3 className="text-sm font-black text-white">{t('pin.forgotTitle')}</h3>
        </div>
        {state === 'reset' && <p className="text-xs text-slate-300 leading-relaxed">{t('pin.noBackup')}</p>}
        <p className="text-xs text-amber-300 leading-relaxed">{t('pin.forgotWarn')}</p>
        {newPinFields}
        {messages}
        <button disabled={busy} className="btn-primary w-full py-3 disabled:opacity-50">
          {spinnerOr(t('pin.createNew'))}
        </button>
        {state !== 'reset' && (
          <button
            type="button"
            onClick={() => {
              clearFields();
              setForgot(false);
            }}
            disabled={busy}
            className="w-full text-xs text-slate-400 font-bold"
          >
            {t('pin.back')}
          </button>
        )}
      </form>
    );
  }

  // ---- أول مرة: اختيار PIN ----
  if (state === 'setup') {
    const onSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateNew()) return;
      run(async () => {
        await setupPin(uid, pin);
        await load();
      });
    };
    return (
      <form onSubmit={onSubmit} className="card p-5 space-y-4 border-primary-500/30 bg-primary-500/10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary-400" />
          <h3 className="text-sm font-black text-white">{t('pin.setupTitle')}</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{t('pin.setupDesc')}</p>
        {newPinFields}
        {messages}
        <button disabled={busy} className="btn-primary w-full py-3 disabled:opacity-50">
          {spinnerOr(t('pin.create'))}
        </button>
      </form>
    );
  }

  // ---- ترحيل حساب قديم: الكود القديم مرة واحدة + PIN جديد ----
  if (state === 'migrate') {
    const onSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!legacyCode.trim()) return;
      if (!validateNew()) return;
      run(async () => {
        await setupPin(uid, pin, legacyCode);
        await load();
      });
    };
    return (
      <form onSubmit={onSubmit} className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary-400" />
          <h3 className="text-sm font-black text-white">{t('pin.restoreTitle')}</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{t('pin.restoreLegacyDesc')}</p>
        <input
          dir="ltr"
          value={legacyCode}
          disabled={busy}
          onChange={(e) => setLegacyCode(e.target.value)}
          placeholder={t('chat.unlockPlaceholder')}
          className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm tracking-widest outline-none focus:border-primary-500"
        />
        {newPinFields}
        {messages}
        <button disabled={busy || lockLeft > 0} className="btn-primary w-full py-3 disabled:opacity-50">
          {spinnerOr(t('pin.create'))}
        </button>
        <button type="button" onClick={() => { clearFields(); setForgot(true); }} disabled={busy} className="w-full text-xs text-red-400 font-bold">
          {t('pin.forgot')}
        </button>
      </form>
    );
  }

  // ---- جهاز جديد أو بيانات ممسوحة: إدخال PIN ----
  if (state === 'restore') {
    const onSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const v = legacy ? legacyCode.trim() : pin;
      if (!v) return;
      if (!legacy && !/^\d{6}$/.test(pin)) {
        setErr(t('pin.invalid'));
        return;
      }
      run(async () => {
        await restoreKeys(uid, v);
        await load();
      });
    };
    return (
      <form onSubmit={onSubmit} className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary-400" />
          <h3 className="text-sm font-black text-white">{t('pin.restoreTitle')}</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {legacy ? t('pin.restoreLegacyDesc') : t('pin.restoreDesc')}
        </p>
        {legacy ? (
          <input
            dir="ltr"
            value={legacyCode}
            disabled={busy}
            onChange={(e) => setLegacyCode(e.target.value)}
            placeholder={t('chat.unlockPlaceholder')}
            className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm tracking-widest outline-none focus:border-primary-500"
          />
        ) : (
          <PinInput value={pin} onChange={setPin} placeholder={t('pin.new')} show={show} onToggle={toggle} toggleLabel={toggleLabel} disabled={busy} />
        )}
        {messages}
        <button disabled={busy || lockLeft > 0} className="btn-primary w-full py-3 disabled:opacity-50">
          {spinnerOr(t('pin.unlock'))}
        </button>
        <button type="button" onClick={() => { clearFields(); setForgot(true); }} disabled={busy} className="w-full text-xs text-red-400 font-bold">
          {t('pin.forgot')}
        </button>
      </form>
    );
  }

  return <>{children}</>;
};

export default E2EEGate;

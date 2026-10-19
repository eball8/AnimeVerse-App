import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, KeyRound, ShieldCheck, Copy, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { clearPendingCode, initE2EE, resetKeys, restoreKeys } from '../services/cryptoService';
import { copyText } from '../utils/links';

const E2EEGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState<'loading' | 'ready' | 'restore' | 'error'>('loading');
  const [code, setCode] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setState('loading');
    try {
      const r = await initE2EE(user.uid);
      setState(r.state);
      setCode(r.pendingCode);
    } catch (e) {
      console.error(e);
      setState('error');
    }
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

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

  if (state === 'restore') {
    const doRestore = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || busy) return;
      setBusy(true);
      setErr('');
      try {
        await restoreKeys(user.uid, input);
        await load();
      } catch {
        setErr(t('chat.unlockBad'));
      } finally {
        setBusy(false);
      }
    };
    const doReset = async () => {
      if (!confirm(t('chat.resetConfirm'))) return;
      setBusy(true);
      try {
        const c = await resetKeys(user.uid);
        setCode(c);
        setState('ready');
      } catch (e) {
        console.error(e);
        setErr(t('common.error'));
      } finally {
        setBusy(false);
      }
    };
    return (
      <form onSubmit={doRestore} className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary-400" />
          <h3 className="text-sm font-black text-white">{t('chat.unlockTitle')}</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{t('chat.unlockDesc')}</p>
        <input
          dir="ltr"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chat.unlockPlaceholder')}
          className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm tracking-widest outline-none focus:border-primary-500"
        />
        {err && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{err}</p>}
        <button disabled={busy} className="btn-primary w-full py-3 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('chat.unlockButton')}
        </button>
        <button type="button" onClick={doReset} disabled={busy} className="w-full text-xs text-red-400 font-bold">
          {t('chat.reset')}
        </button>
      </form>
    );
  }

  return (
    <>
      {code && (
        <div className="card p-4 mb-4 space-y-3 border-primary-500/30 bg-primary-500/10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary-400" />
            <h3 className="text-sm font-black text-white">{t('chat.codeTitle')}</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{t('chat.codeDesc')}</p>
          <div dir="ltr" className="text-center text-lg font-black tracking-widest text-white bg-dark-950 rounded-xl py-3 select-all">
            {code}
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (await copyText(code)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
              className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {t('chat.codeCopy')}
            </button>
            <button
              onClick={async () => {
                await clearPendingCode(user.uid).catch(console.error);
                setCode(undefined);
              }}
              className="flex-1 btn-primary py-2.5 text-xs"
            >
              {t('chat.codeSaved')}
            </button>
          </div>
        </div>
      )}
      {children}
    </>
  );
};

export default E2EEGate;

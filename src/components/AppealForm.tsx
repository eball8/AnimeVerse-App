import React, { useEffect, useState } from 'react';
import { Check, Loader2, Send } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { getMyAppeal, submitAppeal } from '../services/accountStatusService';
import type { Appeal, AppealKind, StatusLevel } from '../services/accountStatusService';

const KIND: Record<string, AppealKind> = { yellow: 'warning', red: 'restrict', closed: 'ban' };

interface Props {
  uid: string;
  level: StatusLevel;
  /** آخر موعد للطعن (0 = بدون تحديد) */
  deadline: number;
}

const AppealForm: React.FC<Props> = ({ uid, level, deadline }) => {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [appeal, setAppeal] = useState<Appeal | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let off = false;
    getMyAppeal(uid).then((a) => {
      if (off) return;
      setAppeal(a);
      setLoading(false);
    });
    return () => {
      off = true;
    };
  }, [uid]);

  const send = async () => {
    if (busy) return;
    if (text.trim().length < 10) {
      setErr(t('as.appeal.short'));
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await submitAppeal(uid, KIND[level] || 'warning', text);
      setAppeal({ status: 'pending', message: text.trim(), createdAt: Date.now() });
    } catch (e) {
      console.error('appeal failed:', e);
      setErr(t('as.appeal.err'));
    } finally {
      setBusy(false);
    }
  };

  const expired = deadline > 0 && Date.now() > deadline;

  return (
    <div className="card p-4 text-start">
      <h4 className="text-sm font-black text-white">{t('as.appeal.title')}</h4>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
        </div>
      ) : appeal ? (
        <div className="mt-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3 flex gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-200 leading-relaxed">{t(`as.appeal.${appeal.status}`)}</p>
        </div>
      ) : expired ? (
        <p className="text-xs text-slate-400 mt-3">{t('as.appeal.expired')}</p>
      ) : (
        <>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">{t('as.appeal.intro')}</p>
          {deadline > 0 && (
            <p className="text-[11px] text-amber-400 mt-2">
              {t('as.appeal.deadline', { date: new Date(deadline).toLocaleDateString(lang) })}
            </p>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            rows={4}
            placeholder={t('as.appeal.placeholder')}
            className="w-full mt-3 rounded-2xl bg-white/5 border border-white/10 p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary-500/50"
          />
          {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="btn-primary w-full mt-3 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {busy ? t('as.appeal.sending') : t('as.appeal.send')}
          </button>
        </>
      )}
    </div>
  );
};

export default AppealForm;

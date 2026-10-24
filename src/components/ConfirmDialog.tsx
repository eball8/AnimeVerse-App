import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Trash2, XCircle } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true = إجراء خطر (حذف). يظهر زر التأكيد بالأحمر مع أيقونة سلة */
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface Pending {
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
}

type AlertTone = 'error' | 'success' | 'info';

// تحديد نوع التنبيه من نصه ليأخذ لوناً وأيقونة مناسبة
const toneOf = (text: string): AlertTone => {
  if (/(خطأ|فشل|تعذّر|تعذر|غير صالح|error|fail|invalid|erreur|échec|echec)/i.test(text)) return 'error';
  if (/(تم |تمّ|نجح|success|done|réussi|reussi)/i.test(text)) return 'success';
  return 'info';
};

const TONE_STYLE: Record<AlertTone, { wrap: string; Icon: React.ElementType }> = {
  error: { wrap: 'bg-red-500/15 text-red-400', Icon: XCircle },
  success: { wrap: 'bg-emerald-500/15 text-emerald-400', Icon: CheckCircle2 },
  info: { wrap: 'bg-primary-500/15 text-primary-300', Icon: Info },
};

// نافذة تأكيد وتنبيه موحّدة بدل confirm() و alert() الأصلية الرمادية
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useI18n();
  const [pending, setPending] = useState<Pending | null>(null);
  const ref = useRef<Pending | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);

  const close = useCallback((value: boolean) => {
    const p = ref.current;
    ref.current = null;
    setPending(null);
    p?.resolve(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((o) => {
    return new Promise<boolean>((resolve) => {
      const opts: ConfirmOptions = typeof o === 'string' ? { title: o, danger: true } : o;
      // لو كانت هناك نافذة مفتوحة نغلقها كإلغاء
      ref.current?.resolve(false);
      const next = { opts, resolve };
      ref.current = next;
      setPending(next);
    });
  }, []);

  // استبدال alert() الأصلية في كل التطبيق بنافذة بتصميم التطبيق
  useEffect(() => {
    const original = window.alert;
    window.alert = (msg?: unknown) => {
      const text = String(msg ?? '').trim();
      if (!text) return;
      setAlerts((q) => [...q, text]);
    };
    return () => {
      window.alert = original;
    };
  }, []);

  const dismissAlert = useCallback(() => setAlerts((q) => q.slice(1)), []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  useEffect(() => {
    if (alerts.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') dismissAlert();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alerts, dismissAlert]);

  const o = pending?.opts;
  const danger = o?.danger !== false;

  const alertText = alerts[0];
  const tone = alertText ? toneOf(alertText) : 'info';
  const ToneIcon = TONE_STYLE[tone].Icon;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {pending && o && (
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-fade-in"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={o.title}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-dark-900 border border-white/10 shadow-2xl shadow-black/60 p-5 text-center animate-slide-up"
          >
            <div
              className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                danger ? 'bg-red-500/15 text-red-400' : 'bg-primary-500/15 text-primary-300'
              }`}
            >
              {danger ? <Trash2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>

            <h3 className="text-base font-black text-white">{o.title}</h3>
            {o.message && <p className="mt-1.5 text-xs leading-relaxed text-slate-400 whitespace-pre-line">{o.message}</p>}

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                onClick={() => close(false)}
                className="py-2.5 rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-slate-200 active:scale-95 transition-transform"
              >
                {o.cancelLabel || t('common.cancel')}
              </button>
              <button
                autoFocus
                onClick={() => close(true)}
                className={`py-2.5 rounded-2xl text-sm font-bold text-white active:scale-95 transition-transform ${
                  danger
                    ? 'bg-gradient-to-r from-red-500 to-accent-500 shadow-lg shadow-red-500/25'
                    : 'bg-gradient-to-r from-primary-500 to-accent-500 shadow-lg shadow-primary-500/25'
                }`}
              >
                {o.confirmLabel || (danger ? t('common.delete') : t('confirm.ok'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertText && (
        <div
          className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-fade-in"
          onClick={dismissAlert}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-dark-900 border border-white/10 shadow-2xl shadow-black/60 p-5 text-center animate-slide-up"
          >
            <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-3 ${TONE_STYLE[tone].wrap}`}>
              <ToneIcon className="w-6 h-6" />
            </div>

            <p dir="auto" className="text-sm font-bold leading-relaxed text-white whitespace-pre-line break-words">
              {alertText}
            </p>

            <button
              autoFocus
              onClick={dismissAlert}
              className="mt-5 w-full py-2.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-primary-500 to-accent-500 shadow-lg shadow-primary-500/25 active:scale-95 transition-transform"
            >
              {t('confirm.ok')}
            </button>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  // احتياط: لو استُخدم خارج المزوّد نرجع للنافذة الأصلية بدل أن يتعطل التطبيق
  return ctx ?? ((o) => Promise.resolve(window.confirm(typeof o === 'string' ? o : o.title)));
};

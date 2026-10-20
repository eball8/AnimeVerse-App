import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

const pad = (n: number) => String(n).padStart(2, '0');
export const toISODate = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// أرقام إنجليزية دائماً (حتى بالعربية) + أسماء الأشهر والأيام تتبع لغة التطبيق تلقائياً
const localeOf = (lang: string) => (lang === 'ar' ? 'ar-u-nu-latn' : lang);

// بداية الأسبوع: السبت للعربية، الاثنين للفرنسية والإسبانية، الأحد للباقي
const weekStartOf = (lang: string) => (lang === 'ar' ? 6 : lang === 'fr' || lang === 'es' ? 1 : 0);

export const formatDate = (iso: string, lang: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(y, m - 1, d)
    );
  } catch {
    return iso;
  }
};

// للتوافق مع الكود القديم
export const formatArabicDate = (iso: string) => formatDate(iso, 'ar');

const parseISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
};

interface Props {
  value: string; // YYYY-MM-DD أو ''
  onChange: (iso: string) => void;
  minAge?: number;
  maxAge?: number;
  placeholder?: string;
  label?: string;
}

const DatePickerSheet: React.FC<Props> = ({
  value,
  onChange,
  minAge = 13,
  maxAge = 100,
  placeholder,
  label,
}) => {
  const { t, lang, dir } = useI18n();
  const rtl = dir === 'rtl';
  const ph = placeholder || t('date.pick');
  const lb = label || t('date.birth');

  const months = useMemo(() => {
    const f = new Intl.DateTimeFormat(localeOf(lang), { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(2023, i, 1)));
  }, [lang]);
  const weekStart = weekStartOf(lang);
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(localeOf(lang), { weekday: 'narrow' });
    // 1 يناير 2023 كان يوم أحد
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2023, 0, 1 + ((weekStart + i) % 7))));
  }, [lang, weekStart]);
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;
  const today = new Date();
  const maxYear = today.getFullYear() - minAge;
  const minYear = today.getFullYear() - maxAge;
  // أحدث تاريخ مسموح (يوم ميلاد من بلغ الحد الأدنى للعمر اليوم)
  const latest = new Date(maxYear, today.getMonth(), today.getDate());

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'days' | 'years'>('days');
  const initial = value ? parseISO(value) : { y: Math.min(2000, maxYear), m: 0, d: 0 };
  const [year, setYear] = useState(initial.y);
  const [month, setMonth] = useState(initial.m);
  const [picked, setPicked] = useState<string>(value);

  useEffect(() => {
    if (!open) return;
    const v = value ? parseISO(value) : { y: Math.min(2000, maxYear), m: 0, d: 0 };
    setYear(v.y);
    setMonth(v.m);
    setPicked(value);
    setView('days');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => {
    const first = new Date(year, month, 1).getDay(); // 0=الأحد
    const offset = (first - weekStart + 7) % 7;
    const total = new Date(year, month + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)] as (number | null)[];
  }, [year, month, weekStart]);

  const isDisabled = (d: number) => new Date(year, month, d) > latest || year < minYear;

  const canPrev = !(year === minYear && month === 0);
  const canNext = !(year === latest.getFullYear() && month === latest.getMonth());

  const step = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m);
    setYear(y);
  };

  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i),
    [maxYear, minYear]
  );

  const confirm = () => {
    if (picked) onChange(picked);
    setOpen(false);
  };

  const sheet = open && (
    <div className="fixed inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={lb}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md bg-dark-900 border-t border-x border-white/10 rounded-t-[2rem] p-5 pb-6 animate-slide-up shadow-[0_-20px_60px_-10px_rgba(217,70,239,0.25)]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />

        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white"
            aria-label={t('date.close')}
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setView(view === 'days' ? 'years' : 'days')}
            className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm font-black text-white hover:bg-white/10 transition"
          >
            {months[month]} {year}
          </button>
          <div className="w-9" />
        </div>

        {view === 'years' ? (
          <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto no-scrollbar py-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                ref={(el) => { if (el && y === year) el.scrollIntoView({ block: 'center' }); }}
                onClick={() => { setYear(y); setView('days'); }}
                className={`py-2.5 rounded-xl text-sm font-bold border transition ${
                  y === year
                    ? 'bg-gradient-to-br from-primary-500 to-accent-500 border-transparent text-white'
                    : 'bg-dark-950 border-white/10 text-slate-300 hover:bg-white/5'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 px-1">
              <button
                type="button"
                disabled={!canPrev}
                onClick={() => step(-1)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-300 hover:bg-white/10 disabled:opacity-25"
                aria-label={t('date.prev')}
              >
                <PrevIcon className="w-5 h-5" />
              </button>
              <span className="text-xs text-slate-500">{t('date.hint')}</span>
              <button
                type="button"
                disabled={!canNext}
                onClick={() => step(1)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-300 hover:bg-white/10 disabled:opacity-25"
                aria-label={t('date.next')}
              >
                <NextIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {weekdays.map((w, i) => (
                <div key={i} className="text-center text-[11px] font-bold text-slate-500 py-1.5">{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((d, i) => {
                if (d === null) return <div key={`e${i}`} />;
                const iso = toISODate(year, month, d);
                const disabled = isDisabled(d);
                const on = picked === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPicked(iso)}
                    className={`mx-auto w-10 h-10 rounded-full text-sm font-bold transition active:scale-90 ${
                      on
                        ? 'bg-gradient-to-br from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/40'
                        : disabled
                        ? 'text-slate-700 cursor-not-allowed'
                        : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={confirm}
            disabled={!picked}
            className="flex-1 btn-primary py-3 disabled:opacity-40"
          >
            {picked ? t('date.confirm', { date: formatDate(picked, lang) }) : t('date.pickDay')}
          </button>
        </div>
        <p className="text-center text-[11px] text-slate-500 mt-3">{t('date.minAge', { age: minAge })}</p>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative w-full ps-10 pe-3 py-3 rounded-2xl bg-dark-900 border border-white/10 text-start outline-none focus:border-primary-500/50 hover:border-white/20 transition"
      >
        <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <span className={value ? 'text-white' : 'text-slate-500'}>
          {value ? formatDate(value, lang) : ph}
        </span>
      </button>
      {sheet && createPortal(sheet, document.body)}
    </>
  );
};

export default DatePickerSheet;

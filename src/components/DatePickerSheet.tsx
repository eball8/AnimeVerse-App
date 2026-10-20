import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
// الأسبوع يبدأ بالسبت (الواجهة RTL فيظهر السبت على اليمين)
const WEEKDAYS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];

const pad = (n: number) => String(n).padStart(2, '0');
export const toISODate = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export const formatArabicDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

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
  placeholder = 'اختر تاريخ ميلادك',
  label = 'تاريخ الميلاد',
}) => {
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
    const offset = (first + 1) % 7; // السبت = 0
    const total = new Date(year, month + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)] as (number | null)[];
  }, [year, month]);

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
    <div className="fixed inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md bg-dark-900 border-t border-x border-white/10 rounded-t-[2rem] p-5 pb-6 animate-slide-up shadow-[0_-20px_60px_-10px_rgba(217,70,239,0.25)]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />

        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setView(view === 'days' ? 'years' : 'days')}
            className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm font-black text-white hover:bg-white/10 transition"
          >
            {MONTHS[month]} {year}
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
                aria-label="الشهر السابق"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="text-xs text-slate-500">اضغط على الشهر لاختيار السنة بسرعة</span>
              <button
                type="button"
                disabled={!canNext}
                onClick={() => step(1)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-300 hover:bg-white/10 disabled:opacity-25"
                aria-label="الشهر التالي"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-[11px] font-bold text-slate-500 py-1.5">{w}</div>
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
            {picked ? `تأكيد ${formatArabicDate(picked)}` : 'اختر يوماً'}
          </button>
        </div>
        <p className="text-center text-[11px] text-slate-500 mt-3">يجب أن يكون عمرك {minAge} سنة على الأقل</p>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative w-full pr-10 pl-3 py-3 rounded-2xl bg-dark-900 border border-white/10 text-right outline-none focus:border-primary-500/50 hover:border-white/20 transition"
      >
        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <span className={value ? 'text-white' : 'text-slate-500'}>
          {value ? formatArabicDate(value) : placeholder}
        </span>
      </button>
      {sheet && createPortal(sheet, document.body)}
    </>
  );
};

export default DatePickerSheet;

import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock, Flag, Info, Lock } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useReportTickets } from '../hooks/useReportTickets';
import { countUnreadReportNotifs, markReportNotifsRead } from '../services/reportService';
import { categoryText, outcomeFor, targetLabel } from '../services/reportMessages';
import type { OutcomeTone } from '../services/reportMessages';

const TONE_STYLE: Record<OutcomeTone, { badge: string; box: string; Icon: typeof Clock }> = {
  pending: {
    badge: 'bg-amber-500/15 text-amber-300',
    box: 'bg-amber-500/10 border-amber-500/20',
    Icon: Clock,
  },
  action: {
    badge: 'bg-emerald-500/15 text-emerald-300',
    box: 'bg-emerald-500/10 border-emerald-500/20',
    Icon: CheckCircle2,
  },
  none: {
    badge: 'bg-slate-500/20 text-slate-300',
    box: 'bg-white/5 border-white/10',
    Icon: Info,
  },
};

const MyReports: React.FC = () => {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const tickets = useReportTickets(true);

  const L = (ar: string, en: string, fr: string) => (lang === 'ar' ? ar : lang === 'fr' ? fr : en);

  // فتح الصفحة = قراءة إشعارات البلاغات
  useEffect(() => {
    if (countUnreadReportNotifs(tickets) > 0) markReportNotifsRead();
  }, [tickets]);

  const sorted = useMemo(() => [...tickets].sort((a, b) => b.createdAt - a.createdAt), [tickets]);

  const fmt = (ms: number) => new Date(ms).toLocaleString(lang);

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 rounded-xl hover:bg-white/10 text-slate-300"
          aria-label={L('رجوع', 'Back', 'Retour')}
        >
          <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
        </button>
        <h2 className="text-xl font-black text-white">{L('بلاغاتك', 'Your reports', 'Vos signalements')}</h2>
      </div>

      <div className="card p-3 flex items-start gap-2">
        <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {L(
            'بلاغاتك مجهولة الهوية: لا نحفظ حسابك مع البلاغ. لذلك تظهر البلاغات وردودنا عليها على هذا الجهاز فقط، وتُحذف تلقائياً بعد 90 يوماً.',
            'Your reports are anonymous: we do not store your account with the report. So reports and our replies appear on this device only, and are removed automatically after 90 days.',
            'Vos signalements sont anonymes : nous ne conservons pas votre compte avec le signalement. Ils et nos réponses apparaissent donc uniquement sur cet appareil et sont supprimés automatiquement après 90 jours.'
          )}
        </p>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Flag className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-500">
            {L('لم تقدّم أي بلاغ بعد.', 'You have not submitted any reports yet.', 'Vous n’avez encore envoyé aucun signalement.')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map((tk) => {
          const outcome = outcomeFor(lang, tk);
          const style = TONE_STYLE[outcome.tone];
          const cat = categoryText(lang, tk);

          return (
            <div key={tk.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">{targetLabel(lang, tk.targetType)}</p>
                  {cat && <p className="text-xs text-slate-400 mt-0.5 break-words">{cat}</p>}
                  {tk.reportedUsername && (
                    <p className="text-[11px] text-slate-500 mt-0.5 break-all" dir="ltr">
                      @{tk.reportedUsername}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${style.badge}`}
                >
                  <style.Icon className="w-3 h-3" />
                  {outcome.title}
                </span>
              </div>

              <div className={`rounded-xl p-3 border ${style.box}`}>
                <p className="text-xs leading-relaxed text-slate-200 break-words">{outcome.text}</p>
              </div>

              <p className="text-[10px] text-slate-500">
                {L('أُرسل في', 'Sent', 'Envoyé')}: {fmt(tk.createdAt)}
                {tk.repliedAt ? ` · ${L('تمت المراجعة في', 'Reviewed', 'Examiné')}: ${fmt(tk.repliedAt)}` : ''}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MyReports;

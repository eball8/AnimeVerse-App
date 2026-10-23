import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { AlertTriangle, Ban, Check, Clock, Loader2, ShieldAlert, Trash2, X } from 'lucide-react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from './ConfirmDialog';
import AppealsAdminTab from './AppealsAdminTab';
import { logAdmin } from '../services/adminLog';
import {
  URGENT_CATEGORIES, WELFARE_CATEGORIES, applyAction, canDeleteTarget, closeBugReport,
  planAction, resolveOffenderUid,
} from '../services/moderationService';
import type { ModAction, ReportDoc } from '../services/moderationService';

const smallBtn = 'px-3 py-1.5 rounded-xl text-xs font-bold border active:scale-95 flex items-center gap-1 disabled:opacity-40';

const CATS: Record<string, string> = {
  dislike: 'لا يعجبه فقط', bullying: 'تنمّر', selfharm: 'إيذاء النفس', violence: 'عنف / كراهية / استغلال',
  restricted: 'مواد مقيّدة', nudity: 'عُري / نشاط جنسي', scam: 'احتيال', spam: 'سبام', false: 'معلومات كاذبة',
  ip: 'ملكية فكرية', fake: 'حساب مزيّف', other: 'آخر',
};

const ACTION_LABEL: Record<ModAction, string> = {
  dismiss: 'لا مخالفة — إغلاق البلاغ',
  warn: 'إرسال إنذار',
  delete: 'حذف المحتوى + إنذار',
  restrict: 'تقييد الحساب مؤقتاً',
  ban: 'حظر نهائي + حذف كل المحتوى',
};

const ReportsAdminTab: React.FC = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [reports, setReports] = useState<ReportDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState(3);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(150)));
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReportDoc)));
    } catch (e: any) {
      alert(`خطأ: ${e?.message || e}`);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // عدد البلاغات على نفس المحتوى وعلى نفس الشخص
  const counts = useMemo(() => {
    const byTarget: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    for (const r of reports) {
      if (r.type === 'bug') continue;
      const k = `${r.targetType}:${r.targetId}`;
      byTarget[k] = (byTarget[k] || 0) + 1;
      if (r.reportedUid) byUser[r.reportedUid] = (byUser[r.reportedUid] || 0) + 1;
    }
    return { byTarget, byUser };
  }, [reports]);

  const list = useMemo(() => {
    const urgent = (r: ReportDoc) => (URGENT_CATEGORIES.includes(r.category) ? 1 : 0);
    return reports
      .filter((r) => showAll || r.status === 'pending')
      .sort((a, b) => {
        if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
        return urgent(b) - urgent(a);
      });
  }, [reports, showAll]);

  const act = async (r: ReportDoc, base: ModAction) => {
    if (busy || !user) return;
    setBusy(r.id);
    try {
      const offender = await resolveOffenderUid(r);
      if (base !== 'dismiss' && offender && offender === user.uid) {
        alert('لا يمكنك تنفيذ إجراء على حسابك.');
        return;
      }
      const plan = await planAction(offender, base, days, String(r.category ?? ''));
      const escalated = plan.effective !== plan.base;
      const lines: string[] = [];
      if (escalated) lines.push(`بسبب تكرار المخالفات سيُصعَّد القرار تلقائياً إلى: ${ACTION_LABEL[plan.effective]}`);
      if (plan.effective === 'restrict') lines.push(`مدة التقييد: ${plan.days} يوم`);
      if (offender && base !== 'dismiss') lines.push(`المخالفات المؤكدة بعد هذا القرار: ${plan.strikes}`);
      if (!offender && base !== 'dismiss') lines.push('تنبيه: صاحب المحتوى غير معروف، لن يصله إنذار.');
      const ok = await confirm({
        title: ACTION_LABEL[plan.effective],
        message: lines.join('\n'),
        danger: base !== 'dismiss',
      });
      if (!ok) return;
      await applyAction(r, plan, offender, user.uid);
      await load();
    } catch (e: any) {
      alert(`خطأ: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  const closeBug = async (r: ReportDoc, fixed: boolean) => {
    if (busy || !user) return;
    setBusy(r.id);
    try {
      await closeBugReport(r, fixed, user.uid);
      await load();
    } catch (e: any) {
      alert(`خطأ: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: ReportDoc) => {
    if (!(await confirm({ title: 'حذف سجل البلاغ؟' }))) return;
    try {
      await deleteDoc(doc(db, 'reports', r.id));
      logAdmin('delete_report', 'report', r.id);
      setReports((rs) => rs.filter((x) => x.id !== r.id));
    } catch (e: any) {
      alert(`خطأ: ${e?.message || e}`);
    }
  };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto my-10" />;

  return (
    <div className="space-y-3">
      <AppealsAdminTab />

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setShowAll((v) => !v)}
          className={`${smallBtn} border-white/20 text-slate-300`}
        >
          {showAll ? 'عرض المعلّقة فقط' : 'عرض كل البلاغات'}
        </button>
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <Clock className="w-3.5 h-3.5" /> مدة التقييد
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-2 py-1.5 rounded-xl bg-dark-950 border border-white/10 text-white text-xs"
          >
            <option value={3}>3 أيام</option>
            <option value={7}>7 أيام</option>
            <option value={30}>30 يوماً</option>
          </select>
        </label>
      </div>

      {list.length === 0 && <p className="text-center text-sm text-slate-500 py-10">لا توجد بلاغات.</p>}

      {list.map((r) => {
        const pending = r.status === 'pending';
        const isBug = r.type === 'bug';
        const urgent = URGENT_CATEGORIES.includes(r.category);
        const welfare = WELFARE_CATEGORIES.includes(r.category);
        const sameTarget = counts.byTarget[`${r.targetType}:${r.targetId}`] || 0;
        const sameUser = r.reportedUid ? counts.byUser[r.reportedUid] || 0 : 0;
        const deletable = canDeleteTarget(String(r.targetType));
        const isBusy = busy === r.id;

        return (
          <div
            key={r.id}
            className={`card p-3 space-y-2 ${urgent && pending ? 'border-red-500/50' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {urgent && pending && (
                <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> عاجل
                </span>
              )}
              <span className="text-slate-400">{r.type} · {r.targetType} ·</span>
              <span className={pending ? 'text-amber-300 font-bold' : 'text-slate-300'}>{r.status}</span>
              {r.action && <span className="text-slate-500">· {r.action}</span>}
            </div>

            {!isBug && (
              <p className="text-xs text-primary-300 font-bold">
                {CATS[String(r.category)] || r.category}
                {sameTarget > 1 && <span className="text-red-300"> · {sameTarget} بلاغات على نفس المحتوى</span>}
                {sameUser > 1 && <span className="text-amber-300"> · {sameUser} بلاغات على نفس الشخص</span>}
              </p>
            )}

            <p className="text-sm text-slate-200 break-words">{r.reason}</p>

            {r.reportedUsername && (
              <p className="text-xs text-slate-300 break-all" dir="ltr">
                المُبلَّغ عنه: <span className="text-white font-bold">@{r.reportedUsername}</span>
              </p>
            )}
            {r.contactUsername && (
              <p className="text-xs text-slate-300 break-all" dir="ltr">
                مستخدم أرسل المشكلة: <span className="text-white font-bold">@{r.contactUsername}</span>
              </p>
            )}
            {r.appVersion && <p className="text-[11px] text-slate-400">الإصدار: {r.appVersion}</p>}
            {r.link && (
              <a href={r.link} target="_blank" rel="noopener noreferrer" className="block text-xs text-primary-400 underline break-all" dir="ltr">
                {r.link}
              </a>
            )}
            {Array.isArray(r.screenshots) && r.screenshots.length > 0 && (
              <div className="flex gap-2">
                {r.screenshots.map((u: string, i: number) => (
                  <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-xl overflow-hidden border border-white/10">
                    <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-500 break-all">
              {r.targetId} · {r.createdAt?.toDate?.().toLocaleString('ar') ?? ''}
            </p>

            {welfare && pending && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-300 leading-relaxed">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                بلاغ إيذاء نفس: صاحب المحتوى قد يكون في أزمة. يُفضَّل حذف المحتوى فقط دون عقوبة (لا تُحتسب مخالفة).
              </p>
            )}
            {urgent && pending && (
              <p className="flex items-start gap-1.5 text-[11px] text-red-300 leading-relaxed">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                إن كان المحتوى يخص الأطفال أو الإرهاب أو جريمة، استخدم «حظر نهائي» وأبلغ الجهات المختصة. الدليل يُحفظ تلقائياً.
              </p>
            )}

            {pending && !isBug && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button disabled={isBusy} onClick={() => act(r, 'dismiss')} className={`${smallBtn} border-white/20 text-slate-300`}>
                  <Check className="w-3.5 h-3.5" /> لا مخالفة
                </button>
                <button disabled={isBusy} onClick={() => act(r, 'warn')} className={`${smallBtn} border-amber-500/40 text-amber-300`}>
                  <AlertTriangle className="w-3.5 h-3.5" /> إنذار
                </button>
                <button disabled={isBusy || !deletable} onClick={() => act(r, 'delete')} className={`${smallBtn} border-orange-500/40 text-orange-300`}>
                  <Trash2 className="w-3.5 h-3.5" /> حذف + إنذار
                </button>
                <button disabled={isBusy} onClick={() => act(r, 'restrict')} className={`${smallBtn} border-red-500/40 text-red-300`}>
                  <Clock className="w-3.5 h-3.5" /> تقييد
                </button>
                <button disabled={isBusy} onClick={() => act(r, 'ban')} className={`${smallBtn} border-red-600/60 bg-red-600/20 text-red-200`}>
                  <Ban className="w-3.5 h-3.5" /> حظر نهائي
                </button>
                {isBusy && <Loader2 className="w-4 h-4 animate-spin text-primary-400 self-center" />}
              </div>
            )}

            {pending && isBug && (
              <div className="flex gap-2 pt-1">
                <button disabled={isBusy} onClick={() => closeBug(r, true)} className={`${smallBtn} border-emerald-500/40 text-emerald-400`}>
                  <Check className="w-3.5 h-3.5" /> تم الإصلاح
                </button>
                <button disabled={isBusy} onClick={() => closeBug(r, false)} className={`${smallBtn} border-white/20 text-slate-300`}>
                  <X className="w-3.5 h-3.5" /> إغلاق
                </button>
              </div>
            )}

            {!pending && (
              <button onClick={() => remove(r)} className={`${smallBtn} border-red-500/40 text-red-400 w-fit`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ReportsAdminTab;

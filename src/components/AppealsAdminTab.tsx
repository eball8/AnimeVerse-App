import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Scale, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from './ConfirmDialog';
import { pickAuthor, useUserBriefs } from '../services/userCache';
import { acceptAppeal, listAppeals, rejectAppeal } from '../services/appealAdminService';
import type { AppealItem } from '../services/appealAdminService';
import Avatar from './Avatar';

const smallBtn =
  'px-3 py-1.5 rounded-xl text-xs font-bold border active:scale-95 flex items-center gap-1 disabled:opacity-40';

const KIND_LABEL: Record<AppealItem['kind'], string> = {
  warning: 'طعن في إنذار',
  restrict: 'طعن في تقييد',
  ban: 'طعن في إغلاق الحساب',
};

const STATUS_LABEL: Record<AppealItem['status'], string> = {
  pending: 'معلّق',
  accepted: 'مقبول',
  rejected: 'مرفوض',
};

const AppealsAdminTab: React.FC = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [items, setItems] = useState<AppealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const briefs = useUserBriefs(items.map((i) => i.uid));

  const load = useCallback(async () => {
    try {
      setItems(await listAppeals());
    } catch (e: any) {
      console.error('appeals load failed:', e);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (a: AppealItem, accept: boolean) => {
    if (busy || !user) return;
    const ok = await confirm({
      title: accept ? 'قبول الطعن؟' : 'رفض الطعن؟',
      message: accept
        ? a.kind === 'ban'
          ? 'سيُرفع الإغلاق عن الحساب ويُسقَط إنذار واحد. المحتوى الذي حُذف عند الإغلاق لا يمكن استرجاعه.'
          : 'سيُسقَط إنذار واحد ويُرفع التقييد الحالي.'
        : 'سيبقى القرار كما هو، ولا يستطيع المستخدم إرسال طعن آخر.',
      danger: !accept,
    });
    if (!ok) return;
    setBusy(a.uid);
    try {
      if (accept) await acceptAppeal(a, user.uid);
      else await rejectAppeal(a, user.uid);
      await load();
    } catch (e: any) {
      alert(`خطأ: ${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-primary-500 mx-auto my-4" />;
  if (items.length === 0) return null;

  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-primary-400" />
        <h3 className="text-sm font-black text-white">الطعون</h3>
        <span className="text-[11px] text-amber-300 font-bold">{pendingCount} معلّق</span>
      </div>

      {items.map((a) => {
        const author = pickAuthor(briefs, a.uid, 'مستخدم', undefined);
        const pending = a.status === 'pending';
        const isBusy = busy === a.uid;
        return (
          <div key={a.uid} className={`card p-3 space-y-2 ${pending ? 'border-amber-500/40' : 'opacity-70'}`}>
            <div className="flex items-center gap-2">
              <Avatar
                src={author.photo}
                seed={a.uid}
                name={author.name}
                className="w-8 h-8 rounded-full object-cover bg-dark-900 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{author.name}</p>
                <p className="text-[10px] text-slate-500 truncate" dir="ltr">{a.uid}</p>
              </div>
              <span className={`text-[10px] font-bold ${pending ? 'text-amber-300' : 'text-slate-400'}`}>
                {STATUS_LABEL[a.status]}
              </span>
            </div>

            <p className="text-xs text-primary-300 font-bold">{KIND_LABEL[a.kind]}</p>
            <p className="text-sm text-slate-200 break-words whitespace-pre-wrap">{a.message}</p>
            {a.createdAt > 0 && (
              <p className="text-[10px] text-slate-500">{new Date(a.createdAt).toLocaleString('ar')}</p>
            )}

            {pending && (
              <div className="flex gap-2 pt-1">
                <button
                  disabled={isBusy}
                  onClick={() => decide(a, true)}
                  className={`${smallBtn} border-emerald-500/40 text-emerald-400`}
                >
                  <Check className="w-3.5 h-3.5" /> قبول الطعن
                </button>
                <button
                  disabled={isBusy}
                  onClick={() => decide(a, false)}
                  className={`${smallBtn} border-red-500/40 text-red-300`}
                >
                  <X className="w-3.5 h-3.5" /> رفض
                </button>
                {isBusy && <Loader2 className="w-4 h-4 animate-spin text-primary-400 self-center" />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AppealsAdminTab;

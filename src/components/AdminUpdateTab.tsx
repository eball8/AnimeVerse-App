import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Rocket } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useConfirm } from './ConfirmDialog';
import { logAdmin } from '../services/adminLog';
import { getLatestBuild, getPublishedBuild, publishUpdate } from '../services/updateService';

const AdminUpdateTab: React.FC = () => {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [latest, setLatest] = useState<number | null>(null);
  const [published, setPublished] = useState<number | null>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLatest(null);
    setPublished(null);
    const [l, p] = await Promise.all([getLatestBuild(), getPublishedBuild()]);
    setLatest(l);
    setPublished(p);
  }, []);
  useEffect(() => { load(); }, [load]);

  // إن تعذّر جلب الرقم من GitHub نسمح بكتابته يدوياً
  const target = latest || Number(manual) || 0;
  const already = target > 0 && target === published;

  const publish = async () => {
    if (!target || already) return;
    const ok = await confirm({
      title: t('upd.adm.confirm'),
      message: t('upd.adm.confirmMsg'),
      danger: false,
      confirmLabel: t('upd.adm.confirmBtn'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await publishUpdate(target);
      logAdmin('publish_update', 'app', String(target), `build ${target}`);
      setPublished(target);
      setDone(true);
    } catch (e: any) {
      alert(t('adm.err', { msg: e?.message || e }));
    }
    setBusy(false);
  };

  if (latest === null || published === null) {
    return <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto my-10" />;
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-primary-400" />
          <h3 className="text-sm font-black text-white">{t('upd.adm.title')}</h3>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">{t('upd.adm.hint')}</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-dark-950 border border-white/10 p-3 text-center">
            <p className="text-[10px] text-slate-400">{t('upd.adm.latest')}</p>
            <p className="text-2xl font-black text-primary-400 mt-1" dir="ltr">{latest || '—'}</p>
          </div>
          <div className="rounded-2xl bg-dark-950 border border-white/10 p-3 text-center">
            <p className="text-[10px] text-slate-400">{t('upd.adm.published')}</p>
            <p className="text-2xl font-black text-white mt-1" dir="ltr">{published || '—'}</p>
          </div>
        </div>

        {!latest && (
          <input
            inputMode="numeric"
            dir="ltr"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
            placeholder={t('upd.adm.manual')}
            className="w-full px-3 py-2.5 rounded-xl bg-dark-950 border border-white/10 text-white text-sm outline-none focus:border-primary-500"
          />
        )}

        <button
          onClick={publish}
          disabled={busy || !target || already}
          className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          {already ? t('upd.adm.already') : t('upd.adm.publish')}
        </button>

        {done && <p className="text-center text-xs text-emerald-400 font-bold">{t('upd.adm.done')}</p>}

        <button
          onClick={load}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-slate-400 active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5" /> {t('upd.adm.refresh')}
        </button>
      </div>
    </div>
  );
};

export default AdminUpdateTab;

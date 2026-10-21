import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  X, User, Search, Bell, BellOff, Timer, Palette, Image as ImageIcon, EyeOff, Flag, Ban, Loader2,
  Archive, ArchiveRestore, Trash2,
} from 'lucide-react';
import { convIdOf } from '../services/chatService';
import type { ReportKind } from '../services/chatService';
import { setChatPref, subscribeChatPrefs } from '../services/chatPrefsService';
import type { ChatPref } from '../services/chatPrefsService';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from './ConfirmDialog';
import { useI18n } from '../i18n/I18nContext';

// ---------------------------------------------------------------
// عناصر مشتركة
// ---------------------------------------------------------------
const Switch: React.FC<{ on: boolean }> = ({ on }) => (
  <span className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-primary-500' : 'bg-white/15'}`}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'start-[22px]' : 'start-0.5'}`} />
  </span>
);

interface RowProps {
  icon: React.ElementType;
  label: string;
  sub?: string;
  onClick: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}

const Row: React.FC<RowProps> = ({ icon: Icon, label, sub, onClick, right, danger }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 text-start"
  >
    <Icon className={`w-5 h-5 shrink-0 ${danger ? 'text-red-400' : 'text-slate-300'}`} />
    <div className="flex-1 min-w-0">
      <p className={`text-sm font-bold ${danger ? 'text-red-400' : 'text-white'}`}>{label}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
    {right}
  </button>
);

// ---------------------------------------------------------------
// قائمة خيارات المحادثة (الثلاث نقاط)
// ---------------------------------------------------------------
export interface ChatOptionsSheetProps {
  isGroup: boolean;
  name: string;
  muted: boolean;
  restricted: boolean;
  blocked: boolean;
  disappearing: boolean;
  onClose: () => void;
  onProfile: () => void;
  onSearch: () => void;
  onToggleMute: () => void;
  onToggleDisappear: () => void;
  onTheme: () => void;
  onMedia: () => void;
  onToggleRestrict: () => void;
  onReport: () => void;
  onToggleBlock: () => void;
}

const ChatOptionsSheet: React.FC<ChatOptionsSheetProps> = (p) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { uid: routeUid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const me = user?.uid || '';
  const convId = routeUid ? (p.isGroup ? routeUid : convIdOf(me, routeUid)) : '';
  const [pref, setPref] = useState<ChatPref | undefined>(undefined);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!me || !convId) return;
    return subscribeChatPrefs(me, (m) => setPref(m[convId]));
  }, [me, convId]);

  const archived = !!pref?.archived;

  const toggleArchive = async () => {
    if (!me || !convId) return;
    setErr('');
    try {
      await setChatPref(me, convId, { archived: !archived }, pref);
      if (!archived) navigate('/messages'); else p.onClose();
    } catch (e) {
      console.error(e);
      setErr(t('msgManage.fail'));
    }
  };

  const deleteChat = async () => {
    if (!me || !convId) return;
    setErr('');
    const ok = await confirm({
      title: t('chatManage.deleteTitle', { name: p.name }),
      message: t('chatManage.deleteMsg'),
      confirmLabel: t('msgManage.deleteConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await setChatPref(me, convId, { deletedAt: Date.now(), archived: false }, pref);
      navigate('/messages');
    } catch (e) {
      console.error(e);
      setErr(t('msgManage.fail'));
    }
  };

  return (
  <div className="fixed inset-0 z-[115] bg-black/60 flex items-end justify-center" onClick={p.onClose}>
    <div
      className="w-full max-w-md bg-dark-900 border-t border-white/10 rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-white font-black truncate">{p.name}</h3>
        <button type="button" onClick={p.onClose} className="text-slate-400 p-1" aria-label={t('chatUi.close')}>
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="divide-y divide-white/5 border-t border-white/10">
        {!p.isGroup && (
          <Row icon={User} label={t('opt.profile')} sub={t('opt.profileSub')} onClick={p.onProfile} />
        )}
        <Row icon={Search} label={t('opt.search')} sub={t('opt.searchSub')} onClick={p.onSearch} />
        <Row
          icon={p.muted ? BellOff : Bell}
          label={t('opt.mute')}
          sub={p.muted ? t('opt.muteOn') : t('opt.muteOff')}
          onClick={p.onToggleMute}
          right={<Switch on={p.muted} />}
        />
        <Row
          icon={Timer}
          label={t('opt.disappear')}
          sub={p.disappearing ? t('opt.disappearOn') : t('opt.disappearOff')}
          onClick={p.onToggleDisappear}
          right={<Switch on={p.disappearing} />}
        />
        <Row icon={Palette} label={t('opt.theme')} sub={t('opt.themeSub')} onClick={p.onTheme} />
        <Row icon={ImageIcon} label={t('opt.media')} sub={t('opt.mediaSub')} onClick={p.onMedia} />
        <Row
          icon={archived ? ArchiveRestore : Archive}
          label={archived ? t('opt.unarchive') : t('opt.archive')}
          sub={archived ? t('opt.unarchiveSub') : t('opt.archiveSub')}
          onClick={toggleArchive}
        />
      </div>

      {!p.isGroup && (
        <div className="divide-y divide-white/5 border-t border-white/10 mt-2">
          <Row
            icon={EyeOff}
            label={t('opt.restrict')}
            sub={p.restricted ? t('opt.restrictOn') : t('opt.restrictOff')}
            onClick={p.onToggleRestrict}
            right={<Switch on={p.restricted} />}
          />
          <Row icon={Flag} label={t('opt.report')} sub={t('opt.reportSub')} onClick={p.onReport} danger />
          <Row
            icon={Ban}
            label={p.blocked ? t('opt.unblock') : t('opt.block')}
            sub={p.blocked ? t('opt.unblockSub') : t('opt.blockSub')}
            onClick={p.onToggleBlock}
            danger={!p.blocked}
          />
        </div>
      )}

      <div className="divide-y divide-white/5 border-t border-white/10 mt-2">
        <Row icon={Trash2} label={t('opt.deleteChat')} sub={t('opt.deleteChatSub')} onClick={deleteChat} danger />
      </div>
      {err && <p className="text-xs text-red-400 px-5 pt-3">{err}</p>}
    </div>
  </div>
  );
};

export default ChatOptionsSheet;

// ---------------------------------------------------------------
// نافذة الإبلاغ
// ---------------------------------------------------------------
const REPORT_REASONS: { id: string; storeLabel: string; kind: ReportKind }[] = [
  { id: 'abuse', storeLabel: 'إساءة أو تحرّش', kind: 'abuse' },
  { id: 'spam', storeLabel: 'رسائل مزعجة (سبام)', kind: 'spam' },
  { id: 'impersonation', storeLabel: 'انتحال شخصية', kind: 'abuse' },
  { id: 'inappropriate', storeLabel: 'محتوى غير لائق', kind: 'abuse' },
  { id: 'other', storeLabel: 'سبب آخر', kind: 'abuse' },
];

export const ReportSheet: React.FC<{
  name: string;
  busy: boolean;
  onSubmit: (kind: ReportKind, reason: string) => void;
  onClose: () => void;
}> = ({ name, busy, onSubmit, onClose }) => {
  const { t } = useI18n();
  const [reasonId, setReasonId] = useState<string>('');
  const [details, setDetails] = useState('');
  const picked = REPORT_REASONS.find((r) => r.id === reasonId);

  const submit = () => {
    if (!picked || busy) return;
    const extra = details.trim();
    onSubmit(picked.kind, extra ? `${picked.storeLabel} — ${extra}` : picked.storeLabel);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-dark-900 border-t border-white/10 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-black flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-400" /> {t('rep.title', { name })}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 p-1" aria-label={t('chatUi.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">{t('rep.hint')}</p>

        <div className="space-y-2">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setReasonId(r.id)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-start text-sm font-bold ${
                reasonId === r.id ? 'bg-primary-500/15 border-primary-500/50 text-white' : 'bg-white/5 border-white/10 text-white'
              }`}
            >
              <span>{t(`rep.${r.id}`)}</span>
              <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${reasonId === r.id ? 'bg-primary-500 border-primary-500' : 'border-slate-500'}`} />
            </button>
          ))}
        </div>

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 200))}
          rows={3}
          placeholder={t('rep.details')}
          className="w-full mt-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500"
        />
        <p className="text-[11px] text-slate-500 text-end mt-1">{details.length}/200</p>

        <button
          type="button"
          onClick={submit}
          disabled={!picked || busy}
          className="w-full mt-3 py-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />} {t('rep.send')}
        </button>
      </div>
    </div>
  );
};

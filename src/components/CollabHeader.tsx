import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Users, Loader2, LogOut } from 'lucide-react';
import { getContributorIds, MAX_COLLABORATORS } from '../services/postService';
import type { Post } from '../services/postService';
import { useUserBriefs } from '../services/userCache';
import { useI18n } from '../i18n/I18nContext';
import { useMediaLock } from '../utils/mediaManager';
import Avatar from './Avatar';

export interface Contributor {
  uid: string;
  name: string;
  photo?: string;
  username?: string;
  role: 'owner' | 'collab' | 'pending';
}

type CollabFields = Pick<Post, 'authorId' | 'collaborators' | 'collabAccepted'>;

/**
 * يحسب قائمة المساهمين المعروضين في رأس المنشور:
 * صاحب المنشور أولاً، ثم من قبِل الدعوة (accepted)، وكذلك المنتظرون (pending) لعرضهم في النافذة فقط.
 */
export const useCollab = (
  post: CollabFields,
  ownerName: string,
  ownerPhoto?: string
): { accepted: Contributor[]; pending: Contributor[] } => {
  const ids = getContributorIds(post);
  const pendingIds = (post.collaborators || []).filter((id) => !ids.includes(id)).slice(0, MAX_COLLABORATORS);
  const briefs = useUserBriefs([...ids, ...pendingIds]);

  const make = (uid: string, role: Contributor['role']): Contributor | null => {
    if (role === 'owner') return { uid, name: ownerName, photo: ownerPhoto, role };
    const b = briefs[uid];
    if (!b) return null; // حساب محذوف أو لم يُحمَّل بعد
    return { uid, name: b.displayName || '...', photo: b.photoURL, username: b.username, role };
  };

  const accepted = ids
    .map((id) => make(id, id === post.authorId ? 'owner' : 'collab'))
    .filter((x): x is Contributor => !!x);
  const pending = pendingIds.map((id) => make(id, 'pending')).filter((x): x is Contributor => !!x);
  return { accepted, pending };
};

/** نص الأسماء: "A و B" أو "A و3 آخرين" */
export const useCollabNames = () => {
  const { t } = useI18n();
  return (list: Contributor[]): string => {
    if (list.length <= 1) return list[0]?.name || '';
    if (list.length === 2) return t('collab.and2', { a: list[0].name, b: list[1].name });
    return t('collab.andMore', { a: list[0].name, count: list.length - 1 });
  };
};

interface StackProps {
  list: Contributor[];
  /** مقاس الصورة بالبكسل */
  size?: number;
  ringClass?: string;
}

/* صور المساهمين متراكبة بجانب بعضها (حتى 3 صور ظاهرة + عدّاد للبقية) */
export const CollabAvatarStack: React.FC<StackProps> = ({ list, size = 36, ringClass = 'ring-dark-950' }) => {
  const shown = list.slice(0, 3);
  const rest = list.length - shown.length;
  const overlap = Math.round(size * 0.38);
  return (
    <span className="flex items-center" style={{ height: size }}>
      {shown.map((c, i) => (
        <span
          key={c.uid}
          className="relative block shrink-0"
          // الأول فوق البقية مثل إنستغرام
          style={{ width: size, height: size, marginInlineStart: i === 0 ? 0 : -overlap, zIndex: 10 - i }}
        >
          <Avatar
            src={c.photo}
            seed={c.uid}
            name={c.name}
            className={`w-full h-full rounded-full object-cover bg-dark-900 ring-2 ${ringClass}`}
          />
        </span>
      ))}
      {rest > 0 && (
        <span
          className={`rounded-full bg-dark-800 text-white text-[10px] font-black flex items-center justify-center ring-2 ${ringClass} shrink-0`}
          style={{ width: size, height: size, marginInlineStart: -overlap }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
};

interface SheetProps {
  accepted: Contributor[];
  pending: Contributor[];
  meUid?: string;
  /** أنا مساهم مقبول (غير صاحب المنشور) → يظهر زر الانسحاب */
  canLeave: boolean;
  leaving?: boolean;
  onLeave: () => void;
  onClose: () => void;
}

/* قائمة كل المساهمين (صاحب المنشور + المقبولون + المنتظرون) */
export const ContributorsSheet: React.FC<SheetProps> = ({
  accepted, pending, meUid, canLeave, leaving, onLeave, onClose,
}) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  // إيقاف الفيديوهات أثناء فتح النافذة (مثل باقي النوافذ المنبثقة)
  useMediaLock(true);

  const go = (uid: string) => {
    onClose();
    navigate(`/user/${uid}`);
  };

  const roleLabel = (c: Contributor) =>
    c.role === 'owner' ? t('collab.owner') : c.role === 'pending' ? t('collab.pending') : t('collab.contributor');

  const row = (c: Contributor) => (
    <button
      key={c.uid + c.role}
      onClick={() => go(c.uid)}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-start active:bg-white/5 transition"
    >
      <Avatar
        src={c.photo}
        seed={c.uid}
        name={c.name}
        className={`w-11 h-11 rounded-full object-cover bg-dark-900 shrink-0 ${c.role === 'pending' ? 'opacity-60' : ''}`}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-extrabold text-white truncate">
          {c.name}
          {c.uid === meUid && <span className="text-slate-500 font-semibold"> ·</span>}
        </span>
        {c.username && <span className="block text-[11.5px] text-slate-500 truncate">@{c.username}</span>}
      </span>
      <span
        className={`shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-black ${
          c.role === 'owner'
            ? 'bg-primary-500/20 text-primary-300'
            : c.role === 'pending'
              ? 'bg-amber-500/15 text-amber-300'
              : 'bg-white/10 text-slate-200'
        }`}
      >
        {roleLabel(c)}
      </span>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="w-full max-h-[80vh] flex flex-col bg-dark-900 border-t border-white/10 rounded-t-3xl pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-400" /> {t('collab.sheetTitle')}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-2">
          {accepted.map(row)}
          {pending.map(row)}
        </div>
        {canLeave && (
          <div className="px-4 pt-2">
            <button
              onClick={onLeave}
              disabled={leaving}
              className="w-full h-11 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold flex items-center justify-center gap-2 active:bg-red-500/20 disabled:opacity-60 transition"
            >
              {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              {t('collab.leave')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

interface BannerProps {
  inviterName: string;
  busy: boolean;
  error?: string;
  onAccept: () => void;
  onDecline: () => void;
}

/* شريط دعوة التعاون: يظهر للمدعو فقط تحت رأس المنشور */
export const CollabInviteBanner: React.FC<BannerProps> = ({ inviterName, busy, error, onAccept, onDecline }) => {
  const { t } = useI18n();
  return (
    <div className="mx-3 mb-2.5 p-3 rounded-2xl bg-primary-500/10 border border-primary-500/30">
      <p className="text-[12.5px] font-bold text-white flex items-center gap-2">
        <Users className="w-4 h-4 text-primary-300 shrink-0" />
        <span className="min-w-0">{t('collab.inviteBanner', { name: inviterName })}</span>
      </p>
      {error && <p className="text-[11px] text-red-400 mt-1.5">{error}</p>}
      <div className="flex gap-2 mt-2.5">
        <button
          onClick={onAccept}
          disabled={busy}
          className="flex-1 h-9 rounded-xl bg-gradient-to-tr from-primary-500 to-accent-500 text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-60 transition"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {t('collab.accept')}
        </button>
        <button
          onClick={onDecline}
          disabled={busy}
          className="flex-1 h-9 rounded-xl bg-white/10 text-slate-200 text-xs font-black active:scale-95 disabled:opacity-60 transition"
        >
          {t('collab.decline')}
        </button>
      </div>
    </div>
  );
};

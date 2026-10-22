import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Check, Loader2, Users } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { searchUsers } from '../services/searchService';
import { getMyFollowStates } from '../services/followService';
import { useUserBriefs } from '../services/userCache';
import Avatar from './Avatar';

export interface PickedUser {
  uid: string;
  displayName: string;
  photoURL?: string;
  username?: string;
}

interface Props {
  meUid: string;
  selected: PickedUser[];
  /** الحد الأقصى للمدعوين (لا يشمل صاحب المنشور) */
  max: number;
  onChange: (list: PickedUser[]) => void;
  onClose: () => void;
}

/* نافذة اختيار المساهمين في المنشور التعاوني (بنمط "Invite collaborators" في إنستغرام) */
const CollabPickerSheet: React.FC<Props> = ({ meUid, selected, max, onChange, onClose }) => {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PickedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const reqRef = useRef(0);

  // اقتراحات: الحسابات التي أتابعها
  useEffect(() => {
    let cancelled = false;
    getMyFollowStates(meUid)
      .then((m) => {
        if (cancelled) return;
        setFollowingIds(
          Object.entries(m)
            .filter(([id, st]) => st === 'following' && id !== meUid)
            .map(([id]) => id)
            .slice(0, 30)
        );
      })
      .catch((e) => console.error('collab suggestions failed:', e));
    return () => {
      cancelled = true;
    };
  }, [meUid]);

  const briefs = useUserBriefs(followingIds);

  // بحث مع تأخير بسيط
  useEffect(() => {
    const q = term.trim();
    if (q.replace(/^@/, '').length < 2) {
      reqRef.current++;
      setResults([]);
      setSearching(false);
      return;
    }
    const mine = ++reqRef.current;
    setSearching(true);
    const id = window.setTimeout(async () => {
      const list = await searchUsers(q);
      if (mine !== reqRef.current) return;
      setResults(
        list
          .filter((u) => u.uid !== meUid)
          .map((u) => ({ uid: u.uid, displayName: u.displayName, photoURL: u.photoURL, username: u.username }))
      );
      setSearching(false);
    }, 300);
    return () => window.clearTimeout(id);
  }, [term, meUid]);

  const full = selected.length >= max;
  const isSel = (uid: string) => selected.some((u) => u.uid === uid);

  const toggle = (u: PickedUser) => {
    if (isSel(u.uid)) onChange(selected.filter((x) => x.uid !== u.uid));
    else if (!full) onChange([...selected, u]);
  };

  const suggested: PickedUser[] = followingIds
    .map((id) => briefs[id])
    .filter(Boolean)
    .map((b) => ({ uid: b.uid, displayName: b.displayName, photoURL: b.photoURL, username: b.username }));

  const searchMode = term.trim().replace(/^@/, '').length >= 2;
  const list = searchMode ? results : suggested;

  const row = (u: PickedUser) => {
    const on = isSel(u.uid);
    const disabled = !on && full;
    return (
      <button
        key={u.uid}
        onClick={() => toggle(u)}
        disabled={disabled}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-start active:bg-white/5 disabled:opacity-40 transition"
      >
        <Avatar
          src={u.photoURL}
          seed={u.uid}
          name={u.displayName}
          className="w-11 h-11 rounded-full object-cover bg-dark-900 shrink-0"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-extrabold text-white truncate">{u.displayName}</span>
          {u.username && <span className="block text-[11.5px] text-slate-500 truncate">@{u.username}</span>}
        </span>
        <span
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
            on ? 'bg-primary-500 border-primary-500' : 'border-white/30'
          }`}
        >
          {on && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
        </span>
      </button>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="w-full max-h-[85vh] flex flex-col bg-dark-900 border-t border-white/10 rounded-t-3xl pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-400" /> {t('collab.pickTitle')}
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-slate-400 tabular-nums">
              {selected.length}/{max}
            </span>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-white/10" aria-label={t('collab.done')}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t('collab.search')}
              autoComplete="off"
              autoCapitalize="none"
              className="w-full h-10 ps-9 pe-3 rounded-xl bg-dark-950 border border-white/10 text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary-500"
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{t('collab.info')}</p>
          {full && <p className="text-[11px] text-amber-300 mt-1">{t('collab.limit', { count: max })}</p>}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain min-h-[160px]">
          {selected.length > 0 && !searchMode && (
            <div className="pb-1">
              <p className="px-4 pt-2 pb-1 text-[11px] font-black text-slate-400">
                {t('collab.pickTitle')} · {selected.length}
              </p>
              {selected.map(row)}
            </div>
          )}

          <p className="px-4 pt-2 pb-1 text-[11px] font-black text-slate-400">
            {searchMode ? t('collab.results') : t('collab.suggested')}
          </p>

          {searching ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
            </div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">{searchMode ? t('collab.none') : ''}</p>
          ) : (
            list.filter((u) => searchMode || !isSel(u.uid)).map(row)
          )}
        </div>

        <div className="px-4 pt-2">
          <button
            onClick={onClose}
            className="w-full h-11 rounded-2xl bg-gradient-to-tr from-primary-500 to-accent-500 text-white text-sm font-black active:scale-[0.98] transition"
          >
            {t('collab.done')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CollabPickerSheet;

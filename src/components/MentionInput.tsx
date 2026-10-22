import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { searchUsers } from '../services/searchService';
import { getMyFollowStates } from '../services/followService';
import { useUserBriefs } from '../services/userCache';
import Avatar from './Avatar';

interface Sug {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** مكان ظهور قائمة الاقتراحات */
  popup?: 'top' | 'bottom';
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

const TOKEN_RE = /(^|\s)@([a-zA-Z0-9_.]*)$/;

/* حقل نص يقترح الحسابات أثناء كتابة @ (مثل إنستغرام) ويُدرج @username عند الاختيار */
const MentionInput: React.FC<Props> = ({
  value, onChange, multiline, rows = 3, maxLength, placeholder, disabled, className, popup = 'bottom', onKeyDown,
}) => {
  const { user } = useAuth();
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [token, setToken] = useState<{ q: string; start: number } | null>(null);
  const [found, setFound] = useState<Sug[]>([]);
  const [followIds, setFollowIds] = useState<string[]>([]);
  const reqRef = useRef(0);
  const loadedRef = useRef(false);

  const briefs = useUserBriefs(followIds);

  const loadFollowing = () => {
    if (loadedRef.current || !user) return;
    loadedRef.current = true;
    getMyFollowStates(user.uid)
      .then((m) =>
        setFollowIds(
          Object.entries(m)
            .filter(([, s]) => s === 'following')
            .map(([id]) => id)
            .slice(0, 40)
        )
      )
      .catch((e) => console.error('mention suggestions failed:', e));
  };

  const detect = (text: string, caret: number) => {
    const m = TOKEN_RE.exec(text.slice(0, caret));
    if (!m) {
      setToken(null);
      return;
    }
    setToken({ q: m[2].toLowerCase(), start: caret - m[2].length - 1 });
    loadFollowing();
  };

  // بحث عن الحسابات عند كتابة حرفين أو أكثر
  useEffect(() => {
    const q = token?.q ?? '';
    if (q.length < 2) {
      reqRef.current++;
      setFound([]);
      return;
    }
    const mine = ++reqRef.current;
    const id = window.setTimeout(async () => {
      const list = await searchUsers(q);
      if (mine !== reqRef.current) return;
      setFound(
        list
          .filter((u) => u.uid !== user?.uid && !!u.username)
          .map((u) => ({ uid: u.uid, username: u.username, displayName: u.displayName, photoURL: u.photoURL }))
      );
    }, 250);
    return () => window.clearTimeout(id);
  }, [token?.q, user?.uid]);

  const following: Sug[] = followIds
    .map((id) => briefs[id])
    .filter((b) => !!b && !!b.username)
    .map((b) => ({ uid: b.uid, username: b.username as string, displayName: b.displayName, photoURL: b.photoURL }));

  let list: Sug[] = [];
  if (token) {
    if (token.q.length >= 2) {
      const seen = new Set<string>();
      list = [...following.filter((f) => f.username.startsWith(token.q)), ...found].filter(
        (s) => !seen.has(s.uid) && (seen.add(s.uid), true)
      );
    } else {
      list = following.filter((f) => f.username.startsWith(token.q));
    }
    list = list.slice(0, 6);
  }

  const pick = (s: Sug) => {
    if (!token) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const insert = `@${s.username} `;
    let next = value.slice(0, token.start) + insert + value.slice(caret);
    if (maxLength && next.length > maxLength) return;
    onChange(next);
    setToken(null);
    setFound([]);
    const pos = token.start + insert.length;
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (list.length > 0 && (e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
      e.preventDefault();
      pick(list[0]);
      return;
    }
    if (e.key === 'Escape') setToken(null);
    onKeyDown?.(e);
  };

  const common = {
    value,
    maxLength,
    placeholder,
    disabled,
    className,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      onChange(e.target.value);
      detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        const t = e.currentTarget;
        detect(t.value, t.selectionStart ?? t.value.length);
      }
    },
    onClick: (e: React.MouseEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const t = e.currentTarget;
      detect(t.value, t.selectionStart ?? t.value.length);
    },
    onBlur: () => window.setTimeout(() => setToken(null), 150),
    onKeyDown: handleKeyDown,
  };

  return (
    <div className="relative flex-1 min-w-0">
      {multiline ? (
        <textarea ref={ref} rows={rows} {...common} />
      ) : (
        <input ref={ref} autoComplete="off" {...common} />
      )}

      {list.length > 0 && (
        <div
          className={`absolute z-40 start-0 w-[min(20rem,92vw)] rounded-2xl bg-dark-900 border border-white/10 shadow-2xl overflow-hidden ${
            popup === 'top' ? 'bottom-full mb-2' : 'top-full mt-1'
          }`}
        >
          {list.map((s) => (
            <button
              key={s.uid}
              type="button"
              // onPointerDown حتى لا يفقد الحقل التركيز قبل الاختيار (يعمل باللمس والماوس)
              onPointerDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-start active:bg-white/10 hover:bg-white/5 transition"
            >
              <Avatar
                src={s.photoURL}
                seed={s.uid}
                name={s.displayName}
                className="w-9 h-9 rounded-full object-cover bg-dark-950 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-extrabold text-white truncate">{s.displayName}</span>
                <span className="block text-[11px] text-slate-500 truncate" dir="ltr">@{s.username}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MentionInput;

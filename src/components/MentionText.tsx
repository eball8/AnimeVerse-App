import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { isValidUsername } from '../utils/username';

/* نفس نمط استخراج الإشارات في postService: @username يسبقه بداية النص أو مسافة */
const MENTION_RE = /(^|\s)@([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)/g;

// تحويل اسم المستخدم إلى uid مع كاش (null = غير موجود)
const uidCache = new Map<string, string | null>();

export const resolveUsername = async (name: string): Promise<string | null> => {
  const key = name.toLowerCase();
  if (uidCache.has(key)) return uidCache.get(key) ?? null;
  if (!isValidUsername(key)) return null;
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('username', '==', key), limit(1)));
    const uid = snap.empty ? null : snap.docs[0].id;
    uidCache.set(key, uid);
    return uid;
  } catch (e) {
    console.error('resolve username failed:', e);
    return null;
  }
};

interface Props {
  text: string;
  /** يُستدعى قبل الانتقال إلى الملف الشخصي (مثلاً لإغلاق نافذة) */
  onNavigate?: () => void;
  linkClassName?: string;
}

type Part = { type: 'text'; value: string } | { type: 'mention'; value: string };

export const splitMentions = (text: string): Part[] => {
  const parts: Part[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length; // موضع علامة @
    if (start > last) parts.push({ type: 'text', value: text.slice(last, start) });
    parts.push({ type: 'mention', value: m[2] });
    last = start + 1 + m[2].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
};

/* يعرض النص ويحوّل @username إلى رابط تفاعلي يفتح الملف الشخصي */
const MentionText: React.FC<Props> = ({ text, onNavigate, linkClassName = 'text-primary-400 font-bold' }) => {
  const navigate = useNavigate();
  const [missing, setMissing] = useState<string | null>(null);

  if (!text || !text.includes('@')) return <>{text}</>;

  const open = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    const uid = await resolveUsername(name);
    if (!uid) {
      setMissing(name);
      window.setTimeout(() => setMissing((cur) => (cur === name ? null : cur)), 1500);
      return;
    }
    onNavigate?.();
    navigate(`/user/${uid}`);
  };

  return (
    <>
      {splitMentions(text).map((p, i) =>
        p.type === 'text' ? (
          <React.Fragment key={i}>{p.value}</React.Fragment>
        ) : (
          <button
            key={i}
            type="button"
            dir="ltr"
            onClick={(e) => open(e, p.value)}
            className={`${linkClassName} pointer-events-auto align-baseline ${missing === p.value ? 'opacity-50 line-through' : ''}`}
          >
            @{p.value}
          </button>
        )
      )}
    </>
  );
};

export default MentionText;

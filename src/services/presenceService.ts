import { useEffect, useState } from 'react';
import { collection, doc, documentId, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';

// المستخدم يُعتبر "متصلاً" إذا كان نشاطه خلال آخر دقيقتين ونصف
export const ONLINE_WINDOW_MS = 150 * 1000;
export const HEARTBEAT_MS = 60 * 1000;

// نبضة نشاط: تُرسل فقط إذا كان المستخدم يُظهر حالة نشاطه
export const sendHeartbeat = async (uid: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), { lastActive: serverTimestamp() });
  } catch (e) {
    console.error('heartbeat failed:', e);
  }
};

interface PresenceRec { lastActive: number; show: boolean; }

const isOnlineRec = (r?: PresenceRec): boolean =>
  !!r && r.show && r.lastActive > 0 && Date.now() - r.lastActive < ONLINE_WINDOW_MS;

// يعيد { uid: true/false } لمن هو متصل الآن. إن أخفيتَ أنت حالتك فلن ترى حالة الآخرين أيضاً.
export const usePresence = (uids: Array<string | undefined>, iShowActivity: boolean = true): Record<string, boolean> => {
  const key = Array.from(new Set(uids.filter((x): x is string => !!x))).sort().join(',');
  const [recs, setRecs] = useState<Record<string, PresenceRec>>({});
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    const unsubs: Array<() => void> = [];
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const q = query(collection(db, 'users'), where(documentId(), 'in', chunk));
      unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            setRecs((prev) => {
              const next = { ...prev };
              snap.forEach((d) => {
                const x = d.data() as any;
                next[d.id] = {
                  lastActive: x.lastActive?.toMillis?.() ?? 0,
                  show: x.showActivity !== false,
                };
              });
              return next;
            });
          },
          (e) => console.error('presence error:', e)
        )
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [key]);

  // نعيد التقييم كل نصف دقيقة حتى يختفي المؤشر عند الانقطاع
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const out: Record<string, boolean> = {};
  if (key) key.split(',').forEach((id) => { out[id] = iShowActivity && isOnlineRec(recs[id]); });
  return out;
};

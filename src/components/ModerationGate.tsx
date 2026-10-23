import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, doc, getDoc, limit, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { AlertTriangle, Ban, Check, Clock, ShieldCheck } from 'lucide-react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { SUPPORT_EMAIL } from '../services/moderationService';
import { getTickets, markTicketSeen } from '../services/reportService';

type L3 = { ar: string; en: string; fr: string };
const pick = (lang: string, v: L3): string => (lang === 'ar' ? v.ar : lang === 'fr' ? v.fr : v.en);

const T = {
  bannedTitle: { ar: 'تم إغلاق حسابك', en: 'Your account has been closed', fr: 'Votre compte a été fermé' },
  bannedText: {
    ar: 'تم إغلاق حسابك نظراً لانتهاكه معايير المجتمع.',
    en: 'Your account has been closed for violating the community standards.',
    fr: 'Votre compte a été fermé pour violation des règles de la communauté.',
  },
  appeal: { ar: 'للاعتراض على القرار تواصل معنا:', en: 'To appeal this decision, contact us:', fr: 'Pour contester cette décision, contactez-nous :' },
  logout: { ar: 'تسجيل الخروج', en: 'Sign out', fr: 'Se déconnecter' },
  ok: { ar: 'فهمت', en: 'I understand', fr: 'Compris' },
  close: { ar: 'حسناً', en: 'OK', fr: 'OK' },
  warnTitle: { ar: 'إنذار من إدارة AnimeVerse', en: 'Warning from AnimeVerse', fr: 'Avertissement d’AnimeVerse' },
  warnText: {
    ar: 'تأكدنا بعد المراجعة أن أحد محتوياتك يخالف معايير المجتمع. هذا إنذار، وتكرار المخالفة قد يؤدي إلى حذف المحتوى أو تقييد حسابك أو إغلاقه.',
    en: 'After review, we confirmed that some of your content violates the community standards. This is a warning; repeated violations may lead to content removal, account restrictions or closure.',
    fr: 'Après examen, nous avons confirmé qu’un de vos contenus enfreint les règles de la communauté. Ceci est un avertissement ; la récidive peut entraîner la suppression de contenu, une restriction ou la fermeture du compte.',
  },
  deleteTitle: { ar: 'تم حذف محتوى من حسابك', en: 'Content removed from your account', fr: 'Contenu supprimé de votre compte' },
  deleteText: {
    ar: 'تم حذف أحد محتوياتك لمخالفته معايير المجتمع. هذا إنذار، وتكرار المخالفة قد يؤدي إلى تقييد حسابك أو إغلاقه.',
    en: 'One of your items was removed for violating the community standards. This is a warning; repeated violations may lead to restrictions or closure of your account.',
    fr: 'Un de vos contenus a été supprimé pour violation des règles. Ceci est un avertissement ; la récidive peut entraîner une restriction ou la fermeture du compte.',
  },
  restrictTitle: { ar: 'تم تقييد حسابك مؤقتاً', en: 'Your account is temporarily restricted', fr: 'Votre compte est temporairement restreint' },
  restrictText: {
    ar: 'خلال مدة التقييد لا يمكنك النشر أو التعليق أو إرسال الرسائل. وتكرار المخالفات قد يؤدي إلى إغلاق حسابك نهائياً.',
    en: 'During the restriction you cannot post, comment or send messages. Further violations may lead to permanent closure.',
    fr: 'Pendant la restriction, vous ne pouvez ni publier, ni commenter, ni envoyer de messages. D’autres infractions peuvent entraîner la fermeture définitive.',
  },
  until: { ar: 'ينتهي التقييد في:', en: 'Restriction ends on:', fr: 'Fin de la restriction :' },
  type: { ar: 'نوع المحتوى:', en: 'Content type:', fr: 'Type de contenu :' },
  restrictedBar: {
    ar: 'حسابك مقيّد مؤقتاً: لا يمكنك النشر أو التعليق أو المراسلة.',
    en: 'Your account is temporarily restricted: no posting, commenting or messaging.',
    fr: 'Compte temporairement restreint : publication, commentaires et messages désactivés.',
  },
  replyTitle: { ar: 'ردّ على بلاغك', en: 'Reply to your report', fr: 'Réponse à votre signalement' },
  replyViolation: {
    ar: 'راجعنا بلاغك وتأكدنا من وجود مخالفة لمعايير المجتمع، وقد اتخذنا الإجراء المناسب. شكراً لمساعدتك في إبقاء المجتمع آمناً.',
    en: 'We reviewed your report and confirmed a violation of the community standards. We have taken the appropriate action. Thank you for helping keep the community safe.',
    fr: 'Nous avons examiné votre signalement et confirmé une infraction aux règles. Nous avons pris les mesures appropriées. Merci de contribuer à la sécurité de la communauté.',
  },
  replyNone: {
    ar: 'راجعنا بلاغك ولم نجد أن المحتوى ينتهك معايير المجتمع، لذلك لم نتخذ أي إجراء. شكراً لك على تواصلك.',
    en: 'We reviewed your report and did not find that the content violates the community standards, so no action was taken. Thank you for reaching out.',
    fr: 'Nous avons examiné votre signalement et n’avons pas constaté d’infraction aux règles ; aucune mesure n’a été prise. Merci de votre démarche.',
  },
  replyBugFixed: {
    ar: 'شكراً لك، تمت معالجة المشكلة التي أبلغت عنها.',
    en: 'Thank you, the problem you reported has been handled.',
    fr: 'Merci, le problème signalé a été traité.',
  },
  replyBugNone: {
    ar: 'شكراً لك، راجعنا ملاحظتك ولا يوجد إجراء إضافي حالياً.',
    en: 'Thank you, we reviewed your note and there is no further action for now.',
    fr: 'Merci, nous avons examiné votre remarque ; aucune action supplémentaire pour le moment.',
  },
} satisfies Record<string, L3>;

const TARGETS: Record<string, L3> = {
  post: { ar: 'منشور', en: 'Post', fr: 'Publication' },
  video: { ar: 'فيديو', en: 'Video', fr: 'Vidéo' },
  reel: { ar: 'ريل', en: 'Reel', fr: 'Reel' },
  story: { ar: 'قصة', en: 'Story', fr: 'Story' },
  comment: { ar: 'تعليق', en: 'Comment', fr: 'Commentaire' },
  message: { ar: 'رسالة', en: 'Message', fr: 'Message' },
  user: { ar: 'الملف الشخصي', en: 'Profile', fr: 'Profil' },
  conversation: { ar: 'محادثة', en: 'Conversation', fr: 'Conversation' },
  group: { ar: 'مجموعة', en: 'Group', fr: 'Groupe' },
};

interface Notice {
  id: string;
  code: string;
  targetType?: string;
  until?: number;
  createdAt: number;
}
interface Reply {
  id: string;
  status: string;
}

const Overlay: React.FC<{ children: React.ReactNode; z?: number }> = ({ children, z = 450 }) =>
  createPortal(
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-5"
      style={{ zIndex: z }}
    >
      {children}
    </div>,
    document.body
  );

const ModerationGate: React.FC = () => {
  const { user, signOut } = useAuth();
  const { lang } = useI18n();
  const tx = (v: L3) => pick(lang, v);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const [banned, setBanned] = useState(false);
  const [until, setUntil] = useState(0);
  const [tick, setTick] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const replyRef = useRef<Reply | null>(null);
  replyRef.current = reply;

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) {
      setBanned(false);
      setUntil(0);
      setNotice(null);
      return;
    }
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(doc(db, 'users', uid), (s) => setBanned(s.data()?.isBanned === true), () => {})
    );
    unsubs.push(
      onSnapshot(
        doc(db, 'moderation', uid),
        (s) => {
          const t = s.data()?.restrictedUntil;
          setUntil(t?.toMillis ? t.toMillis() : 0);
        },
        () => {}
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'moderation', uid, 'notices'), where('seen', '==', false), limit(10)),
        (snap) => {
          const items: Notice[] = snap.docs
            .map((d) => {
              const x = d.data();
              return {
                id: d.id,
                code: String(x.code || ''),
                targetType: x.targetType ? String(x.targetType) : undefined,
                until: x.until?.toMillis ? x.until.toMillis() : undefined,
                createdAt: x.createdAt?.toMillis ? x.createdAt.toMillis() : 0,
              };
            })
            .filter((n) => n.code && n.code !== 'ban')
            .sort((a, b) => a.createdAt - b.createdAt);
          setNotice(items[0] ?? null);
        },
        () => {}
      )
    );

    const iv = window.setInterval(() => setTick((n) => n + 1), 60000);
    return () => {
      unsubs.forEach((u) => u());
      window.clearInterval(iv);
    };
  }, [uid]);

  // ردود الإدارة على بلاغاتي (التذاكر محفوظة في هذا الجهاز فقط)
  const checkReplies = useCallback(async () => {
    if (replyRef.current) return;
    const pending = getTickets().filter((t) => !t.seen);
    for (const tk of pending) {
      try {
        const s = await getDoc(doc(db, 'reportTickets', tk.id));
        if (s.exists()) {
          setReply({ id: tk.id, status: String(s.data().status || '') });
          return;
        }
      } catch {
        /* نتجاهل ونحاول لاحقاً */
      }
    }
  }, []);

  useEffect(() => {
    if (!uid) return;
    checkReplies();
    const iv = window.setInterval(checkReplies, 120000);
    const onVis = () => {
      if (document.visibilityState === 'visible') checkReplies();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [uid, checkReplies]);

  const dismissNotice = async () => {
    if (!uid || !notice) return;
    const id = notice.id;
    setNotice(null);
    try {
      await updateDoc(doc(db, 'moderation', uid, 'notices', id), { seen: true });
    } catch (e) {
      console.error('notice seen failed:', e);
    }
  };

  const dismissReply = () => {
    if (!reply) return;
    markTicketSeen(reply.id);
    setReply(null);
    window.setTimeout(checkReplies, 400);
  };

  if (!user) return null;

  /* ---------------- حساب محظور ---------------- */
  if (banned) {
    return createPortal(
      <div
        className="fixed inset-0 z-[600] bg-dark-950 flex flex-col items-center justify-center px-8 text-center"
        dir={dir}
      >
        <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
          <Ban className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-black text-white mt-5">{tx(T.bannedTitle)}</h2>
        <p className="text-sm text-slate-400 mt-3 leading-relaxed">{tx(T.bannedText)}</p>
        {SUPPORT_EMAIL && (
          <p className="text-xs text-slate-500 mt-4">
            {tx(T.appeal)} <span dir="ltr" className="text-primary-400">{SUPPORT_EMAIL}</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => signOut()}
          className="btn-primary mt-8 px-8 py-3 rounded-2xl text-sm font-bold"
        >
          {tx(T.logout)}
        </button>
      </div>,
      document.body
    );
  }

  const restricted = until > Date.now() && tick >= 0;

  const noticeTitle = (c: string): L3 =>
    c === 'restrict' ? T.restrictTitle : c === 'delete' ? T.deleteTitle : T.warnTitle;
  const noticeText = (c: string): L3 =>
    c === 'restrict' ? T.restrictText : c === 'delete' ? T.deleteText : T.warnText;

  const replyText = (s: string): L3 =>
    s === 'violation'
      ? T.replyViolation
      : s === 'bug_fixed'
      ? T.replyBugFixed
      : s === 'no_action'
      ? T.replyBugNone
      : T.replyNone;

  return (
    <>
      {restricted && !notice && (
        <div
          className="fixed bottom-24 inset-x-4 z-[250] pointer-events-none rounded-2xl bg-red-500/90 text-white text-[11px] font-bold px-3 py-2 flex items-center gap-2 shadow-lg"
          dir={dir}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            {tx(T.restrictedBar)} ({new Date(until).toLocaleDateString(lang)})
          </span>
        </div>
      )}

      {notice && (
        <Overlay>
          <div className="w-full max-w-sm rounded-3xl bg-dark-900 border border-white/10 p-6 text-center" dir={dir}>
            <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
            <h3 className="text-lg font-black text-white mt-4">{tx(noticeTitle(notice.code))}</h3>
            <p className="text-sm text-slate-300 mt-3 leading-relaxed">{tx(noticeText(notice.code))}</p>
            {notice.targetType && TARGETS[notice.targetType] && (
              <p className="text-xs text-slate-500 mt-3">
                {tx(T.type)} {tx(TARGETS[notice.targetType])}
              </p>
            )}
            {notice.code === 'restrict' && notice.until && (
              <p className="text-xs text-red-300 mt-2">
                {tx(T.until)} {new Date(notice.until).toLocaleDateString(lang)}
              </p>
            )}
            <button
              type="button"
              onClick={dismissNotice}
              className="btn-primary mt-6 w-full py-3 rounded-2xl text-sm font-bold"
            >
              {tx(T.ok)}
            </button>
          </div>
        </Overlay>
      )}

      {!notice && reply && (
        <Overlay z={440}>
          <div className="w-full max-w-sm rounded-3xl bg-dark-900 border border-white/10 p-6 text-center" dir={dir}>
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              {reply.status === 'violation' ? (
                <ShieldCheck className="w-7 h-7 text-emerald-400" />
              ) : (
                <Check className="w-7 h-7 text-emerald-400" />
              )}
            </div>
            <h3 className="text-lg font-black text-white mt-4">{tx(T.replyTitle)}</h3>
            <p className="text-sm text-slate-300 mt-3 leading-relaxed">{tx(replyText(reply.status))}</p>
            <button
              type="button"
              onClick={dismissReply}
              className="btn-primary mt-6 w-full py-3 rounded-2xl text-sm font-bold"
            >
              {tx(T.close)}
            </button>
          </div>
        </Overlay>
      )}
    </>
  );
};

export default ModerationGate;

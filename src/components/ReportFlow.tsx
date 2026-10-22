import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ChevronRight, ImagePlus, Loader2, ShieldCheck, X, Check, AlertCircle, Link2, User } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useUserBriefs } from '../services/userCache';
import {
  MAX_SCREENSHOTS, MAX_SCREENSHOT_MB, rememberReported, reportFileError, submitReport,
} from '../services/reportService';
import type { ReportMessageKind, ReportTargetType } from '../services/reportService';

type L3 = { ar: string; en: string; fr: string };
type Reason = { id: string } & L3;

const pick = (lang: string, v: L3): string => (lang === 'ar' ? v.ar : lang === 'fr' ? v.fr : v.en);

/* ------------------------------ الأسباب ------------------------------ */
const CONTENT_REASONS: Reason[] = [
  { id: 'dislike', ar: 'لا يعجبني فقط', en: "I just don't like it", fr: "Je n'aime pas ça" },
  { id: 'bullying', ar: 'تنمّر أو تواصل غير مرغوب', en: 'Bullying or unwanted contact', fr: 'Harcèlement ou contact non désiré' },
  { id: 'selfharm', ar: 'انتحار أو إيذاء النفس أو اضطرابات الأكل', en: 'Suicide, self-injury or eating disorders', fr: "Suicide, automutilation ou troubles alimentaires" },
  { id: 'violence', ar: 'عنف أو كراهية أو استغلال', en: 'Violence, hate or exploitation', fr: 'Violence, haine ou exploitation' },
  { id: 'restricted', ar: 'بيع أو ترويج مواد مقيّدة', en: 'Selling or promoting restricted items', fr: 'Vente ou promotion d’articles réglementés' },
  { id: 'nudity', ar: 'عُري أو نشاط جنسي', en: 'Nudity or sexual activity', fr: 'Nudité ou activité sexuelle' },
  { id: 'scam', ar: 'احتيال أو نصب أو محتوى مزعج', en: 'Scam, fraud or spam', fr: 'Arnaque, fraude ou spam' },
  { id: 'false', ar: 'معلومات كاذبة', en: 'False information', fr: 'Fausses informations' },
  { id: 'ip', ar: 'انتهاك الملكية الفكرية', en: 'Intellectual property', fr: 'Propriété intellectuelle' },
  { id: 'other', ar: 'سبب آخر', en: 'Something else', fr: 'Autre chose' },
];

const MESSAGE_REASONS: Reason[] = [
  { id: 'bullying', ar: 'تنمّر أو مضايقة', en: 'Bullying or harassment', fr: 'Harcèlement' },
  { id: 'violence', ar: 'تهديد أو عنف أو كراهية', en: 'Threats, violence or hate', fr: 'Menaces, violence ou haine' },
  { id: 'nudity', ar: 'عُري أو محتوى جنسي', en: 'Nudity or sexual content', fr: 'Nudité ou contenu sexuel' },
  { id: 'scam', ar: 'احتيال أو نصب', en: 'Scam or fraud', fr: 'Arnaque ou fraude' },
  { id: 'spam', ar: 'رسائل مزعجة', en: 'Spam', fr: 'Spam' },
  { id: 'selfharm', ar: 'انتحار أو إيذاء النفس', en: 'Suicide or self-injury', fr: 'Suicide ou automutilation' },
  { id: 'other', ar: 'سبب آخر', en: 'Something else', fr: 'Autre chose' },
];

const CHAT_REASONS: Reason[] = [
  { id: 'bullying', ar: 'مضايقة أو تنمّر', en: 'Harassment or bullying', fr: 'Harcèlement' },
  { id: 'violence', ar: 'تهديدات أو كراهية', en: 'Threats or hate', fr: 'Menaces ou haine' },
  { id: 'nudity', ar: 'محتوى جنسي أو غير لائق', en: 'Sexual or inappropriate content', fr: 'Contenu sexuel ou inapproprié' },
  { id: 'scam', ar: 'احتيال أو نصب', en: 'Scam or fraud', fr: 'Arnaque ou fraude' },
  { id: 'spam', ar: 'رسائل مزعجة', en: 'Spam', fr: 'Spam' },
  { id: 'selfharm', ar: 'انتحار أو إيذاء النفس', en: 'Suicide or self-injury', fr: 'Suicide ou automutilation' },
  { id: 'other', ar: 'سبب آخر', en: 'Something else', fr: 'Autre chose' },
];

const USER_REASONS: Reason[] = [
  { id: 'fake', ar: 'حساب مزيّف أو انتحال شخصية', en: 'Fake account or impersonation', fr: 'Faux compte ou usurpation' },
  { id: 'bullying', ar: 'تنمّر أو مضايقة', en: 'Bullying or harassment', fr: 'Harcèlement' },
  { id: 'nudity', ar: 'محتوى جنسي أو عُري', en: 'Nudity or sexual content', fr: 'Nudité ou contenu sexuel' },
  { id: 'scam', ar: 'احتيال أو نصب', en: 'Scam or fraud', fr: 'Arnaque ou fraude' },
  { id: 'violence', ar: 'عنف أو كراهية', en: 'Violence or hate', fr: 'Violence ou haine' },
  { id: 'spam', ar: 'نشاط مزعج (سبام)', en: 'Spam activity', fr: 'Activité de spam' },
  { id: 'selfharm', ar: 'انتحار أو إيذاء النفس', en: 'Suicide or self-injury', fr: 'Suicide ou automutilation' },
  { id: 'other', ar: 'سبب آخر', en: 'Something else', fr: 'Autre chose' },
];

const APP_REASONS: Reason[] = [
  { id: 'crash', ar: 'التطبيق يتوقف أو يُغلق فجأة', en: 'App crashes or closes', fr: "L'appli plante ou se ferme" },
  { id: 'login', ar: 'مشكلة في تسجيل الدخول أو الحساب', en: 'Login or account problem', fr: 'Problème de connexion ou de compte' },
  { id: 'video', ar: 'الفيديو أو الحلقات لا تعمل', en: "Videos or episodes don't play", fr: 'Vidéos ou épisodes ne fonctionnent pas' },
  { id: 'chat', ar: 'مشكلة في الدردشة أو الرسائل', en: 'Chat or messages problem', fr: 'Problème de chat ou de messages' },
  { id: 'upload', ar: 'مشكلة في رفع المنشورات أو القصص', en: 'Posting or story upload problem', fr: 'Problème de publication ou de story' },
  { id: 'notif', ar: 'الإشعارات لا تصل', en: 'Notifications not working', fr: 'Notifications ne fonctionnent pas' },
  { id: 'slow', ar: 'التطبيق بطيء أو يعلّق', en: 'App is slow or freezing', fr: "L'appli est lente ou fige" },
  { id: 'display', ar: 'خطأ في العرض أو التصميم', en: 'Display or layout bug', fr: "Bug d'affichage" },
  { id: 'search', ar: 'مشكلة في البحث', en: 'Search problem', fr: 'Problème de recherche' },
  { id: 'profile', ar: 'مشكلة في الملف الشخصي أو الإعدادات', en: 'Profile or settings problem', fr: 'Problème de profil ou de paramètres' },
  { id: 'other', ar: 'مشكلة أخرى', en: 'Other problem', fr: 'Autre problème' },
];

const reasonsFor = (t: ReportTargetType): Reason[] => {
  switch (t) {
    case 'message': return MESSAGE_REASONS;
    case 'conversation':
    case 'group': return CHAT_REASONS;
    case 'user': return USER_REASONS;
    case 'app': return APP_REASONS;
    default: return CONTENT_REASONS;
  }
};

const TITLES: Record<ReportTargetType, L3> = {
  post: { ar: 'لماذا تبلّغ عن هذا المنشور؟', en: 'Why are you reporting this post?', fr: 'Pourquoi signalez-vous cette publication ?' },
  video: { ar: 'لماذا تبلّغ عن هذا الفيديو؟', en: 'Why are you reporting this video?', fr: 'Pourquoi signalez-vous cette vidéo ?' },
  reel: { ar: 'لماذا تبلّغ عن هذا الريلز؟', en: 'Why are you reporting this reel?', fr: 'Pourquoi signalez-vous ce reel ?' },
  story: { ar: 'لماذا تبلّغ عن هذه القصة؟', en: 'Why are you reporting this story?', fr: 'Pourquoi signalez-vous cette story ?' },
  comment: { ar: 'لماذا تبلّغ عن هذا التعليق؟', en: 'Why are you reporting this comment?', fr: 'Pourquoi signalez-vous ce commentaire ?' },
  message: { ar: 'لماذا تبلّغ عن هذه الرسالة؟', en: 'Why are you reporting this message?', fr: 'Pourquoi signalez-vous ce message ?' },
  conversation: { ar: 'لماذا تبلّغ عن هذه المحادثة؟', en: 'Why are you reporting this conversation?', fr: 'Pourquoi signalez-vous cette conversation ?' },
  group: { ar: 'لماذا تبلّغ عن هذه المجموعة؟', en: 'Why are you reporting this group?', fr: 'Pourquoi signalez-vous ce groupe ?' },
  user: { ar: 'لماذا تبلّغ عن هذا المستخدم؟', en: 'Why are you reporting this user?', fr: 'Pourquoi signalez-vous cet utilisateur ?' },
  app: { ar: 'ما المشكلة التي تواجهها في التطبيق؟', en: 'What problem are you having with the app?', fr: "Quel problème rencontrez-vous avec l'appli ?" },
};

const T = {
  header: { ar: 'إبلاغ', en: 'Report', fr: 'Signaler' },
  headerApp: { ar: 'الإبلاغ عن مشكلة', en: 'Report a problem', fr: 'Signaler un problème' },
  anon: {
    ar: 'بلاغك سرّي ومجهول الهوية. إذا كان شخص ما في خطر مباشر فاتصل بخدمات الطوارئ المحلية ولا تنتظر.',
    en: "Your report is anonymous. If someone is in immediate danger, call the local emergency services - don't wait.",
    fr: "Votre signalement est anonyme. Si quelqu'un est en danger immédiat, appelez les secours locaux sans attendre.",
  },
  anonApp: {
    ar: 'اختر نوع المشكلة وأضف وصفاً إن أردت.',
    en: 'Pick the type of problem and add details if you like.',
    fr: 'Choisissez le type de problème et ajoutez des détails si vous le souhaitez.',
  },
  details: { ar: 'تفاصيل إضافية (اختياري)', en: 'More details (optional)', fr: 'Plus de détails (facultatif)' },
  detailsPh: { ar: 'اشرح ما حدث...', en: 'Explain what happened...', fr: 'Expliquez ce qui s’est passé...' },
  shots: { ar: 'لقطات شاشة (حتى 3)', en: 'Screenshots (up to 3)', fr: "Captures d'écran (jusqu'à 3)" },
  addShot: { ar: 'إضافة', en: 'Add', fr: 'Ajouter' },
  reported: { ar: 'المستخدم المُبلَّغ عنه', en: 'Reported user', fr: 'Utilisateur signalé' },
  link: { ar: 'الرابط', en: 'Link', fr: 'Lien' },
  contact: { ar: 'اسم المستخدم الخاص بك (اختياري)', en: 'Your username (optional)', fr: "Votre nom d'utilisateur (facultatif)" },
  contactNote: {
    ar: 'إضافته اختيارية وتساعدنا على متابعة المشكلة.',
    en: 'Optional - it helps us follow up on the problem.',
    fr: 'Facultatif - cela nous aide à suivre le problème.',
  },
  hidden: {
    ar: 'هويتك مخفية: لا يعرفها المُبلَّغ عنه ولا التطبيق.',
    en: 'Your identity stays hidden from the reported person and from the app.',
    fr: "Votre identité reste cachée à la personne signalée et à l'appli.",
  },
  submit: { ar: 'إرسال البلاغ', en: 'Submit report', fr: 'Envoyer le signalement' },
  doneTitle: { ar: 'شكراً لك', en: 'Thank you', fr: 'Merci' },
  doneText: {
    ar: 'وصلنا بلاغك وسنراجعه قريباً.',
    en: 'We received your report and will review it soon.',
    fr: 'Nous avons reçu votre signalement et allons l’examiner.',
  },
  close: { ar: 'إغلاق', en: 'Close', fr: 'Fermer' },
  fail: { ar: 'تعذّر إرسال البلاغ. حاول مرة أخرى.', en: 'Could not send the report. Try again.', fr: "Impossible d'envoyer le signalement. Réessayez." },
  notImage: { ar: 'اختر صورة فقط.', en: 'Please choose an image.', fr: 'Choisissez une image.' },
  tooBig: { ar: `حجم الصورة كبير (الحد ${MAX_SCREENSHOT_MB} MB).`, en: `Image is too big (max ${MAX_SCREENSHOT_MB} MB).`, fr: `Image trop lourde (max ${MAX_SCREENSHOT_MB} Mo).` },
  encrypted: {
    ar: 'الرسائل مشفّرة ولا يمكن للمشرف قراءتها، لذلك أرفق لقطة شاشة للرسالة.',
    en: 'Messages are encrypted and cannot be read by moderators, so attach a screenshot of the message.',
    fr: 'Les messages sont chiffrés et illisibles pour les modérateurs, joignez donc une capture du message.',
  },
} satisfies Record<string, L3>;

/* ------------------------------ المكوّن ------------------------------ */
export interface ReportFlowProps {
  targetType: ReportTargetType;
  targetId: string;
  /** صاحب المحتوى المُبلَّغ عنه */
  reportedUid?: string;
  /** اسم احتياطي إن لم يتوفر اسم المستخدم */
  reportedName?: string;
  /** رابط المنشور أو الملف الشخصي */
  link?: string;
  contentType?: ReportMessageKind;
  appVersion?: string;
  onClose: () => void;
  onDone?: () => void;
}

interface Shot {
  file: File;
  url: string;
}

const ReportFlow: React.FC<ReportFlowProps> = ({
  targetType, targetId, reportedUid, reportedName, link, contentType, appVersion, onClose, onDone,
}) => {
  const { lang } = useI18n();
  const tx = (v: L3) => pick(lang, v);
  const isApp = targetType === 'app';
  const isMsg = targetType === 'message' || targetType === 'conversation' || targetType === 'group';

  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [contact, setContact] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;

  const briefs = useUserBriefs(reportedUid ? [reportedUid] : []);
  const brief = reportedUid ? briefs[reportedUid] : undefined;
  const reportedUsername = brief?.username || '';
  const reportedShown = reportedUsername ? `@${reportedUsername}` : reportedName || '';

  useEffect(
    () => () => {
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    },
    []
  );

  const reasons = useMemo(() => reasonsFor(targetType), [targetType]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    setError('');
    const next = [...shots];
    for (const f of list) {
      if (next.length >= MAX_SCREENSHOTS) break;
      const err = reportFileError(f);
      if (err === 'NOT_IMAGE') {
        setError(tx(T.notImage));
        continue;
      }
      if (err === 'TOO_BIG') {
        setError(tx(T.tooBig));
        continue;
      }
      next.push({ file: f, url: URL.createObjectURL(f) });
    }
    setShots(next);
  };

  const removeShot = (i: number) => {
    setShots((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, k) => k !== i);
    });
  };

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError('');
    try {
      await submitReport({
        targetType,
        targetId,
        category: reason.id,
        categoryLabel: pick('ar', reason),
        details,
        reportedUid,
        reportedUsername: reportedUsername || undefined,
        link,
        contentType,
        contactUsername: isApp ? contact : undefined,
        appVersion,
        files: shots.map((s) => s.file),
      });
      rememberReported(targetType, targetId);
      setDone(true);
      onDone?.();
    } catch (e) {
      console.error('submit report failed:', e);
      setError(tx(T.fail));
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (busy) return;
    if (reason && !done) {
      setReason(null);
      setError('');
    } else onClose();
  };

  const headerTitle = isApp ? tx(T.headerApp) : tx(T.header);

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-dark-950 flex flex-col" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* الرأس */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-white/10">
        <button type="button" onClick={goBack} className="p-2 text-white" aria-label="back">
          <ArrowRight className="w-6 h-6 rtl:rotate-0 ltr:rotate-180" />
        </button>
        <h2 className="text-lg font-black text-white">{headerTitle}</h2>
        <button type="button" onClick={onClose} className="p-2 text-white" aria-label={tx(T.close)}>
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {done ? (
          <div className="px-6 pt-24 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-black text-white mt-5">{tx(T.doneTitle)}</h3>
            <p className="text-sm text-slate-400 mt-2">{tx(T.doneText)}</p>
            <button type="button" onClick={onClose} className="btn-primary mt-8 px-8 py-3 rounded-2xl text-sm font-bold">
              {tx(T.close)}
            </button>
          </div>
        ) : !reason ? (
          <div className="px-5 pt-6 pb-10">
            <h3 className="text-xl font-black text-white text-center">{tx(TITLES[targetType])}</h3>
            <p className="text-sm text-slate-400 text-center mt-3 leading-relaxed">
              {isApp ? tx(T.anonApp) : tx(T.anon)}
            </p>
            <div className="mt-6">
              {reasons.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r)}
                  className="w-full flex items-center justify-between gap-3 py-4 text-start text-white text-[15px] border-b border-white/5 active:bg-white/5"
                >
                  <span>{tx(r)}</span>
                  <ChevronRight className="w-5 h-5 text-slate-500 shrink-0 rtl:rotate-180" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 pt-5 pb-10 space-y-5">
            <div>
              <p className="text-xs text-slate-500">{tx(TITLES[targetType])}</p>
              <p className="text-lg font-black text-white mt-1">{tx(reason)}</p>
            </div>

            {/* معلومات تُضاف تلقائياً */}
            {!isApp && (reportedShown || link) && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2">
                {reportedShown && (
                  <div className="flex items-start gap-2">
                    <User className="w-4 h-4 text-primary-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-500">{tx(T.reported)}</p>
                      <p className="text-sm text-white break-all" dir="ltr">{reportedShown}</p>
                    </div>
                  </div>
                )}
                {link && (
                  <div className="flex items-start gap-2">
                    <Link2 className="w-4 h-4 text-primary-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-500">{tx(T.link)}</p>
                      <p className="text-xs text-slate-300 break-all" dir="ltr">{link}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isMsg && targetType === 'message' && (
              <p className="text-[11px] text-amber-300/90 leading-relaxed">{tx(T.encrypted)}</p>
            )}

            {/* التفاصيل */}
            <div>
              <label className="text-sm font-bold text-white">{tx(T.details)}</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
                rows={5}
                placeholder={tx(T.detailsPh)}
                className="mt-2 w-full p-3 rounded-2xl bg-dark-900 border border-white/10 text-white text-sm outline-none focus:border-primary-500 resize-none"
              />
              <p className="text-[11px] text-slate-500 text-end tabular-nums">{details.length}/1000</p>
            </div>

            {isApp && (
              <div>
                <label className="text-sm font-bold text-white">{tx(T.contact)}</label>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value.replace(/^@/, '').slice(0, 40))}
                  dir="ltr"
                  placeholder="username"
                  className="mt-2 w-full px-3 py-2.5 rounded-2xl bg-dark-900 border border-white/10 text-white text-sm outline-none focus:border-primary-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">{tx(T.contactNote)}</p>
              </div>
            )}

            {/* لقطات الشاشة */}
            <div>
              <p className="text-sm font-bold text-white">{tx(T.shots)}</p>
              <div className="mt-2 flex gap-3">
                {shots.map((s, i) => (
                  <div key={s.url} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-white/10">
                    <img src={s.url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeShot(i)}
                      className="absolute top-1 end-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                      aria-label="remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {shots.length < MAX_SCREENSHOTS && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-24 h-24 rounded-2xl border border-dashed border-white/20 text-slate-400 flex flex-col items-center justify-center gap-1 active:bg-white/5"
                  >
                    <ImagePlus className="w-6 h-6" />
                    <span className="text-[11px]">{tx(T.addShot)}</span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs">{error}</p>
              </div>
            )}

            {!isApp && (
              <p className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" /> {tx(T.hidden)}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full btn-primary py-3.5 rounded-2xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} {tx(T.submit)}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ReportFlow;

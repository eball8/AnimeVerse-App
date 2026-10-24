import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { uploadVideoToCloudinary } from './cloudinaryService';

/* ------------------------------------------------------------------
   نظام البلاغات الموحّد.
   - هوية المُبلِّغ لا تُحفظ نهائياً (لا reporterUid) فلا يعرفها أحد.
   - لكل بلاغ رقم تذكرة عشوائي يُحفظ في جهاز المُبلِّغ فقط،
     ومنه يستقبل ردّ الإدارة دون كشف هويته.
   - يدعم حتى 3 لقطات شاشة، واسم المستخدم المُبلَّغ عنه، ورابط المحتوى.
------------------------------------------------------------------ */

export type ReportTargetType =
  | 'post'
  | 'video'
  | 'reel'
  | 'story'
  | 'comment'
  | 'message'
  | 'conversation'
  | 'group'
  | 'user'
  | 'app';

export type ReportMessageKind = 'text' | 'image' | 'video' | 'audio';

export const MAX_SCREENSHOTS = 3;
export const MAX_SCREENSHOT_MB = 10;

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: string;
  /** معرّف السبب المختار (مثل spam / bullying) */
  category: string;
  /** نص السبب كما رآه المستخدم (يُحفظ ليقرأه المشرف مباشرة) */
  categoryLabel: string;
  details?: string;
  reportedUid?: string;
  reportedUsername?: string;
  link?: string;
  /** نوع الرسالة عند الإبلاغ عن رسالة */
  contentType?: ReportMessageKind;
  /** اسم مستخدم يكتبه المُبلِّغ بإرادته (للمشاكل التقنية فقط) */
  contactUsername?: string;
  appVersion?: string;
  files?: File[];
}

const clip = (v: string | undefined, max: number): string => (v ?? '').trim().slice(0, max);

const typeFor = (input: ReportInput): 'abuse' | 'spam' | 'bug' => {
  if (input.targetType === 'app') return 'bug';
  if (input.category === 'spam' || input.category === 'scam') return 'spam';
  return 'abuse';
};

export const reportFileError = (file: File): string | null => {
  if (!file.type.startsWith('image/')) return 'NOT_IMAGE';
  if (file.size > MAX_SCREENSHOT_MB * 1024 * 1024) return 'TOO_BIG';
  return null;
};

/* ---- تذاكر الردود (محفوظة في جهاز المُبلِّغ فقط) ---- */
const TICKETS_KEY = 'av_report_tickets_v1';
const TICKET_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CHANGE_EVENT = 'av-report-tickets-changed';

export interface LocalTicket {
  id: string;
  targetType: ReportTargetType;
  createdAt: number;
  /** ظهرت نافذة الرد للمستخدم وأغلقها */
  seen: boolean;
  category?: string;
  categoryLabel?: string;
  reportedUsername?: string;
  /** حالة الرد القادمة من الإدارة (تظهر بعد المراجعة) */
  status?: string;
  /** الإجراء المتخذ: dismiss / warn / delete / restrict / ban */
  action?: string;
  repliedAt?: number;
  /** false = إشعار «تم استلام بلاغك» لم يُقرأ بعد */
  ackRead?: boolean;
  /** false = إشعار الرد لم يُقرأ بعد */
  replyRead?: boolean;
}

const makeTicketId = (): string => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};

const readTickets = (): LocalTicket[] => {
  try {
    const v = JSON.parse(localStorage.getItem(TICKETS_KEY) || '[]');
    if (!Array.isArray(v)) return [];
    const now = Date.now();
    return v.filter(
      (x): x is LocalTicket =>
        x && typeof x.id === 'string' && typeof x.createdAt === 'number' && now - x.createdAt < TICKET_TTL_MS
    );
  } catch {
    return [];
  }
};

const writeTickets = (list: LocalTicket[]): void => {
  try {
    localStorage.setItem(TICKETS_KEY, JSON.stringify(list.slice(-100)));
  } catch {
    /* لا يؤثر على عمل التطبيق */
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* لا يؤثر على عمل التطبيق */
  }
};

export const getTickets = (): LocalTicket[] => readTickets();

/** اشتراك في أي تغيير على تذاكر البلاغات (يُستدعى فوراً مرة أولى) */
export const subscribeTickets = (cb: (list: LocalTicket[]) => void): (() => void) => {
  const run = () => cb(readTickets());
  run();
  window.addEventListener(CHANGE_EVENT, run);
  window.addEventListener('storage', run);
  return () => {
    window.removeEventListener(CHANGE_EVENT, run);
    window.removeEventListener('storage', run);
  };
};

const patchTicket = (id: string, patch: Partial<LocalTicket>): void => {
  writeTickets(readTickets().map((t) => (t.id === id ? { ...t, ...patch } : t)));
};

const rememberTicket = (id: string, input: ReportInput): void => {
  writeTickets([
    ...readTickets(),
    {
      id,
      targetType: input.targetType,
      createdAt: Date.now(),
      seen: false,
      category: clip(input.category, 40) || undefined,
      categoryLabel: clip(input.categoryLabel, 120) || undefined,
      reportedUsername: input.reportedUsername ? clip(input.reportedUsername, 60) : undefined,
      ackRead: false,
    },
  ]);
};

export const markTicketSeen = (id: string): void => {
  writeTickets(readTickets().map((t) => (t.id === id ? { ...t, seen: true } : t)));
};

/** عدد إشعارات البلاغات غير المقروءة (الاستلام + الردود) */
export const countUnreadReportNotifs = (list: LocalTicket[]): number =>
  list.reduce(
    (n, t) => n + (t.ackRead === false ? 1 : 0) + (t.status && t.replyRead === false ? 1 : 0),
    0
  );

/** وضع علامة «مقروء» على كل إشعارات البلاغات */
export const markReportNotifsRead = (): void => {
  const list = readTickets();
  if (countUnreadReportNotifs(list) === 0) return;
  writeTickets(
    list.map((t) => ({
      ...t,
      ackRead: t.ackRead === false ? true : t.ackRead,
      replyRead: t.status && t.replyRead === false ? true : t.replyRead,
    }))
  );
};

/** جلب ردود الإدارة للبلاغات التي لم يصل ردها بعد وحفظها محلياً */
let syncing = false;
export const syncTicketReplies = async (): Promise<void> => {
  if (syncing) return;
  syncing = true;
  try {
    const waiting = readTickets().filter((t) => !t.status);
    for (const tk of waiting) {
      try {
        const s = await getDoc(doc(db, 'reportTickets', tk.id));
        if (!s.exists()) continue;
        const d = s.data();
        patchTicket(tk.id, {
          status: String(d.status || 'reviewed'),
          action: d.action ? String(d.action) : undefined,
          repliedAt: d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now(),
          // إن كانت نافذة الرد قد ظهرت سابقاً فلا نعتبره إشعاراً جديداً
          replyRead: tk.seen === true,
        });
      } catch {
        /* نتجاهل ونحاول لاحقاً */
      }
    }
  } finally {
    syncing = false;
  }
};

export const submitReport = async (input: ReportInput): Promise<void> => {
  const targetId = clip(input.targetId, 200);
  if (!targetId) throw new Error('NO_TARGET');

  const files = (input.files ?? []).slice(0, MAX_SCREENSHOTS);
  const screenshots: string[] = [];
  for (const f of files) {
    if (reportFileError(f)) continue;
    screenshots.push(await uploadVideoToCloudinary(f));
  }

  const details = clip(input.details, 1000);
  const label = clip(input.categoryLabel, 120);
  const reason = (details ? `${label} — ${details}` : label || input.category).slice(0, 500);
  const ticketId = makeTicketId();

  const data: Record<string, unknown> = {
    type: typeFor(input),
    targetId,
    targetType: input.targetType,
    category: clip(input.category, 40) || 'other',
    reason,
    status: 'pending',
    ticketId,
    createdAt: serverTimestamp(),
  };
  if (details) data.details = details;
  if (input.reportedUid) data.reportedUid = clip(input.reportedUid, 200);
  if (input.reportedUsername) data.reportedUsername = clip(input.reportedUsername, 60);
  if (input.link) data.link = clip(input.link, 500);
  if (input.contentType) data.contentType = input.contentType;
  if (input.contactUsername) data.contactUsername = clip(input.contactUsername, 60);
  if (input.appVersion) data.appVersion = clip(input.appVersion, 30);
  if (screenshots.length) data.screenshots = screenshots;

  await addDoc(collection(db, 'reports'), data);
  rememberTicket(ticketId, input);
};

/* ---- منع تكرار البلاغ على نفس المحتوى من نفس الجهاز ---- */
const REPORTED_KEY = 'av_reported_v2';

const readReported = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(REPORTED_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const alreadyReported = (targetType: ReportTargetType, targetId: string): boolean =>
  readReported().includes(`${targetType}:${targetId}`);

export const rememberReported = (targetType: ReportTargetType, targetId: string): void => {
  try {
    const key = `${targetType}:${targetId}`;
    const list = readReported();
    if (!list.includes(key)) localStorage.setItem(REPORTED_KEY, JSON.stringify([...list, key].slice(-300)));
  } catch {
    /* لا يؤثر على عمل التطبيق */
  }
};

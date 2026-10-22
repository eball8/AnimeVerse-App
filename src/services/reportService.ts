import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { uploadVideoToCloudinary } from './cloudinaryService';

/* ------------------------------------------------------------------
   نظام البلاغات الموحّد.
   - هوية المُبلِّغ لا تُحفظ نهائياً (لا reporterUid) فلا يعرفها أحد.
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

  const data: Record<string, unknown> = {
    type: typeFor(input),
    targetId,
    targetType: input.targetType,
    category: clip(input.category, 40) || 'other',
    reason,
    status: 'pending',
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

// قواعد اسم المستخدم (اليوزر نيم) في مكان واحد:
// حروف إنجليزية صغيرة وأرقام و _ و . فقط، من 3 إلى 30 حرفاً،
// بدون نقطة في البداية أو النهاية أو نقطتين متتاليتين، ولا تدعم الحروف الكبيرة أبداً.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

export const USERNAME_HINT = 'أحرف إنجليزية صغيرة وأرقام و _ و . فقط (3-30)';
export const USERNAME_ERROR =
  'اسم المستخدم: أحرف إنجليزية صغيرة وأرقام و _ و . فقط (3-30)، بدون نقطة في البداية أو النهاية أو نقطتين متتاليتين.';

const SHAPE = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;
// Firestore يمنع معرّفات الوثائق التي تبدأ وتنتهي بشرطتين سفليتين مزدوجتين
const RESERVED = /^__.*__$/;

export const isValidUsername = (u: string): boolean =>
  u.length >= USERNAME_MIN && u.length <= USERNAME_MAX && SHAPE.test(u) && !RESERVED.test(u);

// أثناء الكتابة: يحوّل الحروف الكبيرة إلى صغيرة، ويحذف أي رمز غير مسموح،
// ويمنع نقطتين متتاليتين أو نقطة في أول الاسم
export const sanitizeUsernameInput = (v: string): string =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\./, '');

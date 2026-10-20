export type EmailCheckResult = { ok: true } | { ok: false; message: string; key?: string; vars?: Record<string, string> };

const COMMON_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'protonmail.com',
];

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,24}$/;

const levenshtein = (a: string, b: string): number => {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
};

export const checkEmail = (raw: string): EmailCheckResult => {
  const email = raw.trim().toLowerCase();

  if (!email) return { ok: false, message: 'اكتب البريد الإلكتروني.', key: 'auth.emailEmpty' };
  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, message: 'البريد الإلكتروني غير صحيح. تأكد من كتابته.', key: 'auth.emailBad' };
  }

  const domain = email.split('@')[1];
  if (!COMMON_DOMAINS.includes(domain)) {
    const close = COMMON_DOMAINS.find((d) => levenshtein(domain, d) <= 2);
    if (close) {
      return { ok: false, message: `هل تقصد @${close}؟ تأكد من كتابة البريد.`, key: 'auth.emailDidYouMean', vars: { domain: close } };
    }
  }

  return { ok: true };
};

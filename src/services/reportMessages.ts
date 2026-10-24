import type { LocalTicket } from './reportService';

type L3 = { ar: string; en: string; fr: string };
export type OutcomeTone = 'pending' | 'action' | 'none';

export interface TicketOutcome {
  tone: OutcomeTone;
  title: string;
  text: string;
}

const pick = (lang: string, v: L3): string => (lang === 'ar' ? v.ar : lang === 'fr' ? v.fr : v.en);

const M = {
  ackTitle: {
    ar: 'تم استلام بلاغك',
    en: 'We received your report',
    fr: 'Nous avons reçu votre signalement',
  },
  ackText: {
    ar: 'لقد تلقّينا بلاغك وسيقوم فريقنا بمراجعته في أقرب وقت. شكراً لمساهمتك في الحفاظ على مجتمع آمن للجميع.',
    en: 'We have received your report and our team will review it as soon as possible. Thank you for helping keep the community safe.',
    fr: 'Nous avons bien reçu votre signalement et notre équipe l’examinera dans les plus brefs délais. Merci de contribuer à la sécurité de la communauté.',
  },
  pendingTitle: { ar: 'قيد المراجعة', en: 'Under review', fr: 'En cours d’examen' },
  repliedTitle: {
    ar: 'تمت مراجعة بلاغك',
    en: 'Your report was reviewed',
    fr: 'Votre signalement a été examiné',
  },
  actionTitle: { ar: 'تم اتخاذ إجراء', en: 'Action taken', fr: 'Mesure prise' },
  noneTitle: { ar: 'لا توجد مخالفة', en: 'No violation found', fr: 'Aucune infraction' },
  reviewedTitle: { ar: 'تمت المراجعة', en: 'Reviewed', fr: 'Examiné' },
  fixedTitle: { ar: 'تمت معالجة المشكلة', en: 'Problem handled', fr: 'Problème traité' },
  removed: {
    ar: 'راجعنا بلاغك وتأكدنا أن المحتوى ينتهك معايير المجتمع، وقد أزلناه من التطبيق واتخذنا الإجراء المناسب بحق صاحبه. شكراً لك على حرصك.',
    en: 'We reviewed your report and confirmed the content violates the community standards. We removed it from the app and took the appropriate action against its owner. Thank you for caring.',
    fr: 'Nous avons examiné votre signalement et confirmé que le contenu enfreint les règles de la communauté. Nous l’avons supprimé et pris les mesures appropriées contre son auteur. Merci de votre vigilance.',
  },
  warned: {
    ar: 'راجعنا بلاغك وتأكدنا من وجود مخالفة لمعايير المجتمع، وقد وجّهنا إنذاراً لصاحب المحتوى. شكراً لمساعدتك.',
    en: 'We reviewed your report and confirmed a violation of the community standards. We have issued a warning to the content owner. Thank you for your help.',
    fr: 'Nous avons examiné votre signalement et confirmé une infraction aux règles. Nous avons adressé un avertissement à l’auteur du contenu. Merci de votre aide.',
  },
  restricted: {
    ar: 'راجعنا بلاغك وتأكدنا من وجود مخالفة لمعايير المجتمع، وقد قيّدنا الحساب المخالف مؤقتاً. شكراً لمساعدتك.',
    en: 'We reviewed your report and confirmed a violation of the community standards. We have temporarily restricted the offending account. Thank you for your help.',
    fr: 'Nous avons examiné votre signalement et confirmé une infraction aux règles. Nous avons temporairement restreint le compte concerné. Merci de votre aide.',
  },
  banned: {
    ar: 'راجعنا بلاغك وتأكدنا من وجود مخالفة جسيمة لمعايير المجتمع، وقد أغلقنا الحساب المخالف وأزلنا محتواه. شكراً لمساهمتك في سلامة المجتمع.',
    en: 'We reviewed your report and confirmed a serious violation of the community standards. We have closed the offending account and removed its content. Thank you for helping keep the community safe.',
    fr: 'Nous avons examiné votre signalement et confirmé une infraction grave aux règles. Nous avons fermé le compte concerné et supprimé son contenu. Merci de contribuer à la sécurité de la communauté.',
  },
  violation: {
    ar: 'راجعنا بلاغك وتأكدنا من وجود مخالفة لمعايير المجتمع، وقد اتخذنا الإجراء المناسب. شكراً لمساعدتك في إبقاء المجتمع آمناً.',
    en: 'We reviewed your report and confirmed a violation of the community standards. We have taken the appropriate action. Thank you for helping keep the community safe.',
    fr: 'Nous avons examiné votre signalement et confirmé une infraction aux règles. Nous avons pris les mesures appropriées. Merci de contribuer à la sécurité de la communauté.',
  },
  noViolation: {
    ar: 'راجعنا بلاغك بعناية ولم نجد أن المحتوى ينتهك معايير المجتمع، لذلك لم نتخذ أي إجراء. نقدّر اهتمامك، ولا تتردد في الإبلاغ عن أي شيء يقلقك مستقبلاً.',
    en: 'We reviewed your report carefully and did not find that the content violates the community standards, so no action was taken. We appreciate your concern; feel free to report anything that worries you in the future.',
    fr: 'Nous avons examiné attentivement votre signalement et n’avons pas constaté d’infraction aux règles ; aucune mesure n’a été prise. Nous apprécions votre démarche et vous invitons à signaler tout ce qui vous préoccupe.',
  },
  bugFixed: {
    ar: 'شكراً لك، تمت معالجة المشكلة التي أبلغت عنها.',
    en: 'Thank you, the problem you reported has been handled.',
    fr: 'Merci, le problème signalé a été traité.',
  },
  bugNone: {
    ar: 'شكراً لك، راجعنا ملاحظتك ولا يوجد إجراء إضافي حالياً.',
    en: 'Thank you, we reviewed your note and there is no further action for now.',
    fr: 'Merci, nous avons examiné votre remarque ; aucune action supplémentaire pour le moment.',
  },
  reviewed: {
    ar: 'راجعنا بلاغك. شكراً لمساهمتك في الحفاظ على مجتمع آمن.',
    en: 'We reviewed your report. Thank you for helping keep the community safe.',
    fr: 'Nous avons examiné votre signalement. Merci de contribuer à la sécurité de la communauté.',
  },
} satisfies Record<string, L3>;

const TARGETS: Record<string, L3> = {
  post: { ar: 'منشور', en: 'Post', fr: 'Publication' },
  video: { ar: 'فيديو', en: 'Video', fr: 'Vidéo' },
  reel: { ar: 'ريل', en: 'Reel', fr: 'Reel' },
  story: { ar: 'قصة', en: 'Story', fr: 'Story' },
  comment: { ar: 'تعليق', en: 'Comment', fr: 'Commentaire' },
  message: { ar: 'رسالة', en: 'Message', fr: 'Message' },
  conversation: { ar: 'محادثة', en: 'Conversation', fr: 'Conversation' },
  group: { ar: 'مجموعة', en: 'Group', fr: 'Groupe' },
  user: { ar: 'ملف شخصي', en: 'Profile', fr: 'Profil' },
  app: { ar: 'مشكلة في التطبيق', en: 'App problem', fr: 'Problème de l’appli' },
};

const CATEGORIES: Record<string, L3> = {
  dislike: { ar: 'لا يعجبني فقط', en: "I just don't like it", fr: "Je n'aime pas ça" },
  bullying: { ar: 'تنمّر أو مضايقة', en: 'Bullying or harassment', fr: 'Harcèlement' },
  selfharm: { ar: 'انتحار أو إيذاء النفس', en: 'Suicide or self-injury', fr: 'Suicide ou automutilation' },
  violence: { ar: 'عنف أو كراهية أو استغلال', en: 'Violence, hate or exploitation', fr: 'Violence, haine ou exploitation' },
  restricted: { ar: 'مواد مقيّدة', en: 'Restricted items', fr: 'Articles réglementés' },
  nudity: { ar: 'عُري أو محتوى جنسي', en: 'Nudity or sexual content', fr: 'Nudité ou contenu sexuel' },
  scam: { ar: 'احتيال أو نصب', en: 'Scam or fraud', fr: 'Arnaque ou fraude' },
  spam: { ar: 'سبام', en: 'Spam', fr: 'Spam' },
  false: { ar: 'معلومات كاذبة', en: 'False information', fr: 'Fausses informations' },
  ip: { ar: 'انتهاك الملكية الفكرية', en: 'Intellectual property', fr: 'Propriété intellectuelle' },
  fake: { ar: 'حساب مزيّف أو انتحال شخصية', en: 'Fake account or impersonation', fr: 'Faux compte ou usurpation' },
  other: { ar: 'سبب آخر', en: 'Something else', fr: 'Autre chose' },
};

export const targetLabel = (lang: string, type: string): string => {
  const v = TARGETS[type];
  return v ? pick(lang, v) : type;
};

export const categoryText = (lang: string, tk: LocalTicket): string => {
  const v = tk.category ? CATEGORIES[tk.category] : undefined;
  if (v) return pick(lang, v);
  return tk.categoryLabel || '';
};

export const ackMessage = (lang: string): { title: string; text: string } => ({
  title: pick(lang, M.ackTitle),
  text: pick(lang, M.ackText),
});

export const repliedTitle = (lang: string): string => pick(lang, M.repliedTitle);

export const outcomeFor = (lang: string, tk: LocalTicket): TicketOutcome => {
  if (!tk.status) {
    return { tone: 'pending', title: pick(lang, M.pendingTitle), text: pick(lang, M.ackText) };
  }

  switch (tk.status) {
    case 'no_violation':
      return { tone: 'none', title: pick(lang, M.noneTitle), text: pick(lang, M.noViolation) };
    case 'bug_fixed':
      return { tone: 'action', title: pick(lang, M.fixedTitle), text: pick(lang, M.bugFixed) };
    case 'no_action':
      return { tone: 'none', title: pick(lang, M.reviewedTitle), text: pick(lang, M.bugNone) };
    case 'violation': {
      const text =
        tk.action === 'delete'
          ? M.removed
          : tk.action === 'warn'
          ? M.warned
          : tk.action === 'restrict'
          ? M.restricted
          : tk.action === 'ban'
          ? M.banned
          : M.violation;
      return { tone: 'action', title: pick(lang, M.actionTitle), text: pick(lang, text) };
    }
    default:
      return { tone: 'none', title: pick(lang, M.reviewedTitle), text: pick(lang, M.reviewed) };
  }
};

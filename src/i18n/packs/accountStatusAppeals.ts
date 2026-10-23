import type { Lang } from '../translations';

type Dict = Record<string, string>;

const ar: Dict = {
  'as.notif.appealAccepted': 'تمت مراجعة طعنك وقبوله، وتم تخفيف القيود على حسابك.',
  'as.notif.appealRejected': 'راجعنا طعنك ولم يتغير القرار.',
};

const en: Dict = {
  'as.notif.appealAccepted': 'Your appeal was reviewed and accepted, and the restrictions on your account were eased.',
  'as.notif.appealRejected': 'We reviewed your appeal and the decision stands.',
};

const fr: Dict = {
  'as.notif.appealAccepted': 'Votre appel a été examiné et accepté ; les restrictions sur votre compte ont été allégées.',
  'as.notif.appealRejected': 'Nous avons examiné votre appel ; la décision est maintenue.',
};

const pack: Partial<Record<Lang, Dict>> = { ar, en, fr };
export default pack;

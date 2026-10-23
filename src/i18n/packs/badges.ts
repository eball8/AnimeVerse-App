// ترجمات: شارات التوثيق (ذهبية / حمراء)
import type { Lang } from '../translations';

type Dict = Record<string, string>;

const ar: Dict = {
  'badge.verified': 'حساب موثق',
  'adm.badge': 'شارة التوثيق',
  'adm.badgeNone': 'بدون شارة',
  'adm.badgeGold': 'ذهبية (مسؤول / مميز)',
  'adm.badgeRed': 'حمراء (متفاعل)',
};

const en: Dict = {
  'badge.verified': 'Verified account',
  'adm.badge': 'Verification badge',
  'adm.badgeNone': 'No badge',
  'adm.badgeGold': 'Gold (admin / featured)',
  'adm.badgeRed': 'Red (active member)',
};

const fr: Dict = {
  'badge.verified': 'Compte certifié',
  'adm.badge': 'Badge de certification',
  'adm.badgeNone': 'Aucun badge',
  'adm.badgeGold': 'Or (admin / vedette)',
  'adm.badgeRed': 'Rouge (membre actif)',
};

const es: Dict = {
  'badge.verified': 'Cuenta verificada',
  'adm.badge': 'Insignia de verificación',
  'adm.badgeNone': 'Sin insignia',
  'adm.badgeGold': 'Dorada (admin / destacado)',
  'adm.badgeRed': 'Roja (miembro activo)',
};

const pack: Record<Lang, Dict> = { ar, en, fr, es };
export default pack;

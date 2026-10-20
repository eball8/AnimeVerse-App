// ترجمات نافذة اختيار تاريخ الميلاد (DatePickerSheet)
import type { Lang } from '../translations';

type Dict = Record<string, string>;

const ar: Dict = {
  'date.pick': 'اختر تاريخ ميلادك',
  'date.birth': 'تاريخ الميلاد',
  'date.close': 'إغلاق',
  'date.prev': 'الشهر السابق',
  'date.next': 'الشهر التالي',
  'date.hint': 'اضغط على الشهر لاختيار السنة بسرعة',
  'date.confirm': 'تأكيد {date}',
  'date.pickDay': 'اختر يوماً',
  'date.minAge': 'يجب أن يكون عمرك {age} سنة على الأقل',
};

const en: Dict = {
  'date.pick': 'Choose your date of birth',
  'date.birth': 'Date of birth',
  'date.close': 'Close',
  'date.prev': 'Previous month',
  'date.next': 'Next month',
  'date.hint': 'Tap the month to pick the year quickly',
  'date.confirm': 'Confirm {date}',
  'date.pickDay': 'Pick a day',
  'date.minAge': 'You must be at least {age} years old',
};

const fr: Dict = {
  'date.pick': 'Choisissez votre date de naissance',
  'date.birth': 'Date de naissance',
  'date.close': 'Fermer',
  'date.prev': 'Mois précédent',
  'date.next': 'Mois suivant',
  'date.hint': 'Touchez le mois pour choisir l’année rapidement',
  'date.confirm': 'Confirmer {date}',
  'date.pickDay': 'Choisissez un jour',
  'date.minAge': 'Vous devez avoir au moins {age} ans',
};

const es: Dict = {
  'date.pick': 'Elige tu fecha de nacimiento',
  'date.birth': 'Fecha de nacimiento',
  'date.close': 'Cerrar',
  'date.prev': 'Mes anterior',
  'date.next': 'Mes siguiente',
  'date.hint': 'Toca el mes para elegir el año rápido',
  'date.confirm': 'Confirmar {date}',
  'date.pickDay': 'Elige un día',
  'date.minAge': 'Debes tener al menos {age} años',
};

const pack: Record<Lang, Dict> = { ar, en, fr, es };
export default pack;

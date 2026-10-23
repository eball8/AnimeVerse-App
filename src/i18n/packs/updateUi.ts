// ترجمات: لوحة التحديث + تعديل/حذف السيرفرات
import type { Lang } from '../translations';

type Dict = Record<string, string>;

const ar: Dict = {
  'upd.title': 'تحديث جديد متاح 🎉',
  'upd.body': 'نزل تحديث جديد لتطبيق AnimeVerse. يرجى من الجميع تنزيله الآن للاستمتاع بآخر الميزات والإصلاحات.',
  'upd.now': 'تحديث الآن',
  'upd.later': 'لاحقاً',
  'wt.editServer': 'تعديل السيرفر',
  'wt.edit': 'تعديل',
  'wt.delete': 'حذف',
  'wt.confirmDeleteServer': 'هل تريد حذف هذا السيرفر؟',
};

const en: Dict = {
  'upd.title': 'New update available 🎉',
  'upd.body': 'A new version of AnimeVerse is out. Please everyone download it now to get the latest features and fixes.',
  'upd.now': 'Update now',
  'upd.later': 'Later',
  'wt.editServer': 'Edit server',
  'wt.edit': 'Edit',
  'wt.delete': 'Delete',
  'wt.confirmDeleteServer': 'Delete this server?',
};

const fr: Dict = {
  'upd.title': 'Nouvelle mise à jour disponible 🎉',
  'upd.body': "Une nouvelle version d'AnimeVerse est disponible. Merci à tous de la télécharger maintenant.",
  'upd.now': 'Mettre à jour',
  'upd.later': 'Plus tard',
  'wt.editServer': 'Modifier le serveur',
  'wt.edit': 'Modifier',
  'wt.delete': 'Supprimer',
  'wt.confirmDeleteServer': 'Supprimer ce serveur ?',
};

const es: Dict = {
  'upd.title': 'Nueva actualización disponible 🎉',
  'upd.body': 'Ya salió una nueva versión de AnimeVerse. Pedimos a todos que la descarguen ahora.',
  'upd.now': 'Actualizar ahora',
  'upd.later': 'Más tarde',
  'wt.editServer': 'Editar servidor',
  'wt.edit': 'Editar',
  'wt.delete': 'Eliminar',
  'wt.confirmDeleteServer': '¿Eliminar este servidor?',
};

const pack: Record<Lang, Dict> = { ar, en, fr, es };
export default pack;

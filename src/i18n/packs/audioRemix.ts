// ترجمات ميزة استخدام الصوت / الريمكس (Use Audio / Remix)
import type { Lang } from '../translations';

type Dict = Record<string, string>;

const ar: Dict = {
  'audio.allowTitle': 'السماح باستخدام الصوت / الريمكس',
  'audio.allowDesc': 'عند التفعيل يستطيع الآخرون استخدام صوت فيديوك في فيديوهاتهم. عند الإيقاف يختفي خيار الصوت تماماً ولا يستطيع أحد استخدامه.',
  'audio.allowShort': 'السماح باستخدام الصوت',
  'audio.use': 'استعمال الصوت',
  'audio.original': 'الصوت الأصلي',
  'audio.usingFrom': 'صوت من {name}',
  'audio.removeAudio': 'إزالة الصوت',
  'audio.notAllowed': 'صاحب الفيديو لا يسمح باستخدام صوته.',
  'audio.loadFail': 'تعذّر تحميل الصوت المطلوب.',
  'audio.needVideo': 'اختر فيديو ليتم تطبيق الصوت عليه.',
  'audio.saveFail': 'تعذّر تغيير إعداد الصوت.',
};

const en: Dict = {
  'audio.allowTitle': 'Allow audio use / Remix',
  'audio.allowDesc': 'When on, others can use your video\'s audio in their own videos. When off, the audio option is hidden and nobody can use it.',
  'audio.allowShort': 'Allow audio use',
  'audio.use': 'Use audio',
  'audio.original': 'Original audio',
  'audio.usingFrom': 'Audio from {name}',
  'audio.removeAudio': 'Remove audio',
  'audio.notAllowed': 'The owner does not allow using this video\'s audio.',
  'audio.loadFail': 'Could not load the requested audio.',
  'audio.needVideo': 'Pick a video to apply the audio to.',
  'audio.saveFail': 'Could not change the audio setting.',
};

const fr: Dict = {
  'audio.allowTitle': 'Autoriser l\'utilisation de l\'audio / Remix',
  'audio.allowDesc': 'Activé : les autres peuvent utiliser l\'audio de votre vidéo dans leurs vidéos. Désactivé : l\'option audio est masquée et personne ne peut l\'utiliser.',
  'audio.allowShort': 'Autoriser l\'utilisation de l\'audio',
  'audio.use': 'Utiliser l\'audio',
  'audio.original': 'Audio original',
  'audio.usingFrom': 'Audio de {name}',
  'audio.removeAudio': 'Retirer l\'audio',
  'audio.notAllowed': 'Le propriétaire n\'autorise pas l\'utilisation de l\'audio de cette vidéo.',
  'audio.loadFail': 'Impossible de charger l\'audio demandé.',
  'audio.needVideo': 'Choisissez une vidéo pour y appliquer l\'audio.',
  'audio.saveFail': 'Impossible de modifier le réglage audio.',
};

const es: Dict = {
  'audio.allowTitle': 'Permitir el uso del audio / Remix',
  'audio.allowDesc': 'Activado: otros pueden usar el audio de tu video en sus videos. Desactivado: la opción de audio se oculta y nadie puede usarlo.',
  'audio.allowShort': 'Permitir el uso del audio',
  'audio.use': 'Usar audio',
  'audio.original': 'Audio original',
  'audio.usingFrom': 'Audio de {name}',
  'audio.removeAudio': 'Quitar audio',
  'audio.notAllowed': 'El propietario no permite usar el audio de este video.',
  'audio.loadFail': 'No se pudo cargar el audio solicitado.',
  'audio.needVideo': 'Elige un video para aplicarle el audio.',
  'audio.saveFail': 'No se pudo cambiar el ajuste de audio.',
};

const pack: Record<Lang, Dict> = { ar, en, fr, es };
export default pack;

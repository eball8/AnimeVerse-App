// ترجمات: رسائل متفرقة من الخدمات (جهاز افتراضي، اسم المستخدم، المعرض)
import type { Lang } from '../translations';

type Dict = Record<string, string>;

const ar: Dict = {
  'misc.device': 'جهاز',
  'misc.defaultUser': 'مستخدم AnimeVerse',
  'misc.usernameTaken': 'اسم المستخدم مستخدم بالفعل.',
  'misc.galleryRead': 'تعذّر قراءة الملف المختار.',
};

const en: Dict = {
  'misc.device': 'Device',
  'misc.defaultUser': 'AnimeVerse User',
  'misc.usernameTaken': 'This username is already taken.',
  'misc.galleryRead': 'Could not read the selected file.',
};

const fr: Dict = {
  'misc.device': 'Appareil',
  'misc.defaultUser': 'Utilisateur AnimeVerse',
  'misc.usernameTaken': 'Ce nom d’utilisateur est déjà pris.',
  'misc.galleryRead': 'Impossible de lire le fichier sélectionné.',
};

const es: Dict = {
  'misc.device': 'Dispositivo',
  'misc.defaultUser': 'Usuario de AnimeVerse',
  'misc.usernameTaken': 'Este nombre de usuario ya está en uso.',
  'misc.galleryRead': 'No se pudo leer el archivo seleccionado.',
};

const pack: Record<Lang, Dict> = { ar, en, fr, es };
export default pack;

// ترجمات: ربط EZV Player
import type { Lang } from '../translations';

type Dict = Record<string, string>;

const ar: Dict = {
  'wt.ezvMissing': 'مشغل EZV غير مثبت على هاتفك. هل تريد تحميله الآن؟ سيُفتح الرابط في المتصفح مؤقتاً.',
  'wt.ezvFailed': 'تعذّر فتح EZV Player، سيُفتح الرابط في المتصفح.',
};

const en: Dict = {
  'wt.ezvMissing': 'EZV Player is not installed on your phone. Open the store to download it? The link will open in the browser for now.',
  'wt.ezvFailed': 'Could not open EZV Player. Opening the link in the browser.',
};

const fr: Dict = {
  'wt.ezvMissing': 'EZV Player n’est pas installé sur votre téléphone. Ouvrir le store pour le télécharger ? Le lien s’ouvrira dans le navigateur en attendant.',
  'wt.ezvFailed': 'Impossible d’ouvrir EZV Player. Ouverture du lien dans le navigateur.',
};

const es: Dict = {
  'wt.ezvMissing': 'EZV Player no está instalado en tu teléfono. ¿Abrir la tienda para descargarlo? Por ahora el enlace se abrirá en el navegador.',
  'wt.ezvFailed': 'No se pudo abrir EZV Player. Abriendo el enlace en el navegador.',
};

const pack: Record<Lang, Dict> = { ar, en, fr, es };
export default pack;

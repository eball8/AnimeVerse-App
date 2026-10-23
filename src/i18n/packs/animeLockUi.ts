// ترجمات: قفل الأنمي مؤقتاً + فتحه وإشعار المستخدمين
import type { Lang } from '../translations';

type Dict = Record<string, string>;

const ar: Dict = {
  'lock.title': 'هذا القسم مقفل مؤقتاً',
  'lock.desc': 'نعمل حالياً على رفع حلقات هذا الأنمي. سنفتحه قريباً وسنُرسل لك إشعاراً فور توفره، ترقّب! 🍿',
  'lock.hint': 'يمكنك مشاهدة التريلر وقراءة القصة من تبويب التفاصيل.',
  'lock.adminLocked': 'هذا الأنمي مقفل على المستخدمين (أنت ترى الحلقات لأنك أدمن).',
  'lock.adminOpen': 'هذا الأنمي مفتوح للجميع.',
  'lock.unlockBtn': 'فتح الأنمي للجميع',
  'lock.relockBtn': 'إعادة القفل',
  'lock.unlockConfirm': 'سيتم فتح هذا الأنمي وإرسال إشعار لجميع المستخدمين. متابعة؟',
  'lock.relockConfirm': 'سيتم قفل قسم الحلقات عن المستخدمين. متابعة؟',
  'lock.unlockDone': 'تم فتح الأنمي وإرسال الإشعار للجميع ✅',
  'lock.relockDone': 'تم قفل الأنمي.',
  'lock.err': 'حدث خطأ: {msg}',
  'lock.annTitle': '🎉 تم فتح أنمي {title}!',
  'lock.annBody': 'الحلقات متاحة الآن، استمتع بالمشاهدة 🍿',
  'lock.watchNow': 'شاهد الآن',
};

const en: Dict = {
  'lock.title': 'This section is temporarily locked',
  'lock.desc': 'We are uploading the episodes of this anime. It will open soon and you will get a notification as soon as it is available. Stay tuned! 🍿',
  'lock.hint': 'You can still watch the trailer and read the story in the Details tab.',
  'lock.adminLocked': 'This anime is locked for users (you can see the episodes because you are an admin).',
  'lock.adminOpen': 'This anime is open to everyone.',
  'lock.unlockBtn': 'Open anime for everyone',
  'lock.relockBtn': 'Lock again',
  'lock.unlockConfirm': 'This anime will be opened and all users will be notified. Continue?',
  'lock.relockConfirm': 'The episodes section will be locked for users. Continue?',
  'lock.unlockDone': 'Anime opened and everyone was notified ✅',
  'lock.relockDone': 'Anime locked.',
  'lock.err': 'Error: {msg}',
  'lock.annTitle': '🎉 {title} is now open!',
  'lock.annBody': 'Episodes are available now, enjoy watching 🍿',
  'lock.watchNow': 'Watch now',
};

const fr: Dict = {
  'lock.title': 'Cette section est temporairement verrouillée',
  'lock.desc': 'Nous ajoutons les épisodes de cet anime. Il ouvrira bientôt et vous serez notifié dès sa disponibilité. Restez à l’écoute ! 🍿',
  'lock.hint': 'Vous pouvez regarder la bande-annonce et lire le synopsis dans l’onglet Détails.',
  'lock.adminLocked': 'Cet anime est verrouillé pour les utilisateurs (vous voyez les épisodes car vous êtes admin).',
  'lock.adminOpen': 'Cet anime est ouvert à tous.',
  'lock.unlockBtn': 'Ouvrir l’anime pour tous',
  'lock.relockBtn': 'Verrouiller à nouveau',
  'lock.unlockConfirm': 'Cet anime sera ouvert et tous les utilisateurs seront notifiés. Continuer ?',
  'lock.relockConfirm': 'La section des épisodes sera verrouillée pour les utilisateurs. Continuer ?',
  'lock.unlockDone': 'Anime ouvert et tout le monde a été notifié ✅',
  'lock.relockDone': 'Anime verrouillé.',
  'lock.err': 'Erreur : {msg}',
  'lock.annTitle': '🎉 {title} est maintenant ouvert !',
  'lock.annBody': 'Les épisodes sont disponibles, bon visionnage 🍿',
  'lock.watchNow': 'Regarder',
};

const es: Dict = {
  'lock.title': 'Esta sección está bloqueada temporalmente',
  'lock.desc': 'Estamos subiendo los episodios de este anime. Se abrirá pronto y recibirás una notificación en cuanto esté disponible. ¡Atento! 🍿',
  'lock.hint': 'Puedes ver el tráiler y leer la sinopsis en la pestaña Detalles.',
  'lock.adminLocked': 'Este anime está bloqueado para los usuarios (ves los episodios porque eres admin).',
  'lock.adminOpen': 'Este anime está abierto para todos.',
  'lock.unlockBtn': 'Abrir anime para todos',
  'lock.relockBtn': 'Bloquear de nuevo',
  'lock.unlockConfirm': 'Este anime se abrirá y se notificará a todos los usuarios. ¿Continuar?',
  'lock.relockConfirm': 'La sección de episodios se bloqueará para los usuarios. ¿Continuar?',
  'lock.unlockDone': 'Anime abierto y todos fueron notificados ✅',
  'lock.relockDone': 'Anime bloqueado.',
  'lock.err': 'Error: {msg}',
  'lock.annTitle': '🎉 ¡{title} ya está abierto!',
  'lock.annBody': 'Los episodios ya están disponibles, ¡disfruta! 🍿',
  'lock.watchNow': 'Ver ahora',
};

const pack: Record<Lang, Dict> = { ar, en, fr, es };
export default pack;
  

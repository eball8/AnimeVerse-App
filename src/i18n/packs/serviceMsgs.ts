// ترجمات: رسائل الخدمات (حذف الحساب + رفع الملفات)
import type { Lang } from '../translations';

type Dict = Record<string, string>;

const ar: Dict = {
  'svc.step.verify': 'التحقق من الهوية...',
  'svc.step.posts': 'حذف المنشورات...',
  'svc.step.comments': 'حذف التعليقات...',
  'svc.step.stories': 'حذف القصص...',
  'svc.step.likes': 'حذف الإعجابات...',
  'svc.step.follows': 'حذف المتابعات...',
  'svc.step.notifs': 'حذف الإشعارات والحظر...',
  'svc.step.library': 'حذف المكتبة والتقييمات...',
  'svc.step.messages': 'حذف رسائلك...',
  'svc.step.keys': 'حذف المفاتيح والأجهزة...',
  'svc.step.account': 'حذف الحساب...',
  'svc.up.videoTooBig': 'حجم الفيديو كبير جداً. الحد الأقصى هو {mb} ميجابايت.',
  'svc.up.notMedia': 'الملف المرفوع ليس صورة أو فيديو.',
  'svc.up.failedMedia': 'فشل رفع الوسائط.',
  'svc.up.failedFile': 'فشل رفع الملف.',
  'svc.up.parse': 'فشل في تحليل الاستجابة من Cloudinary.',
  'svc.up.network': 'حدث خطأ في الشبكة أثناء الرفع.',
  'svc.up.tooBig': 'الملف كبير جداً.',
  'svc.up.allRejected': 'كل الامتدادات مرفوضة [{list}]',
};

const en: Dict = {
  'svc.step.verify': 'Verifying identity...',
  'svc.step.posts': 'Deleting posts...',
  'svc.step.comments': 'Deleting comments...',
  'svc.step.stories': 'Deleting stories...',
  'svc.step.likes': 'Deleting likes...',
  'svc.step.follows': 'Deleting follows...',
  'svc.step.notifs': 'Deleting notifications and blocks...',
  'svc.step.library': 'Deleting library and ratings...',
  'svc.step.messages': 'Deleting your messages...',
  'svc.step.keys': 'Deleting keys and devices...',
  'svc.step.account': 'Deleting the account...',
  'svc.up.videoTooBig': 'The video is too large. The maximum is {mb} MB.',
  'svc.up.notMedia': 'The uploaded file is not an image or a video.',
  'svc.up.failedMedia': 'Media upload failed.',
  'svc.up.failedFile': 'File upload failed.',
  'svc.up.parse': 'Failed to parse the response from Cloudinary.',
  'svc.up.network': 'A network error occurred during the upload.',
  'svc.up.tooBig': 'The file is too large.',
  'svc.up.allRejected': 'All extensions were rejected [{list}]',
};

const fr: Dict = {
  'svc.step.verify': 'Vérification de l’identité...',
  'svc.step.posts': 'Suppression des publications...',
  'svc.step.comments': 'Suppression des commentaires...',
  'svc.step.stories': 'Suppression des stories...',
  'svc.step.likes': 'Suppression des mentions J’aime...',
  'svc.step.follows': 'Suppression des abonnements...',
  'svc.step.notifs': 'Suppression des notifications et des blocages...',
  'svc.step.library': 'Suppression de la bibliothèque et des notes...',
  'svc.step.messages': 'Suppression de vos messages...',
  'svc.step.keys': 'Suppression des clés et des appareils...',
  'svc.step.account': 'Suppression du compte...',
  'svc.up.videoTooBig': 'La vidéo est trop volumineuse. Le maximum est de {mb} Mo.',
  'svc.up.notMedia': 'Le fichier envoyé n’est ni une image ni une vidéo.',
  'svc.up.failedMedia': 'Échec de l’envoi du média.',
  'svc.up.failedFile': 'Échec de l’envoi du fichier.',
  'svc.up.parse': 'Impossible d’analyser la réponse de Cloudinary.',
  'svc.up.network': 'Une erreur réseau s’est produite pendant l’envoi.',
  'svc.up.tooBig': 'Le fichier est trop volumineux.',
  'svc.up.allRejected': 'Toutes les extensions ont été refusées [{list}]',
};

const es: Dict = {
  'svc.step.verify': 'Verificando la identidad...',
  'svc.step.posts': 'Eliminando publicaciones...',
  'svc.step.comments': 'Eliminando comentarios...',
  'svc.step.stories': 'Eliminando historias...',
  'svc.step.likes': 'Eliminando me gusta...',
  'svc.step.follows': 'Eliminando seguimientos...',
  'svc.step.notifs': 'Eliminando notificaciones y bloqueos...',
  'svc.step.library': 'Eliminando biblioteca y valoraciones...',
  'svc.step.messages': 'Eliminando tus mensajes...',
  'svc.step.keys': 'Eliminando claves y dispositivos...',
  'svc.step.account': 'Eliminando la cuenta...',
  'svc.up.videoTooBig': 'El vídeo es demasiado grande. El máximo es de {mb} MB.',
  'svc.up.notMedia': 'El archivo subido no es una imagen ni un vídeo.',
  'svc.up.failedMedia': 'Falló la subida del contenido.',
  'svc.up.failedFile': 'Falló la subida del archivo.',
  'svc.up.parse': 'No se pudo analizar la respuesta de Cloudinary.',
  'svc.up.network': 'Ocurrió un error de red durante la subida.',
  'svc.up.tooBig': 'El archivo es demasiado grande.',
  'svc.up.allRejected': 'Se rechazaron todas las extensiones [{list}]',
};

const pack: Record<Lang, Dict> = { ar, en, fr, es };
export default pack;

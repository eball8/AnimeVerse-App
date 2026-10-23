// ترجمات: الصفحة الرئيسية (الحلقات الجديدة) + أقسام الاستكشاف + قائمة الحلقات
import type { Lang } from '../translations';

type Dict = Record<string, string>;

const ar: Dict = {
  'home.newEpisodes': 'أحدث الحلقات',
  'home.newEmpty': 'لا توجد حلقات جديدة بعد.',
  'home.newFail': 'تعذّر تحميل الحلقات الجديدة.',
  'explore.airing': 'أنميات مستمرة',
  'explore.finished': 'أنميات منتهية',
  'explore.movies': 'أفلام الأنمي',
  'explore.back': 'رجوع',
  'anime.airingEpsNote': 'الحلقات تُضاف يدوياً من فريق AnimeVerse فور توفرها.',
  'anime.addEpisode': 'إضافة حلقة (للأدمن)',
  'anime.addEpisodePh': 'رقم الحلقة',
  'anime.go': 'فتح',
};

const en: Dict = {
  'home.newEpisodes': 'Latest episodes',
  'home.newEmpty': 'No new episodes yet.',
  'home.newFail': 'Could not load new episodes.',
  'explore.airing': 'Ongoing anime',
  'explore.finished': 'Completed anime',
  'explore.movies': 'Anime movies',
  'explore.back': 'Back',
  'anime.airingEpsNote': 'Episodes are added manually by the AnimeVerse team as soon as they are available.',
  'anime.addEpisode': 'Add episode (admin)',
  'anime.addEpisodePh': 'Episode number',
  'anime.go': 'Open',
};

const fr: Dict = {
  'home.newEpisodes': 'Derniers épisodes',
  'home.newEmpty': 'Aucun nouvel épisode pour le moment.',
  'home.newFail': 'Impossible de charger les nouveaux épisodes.',
  'explore.airing': 'Animes en cours',
  'explore.finished': 'Animes terminés',
  'explore.movies': 'Films d’animation',
  'explore.back': 'Retour',
  'anime.airingEpsNote': 'Les épisodes sont ajoutés manuellement par l’équipe AnimeVerse dès qu’ils sont disponibles.',
  'anime.addEpisode': 'Ajouter un épisode (admin)',
  'anime.addEpisodePh': 'Numéro de l’épisode',
  'anime.go': 'Ouvrir',
};

const es: Dict = {
  'home.newEpisodes': 'Últimos episodios',
  'home.newEmpty': 'Aún no hay episodios nuevos.',
  'home.newFail': 'No se pudieron cargar los episodios nuevos.',
  'explore.airing': 'Animes en emisión',
  'explore.finished': 'Animes finalizados',
  'explore.movies': 'Películas de anime',
  'explore.back': 'Volver',
  'anime.airingEpsNote': 'El equipo de AnimeVerse añade los episodios manualmente en cuanto están disponibles.',
  'anime.addEpisode': 'Añadir episodio (admin)',
  'anime.addEpisodePh': 'Número de episodio',
  'anime.go': 'Abrir',
};

const pack: Record<Lang, Dict> = { ar, en, fr, es };
export default pack;

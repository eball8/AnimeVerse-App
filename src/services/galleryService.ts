import { Capacitor, registerPlugin } from '@capacitor/core';

export interface GalleryMedia {
  id: string;
  uri: string;
  type: 'image' | 'video';
  mime: string;
  duration: number;
  date: number;
  thumb: string;
}

export interface GalleryAccess {
  media: boolean;
  camera: boolean;
}

interface GalleryNativePlugin {
  checkAccess(): Promise<GalleryAccess>;
  requestAccess(): Promise<GalleryAccess>;
  openSettings(): Promise<void>;
  getMedias(options: {
    offset: number;
    limit: number;
    type: 'all' | 'images' | 'videos';
    thumbSize?: number;
  }): Promise<{ medias: GalleryMedia[]; hasMore: boolean }>;
  copyToCache(options: { uri: string }): Promise<{ path: string; mime: string; size: number }>;
}

const Gallery = registerPlugin<GalleryNativePlugin>('Gallery');

export const isNativeGallery = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('Gallery');

export const checkGalleryAccess = async (): Promise<GalleryAccess> => {
  if (!isNativeGallery()) return { media: false, camera: false };
  try {
    return await Gallery.checkAccess();
  } catch {
    return { media: false, camera: false };
  }
};

export const requestGalleryAccess = async (): Promise<GalleryAccess> => {
  if (!isNativeGallery()) return { media: false, camera: false };
  try {
    return await Gallery.requestAccess();
  } catch {
    return { media: false, camera: false };
  }
};

export const openAppSettings = async (): Promise<void> => {
  if (!isNativeGallery()) return;
  try {
    await Gallery.openSettings();
  } catch {
    /* ignore */
  }
};

export const fetchGalleryPage = (
  offset: number,
  type: 'all' | 'images' | 'videos',
  limit = 48
) => Gallery.getMedias({ offset, limit, type, thumbSize: 256 });

export const galleryMediaToFile = async (media: GalleryMedia): Promise<File> => {
  const copied = await Gallery.copyToCache({ uri: media.uri });
  const src = Capacitor.convertFileSrc('file://' + copied.path);
  const res = await fetch(src);
  if (!res.ok) throw new Error('تعذّر قراءة الملف المختار.');
  const blob = await res.blob();
  const mime = copied.mime || blob.type || (media.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const name = copied.path.split('/').pop() || (media.type === 'video' ? 'video.mp4' : 'image.jpg');
  return new File([blob], name, { type: mime });
};

export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

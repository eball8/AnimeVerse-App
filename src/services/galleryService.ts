import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { tr } from '../i18n/staticT';

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
  saveToGallery(options: { path: string; mime: string; name: string }): Promise<{ uri: string }>;
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
  if (!res.ok) throw new Error(tr('misc.galleryRead'));
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

// ---------------------------------------------------------------
// تنزيل صورة/فيديو إلى المعرض (أندرويد) أو كتنزيل عادي في المتصفح
// ---------------------------------------------------------------
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(blob);
  });

export const downloadMediaBlob = async (blob: Blob, mime: string): Promise<void> => {
  const isVideo = mime.startsWith('video/');
  const ext = mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : mime.includes('webp') ? 'webp' : isVideo ? (mime.includes('webm') ? 'webm' : 'mp4') : 'jpg';
  const name = `AnimeVerse_${Date.now()}.${ext}`;

  if (isNativeGallery()) {
    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Gallery.saveToGallery({ path: written.uri, mime, name });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
};

import { tr } from '../i18n/staticT';
import { auth } from '../config/firebase';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

// رابط دالة رفع الفيديو إلى Cloudflare R2. إن لم يُضبط يعود الرفع إلى Cloudinary كما كان.
const R2_UPLOAD_URL: string | undefined = import.meta.env.VITE_R2_UPLOAD_URL;

const MAX_VIDEO_SIZE_MB = 30;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

// يلتقط إطاراً من الفيديو كصورة مصغّرة (9:16). عند أي فشل يعيد null ولا يوقف الرفع.
const makeVideoThumb = (file: File): Promise<Blob | null> =>
  new Promise((resolve) => {
    const v = document.createElement('video');
    const src = URL.createObjectURL(file);
    let done = false;
    const finish = (b: Blob | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(src);
      v.removeAttribute('src');
      v.load();
      resolve(b);
    };
    const timer = setTimeout(() => finish(null), 8000);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.onerror = () => finish(null);
    v.onloadedmetadata = () => {
      try {
        v.currentTime = Math.min(0.3, (v.duration || 1) / 2);
      } catch {
        finish(null);
      }
    };
    v.onseeked = () => {
      try {
        const W = 360, H = 640;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const ctx = c.getContext('2d');
        if (!ctx || !v.videoWidth) return finish(null);
        const scale = Math.max(W / v.videoWidth, H / v.videoHeight);
        const dw = v.videoWidth * scale, dh = v.videoHeight * scale;
        ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
        c.toBlob((b) => finish(b), 'image/jpeg', 0.7);
      } catch {
        finish(null);
      }
    };
    v.src = src;
  });

const r2Key = (url: string): string => decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));

const uploadVideoToR2 = async (
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error(tr('svc.up.network'));
  const url = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', R2_UPLOAD_URL as string);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.url) resolve(res.url);
        else if (xhr.status === 429) reject(new Error('Too many uploads. Try again later.'));
        else reject(new Error(res?.error || tr('svc.up.failedMedia')));
      } catch {
        reject(new Error(tr('svc.up.parse')));
      }
    };
    xhr.onerror = () => reject(new Error(tr('svc.up.network')));
    xhr.send(file);
  });
  // الصورة المصغّرة اختيارية: أي فشل فيها لا يمنع نشر الفيديو
  try {
    const thumb = await makeVideoThumb(file);
    if (thumb) {
      await fetch(R2_UPLOAD_URL as string, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg', 'X-Thumb-For': r2Key(url) },
        body: thumb,
      });
    }
  } catch { /* تجاهل */ }
  return url;
};

// حذف فيديو من R2 (صاحبه فقط). لا يفعل شيئاً لفيديوهات Cloudinary القديمة ولا يرمي أخطاء.
export const deleteVideoFromR2 = async (url?: string): Promise<void> => {
  try {
    if (!R2_UPLOAD_URL || !url || url.includes('cloudinary.com')) return;
    if (!/\/videos\/[^/]+\/[\w-]+\.[a-z0-9]+$/i.test(url)) return;
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    await fetch(R2_UPLOAD_URL, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch { /* تجاهل */ }
};

export const uploadVideoToCloudinary = (
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      reject(new Error(tr('svc.up.videoTooBig', { mb: MAX_VIDEO_SIZE_MB })));
      return;
    }
    if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
      reject(new Error(tr('svc.up.notMedia')));
      return;
    }
    // الفيديو فقط يذهب إلى R2، والصور تبقى على Cloudinary
    if (R2_UPLOAD_URL && file.type.startsWith('video/')) {
      uploadVideoToR2(file, onProgress).then(resolve, reject);
      return;
    }
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) {
          resolve(res.secure_url);
        } else {
          reject(new Error(res?.error?.message || tr('svc.up.failedMedia')));
        }
      } catch {
        reject(new Error(tr('svc.up.parse')));
      }
    };
    xhr.onerror = () => reject(new Error(tr('svc.up.network')));
    xhr.send(formData);
  });
};

// الحد الأقصى للملف المشفّر (صوت/صورة/فيديو في الرسائل). يُرفع كملف raw.
// الخطة المجانية في Cloudinary تقبل غالباً حتى 10MB للملفات raw، ولذلك لا نتجاوزه.
export const MAX_ENCRYPTED_UPLOAD_MB = 10;

// نجرّب الامتدادات بالترتيب، وأي امتداد يرفضه Cloudinary ننتقل بعده للتالي
const RAW_EXTENSIONS = ['txt', 'enc', 'bin'];

class NotAllowedError extends Error {}

const uploadRawOnce = (
  blob: Blob,
  ext: string,
  onProgress?: (percent: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`;
    const formData = new FormData();
    
    // إجبار الامتداد على أن يكون txt أو enc
    // ننشئ ملف جديد بـ MIME Type يطابق الامتداد لتجنب رفض Cloudinary
    const forcedBlob = new Blob([blob], { type: ext === 'txt' ? 'text/plain' : 'application/octet-stream' });
    formData.append('file', forcedBlob, `encrypted_data.${ext}`);
    formData.append('upload_preset', UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) {
          resolve(res.secure_url);
          return;
        }
        const msg: string = res?.error?.message || tr('svc.up.failedFile');
        reject(/not allowed/i.test(msg) ? new NotAllowedError(`Cloudinary: ${msg}`) : new Error(`Cloudinary: ${msg}`));
      } catch {
        reject(new Error(tr('svc.up.parse')));
      }
    };
    xhr.onerror = () => reject(new Error(tr('svc.up.network')));
    xhr.send(formData);
  });
};

// رفع ملف مشفّر (الرسائل الصوتية والصور والفيديو). يُرفع كملف raw ولا يمكن لأحد فتحه بدون المفتاح
export const uploadEncryptedBlob = async (
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<string> => {
  if (blob.size > MAX_ENCRYPTED_UPLOAD_MB * 1024 * 1024) {
    throw new Error(tr('svc.up.tooBig'));
  }
  const failures: string[] = [];
  for (const ext of RAW_EXTENSIONS) {
    try {
      return await uploadRawOnce(blob, ext, onProgress);
    } catch (e: any) {
      if (e instanceof NotAllowedError) {
        failures.push(`${ext}: ${e.message}`);
        continue;
      }
      throw e;
    }
  }
  throw new Error(tr('svc.up.allRejected', { list: failures.join(' | ') }));
};

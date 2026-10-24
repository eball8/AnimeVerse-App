import { tr } from '../i18n/staticT';
import { auth } from '../config/firebase';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

// رابط دالة رفع الفيديو إلى Cloudflare R2. إن لم يُضبط يعود الرفع إلى Cloudinary كما كان.
const R2_UPLOAD_URL: string | undefined = import.meta.env.VITE_R2_UPLOAD_URL;

const MAX_VIDEO_SIZE_MB = 30;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

// يلتقط إطاراً من الفيديو كصورة مصغّرة (9:16). عند أي فشل يعيد null ولا يوقف الرفع.
// مصمّم ليتحمّل WebView في أندرويد: لا يعتمد على حدث واحد، وله مهلة احتياطية.
const makeVideoThumb = (file: File): Promise<Blob | null> =>
  new Promise((resolve) => {
    const v = document.createElement('video');
    const src = URL.createObjectURL(file);
    let done = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (b: Blob | null) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      URL.revokeObjectURL(src);
      v.removeAttribute('src');
      v.load();
      resolve(b);
    };
    const draw = () => {
      if (done) return;
      try {
        if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return;
        const W = 360, H = 640;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const ctx = c.getContext('2d');
        if (!ctx) return finish(null);
        const ratio = v.videoWidth / v.videoHeight;
        if (ratio > 0.7) {
          // فيديو عريض (مثل يوتيوب): خلفية ضبابية + الإطار كاملاً بدل قصّه وتكبيره
          const bs = Math.max(W / v.videoWidth, H / v.videoHeight);
          const bw = v.videoWidth * bs, bh = v.videoHeight * bs;
          ctx.filter = 'blur(16px) brightness(0.7)';
          ctx.drawImage(v, (W - bw) / 2, (H - bh) / 2, bw, bh);
          ctx.filter = 'none';
          const fs = Math.min(W / v.videoWidth, H / v.videoHeight);
          const fw = v.videoWidth * fs, fh = v.videoHeight * fs;
          ctx.drawImage(v, (W - fw) / 2, (H - fh) / 2, fw, fh);
        } else {
          const scale = Math.max(W / v.videoWidth, H / v.videoHeight);
          const dw = v.videoWidth * scale, dh = v.videoHeight * scale;
          ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
        }
        c.toBlob((b) => finish(b && b.size > 0 ? b : null), 'image/jpeg', 0.7);
      } catch {
        finish(null);
      }
    };
    timers.push(setTimeout(() => finish(null), 15000));
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.onerror = () => finish(null);
    v.onseeked = draw;
    v.onloadeddata = () => {
      try {
        const t = Math.min(0.5, (v.duration || 1) / 2);
        if (t > 0) v.currentTime = t;
      } catch { /* نكمل بالإطار الحالي */ }
      // إن لم يصل حدث seeked نرسم الإطار المتاح بعد لحظة
      timers.push(setTimeout(draw, 1200));
    };
    v.src = src;
    v.load();
  });

// يجهّز الغلاف الذي اختاره المستخدم: يبقى بنسبته الأصلية (بلا قصّ)، ويُصغَّر فقط
// حتى لا يتجاوز 720 بكسل في أطول ضلع، وجودته تنخفض عند الحاجة لتبقى ≤ 400 كيلوبايت.
export const coverToJpeg = (file: File): Promise<Blob | null> =>
  new Promise((resolve) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const w0 = img.naturalWidth, h0 = img.naturalHeight;
        if (!w0 || !h0) return resolve(null);
        let scale = Math.min(1, 720 / Math.max(w0, h0));
        for (let attempt = 0; attempt < 4; attempt++) {
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w0 * scale));
          c.height = Math.max(1, Math.round(h0 * scale));
          const ctx = c.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          for (const q of [0.8, 0.65, 0.5]) {
            const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q));
            if (b && b.size > 0 && b.size <= 400 * 1024) return resolve(b);
          }
          scale *= 0.75;
        }
        resolve(null);
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(src);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      resolve(null);
    };
    img.src = src;
  });

const r2Key = (url: string): string => decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));

const uploadVideoToR2 = async (
  file: File,
  onProgress?: (percent: number) => void,
  coverFile?: File | null
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
  // الصورة المصغّرة اختيارية: أي فشل فيها لا يمنع نشر الفيديو (نحاول مرتين)
  try {
    // الغلاف الذي اختاره المستخدم له الأولوية، وإلا نلتقط إطاراً من الفيديو
    const preparedCover =
      coverFile && coverFile.type === 'image/jpeg' && coverFile.size <= 400 * 1024 ? coverFile : coverFile ? await coverToJpeg(coverFile) : null;
    const thumb = preparedCover || (await makeVideoThumb(file));
    if (thumb) {
      for (let i = 0; i < 2; i++) {
        try {
          const r = await fetch(R2_UPLOAD_URL as string, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg', 'X-Thumb-For': r2Key(url) },
            body: thumb,
          });
          if (r.ok) break;
          console.warn('thumb upload failed', r.status);
        } catch (e) {
          console.warn('thumb upload error', e);
        }
      }
    } else {
      console.warn('thumb generation returned null');
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

// ضغط الصور قبل الرفع (قوي لتوفير رصيد Cloudinary): أقصى بعد 1080 بكسل، وجودة تنخفض حتى يصير الحجم ≤ 400 كيلوبايت.
// لا نمسّ GIF/SVG (قد تكون متحركة أو متجهية). عند أي فشل نرفع الملف الأصلي.
const MAX_IMAGE_BYTES = 400 * 1024;
const MAX_IMAGE_SIDE = 1080;

const compressImage = async (file: File): Promise<File> => {
  try {
    if (!file.type.startsWith('image/') || /gif|svg/.test(file.type)) return file;
    const src = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('img'));
      i.src = src;
    });
    URL.revokeObjectURL(src);
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) return file;
    let scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(w0, h0));
    for (let attempt = 0; attempt < 5; attempt++) {
      const c = document.createElement('canvas');
      c.width = Math.round(w0 * scale);
      c.height = Math.round(h0 * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.75, 0.65, 0.55]) {
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q));
        if (blob && blob.size <= MAX_IMAGE_BYTES) {
          // إن لم نوفّر شيئاً (الأصلي أصغر) نبقي الأصلي
          if (blob.size >= file.size && file.size <= MAX_IMAGE_BYTES) return file;
          return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
        }
      }
      scale *= 0.75; // ما زال كبيراً: نصغّر الأبعاد ونعيد المحاولة
    }
    return file;
  } catch {
    return file;
  }
};

export const uploadVideoToCloudinary = (
  file: File,
  onProgress?: (percent: number) => void,
  coverFile?: File | null
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
      uploadVideoToR2(file, onProgress, coverFile).then(resolve, reject);
      return;
    }
    compressImage(file).then((toSend) => {
      const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
      const formData = new FormData();
      formData.append('file', toSend);
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

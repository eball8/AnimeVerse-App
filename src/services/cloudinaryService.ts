const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const MAX_VIDEO_SIZE_MB = 50;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

export const uploadVideoToCloudinary = (
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      reject(new Error(`حجم الفيديو كبير جداً. الحد الأقصى هو ${MAX_VIDEO_SIZE_MB} ميجابايت.`));
      return;
    }
    if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
      reject(new Error('الملف المرفوع ليس صورة أو فيديو.'));
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
          reject(new Error(res?.error?.message || 'فشل رفع الوسائط.'));
        }
      } catch {
        reject(new Error('فشل في تحليل الاستجابة من Cloudinary.'));
      }
    };
    xhr.onerror = () => reject(new Error('حدث خطأ في الشبكة أثناء الرفع.'));
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
        const msg: string = res?.error?.message || 'فشل رفع الملف.';
        reject(/not allowed/i.test(msg) ? new NotAllowedError(`Cloudinary: ${msg}`) : new Error(`Cloudinary: ${msg}`));
      } catch {
        reject(new Error('فشل في تحليل الاستجابة من Cloudinary.'));
      }
    };
    xhr.onerror = () => reject(new Error('حدث خطأ في الشبكة أثناء الرفع.'));
    xhr.send(formData);
  });
};

// رفع ملف مشفّر (الرسائل الصوتية والصور والفيديو). يُرفع كملف raw ولا يمكن لأحد فتحه بدون المفتاح
export const uploadEncryptedBlob = async (
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<string> => {
  if (blob.size > MAX_ENCRYPTED_UPLOAD_MB * 1024 * 1024) {
    throw new Error('الملف كبير جداً.');
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
  throw new Error(`كل الامتدادات مرفوضة [${failures.join(' | ')}]`);
};

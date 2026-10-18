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

// رفع ملف مشفّر (الرسائل الصوتية). يُرفع كملف raw ولا يمكن لأحد سماعه بدون المفتاح
export const uploadEncryptedBlob = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (blob.size > 8 * 1024 * 1024) {
      reject(new Error('الرسالة الصوتية كبيرة جداً.'));
      return;
    }
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`;
    const formData = new FormData();
    formData.append('file', blob, 'voice.bin');
    formData.append('upload_preset', UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) resolve(res.secure_url);
        else reject(new Error(res?.error?.message || 'فشل رفع الصوت.'));
      } catch {
        reject(new Error('فشل في تحليل الاستجابة من Cloudinary.'));
      }
    };
    xhr.onerror = () => reject(new Error('حدث خطأ في الشبكة أثناء الرفع.'));
    xhr.send(formData);
  });
};

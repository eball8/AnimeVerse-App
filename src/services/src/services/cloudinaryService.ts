// استخدام المتغيرات البيئية من GitHub Secrets
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const MAX_VIDEO_SIZE_MB = 50;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024; // 50MB

export const uploadVideoToCloudinary = (
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    
    // 1. التحقق من حجم الملف (الحد الأقصى 50MB)
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      reject(new Error(`حجم الفيديو كبير جداً. الحد الأقصى هو ${MAX_VIDEO_SIZE_MB} ميجابايت.`));
      return;
    }

    // 2. التحقق من نوع الملف
    if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
      reject(new Error('الملف المرفوع ليس صورة أو فيديو.'));
      return;
    }

    // 3. تجهيز الطلب
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    // 4. تتبع نسبة الرفع
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };

    // 5. معالجة النتيجة
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) {
          resolve(res.secure_url); // رابط الفيديو أو الصورة
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

// أدوات الوسائط للمحادثات

export interface CompressedImage {
  blob: Blob;
  mime: string;
  w: number;
  h: number;
}

// تصغير الصورة وتحويلها إلى JPEG قبل التشفير والرفع (توفير بيانات وسرعة)
export const compressImage = (file: File, maxSide = 1600, quality = 0.82): Promise<CompressedImage> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
      const scale = Math.min(1, maxSide / longest);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas'));
        return;
      }
      // خلفية داكنة للصور الشفافة (PNG) حتى لا تصبح سوداء بشكل غريب
      ctx.fillStyle = '#14141c';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => (b ? resolve({ blob: b, mime: 'image/jpeg', w, h }) : reject(new Error('encode'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('decode'));
    };
    img.src = objectUrl;
  });

export const formatBytes = (n: number): string => {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

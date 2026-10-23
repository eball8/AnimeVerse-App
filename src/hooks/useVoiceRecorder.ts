import { useCallback, useEffect, useRef, useState } from 'react'; 

export interface VoiceResult {
  blob: Blob;
  mime: string;
  duration: number;
}

const MAX_SECONDS = 120;

const pickMime = (): string => {
  // نفضل mp4 لأجهزة iOS، و webm للأندرويد
  const list = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const m of list) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return 'audio/webm'; // القيمة الافتراضية
};

export const useVoiceRecorder = (onAutoStop?: (r: VoiceResult | null) => void) => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const resultRef = useRef<Promise<VoiceResult | null> | null>(null);
  const autoRef = useRef(onAutoStop);
  autoRef.current = onAutoStop;

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  const stop = useCallback(async (): Promise<VoiceResult | null> => {
    const rec = recRef.current;
    if (!rec) return null;
    if (rec.state !== 'inactive') rec.stop();
    return resultRef.current ? resultRef.current : null;
  }, []);

  const start = useCallback(async (): Promise<void> => {
    // إعدادات صوت أنقى: قناة واحدة، إلغاء الصدى وتقليل الضجيج، وإيقاف التضخيم التلقائي (سبب شائع للتشويش)
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
    } catch (e: any) {
      // إن رفض الجهاز هذه الإعدادات نرجع للإعداد العادي، أما رفض الإذن فنمرره كما هو
      if (e?.name === 'OverconstrainedError' || e?.name === 'TypeError') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        throw e;
      }
    }
    streamRef.current = stream;
    chunksRef.current = [];
    
    const preferredMime = pickMime();
    let rec: MediaRecorder;

    try {
      rec = new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 64000 });
    } catch {
      // في حال رفض الجهاز الصيغة، نستخدم الافتراضي
      rec = new MediaRecorder(stream);
    }

    recRef.current = rec;
    startedRef.current = Date.now();

    resultRef.current = new Promise<VoiceResult | null>((resolve) => {
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = () => {
        cleanup();
        resolve(null);
      };
      rec.onstop = () => {
        const duration = Math.round((Date.now() - startedRef.current) / 1000);
        // نأخذ الصيغة التي أنتجها المسجل فعلياً، وإن لم توجد نأخذ المفضلة
        const actualMime = rec.mimeType || preferredMime;
        const blob = new Blob(chunksRef.current, { type: actualMime });
        cleanup();
        resolve(duration < 1 || blob.size === 0 ? null : { blob, mime: actualMime, duration });
      };
    });

    rec.start(250);
    setSeconds(0);
    setRecording(true);
    timerRef.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedRef.current) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) {
        stop().then((r) => autoRef.current?.(r));
      }
    }, 250);
  }, [cleanup, stop]);

  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      rec.stop();
    }
    cleanup();
  }, [cleanup]);

  useEffect(() => () => cancel(), [cancel]);

  return { recording, seconds, start, stop, cancel };
};

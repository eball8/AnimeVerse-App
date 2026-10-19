import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceResult {
  blob: Blob;
  mime: string;
  duration: number;
}

const MAX_SECONDS = 120;

const pickMime = (): string | undefined => {
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return list.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickMime();

    // بعض أجهزة أندرويد ترفض الصيغة المحددة، فنجرب بدونها قبل أن نفشل
    let rec: MediaRecorder;
    try {
      try {
        rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        rec = new MediaRecorder(stream);
      }
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      throw e;
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
        const mime = rec.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        cleanup();
        resolve(duration < 1 || blob.size === 0 ? null : { blob, mime, duration });
      };
    });

    // تمرير 250ms يجعل المتصفح يسلّم البيانات تدريجياً (أضمن على WebView أندرويد)
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

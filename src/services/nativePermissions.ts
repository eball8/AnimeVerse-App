import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { LocalNotifications } from '@capacitor/local-notifications';

// أذونات الكاميرا (لصور البروفايل والستوري)
export const requestCameraPermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const status = await Camera.requestPermissions({ permissions: ['camera'] });
    return status.camera === 'granted';
  } catch (e) {
    console.error('Camera permission failed', e);
    return false;
  }
};

// أذونات الميكروفون (للرسائل الصوتية)
export const requestMicrophonePermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (e) {
    console.error('Microphone permission failed', e);
    return false;
  }
};

// أذونات الإشعارات
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const status = await LocalNotifications.requestPermissions();
    return status.display === 'granted';
  } catch (e) {
    console.error('Notification permission failed', e);
    return false;
  }
};

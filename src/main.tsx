import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { saveAppVersion } from './services/nativeVersion';
import { requestNotificationPermission } from './services/nativePermissions';
import { initDeviceId } from './services/deviceService';

// حفظ رقم الإصدار بشكل دائم وطلب إذن الإشعارات (يعمل داخل تطبيق الأندرويد فقط)
saveAppVersion('1.0.1');
requestNotificationPermission();

// تهيئة معرّف الجهاز الثابت قبل عرض التطبيق (لا تعطّل التشغيل عند الفشل)
const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
Promise.race([initDeviceId().catch(() => undefined), timeout]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { saveAppVersion } from './services/nativeVersion';
import { requestNotificationPermission } from './services/nativePermissions';

// حفظ رقم الإصدار بشكل دائم وطلب إذن الإشعارات (يعمل داخل تطبيق الأندرويد فقط)
saveAppVersion('1.0.1');
requestNotificationPermission();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

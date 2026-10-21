import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.animeverse.app',
  appName: 'AnimeVerse',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
    // المواقع المسموح بفتحها داخل نافذة التطبيق نفسها فقط.
    // أي موقع آخر (روابط المنشورات، سيرفرات المشاهدة، الإعلانات...) يُفتح في المتصفح الخارجي.
    allowNavigation: [
      'accounts.google.com',
      '*.firebaseapp.com',
    ],
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;

import fs from 'fs';
import path from 'path';

// نستخدم process.cwd() لأن السكريبت يعمل من المجلد الرئيسي للمشروع
const gradlePath = path.join(process.cwd(), 'android/app/build.gradle');

try {
  let gradle = fs.readFileSync(gradlePath, 'utf8');

  // 1. إضافة إعدادات التوقيع
  const signingConfig = `
    signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_PATH"))
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
  `;
  gradle = gradle.replace(/android\s*\{/, `android {\n${signingConfig}`);

  // 2. استخدام التوقيع في نسخة الإصدار
  gradle = gradle.replace(/buildTypes\s*\{\s*release\s*\{/, `buildTypes {\n        release {\n            signingConfig signingConfigs.release`);

  // 3. زيادة رقم الإصدار تلقائياً بناءً على عدد مرات البناء في GitHub
  const versionCode = process.env.GITHUB_RUN_NUMBER || '1';
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "1.0.${versionCode}"`);

  fs.writeFileSync(gradlePath, gradle);
  console.log('✅ Successfully injected signing config and versioning!');
} catch (error) {
  console.error('❌ Failed to inject signing config:', error);
  process.exit(1);
}

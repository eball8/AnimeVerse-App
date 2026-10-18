import fs from 'fs';
import path from 'path';

// نستخدم process.cwd() لأن السكريبت يعمل من المجلد الرئيسي للمشروع
const gradlePath = path.join(process.cwd(), 'android/app/build.gradle');

// ===== إعدادات رقم النسخة الظاهر =====
// STEP: كم يزيد الرقم في كل تحديث جديد (7 = كل تحديث يزيد 7)
const STEP = 7;
// ANCHOR_RUN: رقم البناء الذي نبدأ منه الحساب (البناء 109 = النسخة 1.1.9)
const ANCHOR_RUN = 109;

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

  // 3. رقم البناء الداخلي (يزيد تلقائياً، أندرويد يحتاجه للتحديث)
  const run = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10);
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${run}`);

  // 4. رقم النسخة الظاهر: نبدأ من ANCHOR_RUN ونزيد STEP مع كل بناء
  //    كل 100 يزيد الرقم الأوسط، وكل 1000 يزيد الرقم الأول
  const n = Math.max(0, ANCHOR_RUN + (run - ANCHOR_RUN) * STEP);
  const major = 1 + Math.floor(n / 1000);
  const minor = Math.floor((n % 1000) / 100);
  const patch = n % 100;
  const versionName = `${major}.${minor}.${patch}`;
  gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);

  fs.writeFileSync(gradlePath, gradle);
  console.log(`✅ Signing injected. versionName=${versionName} versionCode=${run}`);
} catch (error) {
  console.error('❌ Failed to inject signing config:', error);
  process.exit(1);
}

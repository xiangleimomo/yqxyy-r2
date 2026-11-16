const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('APK v1.6.11 targets the verified yqxxyy production site, not the legacy origin',()=>{
  const gradle=fs.readFileSync('android/app/build.gradle','utf8');
  assert.match(gradle,/websiteUrl.*https:\/\/yqxxyy\.netlify\.app\//);
  assert.doesNotMatch(gradle,/yqxyy-r2\.netlify\.app/);
  assert.match(gradle,/versionCode 19/);
  assert.match(gradle,/versionName '1\.6\.11'/);
  assert.match(gradle,/buildConfigField 'String', 'APP_URL'/);
  assert.match(gradle,/R2_DATA_ORIGIN/);
});

test('Android WebView and native R2 interception consistently use APP_URL host',()=>{
  const java=fs.readFileSync('android/app/src/main/java/com/yqxyy/english/MainActivity.java','utf8');
  assert.match(java,/browser\.loadUrl\(BuildConfig\.APP_URL\)/);
  assert.match(java,/R2PublicDataProxy\.intercept\(/);
  assert.match(java,/Uri\.parse\(BuildConfig\.APP_URL\)\.getHost\(\)/);
  assert.match(java,/home\.getHost\(\)\.equalsIgnoreCase\(url\.getHost\(\)\)/);
});

test('APK always bundles the current GitHub site and publishes a tagged release',()=>{
  const workflow=fs.readFileSync('.github/workflows/build-android-app.yml','utf8');
  assert.match(workflow,/npm run build/);
  assert.match(workflow,/cp -a dist\/\. android\/app\/src\/main\/assets\/site\//);
  assert.match(workflow,/gradle --no-daemon --stacktrace assembleDebug/);
  assert.match(workflow,/gh release upload/);
});

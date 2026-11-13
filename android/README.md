# 一起学英语 Android APP

Android WebView app around the existing yqxyy-r2 website and its responsive mobile UI.
Site data, Supabase accounts, Cloudflare R2 media and GitHub workflows stay unchanged.

- Default website: https://yqxyy-r2.netlify.app/
- Application ID: com.yqxyy.english
- Minimum Android: 7.0 (API 24)
- Build: JDK 17; Gradle 8.9; Android Gradle plugin 8.7.3
- Build command: `cd android && gradle assembleDebug`
- APK location: `android/app/build/outputs/apk/debug/app-debug.apk`
- Auto-build: `.github/workflows/build-android-app.yml`
- Public test APK: https://github.com/xiangleimomo/yqxyy-r2/releases/download/android-app-latest/YQXYY-Android.apk

To move from Netlify to Cloudflare Pages, update websiteUrl in `app/build.gradle`
or build using `-PwebsiteUrl=https://your-domain.example/`, then install the updated APK.
Do not close Netlify until the replacement app has been installed and tested.

The website's existing mobile layout is reused. In-app WebView keeps its own login
cookies separate from Chrome. Supports internal navigation, video fullscreen, file
picking, HTTPS downloads and microphone permissions for the app's own origin.
External websites open in the phone's browser.

IMPORTANT: This APK uses an Android debug signature for private phone testing.
It has not yet been verified on a physical Android device. HLS playback and subtitle
behavior should be checked on the phone. Production distribution requires a stable
private signing key, versionCode updates, and upgrade testing.

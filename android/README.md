# 一起学英语 Android APP

Android WebView app around the existing yqxyy-r2 website and its responsive mobile UI.\nVersion 1.5 extends the in-video PC-style control bar with drag-to-position subtitles, per-video subtitle timing adjustments and grouped TV episode playback. The APK includes the latest GitHub frontend snapshot.
Site data, Supabase accounts, Cloudflare R2 media and GitHub workflows stay unchanged.

- Default website: https://yqxyy-r2.netlify.app/
- Application ID: com.yqxyy.english
- Minimum Android: 7.0 (API 24)\n- Test version: 1.5.0; returning from fullscreen restores portrait orientation.\n- The Android Back button closes HTML fullscreen before navigating.
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
It has not yet been verified on a physical Android device.\nBecause GitHub test builds are debug-signed on fresh CI runners, an older APK may have a different signature: uninstall the old test app before installing version 1.1. Cloud learning records remain in Supabase; local WebView login cookies will be reset. HLS playback and subtitle
behavior should be checked on the phone. Production distribution requires a stable
private signing key, versionCode updates, and upgrade testing.

## GitHub-first Android frontend (1.2)

The release GitHub Action runs `npm run build`, then copies `dist/` into
`android/app/src/main/assets/site/` before Gradle compiles the APK.
Android WebView serves **only the public static frontend routes**
(`/`, `/index.html`, `/js/`, `/css/`, `/assets/`, `/arcade/`,
and `/source-lab/`) from this snapshot using the existing HTTPS
website origin. All `/data/*` content, Netlify Functions and
Supabase requests remain online and are not intercepted.

This deliberately works even if the Netlify static frontend is stale.
Each new APK is a fixed snapshot of the GitHub commit that built it;
new GitHub frontend edits require a new APK build, but R2 learning
content continues to update live without rebuilding. Netlify and
its backend must remain available until the Cloudflare migration
is verified. Do not shut off Netlify early.

The production Android build is debug-signed for personal testing;
uninstall a previous install if its debug signature differs.

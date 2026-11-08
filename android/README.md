# yqxyy Android test APK

This is an experimental Android WebView wrapper for the existing live site, not a native offline app. It requires Internet access and uses a temporary debug signature. Do not distribute as a production release.

Open the GitHub Actions workflow **Android test APK**, download the artifact **yqxyy-android-test-apk**, unzip it and install **app-debug.apk** on Android. Test login, audio, full-screen video, external video sources, PDF reader, downloads, and back navigation. The wrapper intentionally opens external top-level links in the system browser.

The PWA version in this branch is independent of this APK. The debug APK always loads the current production URL, not a PR preview.

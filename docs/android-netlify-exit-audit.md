# Android phone APK — Netlify dependency audit (2026-11-14)

Repository: `xiangleimomo/yqxyy-r2` (branch `main` at audit start).
This is an evidence-based **phone APK** audit. The Android TV APK under `android-tv/` is a separate product and still needs its own exit work. **Do not disable Netlify before all acceptance tests pass.**

## Current architecture actually used

- The APK bundles `index.html`, `js/`, `css/`, and public assets from `npm run build`. `MainActivity.bundledWebsiteFile()` intercepts those requests and reads from APK assets.
- `BuildConfig.APP_URL` is still `https://yqxyy-r2.netlify.app/`. `WebView.loadUrl(APP_URL)` uses a Netlify **logical origin**, even though most HTML/CSS/JS is local.
- `/data/*` is **not** in the APK and currently traverses Netlify Edge `r2-data` → Cloudflare R2. All Watch/Read/Word/Quiz catalogues and VTT are impacted.
- `/book-download/*` traverses Netlify Edge `book-download` to Little Fox official PDF, Pone, or Supabase `story_books`.
- `/_movie-media/bluevelvet/*` is a Netlify redirect/proxy.
- `/.netlify/functions/*` includes `movie-library-metadata` (search/verify), `movie-stream` (legacy source resolver), `movie-study-subtitles` (approved ZIP/SRT conversion), `source-explorer-api` (subtitle/provider exploration), and `movie-tv-seasons` (optional TMDB series count).
- `movie-backdrop` is already intercepted by native Android `MovieBackdropResolver`: **does not need Netlify**.
- Login, records, badges, parents, uploads and accounts use the existing Supabase project directly. Other videos/large images may use Pone, Little Fox CDN or third-party URLs; these are not Netlify itself. Updates use GitHub Releases.

## Verified R2 direct network test

GitHub Actions read-only check: `Audit Android independence from Netlify`.

| Public R2 key | GET with Range | Returned range | CORS Access-Control-Allow-Origin |
|---|---|---|---|
| `data/series-list.json` | HTTP 206 | `bytes 0-1023/73634` | Not present |
| `data/books.json` | HTTP 206 | `bytes 0-1023/15293` | Not present |

Public development endpoint: `https://pub-bf9dac62ea094bcdae4eca9e743f9b61.r2.dev`.
This is **not yet a validated production data domain**. It may have rate limits, abuse restrictions or future configuration changes. Prefer a stable, user-owned R2 custom domain for final deployment.

**Implication:** plain JavaScript `fetch(publicR2/data/...)` can fail because of missing CORS. Android can bypass this obstacle safely by intercepting the current `/data/*` request in native `WebViewClient.shouldInterceptRequest`, fetching public R2 objects over HTTPS and returning a same-origin `WebResourceResponse`. Never ship R2 S3 keys in the APK.

## Migration stages and acceptance

1. **P0 — critical learning resources:** Native read-only R2 proxy for `/data/*`, including JSON, PDF, XML, VTT and HLS with HTTP Range where needed. Verify real Little Fox Watch, Read, Word, Quiz and course updates after a GitHub→R2 publish. Staged in `feat/android-direct-r2-20261114`; changes must pass Java path checks and APK build before merge.
2. **P0 — PDFs:** Replace the `/book-download/*` Netlify Edge route for all bundled, official and Supabase-added PDFs. Validate MIME and the first bytes `%PDF-`, support large downloads without exposing private keys or arbitrary URLs; test legacy and uploaded books.
3. **P1 — media:** Replace `/_movie-media/bluevelvet/*` and any active `movie-stream` or `movie-study-subtitles` requests with a supported non-Netlify gateway or native routine; verify existing movies, subtitles, seeking, 206 Range and switching sources.
4. **P1 — admin tools:** Move `movie-library-metadata` search/verify and any required `source-explorer-api` calls to Android native/Supabase Edge or a Cloudflare Worker; do not mistake an auto-generated playback URL for a validated stream.
5. **P0 — true standalone origin:** Change the APK's logical origin away from `yqxyy-r2.netlify.app` (prefer the Android-reserved `https://appassets.androidplatform.net/` with a proper `WebViewAssetLoader` or equivalently safe local origin). Check Supabase Auth redirects, cookies, session persistence, deep links, CORS, mixed content, download/caches, fullscreen and all resources.
6. **P1 — independent update:** Keep GitHub Releases APK update checks. A new APK may require logging in again because web storage is origin-scoped.
7. **P1 — separate TV version:** `android-tv/` still fetches some catalogues via the site's Netlify `/data` proxy. Change and validate independently; do not conflate the two APKs.

## Switch guardrails

- Do not close Netlify or alter the currently installed release until the **new Android beta** passes the following with Netlify unavailable or blocked in test: app launch, initial catalogue, real login/relogin, Little Fox series, Watch/Read/Word/Quiz, PDF download and full-page read, movie playback and subtitles, admin media search, updating, and resume progress.
- Supabase Auth + DB, existing R2 bucket, Pone large files, GitHub Actions, and legitimate third-party media endpoints remain unchanged.
- Reject R2 key traversal, avoid sending tokens to the public R2 endpoint, and verify status/MIME/Range. Keep server credentials outside APK.
- This audit and first `/data` migration are **not yet full independence**: other Netlify routes listed above remain until replaced.

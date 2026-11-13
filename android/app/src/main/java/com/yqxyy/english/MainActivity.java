package com.yqxyy.english;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.util.Collections;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 1201;
    private static final String UPDATE_URL =
        "https://github.com/xiangleimomo/yqxyy-r2/releases/tag/android-app-latest";

    public class UpdateBridge {
        @JavascriptInterface public String getVersionName() {
            return BuildConfig.VERSION_NAME;
        }
        @JavascriptInterface public String getBuildSha() {
            return BuildConfig.APP_BUILD_SHA;
        }
        @JavascriptInterface public void openUpdatePage() {
            runOnUiThread(() -> openExternally(Uri.parse(UPDATE_URL)));
        }
    }
    private static final int ASK_MIC = 1202;
    private WebView browser;
    private FrameLayout root;
    private TextView errorPanel;
    private View fullScreenView;
    private WebChromeClient.CustomViewCallback fullScreenCallback;
    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private PermissionRequest micRequest;
    private int savedOrientation;
    private int savedSystemUi;
    private boolean appLandscapeFullscreen = false;
    private int appOriginalOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private int appOriginalSystemUi = 0;

    // CSS fullscreen retains HTML subtitles and PC-style controls. The app
    // rotates its Activity only when the trusted top-level site requests it.
    private void setAppLandscapeFullscreen(boolean enter) {
        if (enter == appLandscapeFullscreen) return;
        appLandscapeFullscreen = enter;
        if (enter) {
            appOriginalOrientation = getRequestedOrientation();
            appOriginalSystemUi = getWindow().getDecorView().getSystemUiVisibility();
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } else {
            setRequestedOrientation(appOriginalOrientation);
            getWindow().getDecorView().setSystemUiVisibility(appOriginalSystemUi);
        }
    }

    private boolean isTrustedAppPage() {
        Uri site = Uri.parse(BuildConfig.APP_URL);
        Uri current = Uri.parse(browser.getUrl() == null ? "" : browser.getUrl());
        return "https".equalsIgnoreCase(current.getScheme()) &&
            site.getHost() != null && site.getHost().equalsIgnoreCase(current.getHost());
    }


    // Serve the GitHub main snapshot bundled at build time. Netlify continues
    // handling /data/* (R2), Supabase and API/function requests; only public
    // static website assets are packaged. This avoids depending on a stale
    // Netlify frontend deployment while testing the Android-specific player.
    private WebResourceResponse bundledWebsiteFile(WebResourceRequest request) {
        Uri url = request.getUrl();
        Uri home = Uri.parse(BuildConfig.APP_URL);
        if (!"GET".equalsIgnoreCase(request.getMethod()) ||
            !"https".equalsIgnoreCase(url.getScheme()) ||
            home.getHost() == null || !home.getHost().equalsIgnoreCase(url.getHost())) return null;

        String route = url.getPath();
        if (route == null || route.contains("..") || route.contains("\\")) return null;
        String file = null;
        if (route.equals("/") || route.equals("/index.html")) file = "index.html";
        else if (route.startsWith("/js/") || route.startsWith("/css/") ||
                 route.startsWith("/assets/") || route.startsWith("/arcade/") ||
                 route.startsWith("/source-lab/")) file = route.substring(1);
        if (file == null) return null;
        try {
            InputStream stream = getAssets().open("site/" + file);
            String mime = "application/octet-stream";
            if (file.endsWith(".html")) mime = "text/html";
            else if (file.endsWith(".js") || file.endsWith(".mjs")) mime = "text/javascript";
            else if (file.endsWith(".css")) mime = "text/css";
            else if (file.endsWith(".json")) mime = "application/json";
            else if (file.endsWith(".svg")) mime = "image/svg+xml";
            else if (file.endsWith(".png")) mime = "image/png";
            else if (file.endsWith(".jpg") || file.endsWith(".jpeg")) mime = "image/jpeg";
            else if (file.endsWith(".webp")) mime = "image/webp";
            else if (file.endsWith(".gif")) mime = "image/gif";
            else if (file.endsWith(".woff2")) mime = "font/woff2";
            else if (file.endsWith(".woff")) mime = "font/woff";
            else if (file.endsWith(".ttf")) mime = "font/ttf";
            else if (file.endsWith(".mp3")) mime = "audio/mpeg";
            else if (file.endsWith(".mp4")) mime = "video/mp4";
            WebResourceResponse response = new WebResourceResponse(mime,
                mime.startsWith("text/") || mime.equals("application/json") ? "UTF-8" : null, stream);
            response.setResponseHeaders(Collections.singletonMap("Cache-Control", "no-store"));
            return response;
        } catch (IOException missing) {
            // Missing local asset: let the website handle the request normally.
            return null;
        }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        root = new FrameLayout(this);
        browser = new WebView(this);
        root.addView(browser, new FrameLayout.LayoutParams(-1, -1));
        errorPanel = new TextView(this);
        errorPanel.setText("网络连接失败\n\n点击此处重新加载");
        errorPanel.setTextColor(Color.rgb(52, 65, 74));
        errorPanel.setTextSize(18);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setBackgroundColor(Color.WHITE);
        errorPanel.setVisibility(View.GONE);
        errorPanel.setOnClickListener(v -> { errorPanel.setVisibility(View.GONE); browser.reload(); });
        root.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        // Read-only version metadata and one fixed, trusted update URL.
        browser.addJavascriptInterface(new UpdateBridge(), "YQXYYAndroidApp");
        // A feature marker, not an authentication token. Used by website CSS and
        // the safe fullscreen helper to enable app-only Android behavior.
        settings.setUserAgentString(settings.getUserAgentString() + " YQXYYAndroid/1.5");
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        // Enable Android Safe Browsing on Android 8.0+.
        if (android.os.Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, true);

        browser.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                // Only known advertising hosts are filtered; do not interfere
                // with player HTML, scripts, HLS manifests, or media CDNs.
                if (PlayerAdGuard.isKnownAdHost(request.getUrl().getHost())) {
                    return new WebResourceResponse("text/plain", "UTF-8",
                        new ByteArrayInputStream(new byte[0]));
                }
                return bundledWebsiteFile(request);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (PlayerAdGuard.isKnownAdHost(url.getHost())) return true;
                if (!request.isForMainFrame()) return false;
                if ("yqxyy-app".equalsIgnoreCase(url.getScheme()) &&
                    "fullscreen".equalsIgnoreCase(url.getHost())) {
                    if (isTrustedAppPage()) {
                        if ("/enter".equals(url.getPath())) setAppLandscapeFullscreen(true);
                        if ("/exit".equals(url.getPath())) setAppLandscapeFullscreen(false);
                    }
                    return true;
                }
                String appHost = Uri.parse(BuildConfig.APP_URL).getHost();
                if ("https".equalsIgnoreCase(url.getScheme()) &&
                    appHost != null && appHost.equalsIgnoreCase(url.getHost())) return false;
                // Redirects from a third-party iframe must never launch an
                // advertising tab or replace the trusted player page.
                // A deliberate update download uses the trusted native bridge.
                if (PlayerAdGuard.isPlayerPage(view.getUrl())) {
                    Toast.makeText(MainActivity.this, "已阻止第三方播放器跳转", Toast.LENGTH_SHORT).show();
                    return true;
                }
                if (!PlayerAdGuard.canOpenExternalScheme(url.getScheme())) return true;
                openExternally(url);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                errorPanel.setVisibility(View.GONE);
                // Do not keep the device locked in landscape after navigation.
                if (appLandscapeFullscreen) setAppLandscapeFullscreen(false);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) errorPanel.setVisibility(View.VISIBLE);
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean isDialog,
                    boolean isUserGesture, android.os.Message resultMsg) {
                // Third-party players sometimes use target=_blank / popup ads.
                return false;
            }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullScreenView != null) { callback.onCustomViewHidden(); return; }
                savedSystemUi = getWindow().getDecorView().getSystemUiVisibility();
                savedOrientation = getRequestedOrientation();
                fullScreenView = view;
                fullScreenCallback = callback;
                browser.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            }
            @Override public void onHideCustomView() { closeFullScreen(); }
            @Override public boolean onShowFileChooser(
                    WebView webView, android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, PICK_FILE);
                    return true;
                } catch (Exception e) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    return false;
                }
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    String originHost = request.getOrigin().getHost();
                    String appHost = Uri.parse(BuildConfig.APP_URL).getHost();
                    boolean audio = false;
                    for (String resource : request.getResources())
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) audio = true;
                    if (!audio || appHost == null || !appHost.equalsIgnoreCase(originHost)) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        if (micRequest != null) micRequest.deny();
                        micRequest = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, ASK_MIC);
                    }
                });
            }
        });
        browser.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                Uri uri = Uri.parse(url);
                if (PlayerAdGuard.isKnownAdHost(uri.getHost()) ||
                    (PlayerAdGuard.isPlayerPage(browser.getUrl()) &&
                     !Uri.parse(BuildConfig.APP_URL).getHost().equalsIgnoreCase(uri.getHost()))) {
                    Toast.makeText(this, "已阻止播放器下载或广告跳转", Toast.LENGTH_SHORT).show();
                    return;
                }
                if (!"https".equalsIgnoreCase(uri.getScheme()) || android.os.Build.VERSION.SDK_INT < 29) {
                    openExternally(uri);
                    return;
                }
                String name = URLUtil.guessFileName(url, contentDisposition, mimetype);
                DownloadManager.Request download = new DownloadManager.Request(uri);
                download.setTitle(name);
                download.setMimeType(mimetype);
                download.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                download.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) download.addRequestHeader("Cookie", cookies);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(download);
                Toast.makeText(this, "已开始下载：" + name, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "下载失败，请重试", Toast.LENGTH_SHORT).show();
            }
        });
        browser.loadUrl(BuildConfig.APP_URL);
    }

    private void openExternally(Uri uri) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException e) {
            Toast.makeText(this, "手机没有可打开此链接的应用", Toast.LENGTH_SHORT).show();
        }
    }

    private void closeFullScreen() {
        if (fullScreenView == null) return;
        root.removeView(fullScreenView);
        fullScreenView = null;
        browser.setVisibility(View.VISIBLE);
        setRequestedOrientation(savedOrientation);
        getWindow().getDecorView().setSystemUiVisibility(savedSystemUi);
        if (fullScreenCallback != null) fullScreenCallback.onCustomViewHidden();
        fullScreenCallback = null;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILE || fileCallback == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clips = data.getClipData();
            if (clips != null) {
                results = new Uri[clips.getItemCount()];
                for (int i = 0; i < clips.getItemCount(); i++)
                    results[i] = clips.getItemAt(i).getUri();
            } else if (data.getData() != null) results = new Uri[]{data.getData()};
        }
        fileCallback.onReceiveValue(results);
        fileCallback = null;
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(requestCode, permissions, grants);
        if (requestCode != ASK_MIC || micRequest == null) return;
        if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED)
            micRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        else micRequest.deny();
        micRequest = null;
    }

    @Override public void onBackPressed() {
        if (fullScreenView != null) { closeFullScreen(); return; }
        if (appLandscapeFullscreen) {
            // Back first closes the HTML caption-preserving fullscreen instead
            // of navigating away from the lesson and losing video position.
            browser.evaluateJavascript(
                "(function(){if(document.querySelector('.subtitle-page-fullscreen')){" +
                "window.dispatchEvent(new Event('sf-android-back'));return true;}" +
                "return false;})()",
                value -> {
                    if ("true".equals(value)) return;
                    setAppLandscapeFullscreen(false);
                    if (browser.canGoBack()) browser.goBack();
                    else MainActivity.super.onBackPressed();
                });
            return;
        }
        if (browser.canGoBack()) browser.goBack();
        else super.onBackPressed();
    }
    @Override protected void onPause() {
        super.onPause();
        if (browser != null) browser.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (browser != null) browser.onResume();
    }
    @Override protected void onDestroy() {
        if (appLandscapeFullscreen) setAppLandscapeFullscreen(false);
        if (micRequest != null) { micRequest.deny(); micRequest = null; }
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (fullScreenView != null) closeFullScreen();
        root.removeView(browser);
        browser.destroy();
        super.onDestroy();
    }
}

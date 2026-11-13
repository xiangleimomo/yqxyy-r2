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
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 1201;
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
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, true);

        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!request.isForMainFrame()) return false;
                if ("https".equalsIgnoreCase(url.getScheme()) &&
                    Uri.parse(BuildConfig.APP_URL).getHost().equalsIgnoreCase(url.getHost())) return false;
                openExternally(url);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                errorPanel.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) errorPanel.setVisibility(View.VISIBLE);
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
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
        if (fullScreenView != null) closeFullScreen();
        else if (browser.canGoBack()) browser.goBack();
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
        if (micRequest != null) { micRequest.deny(); micRequest = null; }
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (fullScreenView != null) closeFullScreen();
        root.removeView(browser);
        browser.destroy();
        super.onDestroy();
    }
}

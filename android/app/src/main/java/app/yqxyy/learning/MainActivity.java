package app.yqxyy.learning;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.FrameLayout;
import android.webkit.WebChromeClient.CustomViewCallback;

public class MainActivity extends Activity {
  private WebView web;
  private FrameLayout fullscreen;
  private View customView;
  private CustomViewCallback customCallback;
  private static final String HOME = "https://yqxyy-r2.netlify.app/";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    fullscreen = new FrameLayout(this);
    web = new WebView(this);
    fullscreen.addView(web);
    setContentView(fullscreen);
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setMediaPlaybackRequiresUserGesture(false);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        Uri uri = req.getUrl();
        if ("https".equals(uri.getScheme()) && "yqxyy-r2.netlify.app".equals(uri.getHost())) return false;
        if (!req.isForMainFrame()) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public void onShowCustomView(View view, CustomViewCallback callback) {
        if (customView != null) { callback.onCustomViewHidden(); return; }
        customView = view; customCallback = callback;
        web.setVisibility(View.GONE);
        fullscreen.addView(view, new FrameLayout.LayoutParams(-1,-1));
      }
      @Override public void onHideCustomView() {
        if (customView == null) return;
        fullscreen.removeView(customView);
        customView = null;
        web.setVisibility(View.VISIBLE);
        if (customCallback != null) customCallback.onCustomViewHidden();
        customCallback = null;
      }
    });
    web.loadUrl(HOME);
  }
  @Override public void onBackPressed() {
    if (customView != null) { web.getWebChromeClient().onHideCustomView(); return; }
    if (web.canGoBack()) web.goBack(); else super.onBackPressed();
  }
  @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}

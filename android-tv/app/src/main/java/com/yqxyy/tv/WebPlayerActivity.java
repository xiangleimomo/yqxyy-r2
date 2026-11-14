package com.yqxyy.tv;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * Explicit opt-in fallback for the existing website's third-party embedded
 * players. Does not claim a media URL is decodable by native ExoPlayer.
 * Keeps navigation on the selected provider host; blocks popups/new windows.
 */
public final class WebPlayerActivity extends Activity {
  private WebView browser;
  private FrameLayout root;
  private View fullscreen;
  private WebChromeClient.CustomViewCallback callback;
  private String allowedHost;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    String raw=getIntent().getStringExtra("url");
    Uri uri;
    try {uri=Uri.parse(raw);}catch(Exception ex){finish();return;}
    if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||
        uri.getUserInfo()!=null||uri.getHost().trim().isEmpty()){
      finish();return;
    }
    allowedHost=uri.getHost().toLowerCase(java.util.Locale.ROOT);
    root=new FrameLayout(this);
    root.setBackgroundColor(Color.BLACK);setContentView(root);
    browser=new WebView(this);
    browser.setBackgroundColor(Color.BLACK);
    WebSettings settings=browser.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setSupportMultipleWindows(false);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    browser.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req) {
        if(!req.isForMainFrame())return false;
        Uri u=req.getUrl();
        return !"https".equalsIgnoreCase(u.getScheme())||
          u.getHost()==null||!u.getHost().equalsIgnoreCase(allowedHost);
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view,String url) {
        try{
          Uri u=Uri.parse(url);
          return !"https".equalsIgnoreCase(u.getScheme())||!allowedHost.equalsIgnoreCase(u.getHost());
        }catch(Exception ex){return true;}
      }
    });
    browser.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onCreateWindow(WebView v,boolean dialog,boolean gesture,android.os.Message result) {
        return false;
      }
      @Override public void onShowCustomView(View view,CustomViewCallback cb){
        if(fullscreen!=null){cb.onCustomViewHidden();return;}
        fullscreen=view;callback=cb;
        root.addView(view,new FrameLayout.LayoutParams(-1,-1));
        browser.setVisibility(View.GONE);
      }
      @Override public void onHideCustomView(){closeFullscreen();}
    });
    root.addView(browser,new FrameLayout.LayoutParams(-1,-1));
    TextView close=TvUi.button(this,"← 返回原生播放器",this::finish);
    FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(-2,-2,android.view.Gravity.TOP|android.view.Gravity.RIGHT);
    lp.setMargins(0,16,20,0);
    root.addView(close,lp);
    close.requestFocus();
    browser.loadUrl(uri.toString());
  }
  private void closeFullscreen(){
    if(fullscreen==null)return;
    root.removeView(fullscreen);fullscreen=null;
    browser.setVisibility(View.VISIBLE);
    if(callback!=null)callback.onCustomViewHidden();
    callback=null;
  }
  @Override public boolean onKeyDown(int keyCode,KeyEvent event){
    if(keyCode==KeyEvent.KEYCODE_BACK&&fullscreen!=null){closeFullscreen();return true;}
    return super.onKeyDown(keyCode,event);
  }
  @Override protected void onPause(){if(browser!=null)browser.onPause();super.onPause();}
  @Override protected void onResume(){super.onResume();if(browser!=null)browser.onResume();}
  @Override protected void onDestroy(){
    closeFullscreen();
    if(browser!=null){browser.loadUrl("about:blank");browser.destroy();browser=null;}
    super.onDestroy();
  }
}

package com.yqxyy.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Ten-foot UI: remote D-pad, large cover art, one cover per series. */
public final class TvActivity extends Activity {
  private final ExecutorService io=Executors.newFixedThreadPool(5);
  private final Handler ui=new Handler(Looper.getMainLooper());
  private final LruCache<String,Bitmap> art=new LruCache<String,Bitmap>(40*1024*1024){
    @Override protected int sizeOf(String key,Bitmap value){return value.getByteCount();}
  };
  private List<Catalog.Show> catalogue=new ArrayList<>();
  private LinearLayout shell,nav,body;
  private ScrollView scroll;
  private TextView indicator;
  private String section="all";
  private Catalog.Show activeShow;
  private boolean compact;

  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    compact=getResources().getConfiguration().screenHeightDp>0 &&
      getResources().getConfiguration().screenHeightDp<510;
    getWindow().setFlags(1024,1024);
    getWindow().setBackgroundDrawable(TvUi.bg(TvUi.BG,0,this));
    createShell();
    refresh();
  }

  private void createShell() {
    shell=TvUi.column(this);
    shell.setBackgroundColor(TvUi.BG);
    shell.setPadding(TvUi.dp(this,compact?24:48),TvUi.dp(this,compact?7:20),TvUi.dp(this,compact?24:48),0);
    setContentView(shell);
    LinearLayout masthead=TvUi.row(this);
    TextView title=TvUi.text(this,"一起学英语  TV",compact?24:30,TvUi.WHITE,true);
    masthead.addView(title,new LinearLayout.LayoutParams(0,TvUi.dp(this,compact?43:60),1f));
    indicator=TvUi.text(this,"儿童动画 · 纪录片 · 英语影视",compact?11:14,TvUi.DIM,false);
    masthead.addView(indicator);
    shell.addView(masthead);
    nav=TvUi.row(this);
    nav.setPadding(0,TvUi.dp(this,compact?3:10),0,TvUi.dp(this,compact?5:12));
    shell.addView(nav);
    String[][] tabs={{"all","全部"},{"kids","儿童动画"},{"documentary","纪录片"},{"animated","动画大电影"},{"animation","动画故事"}};
    for(String[] tab:tabs){
      TextView b=TvUi.button(this,tab[1],()->showHome(tab[0]));
      if(compact)b.setTextSize(13);
      LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,TvUi.dp(this,compact?38:48));
      p.setMargins(0,0,TvUi.dp(this,compact?7:12),0);
      nav.addView(b,p);
    }
    scroll=new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setVerticalScrollBarEnabled(false);
    shell.addView(scroll,new LinearLayout.LayoutParams(-1,0,1f));
    body=TvUi.column(this);
    body.setPadding(0,TvUi.dp(this,compact?0:6),0,TvUi.dp(this,compact?10:26));
    scroll.addView(body);
    showMessage("正在加载影片目录…",false);
  }

  private void refresh(){
    indicator.setText("正在连接 Supabase…");
    io.execute(()->{
      try{
        List<Catalog.Show> result=Catalog.load(getApplicationContext());
        ui.post(()->{
          if(isFinishing()||isDestroyed())return;
          catalogue=result;
          indicator.setText(result.size()+" 部作品 · 遥控器上下左右选择");
          if(activeShow==null)showHome(section);
        });
      }catch(Exception error){
        ui.post(()->{
          if(isFinishing()||isDestroyed())return;
          indicator.setText("目录加载失败");
          showMessage("无法读取影片目录\n"+error.getMessage()+"\n检查电视网络后重试",true);
        });
      }
    });
  }

  private void showMessage(String message,boolean retry){
    body.removeAllViews();
    TextView label=TvUi.text(this,message,21,TvUi.DIM,false);
    label.setGravity(Gravity.CENTER);
    body.addView(label,new LinearLayout.LayoutParams(-1,TvUi.dp(this,200)));
    if(retry){
      TextView button=TvUi.button(this,"重新加载",this::refresh);
      body.addView(button);
      button.requestFocus();
    }
  }

  private void showHome(String selected){
    activeShow=null;
    section=selected;
    nav.setVisibility(View.VISIBLE);
    scroll.scrollTo(0,0);
    body.removeAllViews();
    if(catalogue.isEmpty()){
      showMessage("还没有可显示的影片，或正在加载目录…",false);
      return;
    }
    TextView heading=TvUi.text(this,selected.equals("all")?"今晚看什么？":Catalog.categoryName(selected),compact?21:28,TvUi.WHITE,true);
    heading.setPadding(0,0,0,TvUi.dp(this,compact?4:10));body.addView(heading);
    TextView note=TvUi.text(this,"选择海报查看全部季数及集数。按确定键打开。",compact?12:14,TvUi.DIM,false);
    body.addView(note);TvUi.gap(body,this,compact?11:24);
    int count=0;
    for(String cat:Catalog.CATEGORIES){
      if(!selected.equals("all")&&!selected.equals(cat))continue;
      List<Catalog.Show> shows=new ArrayList<>();
      for(Catalog.Show show:catalogue)if(show.category.equals(cat))shows.add(show);
      if(shows.isEmpty())continue;
      count++;
      TextView title=TvUi.text(this,Catalog.categoryName(cat)+"    "+shows.size()+" 部",compact?18:23,TvUi.WHITE,true);
      body.addView(title);
      TvUi.gap(body,this,compact?8:13);
      HorizontalScrollView h=new HorizontalScrollView(this);
      h.setHorizontalScrollBarEnabled(false);
      h.setClipToPadding(false);
      LinearLayout rail=TvUi.row(this);
      rail.setPadding(TvUi.dp(this,6),TvUi.dp(this,compact?3:8),TvUi.dp(this,16),TvUi.dp(this,compact?8:18));
      h.addView(rail);
      for(int i=0;i<shows.size();i++){
        Catalog.Show show=shows.get(i);
        View card=makeCard(show,i<8);
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(
          TvUi.dp(this,compact?145:188),TvUi.dp(this,compact?223:309));
        lp.setMargins(0,0,TvUi.dp(this,compact?12:18),0);
        rail.addView(card,lp);
      }
      h.setOnScrollChangeListener((v,x,y,oldX,oldY)->{
        int first=Math.max(0,x/TvUi.dp(this,compact?157:206)-1);
        int last=Math.min(shows.size(),first+12);
        for(int i=first;i<last;i++){
          LinearLayout card=(LinearLayout)rail.getChildAt(i);
          if(card!=null)loadPoster((ImageView)card.getChildAt(0),shows.get(i).poster);
        }
      });
      body.addView(h);
      TvUi.gap(body,this,compact?12:20);
    }
    if(count==0)showMessage("这个栏目目前还没有影片",false);
  }

  private View makeCard(Catalog.Show show,boolean eagerPoster) {
    LinearLayout card=TvUi.column(this);
    card.setPadding(TvUi.dp(this,compact?6:8),TvUi.dp(this,compact?6:8),TvUi.dp(this,compact?6:8),TvUi.dp(this,compact?6:8));
    card.setBackground(TvUi.focused(this,false));
    card.setFocusable(true);card.setClickable(true);
    card.setOnClickListener(v->showDetail(show));
    card.setOnFocusChangeListener((v,focus)->{
      v.setBackground(TvUi.focused(this,focus));
      v.setScaleX(focus?1.055f:1f);v.setScaleY(focus?1.055f:1f);
      if(focus){
        indicator.setText(show.title+"   ·   "+show.episodeCount()+" 集");
        loadPoster((ImageView)((LinearLayout)v).getChildAt(0),show.poster);
      }
    });
    ImageView image=new ImageView(this);
    image.setScaleType(ImageView.ScaleType.CENTER_CROP);
    image.setBackground(TvUi.bg(Color.rgb(34,51,75),8,this));
    card.addView(image,new LinearLayout.LayoutParams(-1,TvUi.dp(this,compact?158:230)));
    if(eagerPoster)loadPoster(image,show.poster);
    TextView name=TvUi.text(this,show.title,compact?13:16,TvUi.WHITE,true);
    name.setSingleLine(true);
    name.setEllipsize(android.text.TextUtils.TruncateAt.END);
    name.setPadding(TvUi.dp(this,3),TvUi.dp(this,compact?4:8),TvUi.dp(this,3),0);
    card.addView(name);
    TextView meta=TvUi.text(this,(show.mediaType.equals("movie")?"电影":(show.seasons.size()>0?show.seasons.size()+" 季 · ":"")+show.episodeCount()+" 集"),compact?11:12,TvUi.DIM,false);
    meta.setPadding(TvUi.dp(this,3),TvUi.dp(this,compact?3:5),0,0);
    card.addView(meta);
    return card;
  }

  private void showDetail(Catalog.Show show){
    activeShow=show;
    if(show.needsLegacyEpisodes()){
      nav.setVisibility(View.GONE);
      body.removeAllViews();
      body.addView(TvUi.button(this,"← 返回影片目录",()->showHome(section)));
      TvUi.gap(body,this,20);
      body.addView(TvUi.text(this,"正在读取原网站视频资料…",20,TvUi.DIM,false));
      io.execute(()->{
        try {
          LegacyCatalog.loadEpisodes(show);
          ui.post(()->{if(!isFinishing()&&!isDestroyed()&&activeShow==show)showDetail(show);});
        }catch(Exception error){
          ui.post(()->{
            if(isFinishing()||isDestroyed()||activeShow!=show)return;
            if(!show.legacyFilmId.isEmpty()){
              show.episodesLoaded=true; // retain available TMDB URL
              showDetail(show);
            }else{
              body.removeAllViews();
              body.addView(TvUi.button(this,"← 返回影片目录",()->showHome(section)));
              body.addView(TvUi.text(this,"动画故事分集读取失败，请检查网络后重试。\\n"+error.getMessage(),18,TvUi.DIM,false));
              body.addView(TvUi.button(this,"重新读取",()->showDetail(show)));
            }
          });
        }
      });
      return;
    }
    nav.setVisibility(View.GONE);
    scroll.scrollTo(0,0);
    body.removeAllViews();
    TextView back=TvUi.button(this,"← 返回影片目录",()->showHome(section));
    body.addView(back,new LinearLayout.LayoutParams(TvUi.dp(this,220),TvUi.dp(this,49)));
    TvUi.gap(body,this,compact?10:22);
    LinearLayout hero=TvUi.row(this);
    ImageView cover=new ImageView(this);
    cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
    cover.setBackground(TvUi.bg(TvUi.CARD,10,this));
    hero.addView(cover,new LinearLayout.LayoutParams(TvUi.dp(this,compact?114:160),TvUi.dp(this,compact?150:214)));
    loadPoster(cover,show.poster);
    LinearLayout data=TvUi.column(this);
    data.setPadding(TvUi.dp(this,compact?15:27),0,0,0);
    data.addView(TvUi.text(this,show.title,compact?23:30,TvUi.WHITE,true));
    TvUi.gap(data,this,compact?6:12);
    data.addView(TvUi.text(this,Catalog.categoryName(show.category)+"  ·  "+(show.year>0?show.year+"  ·  ":"")+show.seasons.size()+" 季 · "+show.episodeCount()+" 集",compact?13:17,TvUi.ACCENT,false));
    TvUi.gap(data,this,12);
    String summary=show.overview.trim().isEmpty()?"选择下面的季度和集数，按遥控器确定键开始播放。":show.overview;
    TextView overview=TvUi.text(this,summary,compact?13:16,TvUi.DIM,false);
    overview.setMaxLines(4);data.addView(overview);
    hero.addView(data,new LinearLayout.LayoutParams(0,-2,1f));
    body.addView(hero);
    TvUi.gap(body,this,compact?14:27);
    if(show.mediaType.equals("movie")){
      List<Catalog.Episode> episodes=show.seasons.firstEntry().getValue();
      if(!episodes.isEmpty()){
        TextView play=TvUi.button(this,"▶ 播放电影",()->startPlayer(show,show.seasons.firstKey(),0));
        body.addView(play,new LinearLayout.LayoutParams(TvUi.dp(this,230),TvUi.dp(this,57)));
        play.requestFocus();
      }
      return;
    }
    TextView sectionTitle=TvUi.text(this,"选择季数",23,TvUi.WHITE,true);body.addView(sectionTitle);
    TvUi.gap(body,this,13);
    HorizontalScrollView seasonScroller=new HorizontalScrollView(this);
    seasonScroller.setHorizontalScrollBarEnabled(false);
    LinearLayout seasons=TvUi.row(this);seasonScroller.addView(seasons);
    body.addView(seasonScroller);
    TvUi.gap(body,this,20);
    LinearLayout episodesHost=TvUi.column(this);body.addView(episodesHost);
    for(Map.Entry<Integer,List<Catalog.Episode>> entry:show.seasons.entrySet()){
      int s=entry.getKey();
      TextView b=TvUi.button(this,"第 "+s+" 季",()->showSeason(show,s,episodesHost));
      LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,TvUi.dp(this,50));
      lp.setMargins(0,0,TvUi.dp(this,10),0);
      seasons.addView(b,lp);
    }
    if(!show.seasons.isEmpty())showSeason(show,show.seasons.firstKey(),episodesHost);
  }

  private void showSeason(Catalog.Show show,int season,LinearLayout target) {
    target.removeAllViews();
    List<Catalog.Episode> eps=show.seasons.get(season);
    if(eps==null)return;
    TextView heading=TvUi.text(this,"第 "+season+" 季  ·  "+eps.size()+" 集",20,TvUi.WHITE,true);
    target.addView(heading);TvUi.gap(target,this,14);
    GridLayout grid=new GridLayout(this);
    grid.setColumnCount(compact?4:6);
    target.addView(grid);
    for(int i=0;i<eps.size();i++){
      int index=i;Catalog.Episode e=eps.get(i);
      TextView b=TvUi.button(this,"第 "+e.number+" 集",()->startPlayer(show,season,index));
      b.setTextSize(15);
      GridLayout.LayoutParams lp=new GridLayout.LayoutParams(
        GridLayout.spec(i/(compact?4:6)),GridLayout.spec(i%(compact?4:6)));
      lp.width=TvUi.dp(this,compact?122:152);lp.height=TvUi.dp(this,compact?44:53);
      lp.setMargins(0,0,TvUi.dp(this,13),TvUi.dp(this,13));
      grid.addView(b,lp);
    }
    scroll.post(()->{
      if(target.getParent()!=null)target.requestRectangleOnScreen(
        new android.graphics.Rect(0,0,target.getWidth(),TvUi.dp(this,190)),true);
    });
  }

  private void startPlayer(Catalog.Show show,int season,int index){
    Intent intent=new Intent(this,PlayerActivity.class);
    intent.putExtra("seriesTitle",show.title);
    intent.putExtra("playlist",show.playlist(season).toString());
    intent.putExtra("index",index);
    startActivity(intent);
  }

  private void loadPoster(ImageView view,String url){
    if(url==null||!url.startsWith("https://"))return;
    if(url.equals(view.getTag()))return;
    view.setTag(url);
    Bitmap cached=art.get(url);
    if(cached!=null){view.setImageBitmap(cached);return;}
    io.execute(()->{
      HttpURLConnection conn=null;
      try{
        conn=(HttpURLConnection)new URL(url).openConnection();
        conn.setConnectTimeout(8000);conn.setReadTimeout(8000);
        if(conn.getResponseCode()!=200)return;
        Bitmap bitmap;
        try(java.io.InputStream in=conn.getInputStream()){bitmap=BitmapFactory.decodeStream(in);}
        if(bitmap==null)return;
        art.put(url,bitmap);
        ui.post(()->{if(url.equals(view.getTag()))view.setImageBitmap(bitmap);});
      }catch(Exception ignored){}finally{if(conn!=null)conn.disconnect();}
    });
  }

  @Override public void onBackPressed(){
    if(activeShow!=null)showHome(section); else super.onBackPressed();
  }
  @Override public boolean onKeyDown(int keyCode,KeyEvent event) {
    if(keyCode==KeyEvent.KEYCODE_BACK&&activeShow!=null){showHome(section);return true;}
    return super.onKeyDown(keyCode,event);
  }
  @Override protected void onDestroy(){
    io.shutdownNow();super.onDestroy();
  }
}

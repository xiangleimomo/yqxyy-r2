package com.yqxyy.tv;

import android.app.Activity;
import android.content.Intent;
import android.app.AlertDialog;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.SubtitleView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.HashSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native Media3 player for Android TV / remote controls. */
@UnstableApi
public final class PlayerActivity extends Activity {
  private final Handler handler=new Handler(Looper.getMainLooper());
  private JSONArray playlist;
  private int currentIndex,sourceIndex,captionSizeIndex=1;
  private String seriesTitle;
  private boolean isMovie,seekApplied=false;
  private int initialResumeSeconds=0,pendingSeekSeconds=0,lastSavedSecond=-1;
  private TvAccount cloud;
  private final ExecutorService updates=Executors.newSingleThreadExecutor();
  private final List<JSONObject> webSources=new ArrayList<>();
  private TextView webButton;
  private final Runnable progressTick=new Runnable(){
    @Override public void run(){saveProgress();handler.postDelayed(this,15000);}
  };
  private ExoPlayer player;
  private PlayerView video;
  private FrameLayout root;
  private LinearLayout controls;
  private TextView title,warning,playButton,subtitleButton;
  private final List<JSONObject> playableSources=new ArrayList<>();
  private final List<MediaItem.SubtitleConfiguration> sidecarCaptions=new ArrayList<>();
  private final Runnable hide=()->{
    if(controls!=null)controls.setVisibility(View.GONE);
    if(title!=null)title.setVisibility(View.GONE);
  };

  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN|
        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
        WindowManager.LayoutParams.FLAG_FULLSCREEN|
        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    try {
      playlist=new JSONArray(getIntent().getStringExtra("playlist"));
      if(playlist.length()==0)throw new IllegalArgumentException("Empty episode list");
      currentIndex=Math.min(Math.max(0,getIntent().getIntExtra("index",0)),playlist.length()-1);
    }catch(Exception error){finish();return;}
    seriesTitle=getIntent().getStringExtra("seriesTitle");
    if(seriesTitle==null)seriesTitle="一起学英语";
    isMovie=getIntent().getBooleanExtra("isMovie",false);
    initialResumeSeconds=Math.max(0,getIntent().getIntExtra("resumeSeconds",0));
    try{cloud=new TvAccount(getApplicationContext());}catch(Exception ignored){}
    buildUi();
    player=new ExoPlayer.Builder(this).build();
    video.setPlayer(player);
    player.addListener(new Player.Listener() {
      @Override public void onIsPlayingChanged(boolean isPlaying) {
        if(playButton!=null)playButton.setText(isPlaying?"Ⅱ 暂停":"▶ 播放");
      }
      @Override public void onPlayerError(PlaybackException error) {
        if(sourceIndex+1<playableSources.size()){
          int next=sourceIndex+1;
          int seconds=(int)Math.max(0,player.getCurrentPosition()/1000);
          if(seconds>0)pendingSeekSeconds=seconds;
          seekApplied=false;
          playSource(next);
          Toast.makeText(PlayerActivity.this,"直链失败，切换备用线路 "+(next+1),Toast.LENGTH_SHORT).show();
          return;
        }
        warning.setText("无法播放：所有原生直链均失败。\n"
          +error.getErrorCodeName()+"\n可能是片源失效、服务器限制或电视不支持该编码。"
          +(webSources.isEmpty()?"":"\n可手动尝试网页线路。"));
        warning.setVisibility(View.VISIBLE);
        reveal();
      }
      @Override public void onPlaybackStateChanged(int state){
        if(state==Player.STATE_READY&&!seekApplied){
          seekApplied=true;
          if(pendingSeekSeconds>3&&player.getDuration()>0&&
             pendingSeekSeconds*1000L<player.getDuration()-2000)
            player.seekTo(pendingSeekSeconds*1000L);
        }
        if(state==Player.STATE_ENDED)saveProgress();
      }
      @Override public void onTracksChanged(Tracks tracks) {updateCaptionButton();}
    });
    startEpisode();
    handler.postDelayed(progressTick,15000);
  }

  private void buildUi() {
    root=new FrameLayout(this);
    root.setBackgroundColor(Color.BLACK);
    setContentView(root);
    video=new PlayerView(this);
    video.setUseController(false);
    video.setKeepScreenOn(true);
    video.setFocusable(true);
    root.addView(video,new FrameLayout.LayoutParams(-1,-1));
    warning=TvUi.text(this,"",18,TvUi.WHITE,true);
    warning.setGravity(Gravity.CENTER);
    warning.setPadding(TvUi.dp(this,30),TvUi.dp(this,22),TvUi.dp(this,30),TvUi.dp(this,22));
    warning.setBackground(TvUi.bg(Color.rgb(42,35,43),12,this));
    warning.setVisibility(View.GONE);
    FrameLayout.LayoutParams warningLp=new FrameLayout.LayoutParams(
      TvUi.dp(this,650),-2,Gravity.CENTER);
    root.addView(warning,warningLp);
    title=TvUi.text(this,"",22,TvUi.WHITE,true);
    title.setPadding(TvUi.dp(this,32),TvUi.dp(this,18),TvUi.dp(this,32),TvUi.dp(this,16));
    title.setBackgroundColor(Color.argb(210,9,15,28));
    root.addView(title,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));

    HorizontalScrollView barScroll=new HorizontalScrollView(this);
    barScroll.setHorizontalScrollBarEnabled(false);
    barScroll.setFillViewport(true);
    barScroll.setBackgroundColor(Color.argb(224,9,15,28));
    controls=TvUi.row(this);
    controls.setPadding(TvUi.dp(this,20),TvUi.dp(this,13),TvUi.dp(this,20),TvUi.dp(this,13));
    barScroll.addView(controls);
    FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM);
    root.addView(barScroll,p);
    // Keep the outer bar and button row visibility coordinated.
    controls.setTag(barScroll);
    if(!isMovie)addControl("⏮ 上一集",()->skip(-1));
    addControl("−10秒",()->seek(-10000));
    playButton=addControl("Ⅱ 暂停",this::toggle);
    addControl("+10秒",()->seek(10000));
    if(!isMovie)addControl("下一集 ⏭",()->skip(1));
    subtitleButton=addControl("CC 字幕",this::chooseCaptions);
    addControl("字号",this::changeCaptionSize);
    addControl("切换线路",this::chooseSource);
    webButton=addControl("网页线路",this::chooseWebSource);
    webButton.setVisibility(View.GONE);
    addControl(isMovie?"返回影片":"返回选集",this::finish);
    reveal();
  }
  private TextView addControl(String label,Runnable action) {
    TextView b=TvUi.button(this,label,()->{reveal();action.run();});
    b.setTextSize(15);
    LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,TvUi.dp(this,49));
    lp.setMargins(0,0,TvUi.dp(this,8),0);
    controls.addView(b,lp);
    b.setOnFocusChangeListener((v,focus)->{
      v.setBackground(TvUi.focused(this,focus));
      v.setScaleX(focus?1.04f:1f);v.setScaleY(focus?1.04f:1f);
      if(focus)reveal();
    });
    return b;
  }

  private JSONObject currentEpisode(){return playlist.optJSONObject(currentIndex);}
  private void startEpisode() {
    JSONObject ep=currentEpisode();
    if(ep==null)return;
    int season=ep.optInt("season",1),number=ep.optInt("number",1);
    String media=ep.optString("mediaType",isMovie?"movie":"tv");
    title.setText(isMovie||"movie".equals(media)?seriesTitle+"   ·   电影":
      seriesTitle+"    第 "+season+" 季 · 第 "+number+" 集");
    sourceIndex=0;
    playableSources.clear();webSources.clear();sidecarCaptions.clear();
    pendingSeekSeconds=currentIndex==getIntent().getIntExtra("index",0)?initialResumeSeconds:0;
    seekApplied=false;lastSavedSecond=-1;
    JSONArray sources=ep.optJSONArray("sources");
    HashSet<String> seen=new HashSet<>();
    ArrayList<JSONObject> automatic=new ArrayList<>();
    if(sources!=null)for(int i=0;i<sources.length();i++){
      JSONObject source=sources.optJSONObject(i);
      if(source==null)continue;
      String kind=source.optString("kind","");
      String raw=source.optString("url","");
      String url=MediaUrls.forSource(kind,media,ep.optInt("tmdbId",0),season,number,raw);
      if(!url.startsWith("https://")||url.length()>2000||!seen.add(url))continue;
      if(kind.equals("subtitle")||kind.equals("captions")){
        Uri u=Uri.parse(url);
        String lower=u.getPath()==null?"":u.getPath().toLowerCase(java.util.Locale.ROOT);
        String mime=lower.endsWith(".vtt")?MimeTypes.TEXT_VTT:lower.endsWith(".srt")?"application/x-subrip":null;
        if(mime!=null)sidecarCaptions.add(new MediaItem.SubtitleConfiguration.Builder(u)
          .setMimeType(mime).setLanguage(source.optString("language","en")).build());
      }else if(kind.equals("embed")){
        JSONObject fixed=new JSONObject();try{
          fixed.put("kind","embed").put("label",source.optString("label","网页播放器")).put("url",url);
          webSources.add(fixed);
        }catch(Exception ignored){}
      }else if(kind.equals("auto")||kind.equals("direct")){
        JSONObject fixed=new JSONObject();try{
          fixed.put("kind",kind).put("label",source.optString("label","直链播放")).put("url",url);
          if(kind.equals("auto"))automatic.add(fixed);else playableSources.add(fixed);
        }catch(Exception ignored){}
      }
    }
    playableSources.addAll(automatic);
    if(playableSources.isEmpty()){
      String guessed=MediaUrls.automatic(media,ep.optInt("tmdbId",0),season,number);
      if(!guessed.isEmpty())try{
        playableSources.add(new JSONObject().put("kind","auto")
          .put("label","TMDB 自动直链").put("url",guessed));
      }catch(Exception ignored){}
    }
    webButton.setVisibility(webSources.isEmpty()?View.GONE:View.VISIBLE);
    if(playableSources.isEmpty()){
      player.stop();
      warning.setText(webSources.isEmpty()?"当前没有可供 TV 原生播放器使用的视频直链。":
        "此片目前只有网页播放线路，请选择“网页线路”手动尝试。");
      warning.setVisibility(View.VISIBLE);reveal();return;
    }
    playSource(0);
  }
  private void playSource(int index){
    if(index<0||index>=playableSources.size())return;
    sourceIndex=index;
    String url=playableSources.get(index).optString("url","");
    if(!url.startsWith("https://"))return;
    MediaItem.Builder item=new MediaItem.Builder().setUri(Uri.parse(url));
    String path=Uri.parse(url).getPath();
    if(path!=null&&path.toLowerCase(java.util.Locale.ROOT).endsWith(".m3u8"))
      item.setMimeType(MimeTypes.APPLICATION_M3U8);
    if(!sidecarCaptions.isEmpty())item.setSubtitleConfigurations(sidecarCaptions);
    warning.setVisibility(View.GONE);
    player.setMediaItem(item.build());player.prepare();player.play();
    reveal();
  }
  private void chooseWebSource(){
    if(webSources.isEmpty()){
      Toast.makeText(this,"未提供网页播放线路",Toast.LENGTH_SHORT).show();return;
    }
    String[] names=new String[webSources.size()];
    for(int i=0;i<names.length;i++)names[i]=webSources.get(i).optString("label","网页线路 "+(i+1));
    new AlertDialog.Builder(this).setTitle("第三方网页播放器 · 可能不支持电视遥控器")
      .setItems(names,(dialog,which)->{
        saveProgress();
        Intent intent=new Intent(this,WebPlayerActivity.class);
        intent.putExtra("url",webSources.get(which).optString("url",""));
        startActivity(intent);
      }).setNegativeButton("取消",null).show();
  }
  private String historyKey(){
    JSONObject ep=currentEpisode();
    if(ep==null)return "";
    String series=getIntent().getStringExtra("legacySeriesId");
    if(series!=null&&!series.isEmpty())return "anim-"+series;
    String id=ep.optString("id","");
    if(id.startsWith("legacy-movie-"))return "film-"+id.substring("legacy-movie-".length());
    if(id.startsWith("r2-story-"))return "";
    if(id.isEmpty())return "";
    return "film-"+id;
  }
  private void saveProgress(){
    if(cloud==null||!cloud.hasAccount()||player==null)return;
    int seconds=(int)Math.max(0,player.getCurrentPosition()/1000);
    if(seconds<=0||seconds==lastSavedSecond)return;
    lastSavedSecond=seconds;
    String key=historyKey();
    if(key.isEmpty())return;
    JSONObject ep=currentEpisode();
    JSONObject value=new JSONObject();
    try{
      String series=getIntent().getStringExtra("legacySeriesId");
      if(series!=null&&!series.isEmpty()){
        value.put("href","#/lesson/"+series+"/"+ep.optInt("number",1));
        value.put("seriesId",series).put("episodeId",ep.optInt("number",1));
      }else{
        String id=ep.optString("id","");
        if(id.startsWith("legacy-movie-"))id=id.substring("legacy-movie-".length());
        value.put("href","#/movie/"+id);
      }
      value.put("seconds",seconds);
    }catch(Exception ignored){return;}
    updates.execute(()->{try{cloud.markWatched(key,value);}catch(Exception ignored){}});
  }

  private void skip(int direction) {
    int next=currentIndex+direction;
    if(next<0||next>=playlist.length()){
      Toast.makeText(this,"本季没有更多剧集，请返回选集切换季度",Toast.LENGTH_SHORT).show();
      return;
    }
    saveProgress();currentIndex=next;startEpisode();
  }
  private void seek(long millis) {
    if(player==null)return;
    long pos=Math.max(0,player.getCurrentPosition()+millis);
    long duration=player.getDuration();
    if(duration>0)pos=Math.min(duration,pos);
    player.seekTo(pos);
  }
  private void toggle(){if(player==null)return;if(player.isPlaying())player.pause();else player.play();reveal();}

  private void chooseSource(){
    if(playableSources.isEmpty()&&webSources.isEmpty()){
      Toast.makeText(this,"此片没有配置任何线路",Toast.LENGTH_SHORT).show();return;
    }
    ArrayList<String> names=new ArrayList<>();
    for(int i=0;i<playableSources.size();i++)
      names.add("原生 · "+playableSources.get(i).optString("label","线路 "+(i+1)));
    for(int i=0;i<webSources.size();i++)
      names.add("网页 · "+webSources.get(i).optString("label","网页线路 "+(i+1)));
    new AlertDialog.Builder(this).setTitle("选择播放线路")
      .setItems(names.toArray(new String[0]),(dialog,which)->{
        if(which<playableSources.size()){
          seekApplied=false;
          pendingSeekSeconds=(int)Math.max(0,player.getCurrentPosition()/1000);
          playSource(which);
        }else {
          saveProgress();
          Intent intent=new Intent(this,WebPlayerActivity.class);
          intent.putExtra("url",webSources.get(which-playableSources.size()).optString("url",""));
          startActivity(intent);
        }
      }).setNegativeButton("取消",null).show();
  }

  private static final class CaptionChoice {
    final Tracks.Group group; final int track;
    CaptionChoice(Tracks.Group g,int i){group=g;track=i;}
  }
  private List<CaptionChoice> captions(){
    List<CaptionChoice> choices=new ArrayList<>();
    if(player==null)return choices;
    for(Tracks.Group g:player.getCurrentTracks().getGroups()){
      if(g.getType()!=C.TRACK_TYPE_TEXT)continue;
      for(int i=0;i<g.length;i++)if(g.isTrackSupported(i))choices.add(new CaptionChoice(g,i));
    }
    return choices;
  }
  private void updateCaptionButton(){
    if(subtitleButton==null||player==null)return;
    int count=captions().size();
    subtitleButton.setText("CC 字幕"+(count>0?" ("+count+")":""));
  }
  private void chooseCaptions(){
    if(player==null)return;
    List<CaptionChoice> available=captions();
    List<String> labels=new ArrayList<>();
    labels.add("关闭字幕");labels.add("自动选择");
    for(CaptionChoice choice:available){
      Format f=choice.group.getTrackFormat(choice.track);
      String label=f.label;
      String lang=f.language;
      if(label==null||label.trim().isEmpty())
        label=(lang==null||lang.equals("und"))?"字幕轨道 "+(labels.size()-1):lang;
      else if(lang!=null&&!lang.equals("und"))label+=" · "+lang;
      labels.add(label);
    }
    if(available.isEmpty())
      labels.add("片源暂无可选择的字幕轨道（可能尚未载入）");
    new AlertDialog.Builder(this).setTitle("字幕选择 · 根据实际片源")
      .setItems(labels.toArray(new String[0]),(dialog,which)->{
        TrackSelectionParameters.Builder b=player.getTrackSelectionParameters().buildUpon()
          .clearOverridesOfType(C.TRACK_TYPE_TEXT);
        if(which==0)b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT,true);
        else if(which==1)b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT,false);
        else if(which-2<available.size()){
          CaptionChoice selected=available.get(which-2);
          b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT,false);
          b.addOverride(new TrackSelectionOverride(selected.group.getMediaTrackGroup(),
              Collections.singletonList(selected.track)));
        }else return;
        player.setTrackSelectionParameters(b.build());
        reveal();
      }).setNegativeButton("取消",null).show();
  }
  private void changeCaptionSize(){
    captionSizeIndex=(captionSizeIndex+1)%3;
    float[] sizes={0.045f,0.059f,0.076f};
    SubtitleView subtitle=video.getSubtitleView();
    if(subtitle!=null)subtitle.setFractionalTextSize(sizes[captionSizeIndex]);
    Toast.makeText(this,"字幕字号："+new String[]{"小","中","大"}[captionSizeIndex],Toast.LENGTH_SHORT).show();
    reveal();
  }

  private void reveal(){
    handler.removeCallbacks(hide);
    if(controls==null)return;
    Object tag=controls.getTag();
    if(tag instanceof View)((View)tag).setVisibility(View.VISIBLE);
    controls.setVisibility(View.VISIBLE);
    title.setVisibility(View.VISIBLE);
    handler.postDelayed(()->{
      // Return focus to the video so the overlay can disappear after inactivity.
      // A subsequent D-pad press makes all controls visible again.
      if(controls!=null&&controls.getVisibility()==View.VISIBLE){
        video.requestFocus();
        Object box=controls.getTag();
        if(box instanceof View)((View)box).setVisibility(View.GONE);
        hide.run();
      }
    },6500);
  }

  @Override public boolean onKeyDown(int keyCode,KeyEvent event){
    if(keyCode==KeyEvent.KEYCODE_CAPTIONS){chooseCaptions();return true;}
    if(keyCode==KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE||keyCode==KeyEvent.KEYCODE_HEADSETHOOK){
      toggle();return true;
    }
    if(keyCode==KeyEvent.KEYCODE_DPAD_CENTER||keyCode==KeyEvent.KEYCODE_DPAD_UP||
        keyCode==KeyEvent.KEYCODE_DPAD_DOWN||keyCode==KeyEvent.KEYCODE_DPAD_LEFT||
        keyCode==KeyEvent.KEYCODE_DPAD_RIGHT){
      if(controls!=null&&controls.getVisibility()!=View.VISIBLE){
        reveal();
        playButton.requestFocus();
        return true;
      }
      reveal();
    }
    return super.onKeyDown(keyCode,event);
  }
  @Override protected void onPause(){saveProgress();if(player!=null)player.pause();super.onPause();}
  @Override protected void onDestroy(){
    handler.removeCallbacksAndMessages(null);
    saveProgress();updates.shutdown();
    if(player!=null){video.setPlayer(null);player.release();player=null;}
    super.onDestroy();
  }
}

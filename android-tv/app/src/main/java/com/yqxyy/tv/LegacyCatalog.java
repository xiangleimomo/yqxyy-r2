package com.yqxyy.tv;

import android.net.Uri;
import android.content.Context;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** R2-backed legacy media, matching the original site's data/ JSON catalogue. */
final class LegacyCatalog {
  private static final String BASE="https://yqxyy-r2.netlify.app/";
  private static final String TAG="YQXYY-TV-Legacy";
  private static final int MAX_BYTES=9*1024*1024;
  private static JSONObject bundled;
  private static JSONArray providerList=new JSONArray();

  private static Object get(String file) throws Exception {
    String url=resolve(file);
    if(url==null||!url.startsWith(BASE+"data/"))
      throw new IllegalArgumentException("Invalid legacy JSON path");
    HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
    c.setConnectTimeout(12000);c.setReadTimeout(18000);
    c.setRequestProperty("Accept","application/json");
    try{
      if(c.getResponseCode()!=200)throw new IllegalStateException("R2 proxy HTTP "+c.getResponseCode()+" "+file);
      ByteArrayOutputStream out=new ByteArrayOutputStream();
      try(InputStream in=c.getInputStream()){
        byte[] chunk=new byte[8192];int n;
        while((n=in.read(chunk))!=-1){out.write(chunk,0,n);if(out.size()>MAX_BYTES)throw new IllegalStateException("R2 JSON too large");}
      }
      String text=new String(out.toByteArray(),StandardCharsets.UTF_8);
      return new org.json.JSONTokener(text).nextValue();
    }finally{c.disconnect();}
  }
  private static synchronized Object getIndex(Context ctx,String file) throws Exception {
    try{return get("data/"+file);}
    catch(Exception remoteError){
      if(bundled==null){
        try(InputStream in=ctx.getAssets().open("tv-legacy.json")){
          ByteArrayOutputStream out=new ByteArrayOutputStream();
          byte[] buf=new byte[8192];int n;
          while((n=in.read(buf))!=-1)out.write(buf,0,n);
          bundled=new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
        }
      }
      Object fallback=bundled.opt(file);
      if(fallback==null||fallback==JSONObject.NULL)throw remoteError;
      return fallback;
    }
  }
  static String resolve(String url){
    if(url==null||url.trim().isEmpty())return null;
    try{
      URL src=new URL(new URL(BASE),url.trim());
      if(!"https".equals(src.getProtocol())||src.getUserInfo()!=null)return null;
      return src.toString();
    }catch(Exception e){return null;}
  }
  private static String dataFile(String prefix,String id,String suffix){
    if(!id.matches("[a-zA-Z0-9_-]{1,120}"))throw new IllegalArgumentException("Invalid series id");
    return "data/"+prefix+id+suffix;
  }
  private static JSONArray arr(Object value){
    return value instanceof JSONArray?(JSONArray)value:new JSONArray();
  }
  private static JSONObject obj(Object value){
    return value instanceof JSONObject?(JSONObject)value:new JSONObject();
  }
  private static String string(JSONObject source,String key){
    return source.optString(key,"").trim();
  }
  private static int syntheticId(String value){
    return 1000000000+((value.hashCode()&0x7fffffff)%900000000);
  }
  private static JSONObject makeShow(String category,String type,int tmdb,
      String title,String titleZh,String poster,String overview,int count,
      String sid,String fid,String collection) throws Exception {
    JSONObject data=new JSONObject();
    data.put("category",category).put("media_type",type).put("tmdb_id",tmdb)
      .put("title",title).put("title_zh",titleZh)
      .put("poster_url",poster==null?"":poster).put("overview",overview)
      .put("_declared_count",count).put("_legacy_series_id",sid)
      .put("_legacy_film_id",fid).put("_legacy_collection_id",collection);
    return data;
  }
  static void appendPublicCatalogues(Map<String,Catalog.Show> map,Context ctx){
    try{appendMovies(map,ctx);}catch(Exception e){Log.w(TAG,"Original movies unavailable: "+e.getMessage());}
    try{appendAnimation(map,ctx);}catch(Exception e){Log.w(TAG,"Animation stories unavailable: "+e.getMessage());}
    try{
      Object providerData=getIndex(ctx,"movie-hub-providers.json");
      providerList=arr(providerData);
      attachWebPlayers(map);
    }catch(Exception e){Log.w(TAG,"TV web player settings unavailable: "+e.getMessage());}
  }
  static void attachWebPlayers(Catalog.Show show){
    if(providerList.length()==0||show.seasons.isEmpty())return;
    String type=show.mediaType;
    if(!"movie".equals(type)&&!"tv".equals(type))return;
    for(java.util.List<Catalog.Episode> entries:show.seasons.values()){
      for(Catalog.Episode ep:entries){
        if(ep.tmdbId<=0)continue;
        for(int i=0;i<providerList.length();i++){
          JSONObject provider=providerList.optJSONObject(i);
          if(provider==null||!"embed".equals(provider.optString("mode")))continue;
          String template=provider.optString("movie".equals(type)?"movieUrl":"tvUrl","");
          if(!template.startsWith("https://"))continue;
          String url=template.replace("{tmdbId}",Integer.toString(ep.tmdbId))
            .replace("{seasonNumber}",Integer.toString(ep.season))
            .replace("{episodeNumber}",Integer.toString(ep.number));
          if(url.contains("{")||url.contains("}")||url.length()>900)continue;
          try{
            Uri u=Uri.parse(url);
            if(!"https".equals(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null)continue;
            boolean exists=false;
            for(int j=0;j<ep.sources.length();j++){
              JSONObject previous=ep.sources.optJSONObject(j);
              if(previous!=null&&url.equals(previous.optString("url"))){exists=true;break;}
            }
            if(!exists)ep.sources.put(new JSONObject().put("kind","embed")
              .put("label",provider.optString("name","网页播放器")).put("url",url));
          }catch(Exception ignored){}
        }
      }
    }
  }
  private static void attachWebPlayers(Map<String,Catalog.Show> map){
    for(Catalog.Show show:map.values())attachWebPlayers(show);
  }

  private static void appendMovies(Map<String,Catalog.Show> map,Context ctx) throws Exception {
    JSONObject hub=obj(getIndex(ctx,"movie-hub-catalog.json"));
    JSONObject posters=obj(getIndex(ctx,"movie-posters.json"));
    JSONArray movies=hub.optJSONArray("films");
    if(movies==null)return;
    Set<Integer> dynamicMovies=new HashSet<>();
    for(Catalog.Show show:map.values())if(show.category.equals("animated")&&show.mediaType.equals("movie")&&show.tmdbId>0)
      dynamicMovies.add(show.tmdbId);
    for(int i=0;i<movies.length();i++){
      JSONObject m=movies.optJSONObject(i);
      if(m==null)continue;
      String id=string(m,"id");
      if(!id.matches("[a-zA-Z0-9_-]{1,120}"))continue;
      int tmdb=m.optInt("tmdbId",0);
      if(tmdb>0&&dynamicMovies.contains(tmdb))continue;
      String name=string(m,"title"),chinese=string(m,"titleZh");
      String poster="";
      Object rawPoster=posters.opt(id);
      if(rawPoster instanceof String)poster=resolve((String)rawPoster);
      else if(rawPoster instanceof JSONObject)poster=resolve(((JSONObject)rawPoster).optString("url",""));
      String collection=string(m,"seriesId");
      if(collection.isEmpty())continue;
      Catalog.Show show=new Catalog.Show(makeShow("animated","movie",tmdb>0?tmdb:syntheticId(id),
        name,chinese,poster,"",1,"",id,collection));
      JSONObject row=new JSONObject();
      row.put("id","legacy-movie-"+id).put("media_type","movie")
        .put("tmdb_id",tmdb).put("season_number",1).put("episode_number",1)
        .put("playback_sources",autoMovieSource(tmdb));
      show.add(row);
      map.put("legacy-movie:"+id,show);
    }
  }
  private static JSONArray autoMovieSource(int tmdb) throws Exception {
    JSONArray sources=new JSONArray();
    if(tmdb>0){
      JSONObject src=new JSONObject();
      src.put("kind","auto").put("label","TMDB 自动播放地址")
        .put("url","https://api.obj2.top/hls/movie/"+tmdb+"/master.m3u8");
      sources.put(src);
    }
    return sources;
  }
  private static void appendAnimation(Map<String,Catalog.Show> map,Context ctx) throws Exception {
    JSONArray list=arr(getIndex(ctx,"series-list.json"));
    for(int i=0;i<list.length();i++){
      JSONObject m=list.optJSONObject(i);if(m==null)continue;
      String id=string(m,"seriesId");
      if(!id.matches("[a-zA-Z0-9_-]{1,120}")||id.startsWith("movie-"))continue;
      String status=string(m,"status");
      if(status.equals("retired")||status.equals("draft")||status.equals("locked")||status.equals("coming"))continue;
      int count=Math.max(m.optInt("readyEpisodes",0),m.optInt("episodeCount",0));
      if(count<=0)continue;
      String title=string(m,"title"),zh=string(m,"titleZh");
      if(title.isEmpty()&&zh.isEmpty())continue;
      String poster=resolve(string(m,"cover"));
      if(poster==null)poster=resolve("assets/covers/"+id+".svg");
      Catalog.Show show=new Catalog.Show(makeShow("animation","tv",syntheticId("animation-"+id),
        title,zh,poster,string(m,"description"),count,id,"",""));
      map.put("legacy-story:"+id,show);
    }
  }

  static void loadEpisodes(Catalog.Show show) throws Exception {
    if(!show.needsLegacyEpisodes())return;
    if(!show.legacySeriesId.isEmpty()){
      JSONArray episodes=arr(get(dataFile("",show.legacySeriesId,"/episodes.json")));
      show.seasons.clear();
      for(int i=0;i<episodes.length();i++){
        JSONObject ep=episodes.optJSONObject(i);if(ep==null)continue;
        int number=ep.optInt("episodeId",0);
        if(number<=0)continue;
        String status=string(ep,"status");
        if(status.equals("retired")||status.equals("draft")||status.equals("locked")||status.equals("coming"))continue;
        JSONArray sources=new JSONArray();
        JSONObject video=ep.optJSONObject("video");
        if(video!=null){
          for(String[] candidate:new String[][]{
            {"hlsUrl","课程 HLS"},
            {"backupHlsUrl","课程备用 HLS"},
            {"hls720Url","课程 720p"},
            {"directUrl","课程直链"},
            {"mp4Url","课程 MP4"}
          }){
            String url=resolve(string(video,candidate[0]));
            if(url!=null&&isNativeVideo(url)&&!containsUrl(sources,url))
              sources.put(new JSONObject().put("kind","direct")
                .put("label",candidate[1]).put("url",url));
          }
          for(String key:new String[]{"subtitleUrl","vttUrl"}){
            String url=resolve(string(video,key));
            if(url!=null&&isCaption(url))sources.put(new JSONObject().put("kind","subtitle")
              .put("label","英文字幕").put("language","en").put("url",url));
          }
        }
        JSONObject row=new JSONObject().put("id","r2-story-"+show.legacySeriesId+"-"+number)
          .put("media_type","tv").put("tmdb_id",0).put("season_number",1)
          .put("episode_number",number).put("playback_sources",sources);
        show.add(row);
      }
      show.sort();show.episodesLoaded=true;
    }else if(!show.legacyFilmId.isEmpty()){
      // Enrich the selected movie with its original R2 source, not just a TMDB guess.
      Object data=get(dataFile("movies/",show.legacyCollectionId,"/movies.json"));
      JSONArray sources=arr(obj(data).opt("sources"));
      JSONObject picked=null;
      for(int i=0;i<sources.length();i++){
        JSONObject item=sources.optJSONObject(i);
        if(item!=null&&show.legacyFilmId.equals(item.optString("id"))){picked=item;break;}
      }
      if(picked!=null){
        JSONArray available=new JSONArray();
        for(String[] candidate:new String[][]{
          {"hlsUrl","原版电影 HLS"},
          {"fullHlsUrl","完整版 HLS"},
          {"backupHlsUrl","电影备用 HLS"}
        }){
          String url=resolve(string(picked,candidate[0]));
          if(url!=null&&isNativeVideo(url)&&!containsUrl(available,url))
            available.put(new JSONObject().put("kind","direct").put("label",candidate[1]).put("url",url));
        }
        JSONArray backups=picked.optJSONArray("backupSources");
        if(backups!=null)for(int i=0;i<backups.length();i++){
          String url=resolve(backups.optJSONObject(i)==null?"":string(backups.optJSONObject(i),"url"));
          if(url!=null&&isNativeVideo(url)&&!containsUrl(available,url))
            available.put(new JSONObject().put("kind","direct").put("label","其他直链").put("url",url));
        }
        int originalTmdb=show.seasons.isEmpty()?0:show.seasons.firstEntry().getValue().get(0).tmdbId;
        int actualTmdb=picked.optInt("tmdbId",originalTmdb);
        JSONArray auto=autoMovieSource(actualTmdb);
        for(int i=0;i<auto.length();i++){
          JSONObject item=auto.optJSONObject(i);
          if(item!=null&&!containsUrl(available,item.optString("url")))available.put(item);
        }
        show.seasons.clear();
        JSONObject row=new JSONObject().put("id","legacy-movie-"+show.legacyFilmId)
          .put("media_type","movie").put("tmdb_id",actualTmdb)
          .put("season_number",1).put("episode_number",1).put("playback_sources",available);
        show.add(row);
      }
      show.sort();show.episodesLoaded=true;
    }
  }

  private static boolean isNativeVideo(String url){
    String path=Uri.parse(url).getPath();
    return path!=null&&(path.toLowerCase(java.util.Locale.ROOT).endsWith(".m3u8")
      ||path.toLowerCase(java.util.Locale.ROOT).endsWith(".mp4"));
  }
  private static boolean isCaption(String url){
    String path=Uri.parse(url).getPath();
    return path!=null&&(path.endsWith(".vtt")||path.endsWith(".srt"));
  }
  private static boolean containsUrl(JSONArray sources,String url){
    for(int i=0;i<sources.length();i++)if(url.equals(obj(sources.opt(i)).optString("url")))return true;
    return false;
  }
}

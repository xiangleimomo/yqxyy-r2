package com.yqxyy.tv;

import android.content.Context;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Read-only catalogue. Uses the SAME public data as the site's movie_library shelf. */
final class Catalog {
  static final String[] CATEGORIES = {"kids", "documentary", "animated", "animation"};
  static String categoryName(String id) {
    switch(id) {
      case "kids": return "儿童动画";
      case "documentary": return "纪录片";
      case "animated": return "动画大电影";
      case "animation": return "动画故事";
      default: return "其他";
    }
  }
  static final class Episode {
    final String id;
    final int season, number, tmdbId;
    final String mediaType;
    final JSONArray sources;
    Episode(JSONObject obj) {
      id=obj.optString("id","");
      season=Math.max(1,obj.optInt("season_number",1));
      number=Math.max(1,obj.optInt("episode_number",1));
      mediaType=obj.optString("media_type","tv");
      tmdbId=obj.optInt("tmdb_id",0);
      sources=obj.optJSONArray("playback_sources") == null ? new JSONArray() : obj.optJSONArray("playback_sources");
    }
    JSONObject pack() {
      JSONObject item=new JSONObject();
      try {
        item.put("id",id);
        item.put("season",season);
        item.put("number",number);
        item.put("tmdbId",tmdbId);
        item.put("mediaType",mediaType);
        item.put("sources",sources);
      } catch(Exception ignored){}
      return item;
    }
  }
  static final class Show {
    final String key, category, mediaType, title, originalTitle, poster, overview;
    final int tmdbId, year, declaredCount;
    final String legacySeriesId, legacyFilmId, legacyCollectionId;
    boolean episodesLoaded;
    final TreeMap<Integer,List<Episode>> seasons = new TreeMap<>();
    Show(JSONObject obj) {
      category=obj.optString("category","kids");
      mediaType=obj.optString("media_type","tv");
      tmdbId=obj.optInt("tmdb_id",0);
      key=category + ":" + mediaType + ":" + tmdbId;
      originalTitle=obj.optString("title","");
      String localized=obj.optString("title_zh","").trim();
      title=localized.isEmpty()?commonTitle(tmdbId,originalTitle):localized;
      poster=obj.optString("poster_url","");
      overview=obj.optString("overview","");
      year=obj.optInt("year",0);
      legacySeriesId=obj.optString("_legacy_series_id","");
      legacyFilmId=obj.optString("_legacy_film_id","");
      legacyCollectionId=obj.optString("_legacy_collection_id","");
      declaredCount=Math.max(0,obj.optInt("_declared_count",0));
      episodesLoaded=legacySeriesId.isEmpty()&&legacyFilmId.isEmpty();
    }
    void add(JSONObject obj) {
      Episode e=new Episode(obj);
      List<Episode> episodes=seasons.get(e.season);
      if(episodes==null){episodes=new ArrayList<>();seasons.put(e.season,episodes);}
      for(Episode old:episodes)if(old.number==e.number)return;
      episodes.add(e);
    }
    void sort() {
      for(List<Episode> episodes:seasons.values())
        Collections.sort(episodes,Comparator.comparingInt(e->e.number));
    }
    int episodeCount(){
      int n=0;for(List<Episode> es:seasons.values())n+=es.size();
      return episodesLoaded?n:Math.max(n,declaredCount);
    }
    boolean needsLegacyEpisodes(){return !episodesLoaded&&(!legacySeriesId.isEmpty()||!legacyFilmId.isEmpty());}
    JSONArray playlist(int season){
      JSONArray result=new JSONArray();
      List<Episode> episodes=seasons.get(season);
      if(episodes!=null)for(Episode e:episodes)result.put(e.pack());
      return result;
    }
  }
  private static String commonTitle(int tmdb,String fallback) {
    switch(tmdb){
      case 387: return "海绵宝宝";
      case 2437: return "小小探索家 Pocoyo";
      case 12225: return "小猪佩奇";
      case 39898: return "功夫熊猫：盖世传奇";
      case 40075: return "怪诞小镇";
      case 57532: return "汪汪队立大功";
      case 82728: return "布鲁伊";
      case 1044: return "地球脉动";
      case 68595: return "地球脉动 II";
      case 116156: return "地球脉动 III";
      case 13579: return "蓝色星球";
      case 74313: return "蓝色星球 II";
      case 208929: return "蓝色星球 III";
      case 20574: return "美丽中国";
      default: return fallback;
    }
  }
  static List<Show> load(Context context) throws Exception {
    String config;
    try(InputStream stream=context.getAssets().open("tv-config.json")){
      config=new String(readAll(stream),StandardCharsets.UTF_8);
    }
    JSONObject settings=new JSONObject(config);
    String endpoint=settings.getString("url");
    String key=settings.getString("key");
    if(!endpoint.startsWith("https://")||!endpoint.endsWith(".supabase.co")||key.trim().isEmpty())
      throw new IllegalArgumentException("Supabase public settings are not configured");
    Map<String,Show> map=new LinkedHashMap<>();
    final int pageSize=400;
    for(int offset=0;offset<16000;offset+=pageSize) {
      Uri uri=Uri.parse(endpoint+"/rest/v1/movie_library").buildUpon()
          .appendQueryParameter("select","id,category,media_type,tmdb_id,title,title_zh,year,poster_url,overview,season_number,episode_number,playback_sources")
          .appendQueryParameter("published","eq.true")
          .appendQueryParameter("order","tmdb_id.asc,season_number.asc,episode_number.asc")
          .appendQueryParameter("limit",Integer.toString(pageSize))
          .appendQueryParameter("offset",Integer.toString(offset)).build();
      HttpURLConnection conn=(HttpURLConnection)new URL(uri.toString()).openConnection();
      conn.setRequestProperty("apikey",key);
      if(key.startsWith("eyJ"))conn.setRequestProperty("Authorization","Bearer "+key);
      conn.setRequestProperty("Accept","application/json");
      conn.setConnectTimeout(12000);
      conn.setReadTimeout(20000);
      JSONArray batch;
      try {
        int status=conn.getResponseCode();
        if(status<200||status>=300)throw new IllegalStateException("Supabase catalogue HTTP "+status);
        try(InputStream stream=conn.getInputStream()){
          batch=new JSONArray(new String(readAll(stream),StandardCharsets.UTF_8));
        }
      } finally {conn.disconnect();}
      for(int i=0;i<batch.length();i++) {
        JSONObject item=batch.optJSONObject(i);
        if(item==null)continue;
        String type=item.optString("media_type","");
        String category=item.optString("category","");
        if(!type.equals("tv")&&!type.equals("movie"))continue;
        boolean known=false;for(String c:CATEGORIES)if(c.equals(category)){known=true;break;}
        if(!known)continue;
        int tmdb=item.optInt("tmdb_id",0);
        if(tmdb<=0)continue;
        String id=category+":"+type+":"+tmdb;
        Show show=map.get(id);
        if(show==null){show=new Show(item);map.put(id,show);}
        show.add(item);
      }
      if(batch.length()<pageSize)break;
    }
    // The original website serves existing film and animation-course catalogues
    // from R2 through its public /data proxy; they are NOT in movie_library.
    LegacyCatalog.appendPublicCatalogues(map);
    List<Show> result=new ArrayList<>(map.values());
    for(Show show:result)show.sort();
    Collections.sort(result,(a,b)->{
      int ca=categoryIndex(a.category),cb=categoryIndex(b.category);
      return ca!=cb?Integer.compare(ca,cb):a.title.compareToIgnoreCase(b.title);
    });
    return result;
  }
  private static int categoryIndex(String value) {
    for(int i=0;i<CATEGORIES.length;i++)if(CATEGORIES[i].equals(value))return i;
    return 99;
  }
  private static byte[] readAll(InputStream input) throws Exception {
    ByteArrayOutputStream out=new ByteArrayOutputStream();
    byte[] buf=new byte[8192];int n;
    while((n=input.read(buf))!=-1){out.write(buf,0,n);if(out.size()>12*1024*1024)throw new IllegalStateException("Catalogue page too large");}
    return out.toByteArray();
  }
}

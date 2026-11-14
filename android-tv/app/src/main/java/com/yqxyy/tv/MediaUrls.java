package com.yqxyy.tv;

/** A TMDB movie ID is never a TV season/episode ID. Testable without Android. */
final class MediaUrls {
  static String automatic(String mediaType,int tmdbId,int season,int episode){
    if(tmdbId<=0)return "";
    if("movie".equals(mediaType))
      return "https://api.obj2.top/hls/movie/"+tmdbId+"/master.m3u8";
    if("tv".equals(mediaType)&&season>0&&episode>0)
      return "https://api.obj2.top/hls/tv/"+tmdbId+"/"+season+"/"+episode+"/master.m3u8";
    return "";
  }
  static String forSource(String kind,String mediaType,int tmdbId,int season,int episode,String saved){
    if("auto".equals(kind)){
      String built=automatic(mediaType,tmdbId,season,episode);
      if(!built.isEmpty())return built;
    }
    return saved==null?"":saved;
  }
}

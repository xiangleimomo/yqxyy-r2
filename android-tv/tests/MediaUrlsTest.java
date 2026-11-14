package com.yqxyy.tv;
public final class MediaUrlsTest {
  static void equal(String expected,String got){if(!expected.equals(got))throw new AssertionError(expected+" != "+got);}
  public static void main(String[] args){
    equal("https://api.obj2.top/hls/movie/1865/master.m3u8",MediaUrls.automatic("movie",1865,1,1));
    equal("https://api.obj2.top/hls/movie/1865/master.m3u8",
      MediaUrls.forSource("auto","movie",1865,1,1,"https://api.obj2.top/hls/tv/1865/1/1/master.m3u8"));
    equal("https://api.obj2.top/hls/tv/387/1/41/master.m3u8",MediaUrls.automatic("tv",387,1,41));
    equal("https://cdn.example.com/custom.m3u8",
      MediaUrls.forSource("direct","movie",1865,1,1,"https://cdn.example.com/custom.m3u8"));
    equal("",MediaUrls.automatic("movie",0,1,1));
    System.out.println("Movie/TV route tests OK");
  }
}

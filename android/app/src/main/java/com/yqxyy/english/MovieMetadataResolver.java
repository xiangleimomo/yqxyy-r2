package com.yqxyy.english;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** Native implementation of the existing metadata search needed by media admin. */
final class MovieMetadataResolver {
    private MovieMetadataResolver() {}

    static WebResourceResponse intercept(WebResourceRequest request,String appHost){
        if(request==null||appHost==null)return null;
        Uri uri=request.getUrl();
        if(!"https".equalsIgnoreCase(uri.getScheme())||
           !appHost.equalsIgnoreCase(uri.getHost())||
           !"/.netlify/functions/movie-library-metadata".equals(uri.getPath()))return null;
        if(!"GET".equalsIgnoreCase(request.getMethod()))return json(405,"{\"error\":\"GET only\"}");
        String verify=uri.getQueryParameter("verify");
        if(verify!=null&&!verify.isEmpty()){
            if(!verify.matches("[0-9]{1,12}"))return json(400,"{\"error\":\"Invalid TMDB ID\"}");
            // This matches the existing service's catalogue-validation flag;
            // it is NOT proof that a stream actually plays.
            return json(200,"{\"playbackAvailable\":true,\"player\":\"existing-movie-provider\"}");
        }
        String query=uri.getQueryParameter("q");
        if(query==null||query.trim().isEmpty()||query.length()>80)
            return json(400,"{\"error\":\"Enter 1-80 title characters\"}");
        HttpURLConnection connection=null;
        try{
            URL url=new URL("https://streamjuju.cyou/api/search?q="+
                java.net.URLEncoder.encode(query.trim(),"UTF-8"));
            connection=(HttpURLConnection)url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("Accept","application/json");
            if(connection.getResponseCode()!=200)return json(502,"{\"error\":\"Metadata unavailable\"}");
            ByteArrayOutputStream output=new ByteArrayOutputStream();
            try(InputStream input=connection.getInputStream()){
                byte[] chunk=new byte[8192];int n;
                while((n=input.read(chunk))!=-1){
                    if(output.size()+n>512*1024)return json(502,"{\"error\":\"Metadata response too large\"}");
                    output.write(chunk,0,n);
                }
            }
            JSONObject payload=new JSONObject(output.toString("UTF-8"));
            JSONArray source=payload.optJSONArray("results");
            JSONArray results=new JSONArray();
            for(int i=0;source!=null&&i<source.length()&&results.length()<20;i++){
                JSONObject item=source.optJSONObject(i);
                if(item==null)continue;
                long id=item.optLong("id",0);
                String type=item.optString("media_type","");
                if(id<1||(!"movie".equals(type)&&!"tv".equals(type)))continue;
                String date=item.optString("release_date",item.optString("first_air_date",""));
                JSONObject entry=new JSONObject();
                entry.put("tmdbId",id);
                entry.put("mediaType",type);
                entry.put("title",shortText(item.optString("title",item.optString("name","")),220));
                entry.put("titleZh",shortText(item.optString("original_title",item.optString("original_name","")),220));
                entry.put("year",date.matches("^[0-9]{4}.*")?Integer.parseInt(date.substring(0,4)):JSONObject.NULL);
                String poster=item.optString("poster_path","");
                entry.put("posterUrl",poster.matches("/[A-Za-z0-9._/-]+")?
                    "https://image.tmdb.org/t/p/w500"+poster:"");
                entry.put("overview",shortText(item.optString("overview",""),4000));
                results.put(entry);
            }
            JSONObject answer=new JSONObject();answer.put("results",results);
            return json(200,answer.toString());
        }catch(Exception error){
            return json(502,"{\"error\":\"Metadata temporarily unavailable\"}");
        }finally{
            if(connection!=null)connection.disconnect();
        }
    }
    private static String shortText(String input,int max){
        return input.length()<=max?input:input.substring(0,max);
    }
    private static WebResourceResponse json(int status,String value){
        WebResourceResponse r=new WebResourceResponse("application/json","UTF-8",
            new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8)));
        r.setStatusCodeAndReasonPhrase(status,status==200?"OK":
            status==400?"Bad Request":status==405?"Method Not Allowed":"Bad Gateway");
        r.setResponseHeaders(Collections.singletonMap("Cache-Control","no-store"));
        return r;
    }
}

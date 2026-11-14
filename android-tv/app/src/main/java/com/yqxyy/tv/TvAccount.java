package com.yqxyy.tv;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Native, account-scoped Supabase client.
 * - Uses public publishable key and user JWT, never a service_role key.
 * - Refresh credential encrypted with Android Keystore AES-GCM, no raw token in prefs.
 * - book_personal uses existing SELECT RLS and book_portal RPC (not a new table).
 * Networking methods MUST be invoked on a worker thread.
 */
final class TvAccount {
  static final class Personal {
    boolean favorite;
    String category="",lastCfi="",lastReadAt="";
    JSONObject position(){
      try{return new JSONObject(lastCfi);}catch(Exception e){return new JSONObject();}
    }
  }
  private static final String PREF="yqxyy_tv_session";
  private static final String SECRET="yqxyy_tv_refresh_v1";
  private static final String KEY_ALIAS="yqxyy_tv_secret_v1";
  private static final long MIN_VALID=75_000L;
  private final SharedPreferences prefs;
  private final String host,apiKey;
  private final ConcurrentHashMap<String,Personal> rows=new ConcurrentHashMap<>();
  private String accessToken,refreshMemory,uid="",email="";
  private long expiresAt=0;

  TvAccount(Context ctx) throws Exception {
    prefs=ctx.getApplicationContext().getSharedPreferences(PREF,Context.MODE_PRIVATE);
    String config;
    try(InputStream in=ctx.getAssets().open("tv-config.json")){
      config=new String(readAll(in),StandardCharsets.UTF_8);
    }
    JSONObject settings=new JSONObject(config);
    host=settings.getString("url");
    apiKey=settings.getString("key");
    if(!host.startsWith("https://")||!host.endsWith(".supabase.co")||apiKey.trim().isEmpty())
      throw new IllegalStateException("Public Supabase configuration invalid");
    email=prefs.getString("email","");
  }

  boolean hasAccount(){
    return !email.isEmpty()||!prefs.getString("refresh","").isEmpty()||refreshMemory!=null;
  }
  String displayName(){
    return email.isEmpty()?"未登录":email;
  }
  Map<String,Personal> states(){return rows;}
  Personal state(String key){return rows.get(key);}
  void clearStates(){rows.clear();}

  synchronized boolean restore() throws Exception {
    if(!hasAccount())return false;
    requireAuth();
    return !uid.isEmpty();
  }
  synchronized void signIn(String username,String password) throws Exception {
    String e=username==null?"":username.trim();
    if(e.isEmpty()||password==null||password.isEmpty())throw new IllegalArgumentException("请输入邮箱和密码");
    JSONObject body=new JSONObject().put("email",e).put("password",password);
    JSONObject response=obj(request("POST","/auth/v1/token?grant_type=password",body,null));
    remember(response);
    if(uid.isEmpty())readUser();
  }
  synchronized void signOut(){
    try {
      if(accessToken!=null&&!accessToken.isEmpty())
        request("POST","/auth/v1/logout",new JSONObject(),accessToken);
    }catch(Exception ignored) {}
    uid="";email="";accessToken=null;refreshMemory=null;expiresAt=0;
    prefs.edit().remove("refresh").remove("email").apply();
    rows.clear();
  }
  synchronized String currentUserId() throws Exception {
    requireAuth();return uid;
  }
  synchronized void loadPersonal() throws Exception {
    requireAuth();
    String path="/rest/v1/book_personal?select=book_id,favorite,category,last_cfi,last_read_at"
      +"&user_id=eq."+uid+"&limit=1000";
    Object result=request("GET",path,null,accessToken);
    if(!(result instanceof JSONArray))throw new IllegalStateException("观看记录数据格式异常");
    JSONArray data=(JSONArray)result;
    ConcurrentHashMap<String,Personal> updated=new ConcurrentHashMap<>();
    for(int i=0;i<data.length();i++){
      JSONObject x=data.optJSONObject(i);if(x==null)continue;
      String key=x.optString("book_id","");
      if(!key.matches("[a-z0-9-]{1,100}"))continue;
      Personal state=new Personal();
      state.favorite=x.optBoolean("favorite",false);
      state.category=x.optString("category","");
      state.lastCfi=x.optString("last_cfi","");
      state.lastReadAt=x.optString("last_read_at","");
      updated.put(key,state);
    }
    rows.clear();rows.putAll(updated);
  }
  synchronized void setFavorite(String key,boolean favorite) throws Exception {
    JSONObject patch=new JSONObject().put("favorite",favorite);
    personal(key,patch);
    Personal row=rows.get(key);
    if(row==null){row=new Personal();rows.put(key,row);}
    row.favorite=favorite;
  }
  synchronized void markWatched(String key,JSONObject metadata) throws Exception {
    JSONObject patch=new JSONObject().put("cfi",metadata.toString());
    personal(key,patch);
    Personal row=rows.get(key);
    if(row==null){row=new Personal();rows.put(key,row);}
    row.lastCfi=metadata.toString();
    row.lastReadAt=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
      java.util.Locale.ROOT){{setTimeZone(java.util.TimeZone.getTimeZone("UTC"));}}.format(new java.util.Date());
  }
  private void personal(String key,JSONObject changes) throws Exception {
    if(key==null||!key.matches("[a-z0-9-]{1,100}"))
      throw new IllegalArgumentException("无效的收藏或播放记录编号");
    requireAuth();
    JSONObject body=new JSONObject()
      .put("p_action","personal")
      .put("p_payload",new JSONObject().put("book_id",key).put("changes",changes));
    request("POST","/rest/v1/rpc/book_portal",body,accessToken);
  }

  private void requireAuth() throws Exception {
    if(accessToken!=null&&System.currentTimeMillis()+MIN_VALID<expiresAt&&!uid.isEmpty())return;
    String refresh=refreshMemory;
    if(refresh==null||refresh.isEmpty())refresh=loadStoredRefresh();
    if(refresh==null||refresh.isEmpty())throw new IllegalStateException("请先登录 TV 账号");
    JSONObject data=obj(request("POST","/auth/v1/token?grant_type=refresh_token",
      new JSONObject().put("refresh_token",refresh),null));
    remember(data);
    if(uid.isEmpty())readUser();
  }
  private void remember(JSONObject session) throws Exception {
    String access=session.optString("access_token","");
    String refresh=session.optString("refresh_token","");
    if(access.isEmpty()||refresh.isEmpty())throw new IllegalStateException("登录会话缺失");
    accessToken=access;
    refreshMemory=refresh;
    expiresAt=System.currentTimeMillis()+Math.max(120,session.optInt("expires_in",3600))*1000L;
    JSONObject user=session.optJSONObject("user");
    if(user!=null){
      uid=user.optString("id","");
      email=user.optString("email",email);
    }
    try{
      prefs.edit().putString("refresh",encrypt(refresh)).putString("email",email).apply();
    }catch(Exception keyStoreError){
      // Never fall back to storing refresh credentials in plaintext.
      prefs.edit().remove("refresh").putString("email",email).apply();
    }
  }
  private void readUser() throws Exception {
    JSONObject data=obj(request("GET","/auth/v1/user",null,accessToken));
    uid=data.optString("id","");
    email=data.optString("email",email);
    if(uid.isEmpty())throw new IllegalStateException("未获得账户信息");
    prefs.edit().putString("email",email).apply();
  }
  private String loadStoredRefresh(){
    String data=prefs.getString("refresh","");
    if(data.isEmpty())return "";
    try{return decrypt(data);}catch(Exception e){
      prefs.edit().remove("refresh").apply();return "";
    }
  }

  private Object request(String method,String path,JSONObject body,String bearer) throws Exception {
    URL url=new URL(host+path);
    if(!"https".equals(url.getProtocol())||!host.equals(url.getProtocol()+"://"+url.getHost()))
      throw new IllegalArgumentException("Invalid Supabase API address");
    HttpURLConnection conn=(HttpURLConnection)url.openConnection();
    conn.setInstanceFollowRedirects(false);
    conn.setConnectTimeout(10000);conn.setReadTimeout(16000);
    conn.setRequestMethod(method);
    conn.setRequestProperty("apikey",apiKey);
    conn.setRequestProperty("Accept","application/json");
    if(bearer!=null&&!bearer.isEmpty())conn.setRequestProperty("Authorization","Bearer "+bearer);
    if(body!=null){
      conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");
      try(OutputStream stream=conn.getOutputStream()){
        stream.write(body.toString().getBytes(StandardCharsets.UTF_8));
      }
    }
    try{
      int status=conn.getResponseCode();
      InputStream input=(status>=200&&status<300)?conn.getInputStream():conn.getErrorStream();
      byte[] bytes=input==null?new byte[0]:readAll(input);
      String text=new String(bytes,StandardCharsets.UTF_8);
      if(status<200||status>=300){
        String message="网络请求失败（"+status+"）";
        try{
          JSONObject error=new JSONObject(text);
          String supplied=error.optString("msg",error.optString("message",error.optString("error_description","")));
          if(supplied.length()>1)message=supplied.length()>160?supplied.substring(0,160):supplied;
        }catch(Exception ignored){}
        throw new IllegalStateException(message);
      }
      if(text.isEmpty())return new JSONObject();
      if(text.charAt(0)=='[')return new JSONArray(text);
      return new JSONObject(text);
    }finally{conn.disconnect();}
  }
  private static JSONObject obj(Object result){
    return result instanceof JSONObject?(JSONObject)result:new JSONObject();
  }
  private static byte[] readAll(InputStream in) throws Exception {
    try(InputStream stream=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){
      byte[] buf=new byte[8192];int read;
      while((read=stream.read(buf))!=-1){
        out.write(buf,0,read);
        if(out.size()>2*1024*1024)throw new IllegalStateException("Response too large");
      }
      return out.toByteArray();
    }
  }
  private SecretKey key() throws Exception {
    KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
    java.security.Key current=ks.getKey(KEY_ALIAS,null);
    if(current instanceof SecretKey)return (SecretKey)current;
    KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
    gen.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true).build());
    return gen.generateKey();
  }
  private String encrypt(String plaintext) throws Exception {
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE,key());
    byte[] iv=cipher.getIV(),data=cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
    return Base64.encodeToString(iv,Base64.NO_WRAP)+":"+Base64.encodeToString(data,Base64.NO_WRAP);
  }
  private String decrypt(String ciphertext) throws Exception {
    String[] halves=ciphertext.split(":",2);
    if(halves.length!=2)throw new IllegalArgumentException("Corrupted session");
    byte[] iv=Base64.decode(halves[0],Base64.NO_WRAP),bytes=Base64.decode(halves[1],Base64.NO_WRAP);
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,iv));
    return new String(cipher.doFinal(bytes),StandardCharsets.UTF_8);
  }
}

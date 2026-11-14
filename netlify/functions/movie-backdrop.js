'use strict';
// A tiny server-side TMDB backdrop lookup. The Android APK and browser
// receive public image paths only: the API credential never leaves Netlify.
const asId = value => /^[1-9]\d{0,9}$/.test(String(value||''))?Number(value):null;
const respond = (statusCode, data) => ({
  statusCode,
  headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':statusCode===200?'public, max-age=3600, s-maxage=86400':'private, no-store',
    'X-Content-Type-Options':'nosniff'
  },
  body:JSON.stringify(data)
});
exports.handler=async event=>{
  if(event.httpMethod!=='GET')return respond(405,{error:'GET only'});
  const id=asId(event.queryStringParameters?.id);
  const type=String(event.queryStringParameters?.type||'movie');
  if(!id||!['movie','tv'].includes(type))return respond(400,{error:'Invalid TMDB reference'});
  const key=String(process.env.TMDB_API_KEY||'').trim();
  const token=String(process.env.TMDB_READ_ACCESS_TOKEN||'').trim();
  if(!key&&!token)return respond(503,{error:'TMDB metadata is not configured'});
  const url=new URL('https://api.themoviedb.org/3/'+type+'/'+id);
  url.searchParams.set('language','en-US');
  if(key)url.searchParams.set('api_key',key);
  try{
    const response=await fetch(url,{
      headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw Error('TMDB HTTP '+response.status);
    const body=await response.json();
    if(Number(body.id)!==id)throw Error('TMDB ID mismatch');
    const file=String(body.backdrop_path||'');
    // Only image.tmdb.org's verified image path may be returned.
    if(!/^\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(file))return respond(200,{url:null});
    return respond(200,{url:'https://image.tmdb.org/t/p/w1280'+file});
  }catch(error){
    console.warn('TMDB backdrop lookup failed',String(error.message||error));
    return respond(502,{error:'Background image temporarily unavailable'});
  }
};

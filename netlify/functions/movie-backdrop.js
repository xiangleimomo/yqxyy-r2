'use strict';
// Obtain a public TMDB landscape image for a numeric movie/TV ID.
// Primary: official TMDB metadata when server credentials are configured.
// Fallback: the same metadata search already used for portrait posters,
// accepting a result ONLY if its TMDB ID and media type match exactly.
// The Android app needs no key, no manual per-film mapping and no R2 copy.
const SEARCH='https://streamjuju.cyou/api/search';
const asId=value=>/^[1-9]\\d{0,9}$/.test(String(value||''))?Number(value):null;
const pathToImage=value=>{
  const path=String(value||'');
  return /^\\/[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp)$/i.test(path)
    ? 'https://image.tmdb.org/t/p/w1280'+path : null;
};
const respond=(statusCode,data)=>({
  statusCode,
  headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':statusCode===200
      ? (data.url?'public, max-age=86400, s-maxage=86400':'public, max-age=300, s-maxage=300')
      : 'private, no-store',
    'X-Content-Type-Options':'nosniff'
  },
  body:JSON.stringify(data)
});
const lookupOfficial=async(id,type)=>{
  const key=String(process.env.TMDB_API_KEY||'').trim();
  const token=String(process.env.TMDB_READ_ACCESS_TOKEN||'').trim();
  if(!key&&!token)return null;
  const url=new URL('https://api.themoviedb.org/3/'+type+'/'+id);
  url.searchParams.set('language','en-US');
  if(key)url.searchParams.set('api_key',key);
  const response=await fetch(url,{
    headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw Error('TMDB HTTP '+response.status);
  const body=await response.json();
  if(Number(body.id)!==id)throw Error('TMDB ID mismatch');
  return pathToImage(body.backdrop_path);
};
const lookupPosterSource=async(id,type,title)=>{
  if(!title)return null;
  const url=new URL(SEARCH);
  url.searchParams.set('q',title);
  const response=await fetch(url,{
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'
  });
  if(!response.ok)throw Error('Metadata HTTP '+response.status);
  const body=await response.json();
  const results=Array.isArray(body?.results)?body.results:[];
  // Exact ID + correct film/TV type: searching by title alone is not safe.
  const matching=results.find(item=>Number(item?.id)===id&&item?.media_type===type);
  return matching?pathToImage(matching.backdrop_path):null;
};
exports.handler=async event=>{
  if(event.httpMethod!=='GET')return respond(405,{error:'GET only'});
  const id=asId(event.queryStringParameters?.id);
  const type=String(event.queryStringParameters?.type||'movie');
  const title=String(event.queryStringParameters?.title||'').trim();
  if(!id||!['movie','tv'].includes(type)||title.length>160||/[\\x00-\\x1f]/.test(title))
    return respond(400,{error:'Invalid TMDB reference or title'});
  let url=null,source=null;
  try{
    url=await lookupOfficial(id,type);
    if(url)source='tmdb';
  }catch(error){console.warn('Official TMDB backdrop unavailable',String(error.message||error));}
  if(!url && title){
    try{
      url=await lookupPosterSource(id,type,title);
      if(url)source='poster-metadata';
    }catch(error){console.warn('Poster metadata backdrop unavailable',String(error.message||error));}
  }
  return respond(200,{id,type,url,source});
};
exports._test={asId,pathToImage,lookupPosterSource};

'use strict';
// Server-side-only TMDB credentials. Never embed these in index.html or the APK.
const TMDB='https://api.themoviedb.org/3';
const asNumber=value=>/^[1-9]\d{0,9}$/.test(String(value||''))?Number(value):null;
const respond=(code,body)=>({statusCode:code,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff'
},body:JSON.stringify(body)});
exports.handler=async(event)=>{
  if(event.httpMethod!=='GET')return respond(405,{error:'仅支持 GET'});
  const id=asNumber(event.queryStringParameters?.id);
  if(!id)return respond(400,{error:'无效的 TMDB 电视剧编号'});
  const key=String(process.env.TMDB_API_KEY||'').trim();
  const bearer=String(process.env.TMDB_READ_ACCESS_TOKEN||'').trim();
  if(!key&&!bearer)return respond(503,{error:'TMDB 集数查询尚未配置服务端凭据，请先手动填写终止集。',configured:false});
  const url=new URL(TMDB+'/tv/'+id);
  url.searchParams.set('language','zh-CN');
  if(key)url.searchParams.set('api_key',key);
  try{
    const response=await fetch(url,{headers:{'Accept':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},
      signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('TMDB HTTP '+response.status);
    const value=await response.json();
    if(Number(value.id)!==id||!Array.isArray(value.seasons))throw Error('TMDB 季数资料不完整');
    const seasons=value.seasons
      .filter(item=>Number.isInteger(item.season_number)&&item.season_number>=1&&
        Number.isInteger(item.episode_count)&&item.episode_count>0)
      .map(item=>({
        season_number:item.season_number,
        episode_count:item.episode_count,
        season_name:String(item.name||'').slice(0,100),
        air_date:typeof item.air_date==='string'?item.air_date:''
      })).sort((a,b)=>a.season_number-b.season_number);
    return respond(200,{id,title:String(value.name||'').slice(0,220),
      number_of_seasons:seasons.length,seasons,source:'TMDB'});
  }catch(err){
    console.warn('TMDB season query failed',String(err.message||err));
    return respond(502,{error:'TMDB 集数暂时无法查询，请手动填写终止集。'});
  }
};

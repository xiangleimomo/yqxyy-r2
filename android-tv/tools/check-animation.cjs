'use strict';
const fs=require('node:fs');
const path=require('node:path');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/tv-config.json'),'utf8'));
const snap=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/tv-legacy.json'),'utf8'));
const series=snap['series-list.json']||[];
const ready=series.filter(s=>s&&typeof s.seriesId==='string'&&!s.seriesId.startsWith('movie-')&&
  !['retired','draft','locked','coming'].includes(s.status)&&
  Math.max(Number(s.episodeCount)||0,Number(s.readyEpisodes)||0)>0);
if(ready.length<15)throw Error('Animation story shelf would be empty: '+ready.length);
const roots=[cfg.r2DataOrigin,cfg.webUrl];
async function readEpisodes(id){
  for(const root of roots){
    const url=new URL('data/'+id+'/episodes.json',root);
    try{
      const result=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(18000)});
      if(!result.ok)continue;
      const episodes=await result.json();
      if(Array.isArray(episodes)&&episodes.length>0){
        const media=episodes.filter(e=>e?.video&&(e.video.hlsUrl||e.video.directUrl||e.video.mp4Url));
        console.log('TV story episode probe',id,'total:',episodes.length,'with media:',media.length,
          'source:',url.host);
        if(media.length>0)return true;
      }
    }catch(e){console.log('TV story episode retry',url.host,e.message.slice(0,75));}
  }
  return false;
}
(async()=>{
  const ids=['three-kingdoms','journey-to-the-west'].filter(id=>ready.some(s=>s.seriesId===id));
  if(ids.length===0)throw Error('Sample Little Fox stories missing from R2 index');
  const results=await Promise.all(ids.map(readEpisodes));
  if(results.some(value=>!value))throw Error('TV animation episode data not available through R2/current site');
  console.log('Animation shelf verification passed:',ready.length,'series and',ids.length,'real episode directories');
})().catch(e=>{console.error(e.message);process.exitCode=1;});

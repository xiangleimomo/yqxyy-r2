'use strict';
const fs=require('node:fs');
const path=require('node:path');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/tv-config.json'),'utf8'));
const endpoints=[
  new URL('data/',config.r2DataOrigin).href,
  new URL('data/',config.webUrl).href
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJson(file){
  const errors=[];
  for(const root of endpoints){
    for(let i=0;i<2;i++){
      try{
        const url=new URL(file,root);
        const res=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(18000)});
        if(!res.ok)throw Error('HTTP '+res.status);
        const body=await res.json();
        if(!body||typeof body!=='object')throw Error('JSON object or array expected');
        console.log('TV source',file,'from',new URL(root).host);
        return body;
      }catch(e){errors.push(new URL(root).host+': '+e.message);if(i===0)await sleep(450);}
    }
  }
  throw Error(file+' unavailable: '+errors.join('; '));
}
function visibleStory(series){
  if(!series||typeof series!=='object'||typeof series.seriesId!=='string')return false;
  const id=series.seriesId;
  if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id)||id.startsWith('movie-'))return false;
  if(['retired','draft','locked','coming'].includes(String(series.status||'')))return false;
  return Math.max(Number(series.readyEpisodes)||0,Number(series.episodeCount)||0)>0;
}
(async()=>{
  const names=['movie-hub-catalog.json','movie-posters.json','movie-series.json',
    'series-list.json','movie-hub-providers.json'];
  const packed={};
  for(const name of names){
    try{packed[name]=await fetchJson(name);}
    catch(e){if(name==='movie-hub-providers.json'){packed[name]=[];continue;}throw e;}
  }
  const mc=packed['movie-hub-catalog.json'];
  const films=Array.isArray(mc)?mc:(mc?.films||[]);
  const series=packed['series-list.json'];
  const groups=packed['movie-series.json'];
  if(!Array.isArray(films)||films.length<50||!Array.isArray(series)||series.length<40||
     !Array.isArray(groups)||groups.length<15)
    throw Error('TV movie or animation index unexpectedly empty; refusing to release a blank APK');
  const playable=series.filter(visibleStory);
  if(playable.length<15)
    throw Error('TV animation stories missing: only '+playable.length+' eligible series');
  console.log('Verified TV index:',films.length,'movies,',playable.length,'visible animation stories',
    'of',series.length,'series; examples:',playable.slice(0,4).map(x=>x.seriesId).join(', '));
  const dest=path.join(__dirname,'../app/src/main/assets/tv-legacy.json');
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(packed));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

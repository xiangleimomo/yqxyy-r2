'use strict';
const base='https://yqxyy-r2.netlify.app/';
async function read(path){
  const u=new URL(path,base);
  if(u.origin!==new URL(base).origin||!u.pathname.startsWith('/data/'))throw Error('Unsafe path');
  const r=await fetch(u,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error(path+' HTTP '+r.status);
  return r.json();
}
async function main(){
  for(const path of ['data/series-list.json','data/movie-series.json','data/movie-hub-catalog.json','data/movie-posters.json']){
    try{
      const data=await read(path);
      const sample=Array.isArray(data)?data[0]:(data?.films?.[0]||data);
      const values=Array.isArray(data)?data.length:(data?.films?.length||Object.keys(data||{}).length);
      console.log('LEGACY',path,'items=',values,'sampleKeys=',Object.keys(sample||{}).slice(0,24).join(','));
      if(path==='data/series-list.json'&&Array.isArray(data)){
        const extensionCounts={};
        for(const item of data){const u=String(item.cover||'').split('?')[0];
          const ext=(u.match(/\\.([a-zA-Z0-9]+)$/)||[])[1]||'none';
          extensionCounts[ext]=(extensionCounts[ext]||0)+1;}
        console.log('LEGACY cover extensions',JSON.stringify(extensionCounts));
        const series=data.find(x=>String(x.seriesId).includes('three-kingdoms'))||data[0];
        if(series?.seriesId)try {
          const eps=await read('data/'+encodeURIComponent(series.seriesId)+'/episodes.json');
          const sampleEp=eps.find?.(x=>x.video?.hlsUrl)||eps[0]||{};
          console.log('LEGACY episode series=',series.seriesId,
            'count=',eps.length,'epKeys=',Object.keys(sampleEp),'videoKeys=',Object.keys(sampleEp.video||{}),
            'sampleVideoHosts=',Object.keys(sampleEp.video||{}).filter(k=>/url/i.test(k)).map(k=>{
                try{return k+':'+new URL(sampleEp.video[k],base).host}catch{return k+':relative'}}));
        }catch(e){console.log('LEGACY episodes error:',e.message);}
      }
      if(path==='data/movie-series.json'&&Array.isArray(data)){
        const group=data[0];
        if(group?.id)try{
          const movies=await read('data/movies/'+encodeURIComponent(group.id)+'/movies.json');
          console.log('LEGACY movie group=',group.id,'keys=',Object.keys(movies),'filmsFirst=',(movies.films||[])[0],
            'sourcesFirst=',(movies.sources||[])[0]?Object.keys(movies.sources[0]):[]);
        }catch(e){console.log('LEGACY movies error:',e.message);}
      }
    }catch(e){console.log('LEGACY unavailable:',path,e.message);}
  }
}
main().catch(e=>{console.error('legacy audit failed',e.message);process.exitCode=1;});

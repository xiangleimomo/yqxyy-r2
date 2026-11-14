'use strict';
const fs=require('node:fs');
const path=require('node:path');
const url='https://yqxyy-r2.netlify.app/data/';
(async()=>{
  const names=['movie-hub-catalog.json','movie-posters.json','series-list.json','movie-hub-providers.json'];
  const packed={};
  for(const filename of names){
    let last;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const response=await fetch(new URL(filename,url),{headers:{accept:'application/json'},signal:AbortSignal.timeout(25000)});
        if(!response.ok)throw Error(filename+' HTTP '+response.status);
        packed[filename]=await response.json();
        break;
      }catch(error){last=error;await new Promise(r=>setTimeout(r,700));}
    }
    if(!packed[filename]) {
      if(filename==='movie-hub-providers.json'){packed[filename]=[];continue;}
      throw last;
    }
  }
  const films=packed['movie-hub-catalog.json']?.films||[];
  const series=packed['series-list.json'];
  if(!Array.isArray(films)||films.length<50||!Array.isArray(series)||series.length<40)
    throw Error('Legacy TV catalogue unexpectedly empty; preserving previous release');
  const dest=path.join(__dirname,'../app/src/main/assets/tv-legacy.json');
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(packed));
  console.log('Bundled TV legacy catalogue',films.length,'films,',series.length,'animation series');
})().catch(error=>{console.error(error.message);process.exitCode=1;});

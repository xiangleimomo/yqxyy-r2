'use strict';
const fs=require('node:fs');
const path=require('node:path');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/tv-config.json'),'utf8'));
(async()=>{
  const url=config.url+'/rest/v1/movie_library?select=id&published=eq.true&limit=1';
  let lastError;
  for(let n=0;n<3;n++){
    try{
      const response=await fetch(url,{
        headers:{apikey:config.key,Accept:'application/json'},
        signal:AbortSignal.timeout(15000)
      });
      if(!response.ok)throw new Error('Public movie_library HTTP '+response.status);
      const result=await response.json();
      if(!Array.isArray(result)||result.length===0)throw new Error('No published movies accessible to anon');
      console.log('Public Supabase TV catalogue is accessible');
      return;
    }catch(e){lastError=e;await new Promise(resolve=>setTimeout(resolve,1200));}
  }
  throw lastError;
})().catch(err=>{console.error(err.message);process.exitCode=1;});

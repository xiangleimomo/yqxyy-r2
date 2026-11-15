// Read-only forensic audit: never print tokens, full private metadata or all Read text.
const root='data/little-fox-rocket-girl-fs0065/';
const origins=[
  'https://pub-bf9dac62ea094bcdae4eca9e743f9b61.r2.dev/',
  'https://yqxxyy.netlify.app/'
];
async function load(name){
  let error='';
  for(const origin of origins){
    try{
      const response=await fetch(origin+root+name+'?audit='+Date.now(),{signal:AbortSignal.timeout(15000),headers:{'Accept':'application/json'}});
      if(response.ok)return {data:await response.json(),origin:new URL(origin).hostname};
      error=origin+' HTTP '+response.status;
    }catch(e){error=origin+' '+String(e.message||e)}
  }
  throw Error('Rocket Girl '+name+' inaccessible '+error);
}
const [eps,quiz,read]=await Promise.all(['episodes.json','quiz.json','reading-lessons.json'].map(load));
if(!Array.isArray(eps.data)||!quiz.data||!read.data)throw Error('Unexpected R2 series data structure');
const sample=[1,2,3].map(n=>{
  const ep=eps.data.find(x=>Number(x.episodeId)===n)||{};
  const q=quiz.data[String(n)]?.questions||[];
  const r=read.data[String(n)]||{};
  return {episodeId:n,title:ep.title,sourceId:ep.sourceContentId,
    readSourceId:r.sourceId,readSource:r.source,
    paragraphCount:r.paragraphs?.length||0,
    readOpening:r.paragraphs?.slice(0,3).map(p=>({id:p.id,text:String(p.text||'').slice(0,450)})),
    quizCount:q.length,quizSamples:q.slice(0,2).map(x=>({question:x.question,optionCount:x.options?.length,source:x.source,answer:x.answer,evidence:x.evidence?.sourceContentId}))};
});
const summary={source:eps.origin,episodes:eps.data.length,quizEntries:Object.keys(quiz.data).length,
  readEntries:Object.keys(read.data).length,
  level:eps.data[0]?.level,sourceIdsMissing:eps.data.filter(e=>!e.sourceContentId).length,
  modelApiCredentialConfigured:Boolean(process.env.LF_OPENAI_API_KEY),
  r2CredentialConfigured:Boolean(process.env.R2_ACCESS_KEY_ID&&process.env.R2_SECRET_ACCESS_KEY),
  sample};
console.log('ROCKET_GIRL_SOURCE_AUDIT '+JSON.stringify(summary));

const first=read.data['1'];
if(!first?.paragraphs?.length)throw Error('Episode 1 missing official Read');
console.log('ROCKET_GIRL_EP1_READ '+JSON.stringify({sourceId:first.sourceId,paragraphs:first.paragraphs.map(p=>({id:p.id,text:p.text}))}));
console.log('ROCKET_GIRL_EP1_LEGACY_QUIZ '+JSON.stringify(quiz.data['1']));

if(process.env.R2_ENDPOINT&&process.env.R2_BUCKET&&process.env.R2_ACCESS_KEY_ID&&process.env.R2_SECRET_ACCESS_KEY){
 const {AwsClient}=await import('aws4fetch');
 const r2=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
 const endpoint=process.env.R2_ENDPOINT.replace(/\/+$/,'');
 const base=endpoint+'/'+encodeURIComponent(process.env.R2_BUCKET)+'/';
 const signed=await r2.fetch(base+root+'quiz.json',{method:'GET'});
 console.log('ROCKET_GIRL_SIGNED_R2_GET '+signed.status);
 await signed.body?.cancel();
 if(signed.ok){
   const probe='data/__rocketgirl-tests/verification-'+(process.env.GITHUB_RUN_ID||'manual')+'.json';
   const put=await r2.fetch(base+probe,{method:'PUT',headers:{'content-type':'application/json'},body:'{"probe":true}'});
   console.log('ROCKET_GIRL_R2_TEST_PUT '+put.status);
   await put.body?.cancel();
   if(put.ok){
     const verify=await r2.fetch(base+probe,{method:'GET'});
     console.log('ROCKET_GIRL_R2_TEST_READBACK '+verify.status);
     await verify.body?.cancel();
     const del=await r2.fetch(base+probe,{method:'DELETE'});
     console.log('ROCKET_GIRL_R2_TEST_CLEANUP '+del.status);
     await del.body?.cancel();
   }
 }
}

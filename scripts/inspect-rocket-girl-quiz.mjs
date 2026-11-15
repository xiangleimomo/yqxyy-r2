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

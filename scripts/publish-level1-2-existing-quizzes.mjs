import {AwsClient} from 'aws4fetch';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const bank=JSON.parse(await readFile('scripts/quiz-revisions/level1-2-existing-only-2026-11-10.json','utf8'));
if(bank.series.length!==6)throw Error('Expected exactly six preexisting level-1/2 series');
for(const k of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])if(!process.env[k])throw Error('Missing '+k);
const client=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
const url=key=>process.env.R2_ENDPOINT.replace(/\/+$/,'')+'/'+encodeURIComponent(process.env.R2_BUCKET)+'/'+key.split('/').map(encodeURIComponent).join('/');
const digest=b=>createHash('sha256').update(b).digest('hex');
const assert=(b,msg)=>{if(!b)throw Error(msg);};
async function get(key){
 const r=await client.fetch(url(key),{method:'GET',signal:AbortSignal.timeout(30000)});
 assert(r.ok,'R2 GET '+key+' HTTP '+r.status);
 return Buffer.from(await r.arrayBuffer());
}
async function put(key,body){
 const r=await client.fetch(url(key),{method:'PUT',body,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'},signal:AbortSignal.timeout(30000)});
 assert(r.ok,'R2 PUT '+key+' HTTP '+r.status);
 assert(digest(await get(key))===digest(body),'Read-after-write mismatch '+key);
}
const plans=[];
let rewritten=0;
const balanced=[0,0,0,0];
for(const entry of bank.series){
 assert([1,2].includes(entry.level),'This batch must not process level 3+ or level 0');
 const root='data/'+entry.seriesId+'/';
 const paths={series:root+'series.json',episodes:root+'episodes.json',reads:root+'reading-lessons.json',quizzes:root+'quiz.json'};
 const [s,e,r,q]=await Promise.all(Object.values(paths).map(get));
 const series=JSON.parse(s),episodes=JSON.parse(e),reads=JSON.parse(r),quiz=JSON.parse(q);
 assert(series.seriesId===entry.seriesId&&Number(series.level)===entry.level,'Series identity or level mismatch: '+entry.seriesId);
 const originalKeys=Object.keys(quiz);
 // Only modify those *already present*. All other 0-2 series and lessons remain missing.
 assert(entry.lessons.every(l=>originalKeys.includes(String(l.episodeId))),'Attempt to create an originally absent Quiz');
 assert(originalKeys.length===entry.lessons.length,'Existing quiz set changed since this batch was reviewed: '+entry.seriesId);
 for(const lesson of entry.lessons){
  const epId=Number(lesson.episodeId),ep=episodes.find(x=>Number(x.episodeId)===epId),read=reads[String(epId)],existing=quiz[String(epId)];
  assert(ep&&read&&existing?.questions?.length===5,'Missing originally reviewed level-1/2 episode '+entry.seriesId+'/'+epId);
  assert(ep.sourceContentId===read.sourceId&&read.source==='official-public-read','Read/source mismatch '+entry.seriesId+'/'+epId);
  assert(lesson.questions.length===5,'Missing reviewed questions '+entry.seriesId+'/'+epId);
  assert(existing.questions.some(x=>x.options?.length!==4||/complete the sentence/i.test(x.question||'')),'Unexpected already compliant course: '+entry.seriesId+'/'+epId);
  const qs=lesson.questions.map((x,i)=>{
   assert(x.question?.endsWith('?')&&x.options?.length===4&&new Set(x.options.map(y=>y.toLowerCase())).size===4,'Malformed reviewed choices');
   assert(Number.isInteger(x.answerIndex)&&x.answerIndex>=0&&x.answerIndex<=3,'Invalid answer index');
   assert(x.explanation.length>=10&&/[\u3400-\u9fff]/u.test(x.explanation),'Missing Chinese evidence explanation');
   const p=read.paragraphs.find(v=>v.id===x.evidenceParagraphId);
   assert(p?.text,'Missing source paragraph');
   balanced[x.answerIndex]++;
   return {
    id:'q'+(i+1),type:'single-choice',category:'reading',question:x.question,
    options:x.options.map((text,j)=>({key:'ABCD'[j],text})),answer:'ABCD'[x.answerIndex],
    explanation:x.explanation,source:'editorial-official-read',
    evidence:{paragraphIds:[p.id],quote:p.text,sourceContentId:read.sourceId}
   };
  });
  quiz[String(epId)]={episodeId:epId,title:ep.title+' Quiz',styleReference:'yqxyy-v2-story-comprehension',revision:'2026-11-10',questions:qs};
  rewritten++;
 }
 const updated=Buffer.from(JSON.stringify(quiz,null,2)+'\n','utf8');
 assert(Object.keys(quiz).length===originalKeys.length,'This publisher unexpectedly added Quiz entries!');
 plans.push({key:paths.quizzes,backupKey:'__course-backups/low-level-existing-quiz-20261110/'+entry.seriesId+'/quiz.json',original:q,updated,editedIds:entry.lessons.map(x=>x.episodeId)});
}
assert(rewritten===8&&balanced.every(n=>n>=7),'Expected 8 existing lessons and balanced answers: '+JSON.stringify({rewritten,balanced}));
console.log('PRECHECK_PASS: Eight existing low-level quizzes across six series are source-matched; no absent Quiz is created.');
for(const p of plans)await put(p.backupKey,p.original);
console.log('BACKUPS_PASS: All six original Quiz objects are checksum backed up in R2.');
for(const p of plans)await put(p.key,p.updated);
for(const p of plans){
 const r=await fetch('https://yqxyy-r2.netlify.app/'+p.key,{cache:'no-store',signal:AbortSignal.timeout(30000)});
 assert(r.ok,'Public quiz GET failed '+p.key);
 const body=await r.json();
 assert(Object.keys(body).length===p.editedIds.length,'Public lower-level quiz count unexpectedly changed');
 for(const id of p.editedIds)assert(body[id]?.questions?.length===5&&body[id].questions.every(x=>x.options?.length===4&&x.evidence?.sourceContentId),'Public Quiz is not correctly published: '+p.key+'/'+id);
}
console.log('PUBLIC_VERIFY_PASS: Six /data/ quiz routes show exactly eight existing revised lessons. No 0-2 missing lesson received a Quiz.');
console.log('SUMMARY '+JSON.stringify({series:6,updatedExistingQuizzes:rewritten,newlyCreatedQuizzes:0,questions:40,answerDistribution:balanced}));
console.log('SUCCESS: Existing level-1/2 anomalous quizzes corrected; absent 0-2 quizzes left absent.');

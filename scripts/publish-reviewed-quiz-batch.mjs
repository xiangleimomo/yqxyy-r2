import {AwsClient} from 'aws4fetch';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const jobs={
 cinderella:{
  id:'little-fox-cinderella-fs0100',
  level:3,
  episodeCount:12,
  files:['scripts/quiz-revisions/cinderella-2026-11-10-part-1.json','scripts/quiz-revisions/cinderella-2026-11-10-part-2.json']
 },
 snowwhite:{
  id:'little-fox-snow-white-and-the-seven-dwarfs-fs0101',
  level:3,
  episodeCount:12,
  files:['scripts/quiz-revisions/snowwhite-2026-11-10-part-1.json','scripts/quiz-revisions/snowwhite-2026-11-10-part-2.json']
 },
 dracula:{
  id:'little-fox-dracula-fs0016',
  level:9,
  episodeCount:6,
  files:['scripts/quiz-revisions/dracula-2026-11-10-part-1.json','scripts/quiz-revisions/dracula-2026-11-10-part-2.json']
 },
 qt:{
  id:'little-fox-qt-s-science-adventures-fs0047',
  level:7,
  episodeCount:7,
  files:['scripts/quiz-revisions/qt-science-2026-11-10-part-1.json','scripts/quiz-revisions/qt-science-2026-11-10-part-2.json']
 }
};
const name=process.argv[2];
if(!Object.prototype.hasOwnProperty.call(jobs,name))throw Error('Expected approved job: cinderella, snowwhite, dracula or qt');
const job=jobs[name];
for(const key of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])
 if(!process.env[key])throw Error('Missing '+key);
const client=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
const base=process.env.R2_ENDPOINT.replace(/\/+$/,'');
const url=key=>base+'/'+encodeURIComponent(process.env.R2_BUCKET)+'/'+key.split('/').map(encodeURIComponent).join('/');
const hash=value=>createHash('sha256').update(value).digest('hex');
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
async function get(key){
 const r=await client.fetch(url(key),{method:'GET',signal:AbortSignal.timeout(30000)});
 assert(r.ok,'R2 GET '+key+': HTTP '+r.status);
 return Buffer.from(await r.arrayBuffer());
}
async function put(key,body){
 const r=await client.fetch(url(key),{method:'PUT',headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'},body,signal:AbortSignal.timeout(30000)});
 assert(r.ok,'R2 PUT '+key+': HTTP '+r.status);
 assert(hash(await get(key))===hash(body),'R2 read-back checksum mismatch: '+key);
}
const root='data/'+job.id+'/';
const paths={quizzes:root+'quiz.json',episodes:root+'episodes.json',reads:root+'reading-lessons.json',series:root+'series.json'};
const [quizBuf,episodeBuf,readBuf,seriesBuf]=await Promise.all(Object.values(paths).map(get));
const quiz=JSON.parse(quizBuf.toString('utf8'));
const episodes=JSON.parse(episodeBuf.toString('utf8'));
const reads=JSON.parse(readBuf.toString('utf8'));
const series=JSON.parse(seriesBuf.toString('utf8'));
assert(Array.isArray(episodes)&&episodes.length===job.episodeCount,'Unexpected episode count for '+job.id);
assert(series.seriesId===job.id&&Number(series.level)===job.level,'Invalid series ID or wrong level');
assert(quiz&&typeof quiz==='object'&&!Array.isArray(quiz),'Unexpected quiz structure');
const banks=await Promise.all(job.files.map(async path=>JSON.parse(await readFile(path,'utf8'))));
const lessons=banks.flatMap(bank=>{
 assert(bank.seriesId===job.id&&Number(bank.level)===job.level,'Wrong bank series or level');
 return bank.lessons;
});
assert(lessons.length===job.episodeCount&&new Set(lessons.map(x=>Number(x.episodeId))).size===job.episodeCount,'Expected exact reviewed bank coverage');
const counts=[0,0,0,0];
let changed=0;
const rubricBad=/which word appears|complete the sentence|fill in the blank|according to the story,\s*complete/i;
for(const lesson of lessons){
 const epId=Number(lesson.episodeId);
 const ep=episodes.find(item=>Number(item.episodeId)===epId);
 const read=reads[String(epId)];
 const existing=quiz[String(epId)];
 assert(ep&&read&&existing?.questions?.length,'Cannot introduce Quiz on a previously absent episode '+epId);
 assert(['official-text','official-public-read'].includes(read.source),'Not official Read content: '+epId);
 assert(ep.sourceContentId===read.sourceId,'Episode source content ID mismatch: '+epId);
 assert(lesson.questions?.length===5,'Expected 5 reviewed questions: '+epId);
 const good=existing.questions.length===5&&existing.questions.every(q=>q.options?.length===4&&q.evidence?.sourceContentId===read.sourceId&&!rubricBad.test(q.question||'')&&/[\u3400-\u9fff]/u.test(q.explanation||''));
 if(good){
  // Do not modify already compliant original lessons.
  console.log('SKIP_COMPLIANT '+epId);
  continue;
 }
 const prompts=new Set();
 const questions=lesson.questions.map((q,i)=>{
  assert(q.question?.endsWith('?')&&/^[A-Z]/.test(q.question)&&!rubricBad.test(q.question),'Invalid interrogative prompt: '+epId+'/'+i);
  assert(!prompts.has(q.question.toLowerCase()),'Duplicate episode prompt: '+epId+'/'+i);
  prompts.add(q.question.toLowerCase());
  assert(Array.isArray(q.options)&&q.options.length===4&&
    new Set(q.options.map(s=>s.trim().toLowerCase())).size===4,'Invalid options: '+epId+'/'+i);
  assert(Number.isInteger(q.answerIndex)&&q.answerIndex>=0&&q.answerIndex<4,'Invalid answer: '+epId+'/'+i);
  assert(/[\u3400-\u9fff]/u.test(q.explanation)&&q.explanation.length>=10,'Missing specific Chinese explanation: '+epId+'/'+i);
  const para=read.paragraphs?.find(p=>p.id===q.evidenceParagraphId);
  assert(para?.text&&para.text.length>=8,'Evidence paragraph absent: '+epId+'/'+i);
  counts[q.answerIndex]++;
  return {
   id:'q'+(i+1),type:'single-choice',category:'reading',
   question:q.question,
   options:q.options.map((text,j)=>({key:'ABCD'[j],text})),
   answer:'ABCD'[q.answerIndex],explanation:q.explanation,
   source:'editorial-official-read',evidence:{paragraphIds:[para.id],quote:para.text,sourceContentId:read.sourceId}
  };
 });
 quiz[String(epId)]={
  episodeId:epId,title:ep.title+' Quiz',
  styleReference:'yqxyy-v2-story-comprehension',revision:'2026-11-10',questions
 };
 changed++;
}
assert(changed>0,'No modifications necessary; refusing backup-only rerun');
assert(counts.every(x=>x>=Math.max(4,Math.floor(changed*5/8))),'Answer distribution too biased: '+counts.join(','));
console.log('SOURCE_QA_PASS: '+changed+' existing unqualified quizzes rewritten from verified official same-episode Read, with 4 unique options and specific evidence. A/B/C/D='+counts.join('/'));
const backupKey='__course-backups/'+job.id+'-quiz-before-v2-20261110/quiz.json';
await put(backupKey,quizBuf);
const updated=Buffer.from(JSON.stringify(quiz,null,2)+'\n','utf8');
await put(paths.quizzes,updated);
const p=await fetch('https://yqxyy-r2.netlify.app/'+paths.quizzes,{cache:'no-store',signal:AbortSignal.timeout(35000)});
assert(p.ok,'Public website quiz route HTTP '+p.status);
const live=await p.json();
for(const lesson of lessons){
 const q=live[String(lesson.episodeId)];
 assert(q?.questions?.length===5&&q.questions.every(x=>x.options?.length===4&&x.evidence?.sourceContentId),'Public quiz is not complete for '+lesson.episodeId);
}
console.log('R2_BACKUP_PASS '+backupKey);
console.log('PUBLIC_VERIFY_PASS: '+job.episodeCount+' episodes and four-option story quizzes visible through Netlify.');
console.log('SUCCESS: '+job.id+' updated '+changed+' noncompliant lessons; all originally absent quizzes untouched; 0-2 levels excluded.');

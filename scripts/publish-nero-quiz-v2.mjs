import {AwsClient} from 'aws4fetch';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const seriesId='little-fox-nero-the-talking-dog-fs0183';
const prefix='data/'+seriesId+'/';
const quizKey=prefix+'quiz.json';
const readKey=prefix+'reading-lessons.json';
const episodeKey=prefix+'episodes.json';
const backupBase='__course-backups/nero-fs0183-before-quiz-v2-20261109/';
const publicBase='https://yqxyy-r2.netlify.app/';
const sha=x=>createHash('sha256').update(x).digest('hex');
function check(ok,msg){if(!ok)throw Error(msg);}
for(const key of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])check(process.env[key],'Missing secret '+key);
const client=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
const url=key=>process.env.R2_ENDPOINT.replace(/\/+$/,'')+'/'+encodeURIComponent(process.env.R2_BUCKET)+'/'+key.split('/').map(encodeURIComponent).join('/');
async function get(key){
  const r=await client.fetch(url(key),{method:'GET',signal:AbortSignal.timeout(30000)});
  check(r.ok,'R2 GET '+key+' HTTP '+r.status);return Buffer.from(await r.arrayBuffer());
}
async function put(key,body){
  const r=await client.fetch(url(key),{method:'PUT',body,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'},signal:AbortSignal.timeout(30000)});
  check(r.ok,'R2 PUT '+key+' HTTP '+r.status);
  check(sha(await get(key))===sha(body),'R2 read-after-write SHA mismatch '+key);
}
const [origQuiz,origEpisodes,readBytes]=await Promise.all([get(quizKey),get(episodeKey),get(readKey)]);
const quizzes=JSON.parse(origQuiz.toString('utf8')),episodes=JSON.parse(origEpisodes.toString('utf8')),reads=JSON.parse(readBytes.toString('utf8'));
check(Array.isArray(episodes)&&episodes.length===11,'Expected 11 Nero episodes in R2');
check(quizzes['11']?.questions?.length===5&&quizzes['11']?.questions?.every(x=>x.options?.length===4),'Existing Nero episode 11 course must remain complete');
const kept11=sha(JSON.stringify(quizzes['11']));
const parts=await Promise.all([1,2].map(i=>readFile('scripts/quiz-revisions/nero-2026-11-09-part-'+i+'.json','utf8').then(JSON.parse)));
const lessons=parts.flatMap(part=>{check(part.seriesId===seriesId&&part.reference==='official-read','Nero revision bank identity error');return part.lessons;});
check(lessons.length===10&&new Set(lessons.map(l=>l.episodeId)).size===10,'Expected 10 unique Nero revised lessons');
let changedEpisodes=false;
let counter=0;
for(const lesson of lessons){
  const ep=episodes.find(e=>Number(e.episodeId)===lesson.episodeId),read=reads[String(lesson.episodeId)];
  check(ep&&read&&read.source==='official-text'&&ep.sourceContentId===read.sourceId,'Nero official Read identity mismatch for episode '+lesson.episodeId);
  check(lesson.questions?.length===5,'Expected 5 questions episode '+lesson.episodeId);
  const questions=lesson.questions.map((q,i)=>{
    check(q.question?.endsWith('?')&&!/which word appears|fill in the blank|complete the sentence|____/i.test(q.question),'Generic or invalid prompt');
    check(q.options?.length===4&&new Set(q.options.map(v=>v.trim().toLowerCase())).size===4,'Missing or duplicated options');
    check(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4,'Bad answer');
    check(/[\u3400-\u9fff]/u.test(q.explanation),'Explanation must be in Chinese');
    const p=read.paragraphs.find(v=>v.id===q.evidenceParagraphId);
    check(p?.text,'Missing official paragraph '+q.evidenceParagraphId);
    counter++;
    return {
      id:'q'+(i+1),type:'single-choice',category:'reading',question:q.question,
      options:q.options.map((text,index)=>({key:'ABCD'[index],text})),
      answer:'ABCD'[q.answer],explanation:q.explanation,
      source:'editorial-official-read',
      evidence:{paragraphIds:[p.id],quote:p.text,sourceContentId:read.sourceId}
    };
  });
  quizzes[String(lesson.episodeId)]={episodeId:lesson.episodeId,title:ep.title+' Quiz',styleReference:'yqxyy-v2-story-comprehension',revision:'2026-11-09',questions};
  if(!ep.modules?.quiz){ep.modules={...(ep.modules||{}),quiz:true};changedEpisodes=true;}
}
check(sha(JSON.stringify(quizzes['11']))===kept11,'Nero episode 11 unexpectedly changed');
check(counter===50,'Expected 50 Nero narrative questions');
const out=Buffer.from(JSON.stringify(quizzes,null,2)+'\n','utf8');
await put(backupBase+'quiz.json',origQuiz);
if(changedEpisodes)await put(backupBase+'episodes.json',origEpisodes);
await put(quizKey,out);
if(changedEpisodes)await put(episodeKey,Buffer.from(JSON.stringify(episodes,null,2)+'\n','utf8'));
const publicQuizRes=await fetch(publicBase+quizKey,{cache:'no-store',signal:AbortSignal.timeout(30000)});
check(publicQuizRes.ok,'Netlify quiz route HTTP '+publicQuizRes.status);
const pub=await publicQuizRes.json();
for(let n=1;n<=11;n++)check(pub[String(n)]?.questions?.length===5&&pub[String(n)].questions.every(q=>q.options?.length===4),'Public Nero quiz invalid for episode '+n);
check(sha(JSON.stringify(pub['11']))===kept11,'Public Nero episode 11 quiz changed');
if(changedEpisodes){
 const publicEpRes=await fetch(publicBase+episodeKey,{cache:'no-store',signal:AbortSignal.timeout(30000)});
 check(publicEpRes.ok&& (await publicEpRes.json()).find(e=>e.episodeId===10)?.modules?.quiz,'Nero episode 10 quiz module is not published');
}
console.log('PASS: 50 narrative questions published for Nero episodes 1-10, 5 A-D options per lesson, official text evidence in every question.');
console.log('PASS: Nero episode 11 existing 5-question V2 quiz preserved without modification.');
console.log('PASS: Nero 10 quiz module enabled as needed, original data backed up, and all 11 public quizzes verified.');
console.log('SUCCESS: Nero the Talking Dog story quizzes corrected.');

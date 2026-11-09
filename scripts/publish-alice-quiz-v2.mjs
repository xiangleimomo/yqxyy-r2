import { AwsClient } from 'aws4fetch';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const seriesId='little-fox-alice-s-adventures-in-wonderland-fs0106';
const prefix='data/'+seriesId+'/';
const quizKey=prefix+'quiz.json';
const readKey=prefix+'reading-lessons.json';
const episodeKey=prefix+'episodes.json';
const backupKey='__course-backups/alice-fs0106-original-quiz-20261109/quiz.json';
const base='https://yqxyy-r2.netlify.app/';
const sha256=value=>createHash('sha256').update(value).digest('hex');
const assert=(ok,message)=>{if(!ok)throw Error(message);};
for(const k of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])assert(process.env[k], 'Missing R2 credential '+k);
const client=new AwsClient({
  accessKeyId:process.env.R2_ACCESS_KEY_ID,
  secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,
  service:'s3',region:'auto'
});
const objectUrl=key=>process.env.R2_ENDPOINT.replace(/\/+$/,'')+'/'+encodeURIComponent(process.env.R2_BUCKET)+'/'+key.split('/').map(encodeURIComponent).join('/');
async function get(key) {
  const r=await client.fetch(objectUrl(key), {method:'GET',signal:AbortSignal.timeout(35000)});
  assert(r.ok,'R2 GET '+key+' HTTP '+r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function put(key,body) {
  const r=await client.fetch(objectUrl(key), {method:'PUT',headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'},body,signal:AbortSignal.timeout(35000)});
  assert(r.ok,'R2 PUT '+key+' HTTP '+r.status);
  assert(sha256(await get(key))===sha256(body),'R2 read-after-write checksum mismatch: '+key);
}
const [original,readsBuffer,episodeBuffer]=await Promise.all([get(quizKey),get(readKey),get(episodeKey)]);
const quizzes=JSON.parse(original.toString('utf8'));
const reads=JSON.parse(readsBuffer.toString('utf8'));
const episodes=JSON.parse(episodeBuffer.toString('utf8'));
assert(Array.isArray(episodes) && episodes.length===24,'Expected 24 Alice episodes in R2');
assert(quizzes&&typeof quizzes==='object'&&!Array.isArray(quizzes),'Unexpected quiz bank schema');
const files=['scripts/quiz-revisions/alice-2026-11-09-part-1.json','scripts/quiz-revisions/alice-2026-11-09-part-2.json','scripts/quiz-revisions/alice-2026-11-09-part-3.json','scripts/quiz-revisions/alice-2026-11-09-part-4.json'];
const banks=await Promise.all(files.map(async file=>JSON.parse(await readFile(file,'utf8'))));
const all=banks.flatMap(bank=>{
  assert(bank.seriesId===seriesId&&bank.reference==='official-read','Wrong Alice quiz revision source');
  return bank.lessons;
});
assert(all.length===24&&new Set(all.map(l=>Number(l.episodeId))).size===24,'Expected exactly 24 unique revised lessons');
const balanced=[0,0,0,0];
const generated = {};
for(const lesson of all) {
  const id=Number(lesson.episodeId),key=String(id);
  const ep=episodes.find(x=>Number(x.episodeId)===id),read=reads[key];
  assert(ep && read && read.source==='official-text' && ep.sourceContentId===read.sourceId,
    'Episode/official Read not aligned: '+id);
  assert(Array.isArray(read.paragraphs)&&read.paragraphs.length>=5,
    'Official reading is too short: '+id);
  assert(Array.isArray(lesson.questions)&&lesson.questions.length===5,
    'Lesson must have five questions: '+id);
  const questions=lesson.questions.map((question,n)=>{
    assert(typeof question.question==='string'&&/^[A-Z]/.test(question.question)&&question.question.endsWith('?'),
      'Expected English interrogative question: '+id+'/'+n);
    assert(!/which word appears|complete the sentence|fill in the blank|____/i.test(question.question),
      'Generic or cloze question detected: '+id+'/'+n);
    assert(Array.isArray(question.options)&&question.options.length===4&&
      new Set(question.options.map(x=>x.trim().toLowerCase())).size===4,
      'Expected four distinct English choices: '+id+'/'+n);
    assert(Number.isInteger(question.answer)&&question.answer>=0&&question.answer<4,
      'Bad answer index: '+id+'/'+n);
    assert(/[\u3400-\u9fff]/u.test(question.explanation),
      'Expected specific Chinese explanation: '+id+'/'+n);
    const paragraph=read.paragraphs.find(p=>p.id===question.evidenceParagraphId);
    assert(paragraph?.text&&paragraph.text.length>=8,
      'Missing official evidence paragraph: '+id+'/'+n);
    balanced[question.answer]++;
    return {
      id:'q'+(n+1),type:'single-choice',category:'reading',
      question:question.question,
      options:question.options.map((text,index)=>({key:'ABCD'[index],text})),
      answer:'ABCD'[question.answer],explanation:question.explanation,
      source:'editorial-official-read',evidence:{
        paragraphIds:[paragraph.id],quote:paragraph.text,sourceContentId:read.sourceId
      }
    };
  });
  generated[key]={episodeId:id,title:ep.title+' Quiz',styleReference:'yqxyy-v2-story-comprehension',revision:'2026-11-09',questions};
}
assert(balanced.every(x=>x>=18),'Answers are overly imbalanced among A/B/C/D: '+balanced.join(','));
const existingBad=Object.keys(quizzes).filter(k=>/^[0-9]+$/.test(k) && Number(k)>=1 && Number(k)<=24);
assert(existingBad.length===24,'Expected existing 24 Alice lesson quizzes; refusing to overwrite unexpected index');
for(const key of Object.keys(generated))quizzes[key]=generated[key];
const output=Buffer.from(JSON.stringify(quizzes,null,2)+'\n','utf8');
await put(backupKey,original);
await put(quizKey,output);
const publicRes=await fetch(base+quizKey,{cache:'no-store',signal:AbortSignal.timeout(30000)});
assert(publicRes.ok,'Public Netlify R2 quiz route HTTP '+publicRes.status);
const visible=await publicRes.json();
for(let i=1;i<=24;i++){
 const q=visible[String(i)];
 assert(q?.questions?.length===5&&q.questions.every(x=>x.options?.length===4&&x.evidence?.sourceContentId),
    'Public Alice Quiz incomplete in episode '+i);
}
console.log('PASS: 24 Alice lessons x 5 original narrative questions = 120, 4 English choices per question, verified against official source-bound Read paragraphs.');
console.log('PASS: answer distribution A/B/C/D: '+balanced.join('/')+'; no generic word-appearance questions.');
console.log('PASS: original R2 Quiz backed up at '+backupKey+'.');
console.log('PASS: updated R2 Quiz read-after-write and public Netlify /data/ quiz route verified.');
console.log('SUCCESS: Alice in Wonderland course quizzes corrected.');

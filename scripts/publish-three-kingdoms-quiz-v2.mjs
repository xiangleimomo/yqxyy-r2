import {AwsClient} from 'aws4fetch';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const seriesId='three-kingdoms',prefix='data/'+seriesId+'/';
const quizKey=prefix+'quiz.json',episodesKey=prefix+'episodes.json',readingKey=prefix+'reading-lessons.json';
const backupPrefix='__course-backups/three-kingdoms-before-quiz-v2-20261109/';
const publicBase='https://yqxyy-r2.netlify.app/';
const hash=x=>createHash('sha256').update(x).digest('hex');
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
for(const key of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])check(process.env[key],'Missing '+key);
const client=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
const getUrl=key=>process.env.R2_ENDPOINT.replace(/\/+$/,'')+'/'+encodeURIComponent(process.env.R2_BUCKET)+'/'+key.split('/').map(encodeURIComponent).join('/');
async function get(key){
 const r=await client.fetch(getUrl(key),{method:'GET',signal:AbortSignal.timeout(30000)});
 check(r.ok,'R2 GET '+key+' HTTP '+r.status);
 return Buffer.from(await r.arrayBuffer());
}
async function put(key,body){
 const r=await client.fetch(getUrl(key),{method:'PUT',body,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'},signal:AbortSignal.timeout(30000)});
 check(r.ok,'R2 PUT '+key+' HTTP '+r.status);
 check(hash(await get(key))===hash(body),'R2 read-back mismatch: '+key);
}
const [rawQuiz,rawEp,rawRead]=await Promise.all([get(quizKey),get(episodesKey),get(readingKey)]);
const quiz=JSON.parse(rawQuiz.toString('utf8')),episodes=JSON.parse(rawEp.toString('utf8')),reading=JSON.parse(rawRead.toString('utf8'));
check(Array.isArray(episodes)&&episodes.length===14,'Expected exactly 14 Three Kingdoms episodes');
const changes=JSON.parse(await readFile('scripts/quiz-revisions/three-kingdoms-2026-11-09.json','utf8'));
check(changes.seriesId===seriesId&&Object.keys(changes.extraOptions).length===12&&changes.newLessons.length===2,'Bad reviewed Three Kingdoms batch');
let additions=0,rewritten=0;
for(let epId=1;epId<=12;epId++){
 const ep=episodes.find(x=>x.episodeId===epId),q=quiz[String(epId)],r=reading[String(epId)];
 check(ep&&q?.questions?.length===5&&r?.paragraphs?.length&&changes.extraOptions[String(epId)]?.length===5,'Incomplete original story quiz '+epId);
 if(ep.sourceContentId&&r.sourceId)check(ep.sourceContentId===r.sourceId,'Existing episode/Read mismatch: '+epId);
 for(let i=0;i<5;i++){
  const item=q.questions[i],additional=changes.extraOptions[String(epId)][i];
  check(typeof additional==='string'&&additional.length>10,'Fourth option missing: '+epId+'/'+i);
  check(item.options?.length===3&&item.options.every((x,j)=>x.key==='ABC'[j])&&'ABC'.includes(item.answer),'Unexpected original choices: '+epId+'/'+i);
  item.options.push({key:'D',text:additional});
  additions++;
  const replace=changes.replacements?.[String(epId)]?.[String(i+1)];
  if(replace){
   const [question,opts,answer,explanation,pid]=replace;
   const paragraph=r.paragraphs.find(p=>p.id===pid);
   check(paragraph?.text&&opts?.length===4&&Number.isInteger(answer)&&answer>=0&&answer<4&&/[\u3400-\u9fff]/u.test(explanation),'Bad replacement evidence '+epId+'/'+i);
   Object.assign(item,{
    id:'q'+(i+1),type:'single-choice',category:'reading',question,
    options:opts.map((text,j)=>({key:'ABCD'[j],text})),answer:'ABCD'[answer],
    explanation,source:'editorial-source-bound-reading',
    evidence:{paragraphIds:[pid],quote:paragraph.text,sourceContentId:r.sourceId||ep.sourceContentId}
   });
   rewritten++;
  }else if(item.category==='vocabulary') {
   throw Error('Non-plot question still present at episode '+epId+' #'+(i+1));
  }
  check(item.options.length===4&&new Set(item.options.map(x=>x.text.toLowerCase())).size===4,'Invalid final options '+epId+'/'+i);
 }
 q.styleReference='yqxyy-v2-story-comprehension';
 q.revision='2026-11-09';
}
for(const lesson of changes.newLessons){
 const epId=lesson.episodeId,ep=episodes.find(x=>x.episodeId===epId),r=reading[String(epId)];
 check((epId===13||epId===14)&&ep&&r&&r.sourceId===ep.sourceContentId&&lesson.questions.length===5,'Episode 13-14 identity/evidence mismatch '+epId);
 check(!quiz[String(epId)]||!quiz[String(epId)].questions?.length,'Episode '+epId+' already has Quiz, refusing unintended overwrite');
 const questions=lesson.questions.map((q,i)=>{
  const p=r.paragraphs.find(x=>x.id===q.evidenceParagraphId);
  check(p?.text&&q.question.endsWith('?')&&q.options.length===4&&new Set(q.options.map(x=>x.toLowerCase())).size===4&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4&&/[\u3400-\u9fff]/u.test(q.explanation),'Invalid new Three Kingdoms quiz evidence '+epId+'/'+i);
  return {
   id:'q'+(i+1),type:'single-choice',category:'reading',
   question:q.question,options:q.options.map((text,j)=>({key:'ABCD'[j],text})),
   answer:'ABCD'[q.answer],explanation:q.explanation,
   source:'editorial-source-bound-reading',
   evidence:{paragraphIds:[p.id],quote:p.text,sourceContentId:r.sourceId}
  };
 });
 quiz[String(epId)]={episodeId:epId,title:ep.title+' Quiz',styleReference:'yqxyy-v2-story-comprehension',revision:'2026-11-09',questions};
 ep.modules={...(ep.modules||{}),quiz:true};
}
for(let id=1;id<=14;id++){
 const q=quiz[String(id)];
 check(q?.questions?.length===5,'Quiz must contain five questions at '+id);
 for(const x of q.questions){
  check(x.options?.length===4&&'ABCD'.includes(x.answer)&&x.options.some(o=>o.key===x.answer),'Quiz invalid at '+id);
  check(!/which word appears|what does .+ mean in the story|what is a .rung.|close in on.*mean/i.test(x.question),'Generic word meaning quiz remains at '+id);
 }
}
await put(backupPrefix+'quiz.json',rawQuiz);
await put(backupPrefix+'episodes.json',rawEp);
await put(quizKey,Buffer.from(JSON.stringify(quiz,null,2)+'\n','utf8'));
await put(episodesKey,Buffer.from(JSON.stringify(episodes,null,2)+'\n','utf8'));
const qRes=await fetch(publicBase+quizKey,{cache:'no-store',signal:AbortSignal.timeout(30000)});
const eRes=await fetch(publicBase+episodesKey,{cache:'no-store',signal:AbortSignal.timeout(30000)});
check(qRes.ok&&eRes.ok,'Public /data route unavailable');
const qPublic=await qRes.json(),epPublic=await eRes.json();
for(let id=1;id<=14;id++)check(qPublic[id]?.questions?.length===5&&qPublic[id].questions.every(x=>x.options?.length===4),'Public Quiz missing/incomplete: '+id);
check(epPublic.find(x=>x.episodeId===13)?.modules?.quiz&&epPublic.find(x=>x.episodeId===14)?.modules?.quiz,'New quizzes not enabled on public site');
console.log('PASS: Three Kingdoms episodes 1-12 retained original narrative questions, added 60 fourth options, replaced '+rewritten+' vocabulary items with plot questions.');
console.log('PASS: Three Kingdoms episodes 13 and 14 each received 5 evidence-backed original plot questions.');
console.log('PASS: 14 x 5 = 70 questions, each with four answer choices, R2 backup and public Netlify verification succeeded.');
console.log('SUCCESS: Three Kingdoms Quiz corrected.');

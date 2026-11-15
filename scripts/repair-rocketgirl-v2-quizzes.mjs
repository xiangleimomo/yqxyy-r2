// Rocket Girl V2 Quiz: exact official Read, independent editorial review,
// backup-before-write, signed R2 verification, and resumable small batches.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {AwsClient} from 'aws4fetch';
import {checkQuiz,courseInference} from '../automation/littlefox-daily/core.mjs';

const SERIES='little-fox-rocket-girl-fs0065';
const ROOT='data/'+SERIES+'/';
const PUBLIC='https://pub-bf9dac62ea094bcdae4eca9e743f9b61.r2.dev/';
const BANNED=/which\s+is\s+not\s+true|which word appears|complete the sentence|fill in the blank/i;
const checksum=x=>createHash('sha256').update(x).digest('hex');
const ensure=(ok,message)=>{if(!ok)throw Error(message);};

async function readPublic(file){
 const response=await fetch(PUBLIC+ROOT+file+'?fresh='+Date.now(),{
   cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)});
 ensure(response.ok,'Public R2 '+file+' HTTP '+response.status);
 return response.json();
}
export function validateQuestions(ep,read,questions){
 ensure(read?.sourceId===ep?.sourceContentId&&
   ['official-text','official-public-read'].includes(read?.source)&&
   Array.isArray(read?.paragraphs)&&read.paragraphs.length>=5,
   'Episode '+ep?.episodeId+' lacks its matching official Read');
 const errors=checkQuiz({questions},read.paragraphs,read.sourceId);
 ensure(!errors.length,'Episode '+ep.episodeId+' failed V2 quality gate: '+errors.join('; '));
 ensure(new Set(questions.map(q=>q.answer)).size>=3,'Answers biased in episode '+ep.episodeId);
 const n=read.paragraphs.length,split=Math.max(1,Math.floor(n/3)),sections=new Set(),prompts=new Set();
 questions.forEach((q,i)=>{
   ensure(q.type==='single-choice'&&q.category==='reading'&&
     q.source==='editorial-official-read','Invalid question metadata '+ep.episodeId+'/'+i);
   const prompt=String(q.question||'').trim().toLowerCase();
   ensure(prompt.endsWith('?')&&!BANNED.test(prompt)&&!prompts.has(prompt),
     'Generic/duplicate prompt '+ep.episodeId+'/'+i);
   prompts.add(prompt);
   ensure(/[\u3400-\u9fff]/u.test(q.explanation||'')&&
     String(q.explanation||'').length>=18,'Non-specific Chinese explanation '+ep.episodeId+'/'+i);
   const pos=read.paragraphs.findIndex(p=>q.evidence?.paragraphIds?.includes(p.id)&&
     q.evidence.quote===p.text);
   ensure(pos>=0,'Unverifiable verbatim Read evidence '+ep.episodeId+'/'+i);
   sections.add(Math.min(2,Math.floor(pos/split)));
 });
 ensure(sections.size===3,'Episode '+ep.episodeId+' Quiz must cover opening, middle, end');
 return true;
}
function compliant(ep,read,q){
 if(q?.styleReference!=='yqxyy-v2-story-comprehension')return false;
 try{return validateQuestions(ep,read,q.questions);}catch{return false;}
}
async function generate(ep,read,env){
 ensure(Boolean(env.LF_OPENAI_API_KEY),'LF_OPENAI_API_KEY not set; cannot generate verified Quiz');
 const evidence={episodeId:ep.episodeId,title:ep.title,contentId:read.sourceId,paragraphs:read.paragraphs};
 const draft=await courseInference({env,http:fetch,temperature:0.2,messages:[
   {role:'system',content:'你是独立少儿英语编辑。只依据本集官方 Read 原文编制五道原创英文剧情理解题，不借用其他集内容。JSON格式 {questions:[5题]}；每题含 id=q1..q5、type=single-choice、category=reading、source=editorial-official-read、英文具体情节问题 question、四个不同A-D options[{key,text}]、唯一答案 answer、具体的中文解释 explanation、证据 evidence:{paragraphIds:[原文段落id],quote:该段逐字完整文本,sourceContentId:本集CID}。覆盖开端/发展/结尾；A-D答案分散；错误选项是合理但与本集事实不符的干扰项。不出词汇题、不出含糊的 Which is NOT true、不编造情节。'} ,
   {role:'user',content:JSON.stringify(evidence)}]});
 validateQuestions(ep,read,draft?.questions);
 const review=await courseInference({env,http:fetch,temperature:0,messages:[
   {role:'system',content:'你是独立课程审稿员。逐题核查与本集原文证据匹配、全部四个答案的唯一性、没有其他集情节、中文解释具体、难度适合Level 4、五题覆盖不同情节点。只返回JSON {approved:boolean,contentId:string,issues:string[]}，不得修题；有任何问题则拒绝。'},
   {role:'user',content:JSON.stringify({...evidence,quiz:draft})}]});
 ensure(review?.approved===true&&review.contentId===read.sourceId&&
   Array.isArray(review.issues)&&review.issues.length===0,
   'Independent editorial QA rejected '+ep.episodeId+': '+JSON.stringify(review?.issues||[]).slice(0,280));
 return draft.questions;
}
function r2(env){
 for(const n of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])
   ensure(env[n],'Missing R2 secret '+n);
 const client=new AwsClient({accessKeyId:env.R2_ACCESS_KEY_ID,
   secretAccessKey:env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
 const base=env.R2_ENDPOINT.replace(/\/+$/,'')+'/'+encodeURIComponent(env.R2_BUCKET)+'/';
 const url=key=>base+key.split('/').map(encodeURIComponent).join('/');
 return {
   async get(key){
     const res=await client.fetch(url(key),{method:'GET',signal:AbortSignal.timeout(30000)});
     ensure(res.ok,'Signed R2 GET denied HTTP '+res.status+' at '+key+'; no Quiz changed');
     return Buffer.from(await res.arrayBuffer());
   },
   async put(key,bytes){
     const res=await client.fetch(url(key),{method:'PUT',body:bytes,
       headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'},
       signal:AbortSignal.timeout(30000)});
     ensure(res.ok,'Signed R2 PUT denied HTTP '+res.status+' at '+key);
     await res.body?.cancel();
     ensure(checksum(await this.get(key))===checksum(bytes),'R2 verification mismatch '+key);
   }
 };
}
export async function main(env=process.env){
 const mode=String(env.ROCKET_QUIZ_MODE||'audit');
 ensure(['audit','reviewed','generate'].includes(mode),'Unknown mode');
 const start=Number(env.ROCKET_START_EPISODE||1),limit=Number(env.ROCKET_LIMIT||5);
 ensure(Number.isInteger(start)&&start>=1&&start<=252&&
   Number.isInteger(limit)&&limit>=1&&limit<=10,'Invalid start/limit');
 const [eps,quizzes,reads]=await Promise.all([
   readPublic('episodes.json'),readPublic('quiz.json'),readPublic('reading-lessons.json')]);
 ensure(Array.isArray(eps)&&eps.length===252,'Expected exactly 252 Rocket Girl episodes');
 const invalid=eps.filter(ep=>Number(ep.episodeId)>=start&&
   !compliant(ep,reads[String(ep.episodeId)],quizzes[String(ep.episodeId)]));
 console.log('ROCKET_GIRL_V2_AUDIT '+JSON.stringify({
   mode,episodes:eps.length,quizEntries:Object.keys(quizzes).length,
   lessonsNeedingRepairFromStart:invalid.length,
   firstInvalidIds:invalid.slice(0,limit).map(ep=>ep.episodeId)}));
 if(mode==='audit')return {invalid:invalid.length};
 const store=r2(env);
 let oldBytes=await store.get(ROOT+'quiz.json'); // no paid inference before auth succeeds
 let current=JSON.parse(oldBytes.toString('utf8'));
 ensure(checksum(JSON.stringify(current))===checksum(JSON.stringify(quizzes)),
   'Signed/public R2 Quiz mismatch, refusing concurrent overwrite');
 let requests=[];
 if(mode==='reviewed'){
   const reviewed=JSON.parse(await readFile(new URL('./quiz-revisions/rocket-girl-2026-11-15-reviewed.json',import.meta.url),'utf8'));
   ensure(reviewed.seriesId===SERIES&&reviewed.level===4,'Reviewed bank for wrong series');
   requests=reviewed.lessons.filter(x=>x.episodeId>=start&&x.episodeId<start+limit);
 }else{
   ensure(Boolean(env.LF_OPENAI_API_KEY),
     'No LF_OPENAI_API_KEY in GitHub Actions; source-grounded AI repair unavailable');
   requests=invalid.slice(0,limit).map(ep=>({episodeId:ep.episodeId}));
 }
 ensure(requests.length>0,'No candidate lessons for this batch');
 let changed=0;
 for(const candidate of requests){
   const ep=eps.find(x=>x.episodeId===candidate.episodeId);
   ensure(ep,'Episode not found: '+candidate.episodeId);
   const k=String(ep.episodeId),read=reads[k];
   if(compliant(ep,read,current[k])){console.log('SKIP_COMPLIANT '+k);continue;}
   if(mode==='reviewed')ensure(candidate.sourceContentId===read?.sourceId,
      'Reviewed lesson/CID mismatch: '+k);
   const questions=mode==='reviewed'?candidate.questions:await generate(ep,read,env);
   validateQuestions(ep,read,questions);
   const checkBytes=await store.get(ROOT+'quiz.json');
   ensure(checksum(checkBytes)===checksum(oldBytes),'Concurrent R2 Quiz modification; refusing overwrite');
   const backup='__course-backups/rocket-girl-v2/'+(env.GITHUB_RUN_ID||'manual')+'/before-ep-'+k+'.json';
   await store.put(backup,oldBytes);
   current[k]={episodeId:ep.episodeId,title:ep.title+' Quiz',styleReference:'yqxyy-v2-story-comprehension',
     revision:'2026-11-15',questions};
   const newBytes=Buffer.from(JSON.stringify(current,null,2)+'\n','utf8');
   await store.put(ROOT+'quiz.json',newBytes);
   oldBytes=newBytes;changed++;
   console.log('PUBLISHED_REVIEWED_ROCKET_GIRL ep='+k+' cid='+read.sourceId+
     ' questions='+questions.length+' backup='+backup);
 }
 console.log('ROCKET_GIRL_V2_RESULT '+JSON.stringify({changed,mode}));
 return {changed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main();

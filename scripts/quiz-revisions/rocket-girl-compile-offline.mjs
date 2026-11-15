/**
 * Create a SINGLE offline staging package from editor-authored Rocket Girl V2
 * questions. R2 is READ-ONLY here. No publication is allowed until every one
 * of the 252 official episodes has five source-verified reviewed questions.
 */
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {checkQuiz} from '../../automation/littlefox-daily/core.mjs';

const SERIES='little-fox-rocket-girl-fs0065';
const REMOTE='https://pub-bf9dac62ea094bcdae4eca9e743f9b61.r2.dev/data/'+SERIES+'/';
const BANK_DIR=new URL('./',import.meta.url);
const FILE_1=new URL('./rocket-girl-2026-11-15-reviewed.json',import.meta.url);
const MISSING_FIVE='A published Rocket Girl episode requires exactly five source-grounded questions.';
const sha=x=>createHash('sha256').update(x).digest('hex');
const assert=(cond,message)=>{if(!cond)throw Error(message);};
const named=async(name)=>{
 const response=await fetch(REMOTE+name+'?v2-offline-review='+Date.now(),
   {cache:'no-store',signal:AbortSignal.timeout(30000),headers:{Accept:'application/json'}});
 if(!response.ok)throw Error(name+' public R2 GET HTTP '+response.status);
 return response.json();
};
export function makeQuestion(q,episode,read,n){
  const paraId=q.evidenceParagraphId??q.evidence?.paragraphIds?.[0];
  const paragraph=read.paragraphs.find(p=>p.id===paraId);
  assert(paragraph?.text?.length>0,'Episode '+episode.episodeId+' Q'+n+' source paragraph missing: '+paraId);
  let answer=q.answer;
  const options=Array.isArray(q.options)?q.options.map((op,i)=>
    typeof op==='string'?{key:'ABCD'[i],text:op}:{key:op.key,text:op.text}):[];
  const out={
    id:'q'+n,type:'single-choice',category:'reading',question:q.question,
    options,answer,explanation:q.explanation,source:'editorial-official-read',
    evidence:{paragraphIds:[paraId],quote:paragraph.text,sourceContentId:read.sourceId}
  };
  return out;
}
export function verifyLesson(lesson,episode,read){
  const id=Number(lesson.episodeId);
  assert(episode&&episode.status==='published','Episode not published: '+id);
  assert(lesson.title===episode.title,'Wrong quiz title for episode '+id);
  assert(lesson.sourceContentId===episode.sourceContentId,'Wrong lesson CID '+id);
  assert(read?.sourceId===episode.sourceContentId,'R2 Read and episode CID mismatch '+id);
  assert(['official-text','official-public-read'].includes(read?.source),'Non-official Read '+id);
  assert(Array.isArray(read.paragraphs)&&read.paragraphs.length>=5,'Insufficient Read paragraphs '+id);
  assert(lesson.questions?.length===5,MISSING_FIVE+' Episode '+id);
  const questions=lesson.questions.map((q,n)=>makeQuestion(q,episode,read,n+1));
  const errors=checkQuiz({questions},read.paragraphs,read.sourceId);
  assert(errors.length===0,'Episode '+id+' automatic audit failed: '+errors.join('; '));
  const n=read.paragraphs.length,third=Math.max(1,Math.floor(n/3)),sections=new Set();
  const seen=new Set(),keys=new Set();
  for(const [i,q] of questions.entries()){
    assert(q.question?.endsWith('?')&&!/which is not true|fill in the blank|complete the sentence|which word appears|which word is in/i.test(q.question),
      'Generic question '+id+'-'+i);
    assert(q.explanation&&q.explanation.length>=18&&/[\u3400-\u9fff]/u.test(q.explanation),
      'Non-specific Chinese explanation '+id+'-'+i);
    const key=q.question.trim().toLowerCase();
    assert(!seen.has(key),'Duplicated prompt within episode '+id);seen.add(key);
    const index=read.paragraphs.findIndex(p=>p.id===q.evidence.paragraphIds[0]);
    sections.add(Math.min(2,Math.floor(index/third)));
    keys.add(q.answer);
  }
  assert(keys.size>=3,'Unbalanced correct options '+id);
  assert(sections.size===3,'Questions must cover beginning, middle, and end '+id);
  return {episodeId:id,title:episode.title+' Quiz',styleReference:'yqxyy-v2-story-comprehension',
    revision:'offline-editorial-draft-2026-11',questions};
}
async function readBanks(){
  const files=(await readdir(BANK_DIR)).filter(name=>/^rocket-girl-reviewed-\d{3}-\d{3}\.json$/.test(name)).sort();
  const banks=[JSON.parse(await readFile(FILE_1,'utf8'))];
  for(const file of files)banks.push(JSON.parse(await readFile(new URL(file,BANK_DIR),'utf8')));
  return {files:[FILE_1.pathname,...files],banks};
}
export async function compile({episodes,reads,sourceQuiz,banks}){
 assert(Array.isArray(episodes)&&episodes.length===252,'Not exactly 252 original episodes');
 assert(reads&&Object.keys(reads).length===252,'Not exactly 252 official Read lessons');
 assert(sourceQuiz&&typeof sourceQuiz==='object','Original Quiz missing');
 assert(Object.keys(sourceQuiz).length===252,'Source Quiz entries count changed');
 const mapped=new Map(),originTitles=new Set();
 for(const bank of banks){
   assert(bank.seriesId===SERIES&&Number(bank.level)===4,'Wrong level or series');
   for(const draft of bank.lessons){
     const num=Number(draft.episodeId);
     assert(Number.isInteger(num)&&num>=1&&num<=252,'Episode outside Rocket Girl series');
     assert(!mapped.has(num),'Duplicated offline draft for episode '+num);
     mapped.set(num,draft);
   }
 }
 const newQuiz={},coverage=[],answerCounts={A:0,B:0,C:0,D:0};
 for(const [id,draft] of [...mapped].sort((a,b)=>a[0]-b[0])){
   const ep=episodes.find(x=>Number(x.episodeId)===id);
   const revised=verifyLesson(draft,ep,reads[String(id)]);
   newQuiz[String(id)]=revised;
   for(const q of revised.questions)answerCounts[q.answer]++;
   coverage.push({episodeId:id,title:ep.title,sourceContentId:ep.sourceContentId,
     questions:revised.questions.length,verifiedWithOfficialRead:true});
 }
 const pending=episodes.map(ep=>Number(ep.episodeId)).filter(x=>!mapped.has(x));
 const full=coverage.length===252&&pending.length===0;
 const report={seriesId:SERIES,level:4,expectedEpisodes:252,
   reviewedEpisodes:coverage.length,reviewedQuestions:coverage.length*5,
   pendingEpisodes:pending,complete:full,
   releaseReady:full,originalQuizChecksum:sha(JSON.stringify(sourceQuiz)),
   publishedToR2:false,status:full?'FULLY_STAGED_NOT_PUBLISHED':'PARTIAL_OFFLINE_DRAFT_NOT_FOR_PUBLICATION',
   answerCounts,coverage};
 return {replacements:newQuiz,report};
}
export async function main(){
 const [episodes,reads,sourceQuiz,{files,banks}]=await Promise.all([
   named('episodes.json'),named('reading-lessons.json'),named('quiz.json'),readBanks()]);
 const {replacements,report}=await compile({episodes,reads,sourceQuiz,banks});
 const dest=resolve(process.env.OUTPUT_DIR||'out/rocketgirl-v2-offline');
 await mkdir(dest,{recursive:true});
 await Promise.all([
   writeFile(join(dest,'reviewed-replacements.json'),JSON.stringify(replacements,null,2)+'\n'),
   writeFile(join(dest,'review-manifest.json'),JSON.stringify({...report,
     generatedAt:new Date().toISOString(),inputBankFiles:files},null,2)+'\n'),
   writeFile(join(dest,'README.txt'),
     'Rocket Girl Level 4 (252 episodes): source-checked offline V2 Quiz drafts.\n'+
     'This archive is NOT an R2 replacement and must NOT be uploaded as quiz.json.\n'+
     'Only reviewed episodes are included; pending episodes remain absent.\n'+
     'R2 production data has not been touched. A single full replacement is allowed\n'+
     'only after review-manifest.json has releaseReady:true and 252 reviewed episodes.\n'),
 ]);
 console.log('ROCKET_GIRL_OFFLINE_PACKAGE '+JSON.stringify({
   reviewedEpisodes:report.reviewedEpisodes,reviewedQuestions:report.reviewedQuestions,
   pending:report.pendingEpisodes.length,full:report.complete,
   stagedFolder:dest,answerCounts:report.answerCounts,sourceFiles:files.length}));
 return report;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 await main();

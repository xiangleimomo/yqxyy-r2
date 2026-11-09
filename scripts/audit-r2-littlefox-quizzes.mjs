import { AwsClient } from 'aws4fetch';
import { createHash } from 'node:crypto';

const required=['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
for(const k of required) if(!process.env[k]) throw Error('Missing '+k);
const client = new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
const endpoint=process.env.R2_ENDPOINT.replace(/\/+$/,'');
const bucket=process.env.R2_BUCKET;
const objectUrl=key=>endpoint+'/'+encodeURIComponent(bucket)+'/'+key.split('/').map(encodeURIComponent).join('/');
async function getJson(key){
  try {
    const resp=await client.fetch(objectUrl(key),{method:'GET',signal:AbortSignal.timeout(25000)});
    if(resp.status===404) return {missing:true,key};
    if(!resp.ok) return {error:'HTTP '+resp.status,key};
    return {data:JSON.parse(await resp.text()),key};
  }catch(e){return {error:e.message,key};}
}
const listing=await getJson('data/series-list.json');
if(!Array.isArray(listing.data)) throw Error('R2 series-list.json unavailable');
const series=listing.data.filter(s=>s.seriesId&&(/^(little-fox-|three-kingdoms$|journey-to-the-west$)/.test(s.seriesId)));
const bad=/which word appears in this lesson|which word is in (the |this )?(story|lesson)|complete the sentence|fill in the blank|which word (do you|did you) (hear|see)|according to the vocabulary|which word appears|what is the (chinese|english) meaning|what does .+ mean in (chinese|english)/i;
const summary={
 auditedSeries:series.length, auditedLessons:0, quizEntries:0, allQuestions:0,
 perfect5:0, countsBelow5:0, countsAbove5:0, missingQuiz:0,
 generatedWordQuestions:0, generatedWordLessons:0,
 wrongOptionCount:0, duplicateOptions:0, answerProblems:0, genericExplanations:0,
 duplicateQuestionText:0, genericQuizLessons:0, evidenceCount:0,
 readSourceMismatch:0, sourceMissing:0,
 cleanSeries:0, flaggedSeries:0, errors:0
};
const report=[];
const knownGood=new Set(['editorial-public-read','reviewed','human-reviewed']);
let concurrency=10,index=0;
async function worker(){
 while(index<series.length){
  const row=series[index++];
  const id=row.seriesId;
  const root='data/'+id+'/';
  const [epRes, quizRes,readRes]=await Promise.all([getJson(root+'episodes.json'),getJson(root+'quiz.json'),getJson(root+'reading-lessons.json')]);
  const errs=[epRes,quizRes,readRes].filter(x=>x.error).map(x=>x.key+': '+x.error);
  if(errs.length) summary.errors+=errs.length;
  const eps=Array.isArray(epRes.data)?epRes.data:[];
  const quizzes=quizRes.data||{};
  const reads=readRes.data||{};
  const stat={id,title:row.title,episodes:eps.length,quizEntries:Object.keys(quizzes).length,questions:0,
   badCount:0,badCount3:0,genericWordLessons:0,generatedWordQuestions:0,questionCountError:0,optionError:0,answerError:0,
   duplicateQuestions:0,genericExplanation:0,sourceMismatch:0,goodEvidence:0,withoutReading:0,invalidIds:[],missingQuizIds:[],sampleBad:[],error:errs.length?errs.join(' | '):undefined};
  summary.auditedLessons+=eps.length;summary.quizEntries+=Object.keys(quizzes).length;
  for(const ep of eps){
    const k=String(ep.episodeId);
    const q=quizzes[k], rd=reads[k];
    if(!q || !Array.isArray(q.questions) || q.questions.length===0){
      summary.missingQuiz++;
      stat.missingQuizIds.push(k);
      continue;
    }
    if(!rd || !Array.isArray(rd.paragraphs) || rd.paragraphs.length<1){
      stat.withoutReading++;
      summary.sourceMissing++;
    }else if(ep.sourceContentId && rd.sourceId && ep.sourceContentId!==rd.sourceId){
      stat.sourceMismatch++;
      summary.readSourceMismatch++;
    }
    stat.questions+=q.questions.length; summary.allQuestions+=q.questions.length;
    if(q.questions.length===5) summary.perfect5++;
    if(q.questions.length<5){summary.countsBelow5++;stat.badCount++;stat.badCount3++;}
    if(q.questions.length>5){summary.countsAbove5++;stat.badCount++;}
    const names=new Set();
    let generatedCount=0;
    for(const [n,question] of q.questions.entries()){
      const prompt=String(question.question||'');
      const options=Array.isArray(question.options)?question.options:[];
      const generic=bad.test(prompt)||question.source==='generated-from-reading'||question.source==='generated-from-public-read';
      if(generic){
        summary.generatedWordQuestions++;
        stat.generatedWordQuestions++;
        generatedCount++;
      }
      if(options.length!==4){summary.wrongOptionCount++;stat.optionError++;}
      const textOptions=options.map(o=>String(o?.text||o||'').trim().toLowerCase());
      if(new Set(textOptions).size!==options.length){summary.duplicateOptions++;stat.optionError++;}
      if(options.filter(o=>o.key===question.answer).length!==1){summary.answerProblems++;stat.answerError++;}
      const norm=prompt.trim().toLowerCase();
      if(names.has(norm)){summary.duplicateQuestionText++;stat.duplicateQuestions++;}
      names.add(norm);
      if(!question.explanation||/请根据本集阅读内容作答|refer to the reading|please read|根据故事内容作答|please answer according/i.test(question.explanation)){
        summary.genericExplanations++;stat.genericExplanation++;
      }
      if(question.evidence?.paragraphIds?.length && question.evidence.quote){
        summary.evidenceCount++;stat.goodEvidence++;
      }
      if(generic && stat.sampleBad.length<2) stat.sampleBad.push({ep:ep.episodeId,q:n+1,question:prompt,options:options.length,source:question.source});
    }
    if(generatedCount){summary.generatedWordLessons++;stat.genericWordLessons++;}
  }
  if(stat.missingQuizIds.length||stat.badCount||stat.generatedWordQuestions||stat.optionError||stat.answerError||stat.duplicateQuestions||stat.genericExplanation||stat.sourceMismatch||stat.withoutReading||stat.error){
    summary.flaggedSeries++;report.push(stat);
  }else summary.cleanSeries++;
 }
}
await Promise.all(Array.from({length:concurrency},worker));
report.sort((a,b)=>b.generatedWordQuestions-a.generatedWordQuestions||b.badCount-a.badCount||b.episodes-a.episodes);
console.log('=== QUIZ_AUDIT_SUMMARY '+JSON.stringify(summary));
console.log('=== QUIZ_AUDIT_AFFECTED_SERIES '+report.length);
for(const row of report)console.log('AUDIT_SERIES '+JSON.stringify(row));
console.log('=== QUIZ_AUDIT_END');

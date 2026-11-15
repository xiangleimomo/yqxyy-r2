import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyLesson,compile} from '../scripts/quiz-revisions/rocket-girl-compile-offline.mjs';
test('offline assembler uses actual episode source, not guessed quote',()=>{
 const ep={episodeId:2,title:'Test Episode',sourceContentId:'C111',status:'published'};
 const read={sourceId:'C111',source:'official-text',paragraphs:Array.from({length:15},(_,i)=>({id:'p'+(i+1),text:'Verified original paragraph '+(i+1)+', description of an event.'}))};
 const bank={episodeId:2,title:'Test Episode',sourceContentId:'C111',questions:[1,4,7,11,15].map((p,i)=>({
   evidenceParagraphId:'p'+p,question:'What happened in event '+(i+1)+'?',
   options:['Event '+i,'A different event','An unrelated event','No event'].map(x=>x+' '+i),
   answer:'ABCD'[i%4],explanation:'按照本集原文第'+p+'段，这件事情在故事中已经明确发生，因此其他选项不符合事实。'
 }))};
 const result=verifyLesson(bank,ep,read);
 assert.equal(result.questions[0].evidence.quote,read.paragraphs[0].text);
 assert.equal(result.questions[4].evidence.sourceContentId,'C111');
 assert.equal(result.questions.length,5);
 assert.throws(()=>verifyLesson({...bank,title:'Wrong Show'},ep,read),/Wrong quiz title/);
 assert.throws(()=>verifyLesson({...bank,sourceContentId:'Wrong'},ep,read),/Wrong lesson CID/);
 assert.throws(()=>verifyLesson({...bank,questions:bank.questions.slice(0,4)},ep,read),/exactly five/);
});
test('compiler will not claim a complete bank when drafts are missing',async()=>{
 const episodes=Array.from({length:252},(_,i)=>({
   episodeId:i+1,title:'Story '+(i+1),sourceContentId:'C'+(i+1),status:'published'}));
 const reads=Object.fromEntries(episodes.map(ep=>[String(ep.episodeId),{
   sourceId:ep.sourceContentId,source:'official-text',
   paragraphs:Array.from({length:15},(_,i)=>({id:'p'+(i+1),text:'Paragraph '+(i+1)+' with an event described.'}))
 }]));
 const sourceQuiz=Object.fromEntries(episodes.map(ep=>[String(ep.episodeId),{questions:[]}]));
 const out=await compile({episodes,reads,sourceQuiz,banks:[{seriesId:'little-fox-rocket-girl-fs0065',level:4,lessons:[]}]});
 assert.equal(out.report.reviewedEpisodes,0);
 assert.equal(out.report.pendingEpisodes.length,252);
 assert.equal(out.report.releaseReady,false);
 assert.equal(Object.keys(out.replacements).length,0);
});

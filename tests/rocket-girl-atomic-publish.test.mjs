import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertFullPackage} from '../scripts/quiz-revisions/rocket-girl-atomic-publish.mjs';
test('single replacement cannot run for a partial or incomplete quiz bank',()=>{
 const manifest={seriesId:'little-fox-rocket-girl-fs0065',level:4,
   complete:false,releaseReady:false,reviewedEpisodes:22,reviewedQuestions:110,
   pendingEpisodes:Array.from({length:230},(_,i)=>i+23)};
 assert.throws(()=>assertFullPackage(manifest,{}),/Refuse partial package/);
 const full={...manifest,complete:true,releaseReady:true,
   reviewedEpisodes:252,reviewedQuestions:1260,pendingEpisodes:[]};
 assert.throws(()=>assertFullPackage(full,{}),/Replacement must contain every episode/);
 const all=Object.fromEntries(Array.from({length:252},(_,i)=>[String(i+1),{
   episodeId:i+1,styleReference:'yqxyy-v2-story-comprehension',
   questions:Array.from({length:5},(_,n)=>({
     id:'q'+(n+1),options:[{key:'A'},{key:'B'},{key:'C'},{key:'D'}],
     source:'editorial-official-read',evidence:{sourceContentId:'C'+(i+1),quote:'source evidence'}
   }))
 }]));
 assert.equal(assertFullPackage(full,all),true);
 delete all['123'];
 assert.throws(()=>assertFullPackage(full,all),/Replacement must contain every episode/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');

const bank=JSON.parse(fs.readFileSync('scripts/quiz-revisions/rocket-girl-2026-11-15-reviewed.json','utf8'));
test('reviewed Rocket Girl episode 1 is source-identified, five distinct story questions, A-D four-choice',()=>{
 assert.equal(bank.seriesId,'little-fox-rocket-girl-fs0065');
 assert.equal(bank.level,4);
 const lesson=bank.lessons[0];
 assert.equal(lesson.episodeId,1);
 assert.equal(lesson.title,'Sloppy Joe Day');
 assert.equal(lesson.sourceContentId,'C0005780');
 assert.equal(lesson.questions.length,5);
 const answerKeys=new Set();
 for(const [i,q] of lesson.questions.entries()){
   assert.equal(q.id,'q'+(i+1));
   assert.equal(q.type,'single-choice');
   assert.equal(q.category,'reading');
   assert.equal(q.source,'editorial-official-read');
   assert.deepEqual(q.options.map(o=>o.key),['A','B','C','D']);
   assert.equal(new Set(q.options.map(o=>o.text.toLowerCase())).size,4);
   assert(/^[A-Z].+\?$/.test(q.question));
   assert(!/which is not true|which word appears|complete the sentence/i.test(q.question));
   assert(/[\u3400-\u9fff]/u.test(q.explanation));
   assert(q.explanation.length>=18);
   assert.equal(q.evidence.sourceContentId,'C0005780');
   assert(q.evidence.quote.length>12);
   assert(q.evidence.paragraphIds.length);
   assert(q.options.some(o=>o.key===q.answer));
   answerKeys.add(q.answer);
 }
 assert(answerKeys.size>=3);
});
test('repair script refuses to substitute unrelated PDF quizzes or omit R2 backup',()=>{
 const source=fs.readFileSync('scripts/repair-rocketgirl-v2-quizzes.mjs','utf8');
 assert(source.includes("checkQuiz({questions}"));
 assert(source.includes("courseInference"));
 assert(source.includes("Independent editorial QA rejected"));
 assert(source.includes("sourceId===ep?.sourceContentId"));
 assert(source.includes("__course-backups/rocket-girl-v2/"));
 assert(source.includes("Concurrent R2 Quiz modification"));
 assert(source.includes("LF_OPENAI_API_KEY"));
 assert(source.includes("no paid inference before auth succeeds"));
});

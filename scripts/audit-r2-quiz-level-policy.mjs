import {AwsClient} from 'aws4fetch';

const required=['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
for(const key of required) if(!process.env[key])throw Error('Missing '+key);
const client=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
const endpoint=process.env.R2_ENDPOINT.replace(/\/+$/,'');
const baseKey=key=>endpoint+'/'+encodeURIComponent(process.env.R2_BUCKET)+'/'+key.split('/').map(encodeURIComponent).join('/');
async function get(key){
 try{
  const r=await client.fetch(baseKey(key),{method:'GET',signal:AbortSignal.timeout(45000)});
  if(r.status===404)return {missing:true};
  if(!r.ok)return {error:'HTTP '+r.status};
  return {value:JSON.parse(await r.text())};
 }catch(e){return {error:String(e.message||e)};}
}
const index=await get('data/series-list.json');
if(!Array.isArray(index.value))throw Error('R2 data/series-list.json missing');
const rows=index.value.filter(x=>x.seriesId && /^(little-fox-|three-kingdoms$|journey-to-the-west$)/.test(x.seriesId));
const banned=/which word appears|which word is in (?:the |this )?(?:story|lesson)|complete the sentence|fill in the blank|what (?:is|does) (?:the )?.*? mean (?:in|here)|which word did you (?:hear|see)|___+/i;
const genericExplanation=/^(?:根据本集故事内容选择正确答案。?|请根据本集阅读内容作答。?|根据故事内容作答。?|Refer to the reading\.?)$/i;
const tally=()=>({series:0,episodes:0,preExistingQuizzes:0,missingQuizzes:0,ignoredMissing0to2:0,alreadyFullySourceBound:0,structurallyNoncompliantLessons:0,editorialReviewLessons:0,tooFewQuestions:0,tooManyQuestions:0,notFourOptionQuestions:0,bannedQuestions:0,explanationProblems:0,answerProblems:0,evidenceProblems:0,allSameAnswerLessons:0,sourceIdProblems:0,otherErrors:0});
const total=tally();
const levels=Object.fromEntries(Array.from({length:10},(_,i)=>[i,tally()]));
const results=[];
let next=0;
async function work(){
 while(true){
  const k=next++;if(k>=rows.length)return;
  const s=rows[k],lv=Number(s.level),stat=tally(),id=s.seriesId;
  const base='data/'+id+'/';
  const [epR,quizR,readR]=await Promise.all([get(base+'episodes.json'),get(base+'quiz.json'),get(base+'reading-lessons.json')]);
  stat.series=1;
  const eps=Array.isArray(epR.value)?epR.value:[];
  const quizzes=quizR.value&&typeof quizR.value==='object'?quizR.value:{};
  const reads=readR.value&&typeof readR.value==='object'?readR.value:{};
  stat.episodes=eps.length;
  if(epR.error||quizR.error||readR.error)stat.otherErrors++;
  const invalid=[],needsReview=[];
  for(const ep of eps){
   const n=String(ep.episodeId),q=quizzes[n],read=reads[n];
   if(!q || !Array.isArray(q.questions) ||q.questions.length===0){
     stat.missingQuizzes++;
     if(lv<=2)stat.ignoredMissing0to2++;
     continue;
   }
   stat.preExistingQuizzes++;
   let bad=false,review=false;
   if(q.questions.length<5){stat.tooFewQuestions++;bad=true;}
   if(q.questions.length>5){stat.tooManyQuestions++;bad=true;}
   const ans=[];
   const seen=new Set();
   for(const question of q.questions){
    const options=Array.isArray(question.options)?question.options:[];
    const prompt=String(question.question||'');
    if(options.length!==4 || options.some((o,i)=>o.key!==('ABCD'[i])) ||
       new Set(options.map(x=>String(x.text||'').trim().toLowerCase())).size!==options.length) {
      stat.notFourOptionQuestions++;
      bad=true;
    }
    if(banned.test(prompt)||question.source==='generated-from-reading'||question.source==='generated-from-public-read'){
      stat.bannedQuestions++;bad=true;
    }
    if(!question.explanation||genericExplanation.test(String(question.explanation).trim())||
       !/[\u3400-\u9fff]/u.test(question.explanation)) {
      stat.explanationProblems++;bad=true;
    }
    const answers=options.filter(o=>o.key===question.answer);
    if(answers.length!==1){stat.answerProblems++;bad=true;}
    ans.push(question.answer);
    if(seen.has(prompt.trim().toLowerCase()))bad=true;
    seen.add(prompt.trim().toLowerCase());
    const evidence=question.evidence;
    const quote=String(evidence?.quote||'');
    if(!read?.paragraphs?.length||!evidence?.paragraphIds?.length||
       evidence.sourceContentId!==read.sourceId ||
       !read.paragraphs.some(p=>evidence.paragraphIds.includes(p.id)&&p.text===quote)){
      stat.evidenceProblems++;
      review=true;
    }
   }
   if(ans.length>=5&&ans.every(x=>x===ans[0])){stat.allSameAnswerLessons++;review=true;}
   if(ep.sourceContentId&&read?.sourceId&&ep.sourceContentId!==read.sourceId){stat.sourceIdProblems++;review=true;}
   if(bad){stat.structurallyNoncompliantLessons++;invalid.push(Number(n));}
   else if(review){stat.editorialReviewLessons++;needsReview.push(Number(n));}
   else stat.alreadyFullySourceBound++;
  }
  const dst=levels[lv]||levels[9];
  for(const name of Object.keys(stat)){dst[name]+=stat[name];total[name]+=stat[name];}
  const a={seriesId:id,level:lv,title:s.title,episodes:stat.episodes,hasQuiz:stat.preExistingQuizzes,structural:stat.structurallyNoncompliantLessons,needsEditorial:stat.editorialReviewLessons,compliant:stat.alreadyFullySourceBound,ignoredAbsent0to2:stat.ignoredMissing0to2,missingLevel3Plus:lv>=3?stat.missingQuizzes:0,sourceIdProblems:stat.sourceIdProblems,questionsNotFour:stat.notFourOptionQuestions,bannedQuestions:stat.bannedQuestions,evidenceProblems:stat.evidenceProblems,firstInvalidEpisodes:invalid.slice(0,12),firstReviewEpisodes:needsReview.slice(0,12),errorCount:stat.otherErrors};
  results.push(a);
 }
}
await Promise.all(Array.from({length:10},work));
results.sort((a,b)=>b.structural-a.structural||b.needsEditorial-a.needsEditorial);
console.log('LEVEL_POLICY_AUDIT_SUMMARY '+JSON.stringify({date:'2026-11-10',rule:'0-2 missing quiz exempt; only preexisting defective quizzes counted as edits',total,levels}));
console.log('LEVEL_POLICY_AUDIT_QUEUED_SERIES '+results.filter(x=>x.structural||x.needsEditorial).length);
for(const s of results)if(s.structural||s.needsEditorial)console.log('LEVEL_POLICY_SERIES '+JSON.stringify(s));
console.log('LEVEL_POLICY_AUDIT_END');

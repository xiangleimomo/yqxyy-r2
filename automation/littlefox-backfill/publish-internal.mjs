import fs from 'node:fs/promises';
import {makeR2,readPlayer,isEpisodeMatch,verifyPlaylist,parseCaptions,textParagraphs,ORIGINAL_TEXT,BOOK,CAPTION,asVtt,checkQuiz,catalogSeriesId,officialCatalogEntries} from '../littlefox-daily/core.mjs';

const root='automation/littlefox-backfill/';
const req=JSON.parse(await fs.readFile(root+'internal-publish-request.json','utf8'));
if(req.mode!=='historical_supplemental_v2'||typeof req.publish!=='boolean'||!Array.isArray(req.contentIds)||req.contentIds.length!==16||new Set(req.contentIds).size!==16)throw Error('Invalid 16-episode supplemental V2 request');
const packs=await Promise.all([1,2,3,4].map(i=>fs.readFile(root+'specs/batch-'+i+'.json','utf8').then(JSON.parse)));
const specs=new Map(packs.flat().map(x=>[x.id,x]));
if(specs.size!==16||req.contentIds.some(id=>!specs.has(id)))throw Error('Missing or duplicate editorial lesson specification');
const store=await makeR2(process.env,fetch),report={checkedAt:new Date().toISOString(),mode:req.mode,publish:req.publish,items:[],summary:{requested:16,ready:0,published:0,already:0,blocked:0},status:'checking'};
const runKey='historical-supplemental-'+new Date().toISOString().replace(/[:.]/g,'-');
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Official HTTP '+r.status+' '+url);return r;};
const read=async key=>{const raw=await store.get(key);if(raw===null)throw Error('Missing R2 '+key);return JSON.parse(raw);};
const catalogCache=new Map();
async function validateCatalog(s){
 if(!catalogCache.has(s.seriesId)){
  const id=catalogSeriesId(s.seriesId);if(!id)throw Error('Missing official series catalog ID');
  const segment=id.startsWith('SRV')?'songs':'readers';
  const response=await get('https://www.littlefox.com/en/'+segment+'/contents_list_v2/'+id);
  const entries=officialCatalogEntries(await response.text());
  catalogCache.set(s.seriesId,entries);
 }
 const entry=catalogCache.get(s.seriesId)[s.officialEpisodeNumber-1];
 if(!entry||entry.id!==s.id)throw Error('Official C-ID/catalog episode mismatch for '+s.id+' #'+s.officialEpisodeNumber);
}
function vocabEntry(word,meaning,paras,id){
 const matched=paras.find(p=>p.text.toLowerCase().includes(word.toLowerCase()));
 if(!matched)return null;
 const fragments=matched.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[matched.text];
 const example=fragments.find(x=>x.toLowerCase().includes(word.toLowerCase()))?.trim()||matched.text.slice(0,220);
 return {word,meaningZh:meaning,example:example.slice(0,300),exampleZh:'本集原文中“'+word+'”的含义是“'+meaning+'”，可结合本句理解。',paragraphIds:[matched.id],sourceContentId:id,source:'official-text-evidence'};
}
function sectionize(sections,paras){
 const result=[];let start=1;
 for(let i=0;i<sections.length;i++){
  const [last,title,titleZh,summaryZh]=sections[i];
  if(!Number.isInteger(last)||last<start||last>paras.length)throw Error('Invalid editorial story section boundary');
  result.push({id:'s'+(i+1),title,titleZh,paragraphIds:paras.slice(start-1,last).map(p=>p.id),summaryZh});
  start=last+1;
 }
 if(start!==paras.length+1||result.length<2)throw Error('Story sections must cover each official paragraph');
 return result;
}
async function processLesson(s){
 const line={contentId:s.id,seriesId:s.seriesId,officialEpisodeNumber:s.officialEpisodeNumber,status:'checking',stages:[]};
 const step=(name,values={})=>line.stages.push({name,...values});
 try{
  if(!/^C\d{7}$/.test(s.id)||!/^little-fox-[a-z0-9-]+$/.test(s.seriesId)||!Number.isInteger(s.officialEpisodeNumber)||s.officialEpisodeNumber<1)throw Error('Invalid source target');
  await validateCatalog(s);
  step('official_catalog_id_verified');
  const base='data/'+s.seriesId+'/',internalId=100000+s.officialEpisodeNumber,subKey=base+'historical-episodes.json';
  const [episodes,historical,readings,vocabularyIndex,quizzes,series]=await Promise.all([
    read(base+'episodes.json'),
    store.get(subKey).then(v=>v===null?[]:JSON.parse(v)),
    read(base+'reading-lessons.json'),read(base+'vocabulary.json'),read(base+'quiz.json'),read(base+'series.json')
  ]);
  if(!Array.isArray(episodes)||!Array.isArray(historical))throw Error('R2 episode index malformed');
  if(episodes.some(e=>Number(e.episodeId)===internalId || (e.sourceContentId||e.storyBook?.contentId)===s.id))throw Error('Official missing C-ID unexpectedly exists in normal index; refusing overwrite');
  const already=historical.find(e=>Number(e.episodeId)===internalId || e.sourceContentId===s.id);
  if(already){
    if(Number(already.episodeId)!==internalId||already.sourceContentId!==s.id)throw Error('Supplemental ID/C-ID collision');
    line.status='already_published';step('idempotent_no_change');report.summary.already++;return line;
  }
  const [player,english,xmlResponse,pdf]=await Promise.all([
    readPlayer(s.id,fetch),
    get(ORIGINAL_TEXT(s.id)),
    get(CAPTION(s.id)),
    fetch(BOOK(s.id),{method:'HEAD',signal:AbortSignal.timeout(30000)})
  ]);
  if(!isEpisodeMatch(player.item.cont_title,s.title))throw Error('Official title mismatch '+player.item.cont_title+' vs '+s.title);
  if(!pdf.ok)throw Error('Official Storybook HTTP '+pdf.status);
  const video=await verifyPlaylist(player.video,fetch);
  const paragraphs=textParagraphs(await english.text()),xml=await xmlResponse.text(),cues=parseCaptions(xml);
  if(paragraphs.length<6||cues.length<5)throw Error('Insufficient official English Text or subtitle cues');
  if(s.sections.at(-1)?.[0]!==paragraphs.length)throw Error('Editorial sections do not match current official paragraph count');
  step('official_video_text_caption_pdf_verified',{paragraphs:paragraphs.length,cues:cues.length,pdf:pdf.status,host:new URL(video).hostname});
  const lessonSections=sectionize(s.sections,paragraphs);
  const level=Number(series.level);if(!Number.isFinite(level))throw Error('R2 series level unavailable');
  const words=[];
  for(const candidate of s.words){
   const [word,meaning]=String(candidate).split('|');
   if(!word||!meaning)throw Error('Invalid editorial vocabulary entry');
   const v=vocabEntry(word,meaning,paragraphs,s.id);
   if(v&&words.every(x=>x.word.toLowerCase()!==word.toLowerCase()))words.push(v);
   if(words.length>=8)break;
  }
  if(words.length<6)throw Error('Fewer than six independently evidenced vocabulary entries: '+words.map(w=>w.word).join(','));
  let checkedQuestions=null;
  if(level>=3){
   if(s.questions?.length!==5)throw Error('Level 3+ requires five manually authored V2 story questions');
   checkedQuestions=s.questions.map((q,i)=>{
    const pid=q.evidence?.paragraphIds?.[0],evidence=paragraphs.find(x=>x.id===pid);
    if(!evidence)throw Error('Missing question evidence paragraph at Q'+(i+1));
    return {...q,id:'q'+(i+1),type:'single-choice',category:'reading',evidence:{sourceContentId:s.id,paragraphIds:[pid],quote:evidence.text}};
   });
   const errors=checkQuiz({questions:checkedQuestions},paragraphs,s.id);
   if(errors.length)throw Error('V2 Quiz validation: '+errors.join('; '));
  }else if(s.questions?.length)throw Error('Level <3 cannot have story Quiz');
  step('manual_editorial_v2_validated',{level,words:words.length,questions:checkedQuestions?.length||0,sections:lessonSections.length});
  const suffix=String(internalId).padStart(3,'0');
  const ep={episodeId:internalId,officialEpisodeNumber:s.officialEpisodeNumber,title:s.title,titleZh:'',releaseDate:'',status:'published',historicalBackfill:true,
    sourceType:'hls',video:{source:'hls',hlsUrl:video},modules:{watch:true,read:true,words:true,vocabulary:true,phrases:false,grammar:false,quiz:!!checkedQuestions,review:false},
    unlockRequiresQuiz:false,sourceContentId:s.id,sourceUrls:{video,storybook:BOOK(s.id),text:ORIGINAL_TEXT(s.id),caption:CAPTION(s.id)},
    storyBook:{contentId:s.id,bookId:'littlefox-'+s.id.toLowerCase(),pdfUrl:BOOK(s.id),availability:'pdf'}};
  const changes={
    [base+'reading-lessons.json']:JSON.stringify({...readings,[internalId]:{episodeId:internalId,officialEpisodeNumber:s.officialEpisodeNumber,title:s.title,source:'official-text',sourceId:s.id,paragraphs,sections:lessonSections}},null,2)+'\n',
    [base+'vocabulary.json']:JSON.stringify({...vocabularyIndex,[internalId]:words},null,2)+'\n',
    [base+'subtitles/'+suffix+'.vtt']:asVtt(cues),
    [base+'subtitles/'+suffix+'.xml']:xml
  };
  if(checkedQuestions)changes[base+'quiz.json']=JSON.stringify({...quizzes,[internalId]:{episodeId:internalId,title:s.title+' Quiz',styleReference:'yqxyy-v2-story-comprehension',questions:checkedQuestions.map(q=>({...q,source:'editorial-official-read'}))}},null,2)+'\n';
  changes[subKey]=JSON.stringify([...historical,ep].sort((a,b)=>a.officialEpisodeNumber-b.officialEpisodeNumber),null,2)+'\n';
  step('supplemental_patch_prepared',{files:Object.keys(changes).length,legacyEpisodeIndexUntouched:true,internalEpisodeId:internalId});
  if(!req.publish){line.status='dry_run_passed';report.summary.ready++;return line;}
  if(process.env.LF_ALLOW_PUBLISH!=='1')throw Error('Publishing safeguard not enabled');
  // Existing index and all existing keys are left unchanged. Backup before
  // writing; publish the supplemental index last so incomplete lessons stay hidden.
  const order=Object.keys(changes).filter(k=>k!==subKey).concat(subKey);
  for(const key of order){
   const previous=await store.get(key);
   if(key.endsWith('.json')&&previous!==null){
    const backup='data/__littlefox-sync/backups/'+runKey+'/'+key.slice(5);
    await store.put(backup,previous);
    if(await store.get(backup)!==previous)throw Error('R2 backup readback failed '+key);
   }else if(key===subKey&&previous===null){
    // First supplemental index has no previous object.
   }else if(!key.endsWith('.json')&&previous!==null){
    throw Error('Subtitle path collision; refusing overwrite '+key);
   }
   const type=key.endsWith('.vtt')?'text/vtt; charset=utf-8':key.endsWith('.xml')?'application/xml; charset=utf-8':'application/json; charset=utf-8';
   await store.put(key,changes[key],type);
   if(await store.get(key)!==changes[key])throw Error('R2 readback mismatch '+key);
  }
  if(await store.get(base+'episodes.json')===null)throw Error('Lost normal R2 episode index after supplemental write');
  line.status='published_verified';step('supplemental_r2_written_readback',{objects:order.length,internalEpisodeId:internalId,officialEpisodeNumber:s.officialEpisodeNumber});
  report.summary.published++;
 }catch(e){line.status='blocked';line.error=String(e.message||e).slice(0,500);report.summary.blocked++;}
 return line;
}
for(const id of req.contentIds){
 const result=await processLesson(specs.get(id));report.items.push(result);
 console.log('BACKFILL_ITEM '+JSON.stringify({id,status:result.status,error:result.error||null}));
}
report.status=report.summary.blocked?'partial_failure':req.publish?'published_verified':'dry_run_passed';
await fs.writeFile('/tmp/littlefox-internal-supplemental-publish-report.json',JSON.stringify(report,null,2)+'\n');
console.log('BACKFILL_SUMMARY '+JSON.stringify(report.summary));
if(report.summary.blocked)process.exitCode=1;

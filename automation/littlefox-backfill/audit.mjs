import fs from 'node:fs/promises';
import {makeR2,officialCatalogEntries,catalogSeriesId,isEpisodeMatch} from '../littlefox-daily/core.mjs';

const report={schemaVersion:1,mode:'read_only_historical_backfill_audit',checkedAt:new Date().toISOString(),scope:'all Little Fox series represented in R2 series-list.json with a resolvable official FS/SRV catalog',summary:{seriesListed:0,seriesAudited:0,seriesUnresolved:0,officialEpisodes:0,r2Episodes:0,missingEpisodes:0,conflicts:0,incompleteExisting:0},series:[],missingEpisodes:[],conflicts:[],incompleteExisting:[],unresolved:[]};
const store=await makeR2(process.env,fetch);
const raw=await store.get('data/series-list.json');
if(raw===null)throw Error('R2 data/series-list.json not found');
const seriesList=JSON.parse(raw);
if(!Array.isArray(seriesList))throw Error('R2 series-list.json is not an array');
report.summary.seriesListed=seriesList.length;
const target=seriesList.filter(s=>s?.seriesId && (String(s.seriesId).startsWith('little-fox-') || ['three-kingdoms','journey-to-the-west'].includes(s.seriesId)));
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,'').trim();
const getJson=async key=>{const t=await store.get(key);return t===null?null:JSON.parse(t);};
let cursor=0;
async function worker(){
 while(cursor<target.length){
  const row=target[cursor++],seriesId=row.seriesId,title=row.title||row.name||seriesId,level=Number(row.level||row.levelNo||0);
  const catalogId=catalogSeriesId(seriesId);
  if(!catalogId){report.summary.seriesUnresolved++;report.unresolved.push({seriesId,title,reason:'No official FS/SRV catalog ID can be derived'});continue;}
  const section=catalogId.startsWith('SRV')?'songs':'readers';
  const catalogUrl='https://www.littlefox.com/en/'+section+'/contents_list_v2/'+catalogId;
  try{
   const [catalogResponse,episodes,readings,vocabularies,quizzes]=await Promise.all([
    fetch(catalogUrl,{headers:{'User-Agent':'Mozilla/5.0 (compatible; yqxyy-historical-audit/1.0)'},signal:AbortSignal.timeout(30000)}),
    getJson('data/'+seriesId+'/episodes.json'),
    getJson('data/'+seriesId+'/reading-lessons.json'),
    getJson('data/'+seriesId+'/vocabulary.json'),
    getJson('data/'+seriesId+'/quiz.json')
   ]);
   if(!catalogResponse.ok)throw Error('Official catalog HTTP '+catalogResponse.status);
   const catalog=officialCatalogEntries(await catalogResponse.text());
   if(!catalog.length)throw Error('Official catalog parser returned zero C-ID/title rows');
   if(!Array.isArray(episodes))throw Error('R2 episodes.json missing or not an array');
   const epByNo=new Map(),cidSeen=new Map();
   for(const ep of episodes){
    const n=Number(ep.episodeId);if(Number.isInteger(n)&&n>0)epByNo.set(n,ep);
    const cid=ep.sourceContentId||ep.storyBook?.contentId;
    if(cid){if(!cidSeen.has(cid))cidSeen.set(cid,[]);cidSeen.get(cid).push(n);}
   }
   const miss=[],conf=[],incomplete=[];
   for(const official of catalog){
    const n=official.seriesEpisodeNumber,existing=epByNo.get(n);
    if(!existing){miss.push({seriesId,seriesTitle:title,level,episodeNumber:n,contentId:official.id,title:official.title,catalogId,catalogUrl,officialTextUrl:'https://cn.littlefox.com/cn/supplement/org/'+official.id,captionUrl:'https://cdn.littlefox.com/contents/caption/'+official.id+'.xml',storybookUrl:'https://res.littlefox.com/en/supplement/load_pdf/'+official.id});continue;}
    const actualCid=existing.sourceContentId||existing.storyBook?.contentId||null;
    const issues=[];
    if(actualCid!==official.id)issues.push({kind:'content_id_mismatch',expected:official.id,actual:actualCid});
    if(norm(existing.title)!==norm(official.title))issues.push({kind:'title_mismatch',expected:official.title,actual:existing.title||null});
    if(issues.length){conf.push({seriesId,seriesTitle:title,episodeNumber:n,officialContentId:official.id,officialTitle:official.title,issues});continue;}
    const read=readings?.[String(n)],vocab=vocabularies?.[String(n)],quiz=quizzes?.[String(n)];
    const missing=[];
    if(!Array.isArray(read?.paragraphs)||!read.paragraphs.length)missing.push('reading');
    if(!Array.isArray(vocab)||!vocab.length)missing.push('vocabulary');
    if(level>=3&&(!Array.isArray(quiz?.questions)||quiz.questions.length!==5))missing.push('five_question_quiz');
    if(!existing.video?.hlsUrl)missing.push('video_url');
    if(!existing.storyBook?.pdfUrl)missing.push('storybook_url');
    if(missing.length)incomplete.push({seriesId,seriesTitle:title,level,episodeNumber:n,contentId:official.id,title:official.title,missing});
   }
   for(const [cid,nums] of cidSeen)if(nums.length>1)conf.push({seriesId,seriesTitle:title,contentId:cid,issues:[{kind:'duplicate_content_id',episodeNumbers:nums}]});
   report.summary.seriesAudited++;report.summary.officialEpisodes+=catalog.length;report.summary.r2Episodes+=episodes.length;
   report.summary.missingEpisodes+=miss.length;report.summary.conflicts+=conf.length;report.summary.incompleteExisting+=incomplete.length;
   report.missingEpisodes.push(...miss);report.conflicts.push(...conf);report.incompleteExisting.push(...incomplete);
   report.series.push({seriesId,title,level,catalogId,officialEpisodeCount:catalog.length,r2EpisodeCount:episodes.length,missingCount:miss.length,conflictCount:conf.length,incompleteCount:incomplete.length,latestOfficialTitle:catalog.at(-1)?.title||null,latestR2Episode:Math.max(0,...episodes.map(e=>Number(e.episodeId)||0))});
  }catch(e){report.summary.seriesUnresolved++;report.unresolved.push({seriesId,title,catalogId,reason:String(e.message||e).slice(0,300)});}
 }
}
await Promise.all(Array.from({length:4},worker));
report.series.sort((a,b)=>String(a.title||a.seriesId).localeCompare(String(b.title||b.seriesId)));
report.missingEpisodes.sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||a.episodeNumber-b.episodeNumber);
report.conflicts.sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||Number(a.episodeNumber||0)-Number(b.episodeNumber||0));
report.incompleteExisting.sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||a.episodeNumber-b.episodeNumber);
await fs.writeFile('/tmp/littlefox-backfill-audit.json',JSON.stringify(report,null,2)+'\n');
const csv=['seriesId,seriesTitle,level,episodeNumber,contentId,title,catalogId',...report.missingEpisodes.map(x=>[x.seriesId,x.seriesTitle,x.level,x.episodeNumber,x.contentId,x.title,x.catalogId].map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(','))].join('\n')+'\n';
await fs.writeFile('/tmp/littlefox-backfill-missing.csv',csv);
const summary=[
'# Little Fox historical backfill audit (read-only)',
'',
'- Series in R2 list: '+report.summary.seriesListed,
'- Series audited against official catalogs: '+report.summary.seriesAudited,
'- Series unresolved: '+report.summary.seriesUnresolved,
'- Official episodes: '+report.summary.officialEpisodes,
'- Existing R2 episode rows: '+report.summary.r2Episodes,
'- Missing episodes: '+report.summary.missingEpisodes,
'- C-ID/title conflicts: '+report.summary.conflicts,
'- Existing but incomplete lessons: '+report.summary.incompleteExisting,
'',
'This audit performs GET requests only. It does not write to R2, modify daily workflows, or publish lessons.'
].join('\n');
console.log('LITTLEFOX_BACKFILL_AUDIT '+JSON.stringify(report.summary));
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n');

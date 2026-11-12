import fs from 'node:fs/promises';
import {makeR2,officialCatalogEntries,catalogSeriesId,isEpisodeMatch} from '../littlefox-daily/core.mjs';

const report={schemaVersion:1,mode:'read_only_historical_backfill_audit',checkedAt:new Date().toISOString(),scope:'all Little Fox series represented in R2 series-list.json with a resolvable official FS/SRV catalog',summary:{seriesListed:0,seriesAudited:0,seriesUnresolved:0,officialEpisodes:0,r2Episodes:0,supplementalEpisodes:0,missingEpisodes:0,mappingAnomalies:0,orphanR2ContentIds:0,duplicateR2ContentIds:0,r2EpisodesWithoutContentId:0},series:[],missingEpisodes:[],mappingAnomalies:[],orphanR2ContentIdsList:[],duplicateR2ContentIdsList:[],r2EpisodesWithoutContentIdList:[],unresolved:[]};
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
   const [catalogResponse,episodes,historical,readings,vocabularies,quizzes]=await Promise.all([
    fetch(catalogUrl,{headers:{'User-Agent':'Mozilla/5.0 (compatible; yqxyy-historical-audit/1.0)'},signal:AbortSignal.timeout(30000)}),
    getJson('data/'+seriesId+'/episodes.json'),
    getJson('data/'+seriesId+'/historical-episodes.json'),
    getJson('data/'+seriesId+'/reading-lessons.json'),
    getJson('data/'+seriesId+'/vocabulary.json'),
    getJson('data/'+seriesId+'/quiz.json')
   ]);
   if(!catalogResponse.ok)throw Error('Official catalog HTTP '+catalogResponse.status);
   const catalogHtml=await catalogResponse.text();
   // Build the official catalog in DOM order from unique data-fcid values.
   // Some Little Fox cards expose shortened display titles; C-ID membership is
   // the reliable key for deciding whether a lesson is already present in R2.
   const catalog=[],seenOfficial=new Set();
   for(const tag of catalogHtml.match(/<[^>]+>/g)||[]){
    const id=tag.match(/\bdata-fcid\s*=\s*["'](C\d{7})["']/i)?.[1]?.toUpperCase();
    if(!id||seenOfficial.has(id))continue;
    const title=tag.match(/\bdata-contname\s*=\s*["']([^"']+)["']/i)?.[1]||'';
    catalog.push({id,title:title?title.replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim():'',seriesEpisodeNumber:catalog.length+1});
    seenOfficial.add(id);
   }
   if(!catalog.length)throw Error('Official catalog parser returned zero C-ID rows');
   if(!Array.isArray(episodes)||!(historical===null||Array.isArray(historical)))throw Error('R2 episodes.json / historical index malformed');
   const allEpisodes=[...episodes,...(historical||[])];
   const r2ByCid=new Map(),r2ByNo=new Map(),officialIds=new Set(catalog.map(x=>x.id));
   for(const ep of allEpisodes){
    const n=Number(ep.episodeId);if(Number.isInteger(n)&&n>0)r2ByNo.set(n,ep);
    const cid=ep.sourceContentId||ep.storyBook?.contentId;
    if(cid){if(!r2ByCid.has(cid))r2ByCid.set(cid,[]);r2ByCid.get(cid).push(ep);}
   }
   const miss=[],mapping=[],orphan=[],duplicates=[],noCid=[];
   for(const official of catalog){
    const matches=r2ByCid.get(official.id)||[];
    if(!matches.length){
      miss.push({seriesId,seriesTitle:title,level,episodeNumber:official.seriesEpisodeNumber,contentId:official.id,title:official.title||null,catalogId,catalogUrl,officialTextUrl:'https://cn.littlefox.com/cn/supplement/org/'+official.id,captionUrl:'https://cdn.littlefox.com/contents/caption/'+official.id+'.xml',storybookUrl:'https://res.littlefox.com/en/supplement/load_pdf/'+official.id});
      continue;
    }
    if(matches.length>1)duplicates.push({seriesId,seriesTitle:title,contentId:official.id,episodeNumbers:matches.map(x=>Number(x.episodeId))});
    const correct=matches.find(x=>Number(x.officialEpisodeNumber??x.episodeId)===official.seriesEpisodeNumber);
    if(!correct)mapping.push({seriesId,seriesTitle:title,officialEpisodeNumber:official.seriesEpisodeNumber,contentId:official.id,r2EpisodeNumbers:matches.map(x=>Number(x.episodeId)),officialTitle:official.title||null,r2Titles:matches.map(x=>x.title||null)});
   }
   for(const [cid,entries] of r2ByCid){
    if(!officialIds.has(cid))orphan.push({seriesId,seriesTitle:title,contentId:cid,episodeNumbers:entries.map(x=>Number(x.episodeId)),titles:entries.map(x=>x.title||null)});
   }
   for(const ep of allEpisodes)if(!(ep.sourceContentId||ep.storyBook?.contentId))noCid.push({seriesId,seriesTitle:title,episodeNumber:Number(ep.episodeId)||null,title:ep.title||null});
   report.summary.seriesAudited++;report.summary.officialEpisodes+=catalog.length;report.summary.r2Episodes+=episodes.length;report.summary.supplementalEpisodes+=(historical||[]).length;
   report.summary.missingEpisodes+=miss.length;report.summary.mappingAnomalies+=mapping.length;report.summary.orphanR2ContentIds+=orphan.length;report.summary.duplicateR2ContentIds+=duplicates.length;report.summary.r2EpisodesWithoutContentId+=noCid.length;
   report.missingEpisodes.push(...miss);report.mappingAnomalies.push(...mapping);report.orphanR2ContentIdsList.push(...orphan);report.duplicateR2ContentIdsList.push(...duplicates);report.r2EpisodesWithoutContentIdList.push(...noCid);
   report.series.push({seriesId,title,level,catalogId,officialEpisodeCount:catalog.length,r2EpisodeCount:episodes.length,supplementalEpisodeCount:(historical||[]).length,missingCount:miss.length,mappingAnomalyCount:mapping.length,orphanContentIdCount:orphan.length,duplicateContentIdCount:duplicates.length,withoutContentIdCount:noCid.length,latestOfficialTitle:catalog.at(-1)?.title||null,latestR2Episode:Math.max(0,...episodes.map(e=>Number(e.episodeId)||0))});
  }catch(e){report.summary.seriesUnresolved++;report.unresolved.push({seriesId,title,catalogId,reason:String(e.message||e).slice(0,300)});}
 }
}
await Promise.all(Array.from({length:4},worker));
report.series.sort((a,b)=>String(a.title||a.seriesId).localeCompare(String(b.title||b.seriesId)));
report.missingEpisodes.sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||a.episodeNumber-b.episodeNumber);
report.mappingAnomalies.sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||a.officialEpisodeNumber-b.officialEpisodeNumber);
report.orphanR2ContentIdsList.sort((a,b)=>a.seriesId.localeCompare(b.seriesId));
report.duplicateR2ContentIdsList.sort((a,b)=>a.seriesId.localeCompare(b.seriesId));
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
'- Existing main R2 episode rows: '+report.summary.r2Episodes,
'- Supplemental historical R2 episode rows: '+report.summary.supplementalEpisodes,
'- Missing episodes: '+report.summary.missingEpisodes,
'- Episode-number mapping anomalies (reported separately): '+report.summary.mappingAnomalies,
'- R2 content IDs absent from official catalog: '+report.summary.orphanR2ContentIds,
'- Duplicate R2 content IDs: '+report.summary.duplicateR2ContentIds,
'- R2 rows without a C-ID: '+report.summary.r2EpisodesWithoutContentId,
'',
'Missing episodes are determined by official C-ID membership across both the untouched main and supplemental historical episode indexes. Mapping anomalies are reported separately and never auto-corrected. This audit performs GET requests only; it does not write to R2 or publish lessons.'
].join('\n');
console.log('LITTLEFOX_BACKFILL_AUDIT '+JSON.stringify(report.summary));
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n');

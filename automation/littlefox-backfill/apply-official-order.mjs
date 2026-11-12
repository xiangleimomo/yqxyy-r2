import fs from 'node:fs/promises';
import {makeR2,catalogSeriesId,officialCatalogEntries} from '../littlefox-daily/core.mjs';
const request=JSON.parse(await fs.readFile('automation/littlefox-backfill/official-order-request.json','utf8'));
if(request.mode!=='preserve_ids_add_official_order'||!Array.isArray(request.seriesIds)||request.seriesIds.length<1||typeof request.publish!=='boolean')throw Error('Invalid order migration request');
const store=await makeR2(process.env,fetch);
const report={checkedAt:new Date().toISOString(),publish:request.publish,series:[],failed:[],summary:{planned:0,written:0,updatedEntries:0,duplicates:0}};
const runKey='historical-official-order-'+new Date().toISOString().replace(/[:.]/g,'-');
async function processSeries(seriesId){
 if(!/^little-fox-[a-z0-9-]+$/.test(seriesId))throw Error('Invalid series '+seriesId);
 const catId=catalogSeriesId(seriesId);
 if(!catId)throw Error('Official catalog ID unavailable: '+seriesId);
 const section=catId.startsWith('SRV')?'songs':'readers';
 const response=await fetch('https://www.littlefox.com/en/'+section+'/contents_list_v2/'+catId,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Official catalog HTTP '+response.status);
 const official=officialCatalogEntries(await response.text());
 if(!official.length)throw Error('Empty official catalog '+seriesId);
 const byCid=new Map(official.map(x=>[x.id,x.seriesEpisodeNumber]));
 const base='data/'+seriesId+'/';
 const beforeEpisodes=await store.get(base+'episodes.json'),beforeSeries=await store.get(base+'series.json');
 if(beforeEpisodes===null||beforeSeries===null)throw Error('Missing existing R2 index/series');
 const episodes=JSON.parse(beforeEpisodes),series=JSON.parse(beforeSeries);
 if(!Array.isArray(episodes)||!episodes.length)throw Error('R2 episode index invalid');
 const legacyMax=Math.max(0,...episodes.map(x=>Number(x.episodeId)||0));
 if(!Number.isInteger(legacyMax)||legacyMax<1)throw Error('R2 legacy maximum invalid');
 const byEpisodeId=new Set();
 for(const ep of episodes){const id=Number(ep.episodeId);if(byEpisodeId.has(id))throw Error('Duplicate internal episodeId '+id);byEpisodeId.add(id);}
 const byContent=new Map();
 for(const ep of episodes){const id=ep.sourceContentId||ep.storyBook?.contentId;if(id){const rows=byContent.get(id)||[];rows.push(ep);byContent.set(id,rows);}}
 let changes=0,duplicates=0;const planned=episodes.map(e=>({...e}));
 for(const [cid,oldRows] of byContent){
  const officialNumber=byCid.get(cid);
  if(!officialNumber)continue;
  const canonical=oldRows.slice().sort((a,b)=>Math.abs(Number(a.episodeId)-officialNumber)-Math.abs(Number(b.episodeId)-officialNumber)||Number(a.episodeId)-Number(b.episodeId))[0];
  for(const old of oldRows){
   const ep=planned.find(x=>Number(x.episodeId)===Number(old.episodeId));
   if(Number(ep.episodeId)===Number(canonical.episodeId)){
    if(ep.officialEpisodeNumber!==officialNumber){ep.officialEpisodeNumber=officialNumber;changes++;}
    if(ep.legacyDuplicateOf!==undefined){delete ep.legacyDuplicateOf;changes++;}
   }else{
    duplicates++;
    if(ep.officialEpisodeNumber!==undefined){delete ep.officialEpisodeNumber;changes++;}
    if(ep.legacyDuplicateOf!==Number(canonical.episodeId)){ep.legacyDuplicateOf=Number(canonical.episodeId);changes++;}
   }
  }
 }
 const resultSeries={...series,legacyEpisodeMax:Number(series.legacyEpisodeMax||legacyMax),officialEpisodeCount:official.length};
 const row={seriesId,officialCatalogId:catId,officialCount:official.length,r2Count:episodes.length,legacyEpisodeMax:legacyMax,changes,duplicateAliases:duplicates,unmapped:planned.filter(e=>!e.officialEpisodeNumber&&!e.legacyDuplicateOf).length,status:request.publish?'checking':'dry_run_passed'};
 report.series.push(row);report.summary.planned++;report.summary.updatedEntries+=changes;report.summary.duplicates+=duplicates;
 if(!request.publish||(!changes&&series.legacyEpisodeMax&&series.officialEpisodeCount===official.length))return;
 const nextEpisodes=JSON.stringify(planned,null,2)+'\n',nextSeries=JSON.stringify(resultSeries,null,2)+'\n';
 for(const [key,old] of [[base+'episodes.json',beforeEpisodes],[base+'series.json',beforeSeries]]){
  const backup='data/__littlefox-sync/backups/'+runKey+'/'+key.slice(5);
  await store.put(backup,old);
  const saved=await store.get(backup);if(saved!==old)throw Error('Backup readback mismatch '+key);
 }
 await store.put(base+'episodes.json',nextEpisodes);
 await store.put(base+'series.json',nextSeries);
 const [newEp,newSeries]=await Promise.all([store.get(base+'episodes.json'),store.get(base+'series.json')]);
 if(newEp!==nextEpisodes||newSeries!==nextSeries)throw Error('Migration readback mismatch '+seriesId);
 const parsed=JSON.parse(newEp);
 if(parsed.length!==episodes.length||parsed.some((ep,i)=>Number(ep.episodeId)!==Number(episodes[i].episodeId)||(ep.sourceContentId||ep.storyBook?.contentId)!==(episodes[i].sourceContentId||episodes[i].storyBook?.contentId)))throw Error('Migration illegally altered existing ID or C ID');
 row.status='published_verified';report.summary.written++;
}
for(const sid of request.seriesIds){
 try{await processSeries(sid);}catch(e){report.failed.push({seriesId:sid,error:String(e.message||e)});}
}
report.status=report.failed.length?'partial_failure':request.publish?'published_verified':'dry_run_passed';
await fs.writeFile('/tmp/littlefox-official-order-report.json',JSON.stringify(report,null,2)+'\n');
console.log('OFFICIAL_ORDER_MIGRATION '+JSON.stringify(report.summary));
console.log(JSON.stringify(report.failed));
if(report.failed.length)process.exitCode=1;

import fs from 'node:fs/promises';
import path from 'node:path';
import {chinaDate,makeR2,scheduleReleases,identifyCId,readPlayer,isEpisodeMatch,verifyPlaylist,parseCaptions,bilingualTextParagraphs,textPageShape,ORIGINAL_TEXT,TRANSLATED_TEXT} from './core.mjs';
const d=chinaDate(),out=`automation/littlefox-daily/inbox/${d.date}.json`;
const privateOut='/tmp/littlefox-source-'+d.date+'.json';
const result={schemaVersion:2,date:d.date,status:'checking',workflowRunId:process.env.GITHUB_RUN_ID||null,privateArtifactName:'littlefox-source-'+(process.env.GITHUB_RUN_ID||'local'),items:[],errors:[]};
const sources={schemaVersion:1,date:d.date,items:[]};
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Official HTTP '+r.status);return r;};
try{
 const store=await makeR2(process.env,fetch);
 const index=await store.get('data/series-list.json');if(!index)throw Error('Missing R2 series-list.json');
 const series=JSON.parse(index);
 const schedule=await(await get(`https://res.littlefox.com/en/forum/publishing_schedule/${d.yearMonth}`)).text();
 const releases=scheduleReleases(schedule,d,series);
 for(const release of releases){
  const item={seriesId:release.seriesId,episodeNumber:release.seriesEpisodeNumber,title:release.title,level:release.level,status:'checking'};
  result.items.push(item);
  try{
   const old=await store.get(`data/${release.seriesId}/episodes.json`);if(!old)throw Error('R2 episode index missing');
   const episodes=JSON.parse(old);
   if(process.env.LF_BLIND_TEST!=='1'&&episodes.some(e=>Number(e.episodeId)===release.seriesEpisodeNumber)){item.status='already_published';continue;}
   const id=await identifyCId(release,episodes,fetch);if(!id)throw Error('C ID unavailable');
   item.contentId=id;
   const player=await readPlayer(id,fetch);
   if(!isEpisodeMatch(player.item.cont_title,release.title))throw Error('Official title mismatch');
   item.video=await verifyPlaylist(player.video,fetch);
   item.storybook=`https://res.littlefox.com/en/supplement/load_pdf/${id}`;
   const pdf=await fetch(item.storybook,{method:'HEAD',signal:AbortSignal.timeout(20000)});
   if(!pdf.ok&&pdf.status!==405)throw Error('Storybook HTTP '+pdf.status);
   item.caption=`https://cdn.littlefox.com/contents/caption/${id}.xml`;
   const cues=parseCaptions(await(await get(item.caption)).text());
   if(cues.length<3)throw Error('Caption missing');item.captionCueCount=cues.length;
   item.textOriginal=ORIGINAL_TEXT(id);item.textTranslated=TRANSLATED_TEXT(id);
   const [en,zh]=await Promise.all([get(item.textOriginal),get(item.textTranslated)]);
   const orgHtml=await en.text(), transHtml=await zh.text();
   let paragraphs;
   try { paragraphs=bilingualTextParagraphs(orgHtml,transHtml); }
   catch (e) { throw Error(String(e.message||e)+'; orgShape='+textPageShape(orgHtml)+'; transShape='+textPageShape(transHtml)); }
   if(paragraphs.length<3)throw Error('Verified Text has fewer than 3 paragraphs');
   item.paragraphCount=paragraphs.length;item.status='ready_for_chatgpt';
   // Full source paragraphs are ONLY in the ephemeral GitHub Actions artifact,
   // NEVER added to the public repository or printed into workflow logs.
   sources.items.push({seriesId:release.seriesId,episodeNumber:release.seriesEpisodeNumber,contentId:id,title:release.title,level:release.level,releaseDate:d.date,officialSourceUrls:{textOriginal:item.textOriginal,textTranslated:item.textTranslated,caption:item.caption,storybook:item.storybook},paragraphs,captionCues:cues,verification:{playerTitle:player.item.cont_title,captionCueCount:cues.length,paragraphCount:paragraphs.length,storybookHeadStatus:pdf.status},status:'ready_for_chatgpt'});
   item.sourceArtifact=true;
  }catch(e){item.status='blocked';item.error=String(e.message||e).slice(0,1200);}
 }
 result.status=releases.length?'checked':'no_release_detected';
}catch(e){result.status='blocked';result.errors.push(String(e.message||e).slice(0,300));}
// The artifact is uploaded separately by Actions and kept for one day.
await fs.writeFile(privateOut,JSON.stringify(sources,null,2)+'\n');
await fs.mkdir(path.dirname(out),{recursive:true});
await fs.writeFile(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,items:result.items.length,ready:sources.items.length,errors:result.errors,privateArtifactName:result.privateArtifactName}));
if(result.status==='blocked')process.exitCode=1;

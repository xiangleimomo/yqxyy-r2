import fs from 'node:fs/promises';
import path from 'node:path';
import {chinaDate,makeR2,scheduleReleases,identifyCId,readPlayer,isEpisodeMatch,verifyPlaylist,parseCaptions,textParagraphs,textPageShape,ORIGINAL_TEXT} from './core.mjs';
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
 let releases=scheduleReleases(schedule,d,series);
 if(process.env.LF_BLIND_TEST==='1'){
  const test=JSON.parse(await fs.readFile('automation/littlefox-daily/blind-test-request.json','utf8'));
  if(test.mode!=='manual_episode_test'||!test.target?.seriesId||!Number.isInteger(test.target?.episodeNumber)||!/^C?$/.test('C'))throw Error('Invalid manual episode test request');
  releases=[{...test.target,date:d.date,seriesTitle:test.target.seriesTitle,seriesEpisodeNumber:test.target.episodeNumber,calendarEpisodeNumber:test.target.calendarEpisodeNumber}];
 }
 for(const calendarRelease of releases){
  const item={seriesId:calendarRelease.seriesId,calendarEpisodeNumber:calendarRelease.calendarEpisodeNumber,title:calendarRelease.title,level:calendarRelease.level,status:'checking'};
  result.items.push(item);
  try{
   // Normal daily runs use the official calendar's known absolute episode field.
   // The one-off regression request may explicitly target a known missing absolute episode.
   const release=calendarRelease;
   item.episodeNumber=release.seriesEpisodeNumber;
   const old=await store.get(`data/${release.seriesId}/episodes.json`);if(!old)throw Error('R2 episode index missing');
   const episodes=JSON.parse(old);
   const maxEpisode=Math.max(0,...episodes.map(e=>Number(e.episodeId)||0));
   if(release.seriesEpisodeNumber>maxEpisode+1){
    item.publicationBlockedBySequenceGap=true;
    item.r2LatestEpisodeNumber=maxEpisode;
    item.missingEpisodeNumbers=Array.from({length:release.seriesEpisodeNumber-maxEpisode-1},(_,i)=>maxEpisode+i+1);
   }
   const existing=episodes.find(e=>Number(e.episodeId)===release.seriesEpisodeNumber);
   if(existing){
    const existingId=existing.sourceContentId||existing.storyBook?.contentId;
    if(existingId===official.contentId&&existing.video?.hlsUrl){item.contentId=existingId;item.status='already_published';continue;}
    throw Error(`R2 episode number conflict at ${release.seriesEpisodeNumber}: existing C ID ${existingId||'missing'}, official C ID ${official.contentId}`);
   }
   const id=await identifyCId(release,episodes,fetch);if(!id)throw Error('C ID unavailable');
   item.contentId=id;
   // Video may be published later than the official Text and C ID.
   // Distinguish a confirmed C ID from release readiness.
   let metadata=null, pendingVideoReason=null;
   try {
     metadata=await readPlayer(id,fetch,false);
     if(!isEpisodeMatch(metadata.item.cont_title,release.title))throw Error('Official title mismatch');
   } catch(e) {
     if(String(e.message||e)==='Official title mismatch')throw e;
     // identifyCId already independently checked a matching official
     // catalog + real Text when the pre-release player is unavailable.
     pendingVideoReason='Player metadata not yet available: '+String(e.message||e).slice(0,180);
   }
   item.contentIdVerified=true;
   try {
     const player=await readPlayer(id,fetch);
     item.video=await verifyPlaylist(player.video,fetch);
   } catch(e) { pendingVideoReason=String(e.message||e).slice(0,250); }
   item.storybook=`https://res.littlefox.com/en/supplement/load_pdf/${id}`;
   const pdf=await fetch(item.storybook,{method:'HEAD',signal:AbortSignal.timeout(20000)});
   if(!pdf.ok&&pdf.status!==405)throw Error('Storybook HTTP '+pdf.status);
   item.caption=`https://cdn.littlefox.com/contents/caption/${id}.xml`;
   const cues=parseCaptions(await(await get(item.caption)).text());
   if(cues.length<3)throw Error('Caption missing');item.captionCueCount=cues.length;
   item.textOriginal=ORIGINAL_TEXT(id);
   const orgHtml=await(await get(item.textOriginal)).text();
   let paragraphs;
   try { paragraphs=textParagraphs(orgHtml); }
   catch (e) { throw Error('English Text parser error: '+String(e.message||e)+'; orgShape='+textPageShape(orgHtml)); }
   if(paragraphs.length<3)throw Error('Official English Text paragraphs unavailable; orgShape='+textPageShape(orgHtml));
   // Only verified English is required. No translated text is fetched or aligned.
   item.paragraphCount=paragraphs.length;
   if(pendingVideoReason){item.status='awaiting_video';item.videoStatus='not_yet_available';item.videoError=pendingVideoReason;continue;}
   item.videoStatus='verified';item.status='ready_for_chatgpt';
   // Full source paragraphs are ONLY in the ephemeral GitHub Actions artifact,
   // NEVER added to the public repository or printed into workflow logs.
   sources.items.push({seriesId:release.seriesId,episodeNumber:release.seriesEpisodeNumber,calendarEpisodeNumber:release.calendarEpisodeNumber,publicationBlockedBySequenceGap:item.publicationBlockedBySequenceGap||false,r2LatestEpisodeNumber:item.r2LatestEpisodeNumber??null,missingEpisodeNumbers:item.missingEpisodeNumbers||[],contentId:id,title:release.title,level:release.level,releaseDate:d.date,officialSourceUrls:{textOriginal:item.textOriginal,caption:item.caption,storybook:item.storybook},paragraphs,captionCues:cues,verification:{playerTitle:metadata?.item?.cont_title||null,captionCueCount:cues.length,paragraphCount:paragraphs.length,textLanguage:'en',storybookHeadStatus:pdf.status},status:'ready_for_chatgpt'});
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

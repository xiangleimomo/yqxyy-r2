import fs from 'node:fs/promises';
import {makeR2,readPlayer,isEpisodeMatch,verifyPlaylist,textParagraphs,ORIGINAL_TEXT,prepareUpdate} from '../littlefox-daily/core.mjs';

const request=JSON.parse(await fs.readFile('automation/littlefox-backfill/song-publish-request.json','utf8'));
if(request.mode!=='historical_song_v2'||request.publish!==true||request.contentId!=='C0005362')throw Error('Invalid explicit song backfill publish request');
const out=JSON.parse(await fs.readFile('automation/littlefox-backfill/song-outbox/C0005362.json','utf8'));
if(out.schemaVersion!==1||out.status!=='ready_for_song_publish'||out.reviewStatus!=='approved'||out.level>2||out.quiz!==null)throw Error('Song outbox does not match low-level no-quiz policy');
const report={contentId:out.contentId,seriesId:out.seriesId,episodeNumber:out.episodeNumber,requestedPublish:true,checkedAt:new Date().toISOString(),status:'checking',stages:[]};
const step=(name,details={})=>report.stages.push({name,...details});
const get=async(url,init={})=>{const r=await fetch(url,{...init,signal:AbortSignal.timeout(25000)});return r;};
try{
 const store=await makeR2(process.env,fetch);
 const player=await readPlayer(out.contentId,fetch);
 if(!isEpisodeMatch(player.item.cont_title,out.title))throw Error('Official song player title mismatch: '+player.item.cont_title);
 const video=await verifyPlaylist(player.video,fetch);
 step('official_song_player_verified',{title:player.item.cont_title,host:new URL(video).hostname});
 const textResponse=await get(ORIGINAL_TEXT(out.contentId));
 if(!textResponse.ok)throw Error('Official lyrics Text HTTP '+textResponse.status);
 const paragraphs=textParagraphs(await textResponse.text()).map(p=>({...p,translation:''}));
 if(paragraphs.length<4)throw Error('Official lyrics Text has fewer than four lines');
 step('official_lyrics_verified',{paragraphs:paragraphs.length});
 const caption=await get('https://cdn.littlefox.com/contents/caption/'+out.contentId+'.xml');
 if(caption.status!==404)throw Error('Song caption endpoint changed; expected documented 404 for this no-timed-caption song, got '+caption.status);
 const book=await get('https://res.littlefox.com/en/supplement/load_pdf/'+out.contentId,{method:'HEAD'});
 if(!book.ok)throw Error('Song Storybook/PDF endpoint HTTP '+book.status);
 step('song_specific_source_policy',{captionXmlStatus:404,storybookStatus:book.status,noTimedCaptionsExpected:true});
 const pmap=new Map(paragraphs.map(p=>[p.id,p.text.toLowerCase()]));
 if(!Array.isArray(out.vocabulary)||out.vocabulary.length<6||out.vocabulary.length>14)throw Error('Song vocabulary must contain 6–14 words');
 for(const v of out.vocabulary){
  if(!v.word||!v.meaningZh||!v.example||!v.exampleZh||!Array.isArray(v.paragraphIds)||!v.paragraphIds.some(pid=>pmap.has(pid)&&pmap.get(pid).includes(v.word.toLowerCase())))throw Error('Song vocabulary evidence invalid: '+v.word);
 }
 if(!Array.isArray(out.lesson?.sections)||out.lesson.sections.length<2||out.lesson.sections.some(s=>!Array.isArray(s.paragraphIds)||!s.paragraphIds.every(pid=>pmap.has(pid))))throw Error('Song reading sections do not map to official lyrics');
 step('song_v2_curriculum_checked',{words:out.vocabulary.length,sections:out.lesson.sections.length,quiz:null});
 const base='data/'+out.seriesId+'/';
 const readJson=async key=>{const raw=await store.get(key);if(raw===null)throw Error('Missing R2 '+key);return JSON.parse(raw);};
 const [episodes,readings,vocabularies,quizzes,series,seriesList]=await Promise.all([
  readJson(base+'episodes.json'),readJson(base+'reading-lessons.json'),readJson(base+'vocabulary.json'),readJson(base+'quiz.json'),readJson(base+'series.json'),readJson('data/series-list.json')
 ]);
 if(!Array.isArray(episodes)||!Array.isArray(seriesList)||!seriesList.some(x=>x.seriesId===out.seriesId))throw Error('R2 series index invalid');
 const matches=episodes.filter(e=>Number(e.episodeId)===out.episodeNumber||e.sourceContentId===out.contentId);
 if(matches.length)throw Error('Song episode or C-ID already exists in R2; refusing overwrite');
 const latest=Math.max(0,...episodes.map(e=>Number(e.episodeId)||0));
 if(latest+1!==out.episodeNumber)throw Error('Song append sequence mismatch: latest '+latest+', target '+out.episodeNumber);
 step('r2_sequence_checked',{existingEpisodes:episodes.length,latestEpisode:latest,nextEpisode:latest+1});
 const prepared=prepareUpdate({
  seriesId:out.seriesId,
  release:{title:out.title,seriesEpisodeNumber:out.episodeNumber,date:out.releaseDate},
  id:out.contentId,video,cues:[],paragraphs,
  course:{vocabulary:out.vocabulary,quiz:null},
  episodes,readings,vocabularies,quizzes,series,seriesList,
  sourceUrls:{text:ORIGINAL_TEXT(out.contentId)},captionXml:''
 });
 if(!prepared)throw Error('prepareUpdate returned duplicate for song');
 const files={...prepared.files};
 delete files[base+'subtitles/'+String(out.episodeNumber).padStart(3,'0')+'.vtt'];
 const epIndex=JSON.parse(files[base+'episodes.json']);
 const ep=epIndex.find(x=>Number(x.episodeId)===out.episodeNumber);
 if(!ep)throw Error('Prepared song episode missing');
 delete ep.storyBook;
 delete ep.sourceUrls;
 files[base+'episodes.json']=JSON.stringify(epIndex,null,2)+'\n';
 if(files[base+'quiz.json'])throw Error('Low-level song must not write a Quiz');
 step('r2_song_patch_prepared',{files:Object.keys(files).length,subtitleFiles:0,quizFileWritten:false,storybookField:false});
 const backupId='historical-song-'+out.contentId+'-'+new Date().toISOString().replace(/[:.]/g,'-');
 const jsonKeys=Object.keys(files).filter(k=>k.endsWith('.json'));
 for(const key of jsonKeys){const prior=await store.get(key);if(prior!==null)await store.put('data/__littlefox-sync/backups/'+backupId+'/'+key.slice(5),prior);}
 step('r2_backups_written',{objects:jsonKeys.length,backupId});
 const order=Object.keys(files).filter(k=>k!==base+'episodes.json'&&k!=='data/series-list.json'&&!k.endsWith('.vtt')&&!k.endsWith('.xml'))
  .concat([base+'episodes.json','data/series-list.json']);
 for(const key of order){
  const content=files[key];
  await store.put(key,content,key.endsWith('.vtt')?'text/vtt; charset=utf-8':'application/json; charset=utf-8');
  const received=await store.get(key);
  if(received!==content)throw Error('R2 readback mismatch '+key);
 }
 report.status='published_verified';
 step('r2_written_and_readback',{objects:order.length,episodeNumber:out.episodeNumber,contentId:out.contentId});
}catch(e){report.status='blocked';report.error=String(e.message||e).slice(0,500);}
await fs.writeFile('/tmp/littlefox-song-publish-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'# Little Fox level-0 song backfill\n\n'+JSON.stringify(report,null,2)+'\n');
if(report.status==='blocked')process.exitCode=1;

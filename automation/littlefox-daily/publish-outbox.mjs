/**
 * Little Fox outbox publisher: GitHub Actions only. NO AI inference/API.
 * Supports dry-run first, guarded opt-in publish, R2 backups and readback.
 */
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {makeR2,readPlayer,isEpisodeMatch,verifyPlaylist,parseCaptions,textParagraphs,ORIGINAL_TEXT,checkQuiz,prepareUpdate} from './core.mjs';

const checkedPath='automation/littlefox-daily/publish-request.json';
let req;
if(process.env.GITHUB_EVENT_NAME==='push'){
  // When ChatGPT creates one approved outbox, publish automatically.
  // Existing outbox edits are NOT considered a new publication request.
  const changed=execFileSync('git',['diff-tree','--no-commit-id','--name-status','-r','HEAD'],{encoding:'utf8'})
    .trim().split('\n').filter(Boolean).map(line=>{
      const [change,path]=line.split('\t');return {change,path};
    });
  const touched=changed.filter(x=>/^automation\/littlefox-daily\/outbox\/C\d{7}\.json$/.test(x.path));
  if(touched.length){
    if(touched.length!==1||touched[0].change!=='A')throw Error('Only one newly added C-ID outbox is eligible for auto publication');
    req={mode:'reviewed_littlefox_v2',contentId:touched[0].path.match(/(C\d{7})\.json$/)[1],publish:true};
  }
}
req=req||JSON.parse(await fs.readFile(checkedPath,'utf8'));
if(req.mode!=='reviewed_littlefox_v2'||!/^C\d{7}$/.test(req.contentId||'')||typeof req.publish!=='boolean')throw Error('Invalid release request');
const id=req.contentId;
const sourceFile='automation/littlefox-daily/outbox/'+id+'.json';
const out=JSON.parse(await fs.readFile(sourceFile,'utf8'));
if(out.schemaVersion!==1||out.contentId!==id||out.reviewStatus!=='approved'||out.status!=='ready_for_publish')throw Error('Not an approved V2 outbox');
if(!/^[a-z0-9-]+$/.test(out.seriesId||'')||!Number.isSafeInteger(out.episodeNumber)||out.episodeNumber<1||Number(out.level)<0)throw Error('Invalid series, level or episode');
if(typeof out.title!=='string'||out.title.length<3)throw Error('Missing verified title');
const want={textOriginal:ORIGINAL_TEXT(id),caption:'https://cdn.littlefox.com/contents/caption/'+id+'.xml',storybook:'https://res.littlefox.com/en/supplement/load_pdf/'+id};
for(const [key,url] of Object.entries(want))if(out.officialSourceUrls?.[key]!==url)throw Error('Official URL does not match '+key);
if(!Object.values(['englishText','storybook','subtitleXml','episodeTitleMatched']).every(k=>out.sourceVerification?.[k]===true))throw Error('Source verification flags missing');
const report={contentId:id,seriesId:out.seriesId,episodeNumber:out.episodeNumber,requestedPublish:req.publish,checkedAt:new Date().toISOString(),status:'checking',stages:[]};
const step=(name,details={})=>report.stages.push({name,...details});
const get=async(url,opts={})=>{const r=await fetch(url,{...opts,signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Official '+new URL(url).hostname+' HTTP '+r.status);return r;};
try{
  const store=await makeR2(process.env,fetch);
  const base='data/'+out.seriesId+'/';
  const mustRead=async key=>{const val=await store.get(key);if(val===null)throw Error('Missing R2 '+key);return JSON.parse(val)};
  const episodeIndexRaw=await store.get(base+'episodes.json');
  const episodes=episodeIndexRaw===null?[]:JSON.parse(episodeIndexRaw);
  if(!Array.isArray(episodes))throw Error('Invalid R2 episode index');
  const existingMatches=episodes.map((e,i)=>({e,i})).filter(({e})=>Number(e.episodeId)===out.episodeNumber||e.sourceContentId===id||e.storyBook?.contentId===id);
  step('r2_real_state_checked',{episodeIndexExists:episodeIndexRaw!==null,existingEpisodes:episodes.length,targetExists:existingMatches.length>0});
  if(req.repairVideo===true&&existingMatches.length>0){
    // Explicitly requested video-only repair for an existing lesson. Never
    // rewrite learning materials, quiz, subtitles, or series/global indexes.
    if(req.publish!==true)throw Error('Video repair requires explicit publish:true');
    const matches=existingMatches;
    if(matches.length!==1||Number(matches[0].e.episodeId)!==out.episodeNumber||
       (matches[0].e.sourceContentId||matches[0].e.storyBook?.contentId)!==id)
      throw Error('Existing episode and C ID do not match uniquely; refusing video repair');
    const {e:current,i:idx}=matches[0];
    const player=await readPlayer(id,fetch);
    if(!isEpisodeMatch(player.item.cont_title,out.title))throw Error('Official player title mismatch during video repair');
    const video=await verifyPlaylist(player.video,fetch);
    step('official_video_verified',{host:new URL(video).hostname,contentId:id});
    if(process.env.LF_ALLOW_PUBLISH!=='1')throw Error('Video repair publish safeguard disabled');
    const repaired={...current,sourceType:'hls',video:{...(current.video||{}),source:'hls',hlsUrl:video},
      sourceUrls:{...(current.sourceUrls||{}),video}};
    const modified=episodes.map((e,i)=>i===idx?repaired:e);
    const target=base+'episodes.json';
    const previous=await store.get(target);
    if(previous===null)throw Error('Original R2 episode index unavailable');
    const backup='data/__littlefox-sync/backups/video-repair-'+id+'-'+
      new Date().toISOString().replace(/[:.]/g,'-')+'/'+target.slice(5);
    await store.put(backup,previous);
    step('r2_episodes_backup_written',{key:backup});
    const next=JSON.stringify(modified,null,2)+'\\n';
    await store.put(target,next);
    const got=await store.get(target);
    if(got!==next)throw Error('R2 video repair readback mismatch');
    const verified=JSON.parse(got);
    if(verified.length!==episodes.length||
       verified.some((x,i)=>i!==idx&&JSON.stringify(x)!==JSON.stringify(episodes[i]))||
       verified[idx].video?.hlsUrl!==video||verified[idx].sourceUrls?.video!==video)
      throw Error('R2 video repair changed unexpected episode fields');
    report.status='video_repaired_verified';
    step('r2_video_only_written_and_verified',{episodeNumber:out.episodeNumber,videoUrl:video,changedEpisodeCount:1,untouchedEpisodeCount:episodes.length-1});
  }else if(existingMatches.length){
    report.status='already_published';step('duplicate_existing', {reason:'R2 already holds target episode or C ID'});
  }else{
    const [seriesList,readings,vocabularies,quizzes,series]=await Promise.all([
      mustRead('data/series-list.json'), mustRead(base+'reading-lessons.json'),
      mustRead(base+'vocabulary.json'),mustRead(base+'quiz.json'),mustRead(base+'series.json')
    ]);
    if(!Array.isArray(seriesList)||!seriesList.some(x=>x.seriesId===out.seriesId))throw Error('Series absent from official R2 series index');
    if(Math.max(0,...episodes.map(e=>Number(e.episodeId)||0))+1!==out.episodeNumber)throw Error('R2 target episode is absent but earlier episode index is incomplete; refusing to fabricate missing episodes. Restore prior episodes before publishing target.');
    step('r2_current_index_checked',{existingEpisodes:episodes.length});
    const player=await readPlayer(id,fetch);
    if(!isEpisodeMatch(player.item.cont_title,out.title))throw Error('Official player title mismatch '+player.item.cont_title);
    const video=await verifyPlaylist(player.video,fetch);
    step('official_video_verified',{host:new URL(video).hostname});
    const [er,cr,pdf]=await Promise.all([get(want.textOriginal),get(want.caption),get(want.storybook,{method:'HEAD'})]);
    const [en,xml]=await Promise.all([er.text(),cr.text()]);
    const paragraphs=textParagraphs(en);
    const cues=parseCaptions(xml);
    if(paragraphs.length<3||cues.length<3)throw Error('Official source lacks sufficient paragraphs or captions');
    if(out.captionMetadata.cueCount!==cues.length)throw Error('XML cue count drifted');
    step('official_text_xml_pdf_verified',{paragraphs:paragraphs.length,cues:cues.length,storybookStatus:pdf.status});
    const transcript=paragraphs.map(p=>p.text.toLowerCase()).join(' ');
    const vocabulary=out.vocabulary||[];
    if(vocabulary.length<6||vocabulary.length>14||vocabulary.some(v=>!v.word||!v.meaningZh||!v.example||!v.exampleZh||!transcript.includes(v.word.toLowerCase())||!Array.isArray(v.paragraphIds)||!v.paragraphIds.some(pid=>paragraphs.some(p=>p.id===pid&&p.text.toLowerCase().includes(v.word.toLowerCase())))))throw Error('Vocabulary source or shape invalid');
    const questions=out.quiz?.questions?.map(q=>{
      const pid=q.evidence?.paragraphIds?.[0];
      const p=paragraphs.find(x=>x.id===pid);
      if(!p||q.evidence?.sourceContentId!==id)throw Error('Quiz evidence paragraph mismatch');
      return {...q,evidence:{...q.evidence,quote:p.text}};
    });
    if(Number(out.level)>=3){
      const errors=checkQuiz({questions},paragraphs,id);
      if(errors.length)throw Error('Quiz validator: '+errors.join('; '));
    }else if(out.quiz)throw Error('Low-level new course must not add Quiz automatically');
    if(!Array.isArray(out.sections)||out.sections.length<2||out.sections.some(s=>!Array.isArray(s.paragraphIds)||!s.paragraphIds.every(pid=>paragraphs.some(p=>p.id===pid))))throw Error('Invalid V2 story sections');
    step('v2_curriculum_and_quiz_checked',{words:vocabulary.length,questions:questions?.length||0,sections:out.sections.length});
    const release={title:out.title,seriesEpisodeNumber:out.episodeNumber,date:out.releaseDate};
    const prepared=prepareUpdate({seriesId:out.seriesId,release,id,video,cues,paragraphs,course:{vocabulary,quiz:Number(out.level)>=3?{questions}:null},episodes,readings,vocabularies,quizzes,series,seriesList,sourceUrls:{text:want.textOriginal,storybook:want.storybook},captionXml:xml});
    if(!prepared)throw Error('Unexpected duplicate after preflight');
    const files=prepared.files;
    step('r2_patch_prepared',{files:Object.keys(files).length});
    if(!req.publish){
      report.status='dry_run_passed';
    }else{
      if(process.env.LF_ALLOW_PUBLISH!=='1')throw Error('Publishing environment safeguard not enabled');
      const backupId=new Date().toISOString().replace(/[:.]/g,'-');
      for(const key of Object.keys(files).filter(k=>k.endsWith('.json'))){
        const prior=await store.get(key);
        if(prior!==null)await store.put('data/__littlefox-sync/backups/'+backupId+'/'+key.slice(5),prior);
      }
      step('backups_written');
      const order=Object.keys(files).filter(k=>k!=='data/series-list.json'&&!k.endsWith('/episodes.json')).concat(
        Object.keys(files).filter(k=>k.endsWith('/episodes.json')),['data/series-list.json']);
      for(const key of order){
        const content=files[key];
        await store.put(key,content,key.endsWith('.vtt')?'text/vtt; charset=utf-8':key.endsWith('.xml')?'application/xml; charset=utf-8':'application/json; charset=utf-8');
        const received=await store.get(key);
        if(received!==content)throw Error('R2 readback mismatch '+key);
      }
      report.status='published_verified';step('r2_written_and_readback',{objects:order.length});
    }
  }
}catch(e){report.status='blocked';report.error=String(e.message||e).slice(0,500)}
await fs.writeFile('/tmp/littlefox-v2-publish-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(report.status==='blocked')process.exitCode=1;

/**
 * Verify a single user-provided Little Fox C-ID hint. Read-only against Little
 * Fox and R2. Never publish, infer story contents, or put copyrighted text in Git.
 * Full verified source is placed exclusively into a private Actions artifact.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  chinaDate, makeR2, resolveOfficialSeriesEpisode,
  readPlayer, isEpisodeMatch, verifyPlaylist,
  parseCaptions, textParagraphs, ORIGINAL_TEXT
} from './core.mjs';

const hintPath=String(process.env.LF_HINT_FILE||'');
if(!/^automation\/littlefox-daily\/cid-hints\/C\d{7}\.json$/.test(hintPath))
  throw Error('Expected one valid C-ID hint file path');
const id=hintPath.match(/(C\d{7})\.json$/)[1];
const today=chinaDate().date;
const runId=String(process.env.GITHUB_RUN_ID||'local');
const reportPath='automation/littlefox-daily/inbox/backfill/'+id+'.json';
const privatePath='/tmp/littlefox-source-'+today+'.json';
const report={
  schemaVersion:2,
  date:today,
  sourceReleaseDate:null,
  hintPath,
  contentId:id,
  status:'checking',
  workflowRunId:runId,
  privateArtifactName:'littlefox-source-'+runId,
  privateArtifactUploaded:false,
  items:[],
  errors:[]
};
const sources={schemaVersion:1,date:today,items:[]};
const get=async(url,init={})=>{
  const r=await fetch(url,{...init,signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error('Official '+new URL(url).hostname+' HTTP '+r.status);
  return r;
};
try{
  const hint=JSON.parse(await fs.readFile(hintPath,'utf8'));
  if(hint.contentId!==id||hint.seriesId!=='three-kingdoms'||
     hint.officialSeriesId!=='FS0182'||hint.episodeNumber!==15||
     hint.title!=='The Journey to Luoyang'||
     hint.publicationAuthorized!==false)
    throw Error('Unexpected episode or untrusted hint payload; do not publish');
  report.sourceReleaseDate=hint.releaseDate;
  const release={
    seriesId:hint.seriesId,
    title:hint.title,
    level:hint.level,
    date:hint.releaseDate,
    calendarEpisodeNumber:hint.episodeNumber
  };
  const official=await resolveOfficialSeriesEpisode(release,fetch);
  if(official.seriesEpisodeNumber!==hint.episodeNumber)
    throw Error('Official FS0182 catalog episode number does not match hint');
  if(official.contentId!==id)
    throw Error('Official FS0182 catalog C-ID mismatch; catalog ID differs from candidate');
  const item={
    seriesId:hint.seriesId,episodeNumber:hint.episodeNumber,
    contentId:id,title:hint.title,level:hint.level,releaseDate:hint.releaseDate,
    contentIdVerified:true,sourceArtifact:false,status:'checking'
  };
  report.items.push(item);
  const store=await makeR2(process.env,fetch);
  const currentRaw=await store.get('data/'+hint.seriesId+'/episodes.json');
  if(currentRaw===null)throw Error('R2 episode index missing, duplicate check unavailable');
  const episodes=JSON.parse(currentRaw);
  if(!Array.isArray(episodes))throw Error('R2 episode index not an array');
  const targetMatches=episodes.filter(e=>Number(e.episodeId)===hint.episodeNumber ||
    e.sourceContentId===id||e.storyBook?.contentId===id);
  if(targetMatches.length){
    const exact=targetMatches.length===1&&
      Number(targetMatches[0].episodeId)===hint.episodeNumber&&
      (targetMatches[0].sourceContentId||targetMatches[0].storyBook?.contentId)===id;
    if(!exact)throw Error('R2 episode/C-ID conflict, manual review required');
    item.status='already_published';
    report.status='checked';
  }else{
    const highest=Math.max(0,...episodes.map(e=>Number(e.episodeId)||0));
    if(hint.episodeNumber>highest+1){
      item.publicationBlockedBySequenceGap=true;
      item.r2LatestEpisodeNumber=highest;
      item.missingEpisodeNumbers=Array.from({length:hint.episodeNumber-highest-1},(_,i)=>highest+i+1);
    }
    const textOriginal=ORIGINAL_TEXT(id);
    const caption='https://cdn.littlefox.com/contents/caption/'+id+'.xml';
    const storybook='https://res.littlefox.com/en/supplement/load_pdf/'+id;
    const [textResponse,captionResponse]=await Promise.all([
      get(textOriginal),get(caption)
    ]);
    const [en,xml]=await Promise.all([textResponse.text(),captionResponse.text()]);
    const paragraphs=textParagraphs(en),cues=parseCaptions(xml);
    if(paragraphs.length<3||cues.length<3)
      throw Error('Verified official C-ID has incomplete English Text or caption timeline');
    let storybookStatus;
    const head=await fetch(storybook,{method:'HEAD',signal:AbortSignal.timeout(25000)});
    if(head.ok)storybookStatus=head.status;
    else if(head.status===405){
      const pdf=await get(storybook);
      storybookStatus=pdf.status;
      await pdf.body?.cancel?.();
    }else throw Error('Storybook HEAD HTTP '+head.status);
    let playerTitle=null,video=null,videoError=null;
    try{
      const p=await readPlayer(id,fetch);
      playerTitle=p.item.cont_title;
      if(!isEpisodeMatch(playerTitle,hint.title))
        throw Error('Official player title mismatch');
      video=await verifyPlaylist(p.video,fetch);
    }catch(e){videoError=String(e.message||e).slice(0,250);}
    item.videoStatus=video?'verified':'awaiting_video';
    if(videoError)item.videoError=videoError;
    item.captionCueCount=cues.length;
    item.paragraphCount=paragraphs.length;
    item.storybookHeadStatus=storybookStatus;
    item.sourceArtifact=true;
    item.status='ready_for_chatgpt';
    sources.items.push({
      seriesId:hint.seriesId,episodeNumber:hint.episodeNumber,
      contentId:id,title:hint.title,level:hint.level,releaseDate:hint.releaseDate,
      publicationBlockedBySequenceGap:!!item.publicationBlockedBySequenceGap,
      missingEpisodeNumbers:item.missingEpisodeNumbers||[],
      officialSourceUrls:{textOriginal,caption,storybook},
      paragraphs,captionCues:cues,
      verification:{
        catalogContentId:id,officialCatalogEpisodeNumber:official.seriesEpisodeNumber,
        textLanguage:'en',paragraphCount:paragraphs.length,
        captionCueCount:cues.length,storybookHeadStatus:storybookStatus,
        playerTitle,videoStatus:item.videoStatus,videoError
      },
      status:'ready_for_chatgpt'
    });
    report.status='checked';
  }
}catch(e){
  report.status='blocked';
  report.errors.push(String(e.message||e).slice(0,800));
  if(report.items[0]&&report.items[0].status==='checking'){
    report.items[0].status='blocked';
    report.items[0].error=report.errors[0];
  }
}
await fs.writeFile(privatePath,JSON.stringify(sources,null,2)+'\n');
await fs.mkdir(path.dirname(reportPath),{recursive:true});
await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({
  status:report.status,contentId:id,items:report.items.map(x=>({status:x.status,videoStatus:x.videoStatus})),
  sourceReadyCount:sources.items.length,errors:report.errors,reportPath,
  privateArtifactName:report.privateArtifactName
}));
if(report.status==='blocked')process.exitCode=1;

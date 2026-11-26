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
     hint.officialSeriesId!=='FS0182'||!Number.isSafeInteger(hint.episodeNumber)||
     hint.episodeNumber<1||typeof hint.title!=='string'||hint.title.length<3||
     hint.publicationAuthorized!==false||
     (hint.videoUrl&&!/^https:\/\/cdn\.littlefox\.com\/contents_\d+\/hls\/\d+\/[^\s]+\/stream\.m3u8(?:\?.*)?$/.test(hint.videoUrl)))
    throw Error('Unexpected episode or untrusted hint payload; do not publish');
  report.sourceReleaseDate=hint.releaseDate;
  const release={
    seriesId:hint.seriesId,
    title:hint.title,
    level:hint.level,
    date:hint.releaseDate,
    calendarEpisodeNumber:hint.episodeNumber
  };
  // If the catalog has not indexed a new title yet, independently verify the
  // supplied exact C-ID against the official player and real media instead of
  // silently deriving a C-ID from the preceding episode.
  let official=null, catalogError=null;
  try {
    official=await resolveOfficialSeriesEpisode(release,fetch);
    if(official.seriesEpisodeNumber!==hint.episodeNumber)
      throw Error('Official FS0182 catalog episode number does not match hint');
    if(official.contentId!==id)
      throw Error('Official FS0182 catalog C-ID mismatch; catalog ID differs from user supplied ID');
  } catch(e) {
    if(!String(e.message||e).includes('Title not found in official series catalog')) throw e;
    catalogError=String(e.message||e);
  }
  const independentlyVerifiedPlayer=await readPlayer(id,fetch);
  if(!isEpisodeMatch(independentlyVerifiedPlayer.item.cont_title,hint.title))
    throw Error('Official player title does not match user specified episode');
  const officialPlaylist=await verifyPlaylist(independentlyVerifiedPlayer.video,fetch);
  if(hint.videoUrl) await verifyPlaylist(hint.videoUrl,fetch);
  const item={
    seriesId:hint.seriesId,episodeNumber:hint.episodeNumber,
    contentId:id,title:hint.title,level:hint.level,releaseDate:hint.releaseDate,
    contentIdVerified:true,sourceArtifact:false,status:'checking'
  };
  report.items.push(item);
  // Official material collection must not depend on R2 access.
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
    const playerTitle=independentlyVerifiedPlayer.item.cont_title;
    const video=officialPlaylist;
    const videoError=null;
    item.videoStatus='verified';
    item.officialCatalogStatus=official?'matched':'title_not_yet_indexed';
    if(catalogError)item.officialCatalogError=catalogError;
    if(hint.videoUrl)item.userProvidedVideoVerified=true;
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
        catalogContentId:official?.contentId||null,officialCatalogEpisodeNumber:official?.seriesEpisodeNumber||null,
        catalogStatus:official?'matched':'title_not_yet_indexed',catalogError,
        contentIdCheckedByOfficialPlayer:true,confirmedOfficialVideo:video,
        userProvidedVideoVerified:Boolean(hint.videoUrl),
        textLanguage:'en',paragraphCount:paragraphs.length,
        captionCueCount:cues.length,storybookHeadStatus:storybookStatus,
        playerTitle,videoStatus:item.videoStatus,videoError
      },
      status:'ready_for_chatgpt'
    });
    // R2 is read only and checked after real official sources are secured.
    // An R2 permission failure blocks publication, but not editorial handoff.
    try{
      const store=await makeR2(process.env,fetch);
      const currentRaw=await store.get('data/'+hint.seriesId+'/episodes.json');
      if(currentRaw===null)throw Error('R2 episode index missing');
      const episodes=JSON.parse(currentRaw);
      if(!Array.isArray(episodes))throw Error('R2 episode index not an array');
      const matches=episodes.filter(e=>Number(e.episodeId)===hint.episodeNumber||
        e.sourceContentId===id||e.storyBook?.contentId===id);
      if(matches.length){
        const exact=matches.length===1&&
          Number(matches[0].episodeId)===hint.episodeNumber&&
          (matches[0].sourceContentId||matches[0].storyBook?.contentId)===id;
        if(!exact){
          item.r2Status='conflict';
          item.status='blocked';
          item.sourceArtifact=false;
          sources.items.length=0;
          report.status='blocked';
          report.errors.push('R2 episode/C-ID conflict; no course approval or publishing');
        }else{
          item.r2Status='already_published';
          item.status='already_published';
          item.sourceArtifact=false;
          sources.items.length=0;
          report.status='checked';
        }
      }else{
        const highest=Math.max(0,...episodes.map(e=>Number(e.episodeId)||0));
        item.r2Status='not_published';
        if(hint.episodeNumber>highest+1){
          item.publicationBlockedBySequenceGap=true;
          item.r2LatestEpisodeNumber=highest;
          item.missingEpisodeNumbers=Array.from({length:hint.episodeNumber-highest-1},(_,i)=>highest+i+1);
          sources.items[0].publicationBlockedBySequenceGap=true;
          sources.items[0].missingEpisodeNumbers=item.missingEpisodeNumbers;
        }
        report.status='checked';
      }
    }catch(e){
      item.r2Status='unverified';
      item.publicationBlockedByR2Check=true;
      item.r2Error=String(e.message||e).slice(0,250);
      sources.items[0].publicationBlockedByR2Check=true;
      report.status='blocked';
      report.blockStage='r2_duplicate_check';
      report.errors.push('R2 duplicate verification unavailable: '+item.r2Error);
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

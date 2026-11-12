import fs from 'node:fs/promises';
import {makeR2,readPlayer,isEpisodeMatch,verifyPlaylist,parseCaptions,textParagraphs,textPageShape,ORIGINAL_TEXT} from '../littlefox-daily/core.mjs';

const request=JSON.parse(await fs.readFile('automation/littlefox-backfill/collect-request.json','utf8'));
if(request.mode!=='collect_historical_missing'||request.publish!==false||!Array.isArray(request.items)||!request.items.length)throw Error('Invalid read-only historical collection request');
const store=await makeR2(process.env,fetch);
const output={schemaVersion:1,mode:'historical_backfill_sources',collectedAt:new Date().toISOString(),items:[]};
const report={mode:request.mode,checkedAt:new Date().toISOString(),items:[]};
const get=async(url,init={})=>{const r=await fetch(url,{...init,signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Official HTTP '+r.status+' '+url);return r;};
for(const target of request.items){
 const row={...target,status:'checking',stages:[]};
 const src={...target,status:'blocked',verification:{},paragraphs:[],captionCues:[],player:null,videoUrl:null,storybookUrl:'https://res.littlefox.com/en/supplement/load_pdf/'+target.contentId};
 const stage=(name,details={})=>row.stages.push({name,...details});
 try{
  if(!/^C\d{7}$/.test(target.contentId)||!/^little-fox-[a-z0-9-]+$/.test(target.seriesId)||!Number.isInteger(target.episodeNumber))throw Error('Invalid target metadata');
  const [indexRaw,playerResult,textResponse]=await Promise.all([
   store.get('data/'+target.seriesId+'/episodes.json'),
   readPlayer(target.contentId,fetch,false).catch(e=>({error:String(e.message||e)})),
   get(ORIGINAL_TEXT(target.contentId))
  ]);
  const captionResponse=await fetch('https://cdn.littlefox.com/contents/caption/'+target.contentId+'.xml',{signal:AbortSignal.timeout(25000)}).catch(e=>({ok:false,status:0,error:String(e.message||e)}));
  const episodes=JSON.parse(indexRaw||'[]');
  if(!Array.isArray(episodes))throw Error('R2 episodes.json is not an array');
  const playerTitle=playerResult?.item?.cont_title||null;
  const actualTitle=playerTitle||target.title||null;
  if(!actualTitle)throw Error('Official player did not provide a title and no catalog title was available');
  if(target.title&&!isEpisodeMatch(actualTitle,target.title))throw Error('Official player title mismatch: '+actualTitle+' vs '+target.title);
  stage('official_player_title',{title:actualTitle,playerAvailable:!playerResult?.error});
  const englishHtml=await textResponse.text();
  const paragraphs=textParagraphs(englishHtml);
  if(paragraphs.length<3)throw Error('Official English Text paragraphs unavailable; '+textPageShape(englishHtml));
  stage('english_text',{paragraphCount:paragraphs.length});
  const xml=captionResponse.ok?await captionResponse.text():'';
  const cues=captionResponse.ok?parseCaptions(xml):[];
  if(cues.length<3&&Number(target.level)>=3)throw Error('Official caption XML unavailable or has fewer than 3 valid timed cues; HTTP '+(captionResponse.status||0));
  stage('caption_xml',{available:captionResponse.ok,cueCount:cues.length,httpStatus:captionResponse.status||0});
  let videoUrl=null,videoVerified=false,mediaKind=null;
  if(playerResult?.video){
    videoUrl=playerResult.video;
    if(/\.m3u8(?:$|[?#])/i.test(videoUrl)){
      try{videoUrl=await verifyPlaylist(videoUrl,fetch);videoVerified=true;mediaKind='hls';}catch(e){stage('video_not_verified',{error:String(e.message||e)});}
    }else{
      try{
        const mediaHost=new URL(videoUrl).hostname.toLowerCase();
        const mediaHead=await fetch(videoUrl,{method:'HEAD',signal:AbortSignal.timeout(25000)});
        if(/(^|\.)littlefox\.com$/.test(mediaHost)&&mediaHead.ok){videoVerified=true;mediaKind='direct-media';}
        else stage('video_not_verified',{host:mediaHost,status:mediaHead.status});
      }catch(e){stage('video_not_verified',{error:String(e.message||e)});}
    }
  }else stage('video_pending',{reason:playerResult?.error||'No player media URL'});
  const book=await get(src.storybookUrl,{method:'HEAD'}).catch(async e=>{
    const r=await fetch(src.storybookUrl,{headers:{Range:'bytes=0-7'},signal:AbortSignal.timeout(25000)});
    if(!r.ok)throw e;
    return r;
  });
  const pdfStatus=book.status;
  stage('storybook',{status:pdfStatus});
  const existing=episodes.filter(e=>Math.abs(Number(e.episodeId)-Number(target.episodeNumber))<=2||Number(e.episodeId)>=Math.max(0,...episodes.map(x=>Number(x.episodeId)||0))-2).map(e=>({episodeId:Number(e.episodeId),title:e.title||null,contentId:e.sourceContentId||e.storyBook?.contentId||null,videoType:e.video?.source||null,videoUrl:e.video?.hlsUrl||null,storybook:e.storyBook?.pdfUrl||null}));
  const songReady=Number(target.level)<3&&videoVerified&&(pdfStatus===200||pdfStatus===206||pdfStatus===405);
  const ready=videoVerified&&cues.length>=3&&(pdfStatus===200||pdfStatus===206||pdfStatus===405);
  Object.assign(src,{status:ready?'ready_for_chatgpt':songReady?'ready_for_song_review':videoVerified?'awaiting_caption_or_storybook':'awaiting_video',title:actualTitle,paragraphs,captionCues:cues,captionXml:xml||null,player:{title:playerTitle,videoUrl:playerResult?.video||null},videoUrl,videoVerified,mediaKind,storybookStatus:pdfStatus,verification:{englishText:true,captionXml:cues.length>=3,storybook:pdfStatus===200||pdfStatus===206||pdfStatus===405,episodeTitleMatched:!target.title||isEpisodeMatch(actualTitle,target.title),video:videoVerified},r2NearbyEpisodes:existing});
  row.status=src.status;row.actualTitle=actualTitle;row.paragraphCount=paragraphs.length;row.captionCueCount=cues.length;row.videoVerified=videoVerified;row.mediaKind=mediaKind;row.storybookStatus=pdfStatus;
 }catch(e){row.status='blocked';row.error=String(e.message||e).slice(0,500);src.status='blocked';src.error=row.error;}
 output.items.push(src);report.items.push(row);
}
await fs.writeFile('/tmp/littlefox-backfill-sources.json',JSON.stringify(output,null,2)+'\n');
await fs.writeFile('/tmp/littlefox-backfill-collection-report.json',JSON.stringify(report,null,2)+'\n');
const summary=['# Little Fox historical source collection','',...report.items.map(x=>'- '+x.seriesId+' #'+x.episodeNumber+' '+x.contentId+': '+x.status+'; Text '+(x.paragraphCount??0)+' paragraphs; captions '+(x.captionCueCount??0)+'; video '+(x.videoVerified?'verified':'pending')+'; PDF '+(x.storybookStatus??'not verified')),'','Read-only: no R2 writes, no outbox creation, no website deployment.'].join('\n');
console.log('LITTLEFOX_BACKFILL_COLLECTION '+JSON.stringify({total:report.items.length,ready:report.items.filter(x=>x.status==='ready_for_chatgpt').length,blocked:report.items.filter(x=>x.status==='blocked').length,awaitingVideo:report.items.filter(x=>x.status==='awaiting_video').length}));
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n');

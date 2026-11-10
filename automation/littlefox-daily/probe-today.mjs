/**
 * Read-only live probe: no R2/Supabase/Netlify/AI, never publishes.
 * Stores only metadata and HTTP diagnostics, not Little Fox's copyrighted text.
 */
import fs from 'node:fs/promises';
import {readPlayer,verifyPlaylist,parseCaptions,ORIGINAL_TEXT,TRANSLATED_TEXT,bilingualTextParagraphs} from './core.mjs';

const id=process.env.LF_PROBE_CID||'C0013536';
const title=process.env.LF_PROBE_TITLE||'A Happy Ending';
const official={
  original:ORIGINAL_TEXT(id),
  translated:TRANSLATED_TEXT(id),
  caption:`https://cdn.littlefox.com/contents/caption/${id}.xml`,
  storybook:`https://res.littlefox.com/en/supplement/load_pdf/${id}`
};
const result={schemaVersion:1,kind:'read_only_official_source_probe',date:'2026-11-10',contentId:id,title,checkedAt:new Date().toISOString(),checks:{},coursePublished:false,r2Modified:false};
const request=async(url,init={})=>fetch(url,{...init,signal:AbortSignal.timeout(18000)});
const checked=async(name,work)=>{
  try{const data=await work();result.checks[name]={ok:true,...data};}
  catch(err){result.checks[name]={ok:false,error:String(err.message||err).slice(0,280)};}
};
await checked('officialPlayer',async()=>{
  const p=await readPlayer(id,request);
  const actual=String(p.item.cont_title||'');
  if(!actual.toLowerCase().includes(title.toLowerCase()))throw Error('Title mismatch: '+actual);
  result.videoCandidate=p.video;
  return {title:actual,videoHost:new URL(p.video).hostname};
});
if(result.checks.officialPlayer?.ok)await checked('m3u8',async()=>{
  const url=await verifyPlaylist(result.videoCandidate,request);
  result.verifiedVideoUrl=url;
  return {playlistValid:true,host:new URL(url).hostname};
});
await checked('caption',async()=>{
  const response=await request(official.caption);if(!response.ok)throw Error('HTTP '+response.status);
  const cues=parseCaptions(await response.text());
  if(cues.length<3)throw Error('Fewer than three timed cues');
  return {cueCount:cues.length,start:cues[0].start,end:cues.at(-1).end};
});
let enHtml=null,zhHtml=null;
await checked('originalText',async()=>{
  const response=await request(official.original);if(!response.ok)throw Error('HTTP '+response.status);
  enHtml=await response.text();
  return {bytes:enHtml.length,nonEmpty:enHtml.length>100};
});
await checked('translatedText',async()=>{
  const response=await request(official.translated);if(!response.ok)throw Error('HTTP '+response.status);
  zhHtml=await response.text();
  return {bytes:zhHtml.length,nonEmpty:zhHtml.length>100};
});
if(enHtml&&zhHtml)await checked('bilingualAlignment',async()=>{
  const p=bilingualTextParagraphs(enHtml,zhHtml);
  return {paragraphs:p.length,translatedParagraphs:p.filter(x=>x.translation).length};
});
await checked('storybook',async()=>{
  const response=await request(official.storybook,{method:'HEAD'});
  if(!response.ok)throw Error('HTTP '+response.status);
  return {status:response.status,contentType:response.headers.get('content-type')||null};
});
delete result.videoCandidate;
await fs.writeFile('/tmp/littlefox-today-probe.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(Object.values(result.checks).some(x=>!x.ok))process.exitCode=1;

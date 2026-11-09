import {AwsClient} from 'aws4fetch';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';

const partFiles=[1,2,3,4,5].map(i=>'data-patches/littlefox-1080-manifest.part'+i+'.b64');
const encoded=(await Promise.all(partFiles.map(p=>readFile(p,'utf8')))).join('').trim();
if(encoded.length!==56012)throw Error('Manifest encoded length mismatch: '+encoded.length);
const manifest=JSON.parse(inflateSync(Buffer.from(encoded,'base64')).toString('utf8'));
if(manifest.rows.length!==871||manifest.paths.length!==47||manifest.urls.length!==864)throw Error('Manifest shape mismatch');
for(const k of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])if(!process.env[k])throw Error('Missing '+k);
const client=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
const objUrl=key=>process.env.R2_ENDPOINT.replace(/\/+$/,'')+'/'+encodeURIComponent(process.env.R2_BUCKET)+'/'+key.split('/').map(encodeURIComponent).join('/');
async function get(key){
 const r=await client.fetch(objUrl(key),{method:'GET',signal:AbortSignal.timeout(35000)});
 if(!r.ok)throw Error('R2 GET '+key+' HTTP '+r.status);
 return JSON.parse(await r.text());
}
const grouped=new Map();
for(const row of manifest.rows){const [pi,ep,cid,ui]=row;const key=manifest.paths[pi];if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push({episodeId:ep,contentId:cid,url1080:manifest.urls[ui]});}
const results={files:grouped.size,rows:manifest.rows.length,ready720:0,alreadyCorrect1080:0,conflicts:[],idMismatches:[],missingEpisodes:[],noVideo:[],other720Fallbacks:0};
for(const [key,items] of grouped){
 const episodes=await get(key);
 if(!Array.isArray(episodes))throw Error('R2 episode data is not an array: '+key);
 for(const item of items){
  const ep=episodes.find(x=>Number(x.episodeId)===Number(item.episodeId));
  if(!ep){results.missingEpisodes.push({key,episodeId:item.episodeId});continue;}
  if(ep.sourceContentId!==item.contentId && ep.storyBook?.contentId!==item.contentId){
   results.idMismatches.push({key,episodeId:item.episodeId,expected:item.contentId,actual:ep.sourceContentId||ep.storyBook?.contentId||null});continue;
  }
  const current=ep.video?.hlsUrl;
  if(!current){results.noVideo.push({key,episodeId:item.episodeId});continue;}
  if(current===item.url1080){results.alreadyCorrect1080++;continue;}
  if(/\/hls\/720\//.test(current)){
    results.ready720++;
    if(ep.video?.hls720Url && !/\/hls\/720\//.test(ep.video.hls720Url))results.other720Fallbacks++;
  }else{
    results.conflicts.push({key,episodeId:item.episodeId,current,target:item.url1080});
  }
 }
}
console.log('LITTLEFOX_1080_AUDIT '+JSON.stringify(results));
if(results.conflicts.length||results.idMismatches.length||results.missingEpisodes.length||results.noVideo.length)throw Error('1080P manifest did not pass all safety checks; R2 was not modified.');
console.log('AUDIT_PASS: All 871 rows match an existing episode and content ID; all primary sources are either the exact target 1080P URL or an existing 720P HLS URL. No writes performed.');

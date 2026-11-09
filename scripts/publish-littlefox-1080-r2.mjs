import {AwsClient} from 'aws4fetch';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const partFiles=[1,2,3,4,5].map(i=>'data-patches/littlefox-1080-manifest.part'+i+'.b64');
const encoded=(await Promise.all(partFiles.map(p=>readFile(p,'utf8')))).join('').trim();
if(encoded.length!==56012)throw Error('Manifest encoded length mismatch: '+encoded.length);
const manifest=JSON.parse(inflateSync(Buffer.from(encoded,'base64')).toString('utf8'));
if(manifest.rows.length!==871||manifest.paths.length!==47||manifest.urls.length!==864)throw Error('Manifest shape mismatch');
for(const k of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])if(!process.env[k])throw Error('Missing '+k);
const client=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
const endpoint=process.env.R2_ENDPOINT.replace(/\/+$/,'');
const objUrl=key=>endpoint+'/'+encodeURIComponent(process.env.R2_BUCKET)+'/'+key.split('/').map(encodeURIComponent).join('/');
const sha=x=>createHash('sha256').update(x).digest('hex');
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
async function getBytes(key){
 const r=await client.fetch(objUrl(key),{method:'GET',signal:AbortSignal.timeout(35000)});
 check(r.ok,'R2 GET '+key+' HTTP '+r.status);
 return Buffer.from(await r.arrayBuffer());
}
async function getJson(key){return JSON.parse((await getBytes(key)).toString('utf8'));}
async function putVerified(key,body){
 const r=await client.fetch(objUrl(key),{method:'PUT',body,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'},signal:AbortSignal.timeout(35000)});
 check(r.ok,'R2 PUT '+key+' HTTP '+r.status);
 check(sha(await getBytes(key))===sha(body),'R2 read-after-write checksum mismatch: '+key);
}
async function parallel(items,limit,fn){
 let next=0;
 const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
  while(true){const i=next++;if(i>=items.length)return;await fn(items[i],i);}
 });
 await Promise.all(workers);
}
const grouped=new Map();
for(const row of manifest.rows){
 const [pi,episodeId,contentId,ui]=row,key=manifest.paths[pi];
 if(!grouped.has(key))grouped.set(key,[]);
 grouped.get(key).push({episodeId,contentId,url1080:manifest.urls[ui]});
}
const plans=[];
await parallel([...grouped.entries()],8,async([key,items])=>{
 const original=await getBytes(key);
 const episodes=JSON.parse(original.toString('utf8'));
 check(Array.isArray(episodes),'Episode data is not array: '+key);
 const updates=[];
 for(const item of items){
  const ep=episodes.find(x=>Number(x.episodeId)===Number(item.episodeId));
  check(ep,'Missing episode '+key+' #'+item.episodeId);
  check(ep.sourceContentId===item.contentId||ep.storyBook?.contentId===item.contentId,
    'Content ID mismatch '+key+' #'+item.episodeId);
  check(ep.video&&typeof ep.video==='object','Missing video object '+key+' #'+item.episodeId);
  const current=ep.video.hlsUrl;
  check(current,'Missing primary HLS '+key+' #'+item.episodeId);
  if(current===item.url1080){updates.push({episodeId:item.episodeId,status:'already1080'});continue;}
  check(/\/hls\/720\//.test(current),'Refusing to overwrite non-720 primary source '+key+' #'+item.episodeId+': '+current);
  check(/\/hls\/1080\//.test(item.url1080),'Manifest target is not 1080P: '+item.url1080);
  // Preserve the exact previous primary 720 URL as the user's explicit 720P choice.
  if(ep.video.hls720Url && ep.video.hls720Url!==current){
    ep.video.hls720PreviousUrl=ep.video.hls720Url;
  }
  ep.video.hls720Url=current;
  ep.video.hlsUrl=item.url1080;
  updates.push({episodeId:item.episodeId,status:'updated'});
 }
 const body=Buffer.from(JSON.stringify(episodes,null,2)+'\n','utf8');
 plans.push({key,backupKey:'__course-backups/littlefox-1080p-20261110/'+key.replace(/^data\//,''),original,body,updates});
});
const updated=plans.reduce((n,p)=>n+p.updates.filter(x=>x.status==='updated').length,0);
const already=plans.reduce((n,p)=>n+p.updates.filter(x=>x.status==='already1080').length,0);
check(updated+already===871,'Expected exactly 871 manifest rows, got '+(updated+already));
check(plans.length===47,'Expected 47 episode files');
check(updated===871,'Expected all 871 listed 720P sources to be replaced; found '+updated+' updates and '+already+' already updated');
console.log('PRECHECK_PASS: 871 matched episode records in 47 R2 files; all are 720P primary sources with exact 1080P target URLs. Preparing full-file backups.');
// Every original file is backed up and read-back verified before any live data object is changed.
await parallel(plans,6,async p=>await putVerified(p.backupKey,p.original));
console.log('BACKUP_PASS: All 47 original episodes.json files backed up and checksum-verified.');
await parallel(plans,6,async p=>await putVerified(p.key,p.body));
console.log('R2_WRITE_PASS: All 47 updated episodes.json files written and checksum-verified.');
// Verify the live public Netlify /data route exposes the new primary source and the retained 720P choice.
await parallel(plans,6,async p=>{
 const r=await fetch('https://yqxyy-r2.netlify.app/'+p.key,{cache:'no-store',signal:AbortSignal.timeout(35000)});
 check(r.ok,'Public Netlify route HTTP '+r.status+' for '+p.key);
 const episodes=await r.json();
 for(const u of p.updates){
  const ep=episodes.find(x=>Number(x.episodeId)===Number(u.episodeId));
  check(ep,'Public route missing episode '+p.key+' #'+u.episodeId);
  if(u.status==='updated'){
    const original=p.updates.find(x=>x.episodeId===u.episodeId);
    check(/\/hls\/1080\//.test(ep.video?.hlsUrl||''),'Public route does not show 1080P '+p.key+' #'+u.episodeId);
    check(/\/hls\/720\//.test(ep.video?.hls720Url||''),'Public route lost 720P choice '+p.key+' #'+u.episodeId);
  }
 }
});
console.log('PUBLIC_VERIFY_PASS: All 871 1080P primary URLs and 720P choices verified through Netlify public data routes.');
console.log('SUMMARY '+JSON.stringify({files:plans.length,updated,already1080:already,backupPrefix:'__course-backups/littlefox-1080p-20261110/',untouched720Rows:921}));
console.log('SUCCESS: Little Fox 1080P upgrades published to R2.');

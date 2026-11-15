/**
 * Atomic single-key publication of the COMPLETE Rocket Girl V2 Quiz.
 * Requires a 252-episode offline review package with explicit releaseReady.
 * Do not invoke for a partial package. Keep all originals and source data.
 */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {AwsClient} from 'aws4fetch';
import {verifyLesson} from './rocket-girl-compile-offline.mjs';
const SERIES='little-fox-rocket-girl-fs0065',TARGET='data/'+SERIES+'/quiz.json';
const checksum=x=>createHash('sha256').update(x).digest('hex');
const insist=(ok,msg)=>{if(!ok)throw Error(msg);};
export function assertFullPackage(manifest,replacements){
  insist(manifest?.seriesId===SERIES&&Number(manifest.level)===4,
    'Invalid Rocket Girl series/level');
  insist(manifest?.complete===true&&manifest?.releaseReady===true&&
    manifest.reviewedEpisodes===252&&manifest.reviewedQuestions===1260&&
    Array.isArray(manifest.pendingEpisodes)&&manifest.pendingEpisodes.length===0,
    'Refuse partial package; require all 252 reviewed episodes and 1260 questions');
  const keys=Object.keys(replacements).sort((a,b)=>Number(a)-Number(b));
  insist(keys.length===252&&keys.every((k,i)=>k===String(i+1)),
    'Replacement must contain every episode, 1 through 252');
  for(let i=1;i<=252;i++){
    const item=replacements[String(i)];
    insist(item?.episodeId===i&&item.styleReference==='yqxyy-v2-story-comprehension'&&
      Array.isArray(item.questions)&&item.questions.length===5,
      'Incomplete episode '+i);
    insist(item.questions.every((q,n)=>q.id==='q'+(n+1)&&q.options?.length===4&&
      q.evidence?.sourceContentId&&q.evidence?.quote&&q.source==='editorial-official-read'),
      'Evidence/options missing episode '+i);
  }
  return true;
}
export async function main(env=process.env){
  insist(env.ROCKET_GIRL_FINAL_PUBLISH==='I_UNDERSTAND_SINGLE_R2_REPLACEMENT',
    'Publication requires explicit final publication consent flag');
  const src=env.PACKAGE_DIR||'out/rocketgirl-v2-offline';
  const [manifest,replacements]=await Promise.all([
    readFile(src+'/review-manifest.json','utf8').then(JSON.parse),
    readFile(src+'/reviewed-replacements.json','utf8').then(JSON.parse)
  ]);
  assertFullPackage(manifest,replacements); // must happen before any R2 write
  for(const n of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])
    insist(Boolean(env[n]),'Missing R2 credential '+n);
  const base=env.R2_ENDPOINT.replace(/\/+$/,'')+'/'+encodeURIComponent(env.R2_BUCKET)+'/';
  const client=new AwsClient({accessKeyId:env.R2_ACCESS_KEY_ID,
    secretAccessKey:env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
  const url=key=>base+key.split('/').map(encodeURIComponent).join('/');
  const get=async key=>{
    const r=await client.fetch(url(key),{method:'GET',signal:AbortSignal.timeout(30000)});
    insist(r.ok,'Signed R2 GET '+key+' HTTP '+r.status);
    return Buffer.from(await r.arrayBuffer());
  };
  const put=async(key,bytes)=>{
    const r=await client.fetch(url(key),{method:'PUT',body:bytes,
      headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'},
      signal:AbortSignal.timeout(30000)});
    insist(r.ok,'R2 PUT '+key+' HTTP '+r.status);
    await r.body?.cancel();
    insist(checksum(await get(key))===checksum(bytes),'Signed R2 readback mismatch '+key);
  };
  // Publication only when the source catalogue still matches the reviewed
  // original. Never overwrite edits made by other admins since packaging.
  const existing=await get(TARGET);
  const old=JSON.parse(existing.toString('utf8'));
  insist(checksum(JSON.stringify(old))===manifest.originalQuizChecksum,
    'Existing R2 quiz changed since review; rebuild and reapprove package');
  const remoteRead=await fetch(
    'https://pub-bf9dac62ea094bcdae4eca9e743f9b61.r2.dev/data/'+SERIES+'/reading-lessons.json',
    {cache:'no-store',signal:AbortSignal.timeout(30000)}).then(r=>{
      insist(r.ok,'Cannot verify live public Read');return r.json();
    });
  const remoteEpisodes=await fetch(
    'https://pub-bf9dac62ea094bcdae4eca9e743f9b61.r2.dev/data/'+SERIES+'/episodes.json',
    {cache:'no-store',signal:AbortSignal.timeout(30000)}).then(r=>{
      insist(r.ok,'Cannot verify live episode index');return r.json();
    });
  insist(remoteEpisodes.length===252,'Episode count changed since review');
  for(const ep of remoteEpisodes){
    const replacement=replacements[String(ep.episodeId)];
    const actual=verifyLesson({
      episodeId:ep.episodeId,title:ep.title,sourceContentId:ep.sourceContentId,
      questions:replacement.questions},ep,remoteRead[String(ep.episodeId)]);
    insist(JSON.stringify(actual.questions)===JSON.stringify(replacement.questions),
      'Read evidence drift at episode '+ep.episodeId);
  }
  // All 1,260 questions have passed this validator before the first R2 write.
  const backup='__course-backups/rocket-girl-v2-atomic/'+
    String(env.GITHUB_RUN_ID||Date.now())+'/quiz-before-v2.json';
  await put(backup,existing);
  // Check for concurrent admin editing after backup and before the one PUT.
  insist(checksum(await get(TARGET))===checksum(existing),'Concurrent Quiz edit; abort');
  const body=Buffer.from(JSON.stringify(replacements,null,2)+'\n','utf8');
  await put(TARGET,body); // one complete replacement, no per-episode overwrites
  console.log('ROCKET_GIRL_V2_FULL_PUBLISH '+JSON.stringify({
    seriesId:SERIES,episodes:252,questions:1260,backup,
    checksum:checksum(body),signedReadbackVerified:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await main();

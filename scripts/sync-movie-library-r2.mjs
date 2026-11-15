import {readFile,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {AwsClient} from 'aws4fetch';

export const OBJECT_KEY='data/movie-library-published.json';
const FIELDS='id,category,media_type,tmdb_id,title,title_zh,year,poster_url,overview,season_number,episode_number,published,sort_order,created_at,updated_at,playback_sources';
export async function publicConfig(){
  const source=await readFile(new URL('../js/supabase-config.js',import.meta.url),'utf8');
  const context={window:{}};
  vm.runInNewContext(source,context,{timeout:1000});
  const {url,publishableKey}=context.window.STORYFOX_SUPABASE||{};
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url||'')||!/^sb_publishable_[\w-]+$/.test(publishableKey||''))throw Error('Invalid public Supabase config');
  return {url:url.replace(/\/$/,''),key:publishableKey};
}

export async function readPublished({url,key,fetcher=fetch,pageSize=500}){
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>500)throw Error('Invalid page size');
  const rows=[];let expected=null;
  for(let offset=0;;offset+=pageSize){
    const request=new URL('/rest/v1/movie_library',url);
    for(const [k,v] of Object.entries({select:FIELDS,published:'eq.true',order:'sort_order.asc,created_at.desc,id.asc',limit:String(pageSize),offset:String(offset)}))request.searchParams.set(k,v);
    const response=await fetcher(request.toString(),{headers:{apikey:key,Prefer:'count=exact',Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('Supabase catalogue HTTP '+response.status+' at offset '+offset);
    const match=(response.headers.get('content-range')||'').match(/\/(\d+)$/);
    if(!match)throw Error('Missing exact Supabase row count');
    const count=Number(match[1]);
    if(!Number.isSafeInteger(count)||(expected!==null&&count!==expected))throw Error('Supabase catalogue changed during export');
    expected=count;
    const page=await response.json();
    if(!Array.isArray(page)||page.length>pageSize)throw Error('Invalid Supabase page');
    rows.push(...page);
    if(rows.length===expected)break;
    if(rows.length>expected||page.length!==pageSize)throw Error('Incomplete Supabase catalogue page');
    if(offset>100000)throw Error('Catalogue exceeds safety limit');
  }
  return validate(rows,expected);
}

export function validate(rows,expected=rows.length){
  if(!Array.isArray(rows)||rows.length!==expected)throw Error('Catalogue row count mismatch');
  const ids=new Set();
  for(const row of rows){
    if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id))throw Error('Duplicate/missing movie ID');
    ids.add(row.id);
    if(row.published!==true||!['animated','kids','documentary','animation'].includes(row.category)||!['movie','tv'].includes(row.media_type))throw Error('Invalid public movie');
    if(row.media_type==='tv'&&(!Number.isInteger(row.season_number)||row.season_number<1||!Number.isInteger(row.episode_number)||row.episode_number<1))throw Error('Invalid TV episode');
    if(!Array.isArray(row.playback_sources))throw Error('Invalid playback sources');
    if(Object.prototype.hasOwnProperty.call(row,'created_by'))throw Error('Private author ID in public export');
  }
  return rows;
}

export function snapshot(rows,generatedAt=new Date().toISOString()){
  validate(rows);
  const checksum=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  return {schemaVersion:1,source:'movie_library',generatedAt,total:rows.length,checksum,rows};
}
function targetURL(){
  const origin=new URL(process.env.R2_ENDPOINT||'');
  const bucket=process.env.R2_BUCKET||'';
  if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.port||origin.username||origin.password||origin.search||origin.hash||
    !/^[0-9a-f]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(origin.hostname)||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))throw Error('Invalid R2 endpoint/bucket');
  return origin.origin+'/'+encodeURIComponent(bucket)+'/'+OBJECT_KEY;
}
export async function main(){
  const {url,key}=await publicConfig();
  const rows=await readPublished({url,key});
  if(!rows.length)throw Error('Empty public catalogue; refusing to overwrite existing R2');
  const fresh=snapshot(rows);
  if(!process.env.R2_ACCESS_KEY_ID||!process.env.R2_SECRET_ACCESS_KEY)throw Error('Missing R2 GitHub secrets');
  const r2=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
  const object=targetURL();
  const preflight=await r2.fetch(object,{method:'GET'});let old=null;
  if(preflight.ok){
    old=await preflight.json();
    if(old?.schemaVersion!==1||!Number.isSafeInteger(old.total))throw Error('Unknown existing snapshot');
    if(rows.length<Math.floor(old.total*0.75))throw Error('Unexpected catalogue shrink; refusing overwrite');
  }else if(preflight.status!==404)throw Error('R2 preflight failed HTTP '+preflight.status);
  let action='unchanged';
  if(!old||old.checksum!==fresh.checksum){
    const put=await r2.fetch(object,{method:'PUT',headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60'},body:JSON.stringify(fresh)});
    if(!put.ok)throw Error('R2 PUT failed HTTP '+put.status);
    await put.body?.cancel();action='uploaded';
  }
  const verified=await r2.fetch(object,{method:'GET'});
  if(!verified.ok)throw Error('R2 GET readback HTTP '+verified.status);
  const stored=await verified.json();
  if(stored?.schemaVersion!==1||stored.total!==rows.length||stored.checksum!==fresh.checksum||!Array.isArray(stored.rows)||stored.rows.length!==rows.length)throw Error('R2 readback did not match source');
  const categories=Object.fromEntries([...new Set(rows.map(x=>x.category))].map(c=>[c,rows.filter(x=>x.category===c).length]));
  const summary={action,key:OBJECT_KEY,total:rows.length,categories,sha256:fresh.checksum,verified:true};
  console.log('MOVIE_R2_SYNC '+JSON.stringify(summary));
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,'### Movie Library R2 Sync\n- Result: '+action+'\n- Object: '+OBJECT_KEY+'\n- Published rows: '+rows.length+'\n- SHA256: '+fresh.checksum+'\n- Signed R2 readback: verified\n');
  return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();

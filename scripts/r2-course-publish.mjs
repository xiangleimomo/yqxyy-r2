// Shared R2 publishing adapter. Does not change website code or Git history.
import fs from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

const required = ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
for (const key of required) if (!process.env[key]) throw new Error('Missing '+key);
const endpoint = process.env.R2_ENDPOINT.replace(/\/$/,'');
const bucket = process.env.R2_BUCKET;
const client = new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, service:'s3', region:'auto' });
const urlFor = key => endpoint+'/'+encodeURIComponent(bucket)+'/'+key.split('/').map(encodeURIComponent).join('/');
async function put(key,body,contentType) {
  const url=urlFor(key);
  const response=await client.fetch(url,{method:'PUT',headers:{'content-type':contentType,'cache-control':'no-cache'},body});
  if(!response.ok) throw new Error('R2 PUT '+key+': HTTP '+response.status+' '+(await response.text()).slice(0,300));
  const verify=await client.fetch(url,{method:'HEAD'});
  if(!verify.ok) throw new Error('R2 HEAD '+key+': HTTP '+verify.status);
}
const mime = name => name.endsWith('.json')?'application/json; charset=utf-8':name.endsWith('.vtt')?'text/vtt; charset=utf-8':name.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':name.endsWith('.pdf')?'application/pdf':'application/octet-stream';
async function walk(dir) {
  const files=[];
  for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) files.push(...await walk(full));
    else if(entry.isFile()) files.push(full);
  }
  return files;
}
const [mode,dir,prefix='data/']=process.argv.slice(2);
if(mode==='smoke') {
  const key='__pipeline-tests/'+(process.env.GITHUB_RUN_ID||'local')+'-'+(process.env.GITHUB_JOB||'smoke')+'.json';
  await put(key,JSON.stringify({engine:process.env.COURSE_ENGINE||'unknown',testedAt:new Date().toISOString()}),'application/json');
  console.log('R2 upload + HEAD verified:',key);
} else if(mode==='publish') {
  if(!dir) throw new Error('Usage: node scripts/r2-course-publish.mjs publish <directory> [key-prefix]');
  const root=path.resolve(dir);
  const files=await walk(root);
  if(!files.length) throw new Error('No files to publish');
  const ordered=files.sort((a,b)=>Number(/(?:series-list|episodes|index)\.json$/.test(a))-Number(/(?:series-list|episodes|index)\.json$/.test(b)));
  for(const file of ordered) {
    const rel=path.relative(root,file).split(path.sep).join('/');
    if(rel.startsWith('..')) throw new Error('Unsafe path');
    const key=prefix.replace(/^\/+|\/+$/g,'')+'/'+rel;
    await put(key,await fs.readFile(file),mime(file));
    console.log('Published',key);
  }
} else throw new Error('Mode must be smoke or publish');

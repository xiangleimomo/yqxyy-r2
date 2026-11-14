#!/usr/bin/env node
/**
 * READ-ONLY Android/Netlify exit audit.
 * No secrets, R2 writes, deploys or changes to any live configuration.
 * Its outputs inform the switch from the embedded Netlify origin to a
 * future independent Android origin and verified R2/gateway endpoints.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'..');
const PUBLIC_R2=process.env.R2_PUBLIC_READ_URL ||
  'https://pub-bf9dac62ea094bcdae4eca9e743f9b61.r2.dev';
const tracked=[
  'android/app/build.gradle',
  'android/app/src/main/java/com/yqxyy/english/MainActivity.java',
  'js/app.js','js/books.js','js/movie-library.js','js/movies.js',
  'js/movie-subtitles.js','js/app-updates.js','js/cloud-account.js',
  'netlify.toml'
];
const routeGroups={
  r2Data:'/data/*',
  pdfDownload:'/book-download/*',
  movieProxy:'/_movie-media/bluevelvet/*',
  backdrop:'/.netlify/functions/movie-backdrop',
  movieSearch:'/.netlify/functions/movie-library-metadata',
  tvSeasons:'/.netlify/functions/movie-tv-seasons',
  movieStream:'/.netlify/functions/movie-stream',
  subtitleExplorer:'/.netlify/functions/source-explorer-api',
  movieStudySubtitles:'/.netlify/functions/movie-study-subtitles'
};

const inventory={};
for(const file of tracked){
  let body;
  try{body=await fs.readFile(path.join(ROOT,file),'utf8');}
  catch{continue;}
  const hits=[];
  for(const [i,line] of body.split('\n').entries()){
    if(/netlify|\/data\/|\/book-download\/|\/_movie-media\/|\.netlify\/functions/i.test(line)){
      hits.push({line:i+1,detail:line.trim().slice(0,190)});
    }
  }
  if(hits.length)inventory[file]=hits;
}

const urls=['data/series-list.json','data/books.json'];
const tests=[];
for(const key of urls){
  const url=PUBLIC_R2.replace(/\/$/,'')+'/'+key;
  const row={key,url};
  const fetchOpts={redirect:'error',signal:AbortSignal.timeout(9000)};
  try{
    const response=await fetch(url,{...fetchOpts,method:'HEAD'});
    row.headStatus=response.status;
    row.contentType=response.headers.get('content-type');
    row.allowOrigin=response.headers.get('access-control-allow-origin');
    await response.body?.cancel();
  }catch(e){row.headError=String(e?.message||e);}
  try{
    const response=await fetch(url,{...fetchOpts,headers:{range:'bytes=0-1023',Origin:'https://appassets.androidplatform.net'}});
    row.getStatus=response.status;
    row.range=response.headers.get('content-range');
    row.cors=response.headers.get('access-control-allow-origin');
    const reader=response.body?.getReader();
    if(reader){
      const first=await reader.read();
      row.sample=first.value?new TextDecoder().decode(first.value.subarray(0,90)):'';
      await reader.cancel();
    }
  }catch(e){row.getError=String(e?.message||e);}
  row.accessible=[200,206].includes(row.getStatus);
  row.corsForApp=row.cors==='*'||row.cors==='https://appassets.androidplatform.net';
  tests.push(row);
}

const result={
  checkedAt:new Date().toISOString(),
  target:'Android phone APK (android/) only; android-tv/ audited separately',
  currentAppOrigin:'https://yqxyy-r2.netlify.app/',
  proposedLocalOrigin:'https://appassets.androidplatform.net/',
  r2PublicProbe:PUBLIC_R2,
  routeGroups,
  sourceInventory:inventory,
  remoteTests:tests,
  preliminaryVerdict:tests.every(x=>x.accessible)
    ? 'R2 public URL readable; still verify CORS, Range, security, and production stability'
    : 'R2 public URL not verified for all critical objects; do NOT switch Android yet'
};
console.log(JSON.stringify(result,null,2));

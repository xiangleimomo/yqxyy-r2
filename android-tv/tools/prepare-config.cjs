'use strict';
const fs=require('node:fs');
const path=require('node:path');
const cfg=fs.readFileSync(path.join(__dirname,'../../js/supabase-config.js'),'utf8');
const gradle=fs.readFileSync(path.join(__dirname,'../../android/app/build.gradle'),'utf8');
const url=cfg.match(/\burl\s*:\s*['"]([^'"]+)['"]/);
const key=cfg.match(/\bpublishableKey\s*:\s*['"]([^'"]+)['"]/);
const site=gradle.match(/findProperty\('websiteUrl'\)\s*\?:\s*'([^']+)'/);
const r2=gradle.match(/findProperty\('r2DataOrigin'\)\s*\?:\s*'([^']+)'/);
const root=u=>{
  const parsed=new URL(u);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||
     (parsed.pathname!==''&&parsed.pathname!=='/')||parsed.search||parsed.hash)
    throw new Error('Public resource origin must be a bare HTTPS hostname');
  return parsed.origin+'/';
};
if(!url||!key||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url[1])||!key[1].trim()||!site||!r2)
  throw new Error('Missing public Supabase or current Android resource configuration');
const output=path.join(__dirname,'../app/src/main/assets/tv-config.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({
  url:url[1].replace(/\/$/,''),
  key:key[1],
  webUrl:root(site[1]),
  r2DataOrigin:root(r2[1])
}));
console.log('TV public Supabase and current Android media origins prepared');

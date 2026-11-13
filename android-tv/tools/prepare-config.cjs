'use strict';
const fs=require('node:fs');
const path=require('node:path');
const config=fs.readFileSync(path.join(__dirname,'../../js/supabase-config.js'),'utf8');
const url=config.match(/\burl\s*:\s*['"]([^'"]+)['"]/);
const key=config.match(/\bpublishableKey\s*:\s*['"]([^'"]+)['"]/);
if(!url||!key||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url[1])||!key[1].trim())
  throw new Error('Missing public Supabase endpoint or publishable key');
const output=path.join(__dirname,'../app/src/main/assets/tv-config.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({url:url[1].replace(/\/$/,''),key:key[1]}));
console.log('TV public Supabase configuration prepared');

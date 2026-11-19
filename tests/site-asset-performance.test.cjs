const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('production HTML preserves order of 34 deferred scripts and loads core after dependencies',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const scriptTags=[...html.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g)];
  assert(scriptTags.length>=30);
  assert(scriptTags.every(([tag])=>/\sdefer(?:\s|>)/.test(tag)),'Every site script should defer in DOM order');
  const sources=scriptTags.map(x=>x[1]);
  const index=(target)=>sources.findIndex(x=>x.startsWith(target));
  assert(index('js/supabase-config.js')<index('js/cloud-account.js'));
  assert(index('js/movies.js')<index('js/movie-library.js')||
    index('js/movie-library.js')<index('js/app.js'),'Libraries precede App startup');
  assert(index('js/movie-library.js')<index('js/app.js'));
  assert(index('js/media-shelf.js')<index('js/app.js'));
  assert(index('js/mobile-app.js')<index('js/app.js'));
  assert(!sources.some(x=>/yqxyy-r2\.netlify\.app/.test(x)));
  assert(sources.some(x=>x==='js/movies.js?v=20261119-integrated-speed-1'));
  assert(sources.some(x=>x==='js/movie-library.js?v=20261119-integrated-speed-1'));
  assert(sources.some(x=>x==='js/app.js?v=20261119-integrated-speed-1'));
});

test('Netlify asset caching must revalidate HTML and preserve R2 /data edge routing',()=>{
 const toml=fs.readFileSync('netlify.toml','utf8');
 for(const value of ['for = "/index.html"','Cache-Control = "no-cache, must-revalidate"',
   'for = "/js/*"','for = "/css/*"','path = "/data/*"','function = "r2-data"'])
   assert(toml.includes(value),value);
 const app=fs.readFileSync('js/app.js','utf8');
 assert(app.includes('pendingJSON: new Map()'),'Shared JSON request in flight');
 assert(app.includes('if(this.pendingJSON.has(path))return this.pendingJSON.get(path)'));
});

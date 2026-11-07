const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const seriesId of ['little-fox-test','movie-test']){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://lesson.test/**',r=>r.fulfill({contentType:r.request().url().endsWith('.vtt')?'text/vtt':'text/html',body:r.request().url().endsWith('.vtt')?'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nMobile lesson subtitle\n':'<main id="app"></main>'}));await page.goto('https://lesson.test/');
 const index=fs.readFileSync('index.html','utf8');for(const m of index.matchAll(/href="(css\/[^"?]+)(?:\?[^\"]*)?"/g))await page.addStyleTag({content:fs.readFileSync(m[1],'utf8')});for(const m of index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))await page.addStyleTag({content:m[1]});
 await page.addScriptTag({content:fs.readFileSync('js/app.js','utf8').replace('App.start();','')});await page.addScriptTag({content:fs.readFileSync('js/mobile-external-caption.js','utf8')});
 await page.evaluate(seriesId=>{
  window.MobileApp={active:true};document.body.classList.add('sf-mobile-app');document.documentElement.classList.add('sf-mobile-app');window.Hls=class{static isSupported(){return false;}};
  App.canAccessEpisode=()=>true;App.isGuestEpisodeLimit=()=>false;
  const d={seriesId,episodeId:1,series:{level:1,totalEpisodes:1},ep:{episodeId:1,status:'published',modules:{},video:{hlsUrl:'https://example.test/video.m3u8'}}};
  App.cache[`data/${seriesId}/episodes.json`]=[d.ep];App.el().innerHTML=App.hlsVideoPanel(d);
  const video=document.querySelector('video');Object.defineProperty(video,'currentTime',{get:()=>2});App.bindLessonPanel('watch',d,App.el());video.dispatchEvent(new Event('timeupdate'));
 },seriesId);
 await page.waitForFunction(()=>document.querySelector('.sf-mobile-caption-line')?.textContent==='Mobile lesson subtitle');
 assert(await page.locator('.sf-mobile-captions-outside').isVisible());assert(await page.locator('.sf-mobile-caption-line').isVisible());
 assert(await page.locator('.sf-lesson-toolbar').isVisible(),'episode learning retains its own mobile toolbar');
 assert.equal(await page.locator('.sf-mobile-captions-outside').evaluate(el=>el.hidden),false);
 assert.deepEqual(errors,[]);await context.close();console.log('PASS mobile caption integration: '+seriesId);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

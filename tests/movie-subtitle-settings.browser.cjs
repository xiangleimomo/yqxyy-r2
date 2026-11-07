const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const index=read('index.html');
async function setup(browser,mobile){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:900},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://subtitle.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="app"><section class="direct-video-panel sf-movie-lesson-player sf-full-movie-player"><div class="movie-watch-frame video-wrap"><video playsinline></video></div></section></main>'}));
  await page.goto('https://subtitle.test/');
  if(mobile)await page.evaluate(()=>{document.body.classList.add('sf-mobile-app');document.documentElement.classList.add('sf-mobile-app');});
  for(const match of index.matchAll(/href="(css\/[^"?]+)(?:\?[^\"]*)?"/g))await page.addStyleTag({content:read(match[1])});
  for(const file of ['source-lab/core.js','js/app.js','js/movie-subtitles.js'])await page.addScriptTag({content:read(file).replace('App.start();','')});
  await page.evaluate(()=>{
    window.testClock=1;window.testHls=null;
    const video=document.querySelector('video');Object.defineProperty(video,'currentTime',{get:()=>testClock,set:value=>{testClock=value;}});
    window.Hls={Events:{SUBTITLE_TRACKS_UPDATED:'tracks',MANIFEST_PARSED:'manifest',CUES_PARSED:'cues'}};
    window.disposeMovieSubtitles=MovieSubtitles.mount(document.getElementById('app'),video,{id:'test-film',title:'Test film',year:2026},()=>testHls);
    document.querySelector('.subtitle-settings-trigger').click();
  });
  return {context,page,errors};
}
const text=page=>page.locator('.video-caption').textContent();
const tick=(page,time)=>page.evaluate(time=>{testClock=time;document.querySelector('video').dispatchEvent(new Event('timeupdate'));},time);
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const mobile of [false,true]){
  const {page,context,errors}=await setup(browser,mobile);
  const settingsBox=await page.locator('.subtitle-controls').evaluate(el=>({height:el.clientHeight,contentHeight:el.scrollHeight,width:el.clientWidth,contentWidth:el.scrollWidth}));
  assert(settingsBox.contentWidth<=settingsBox.width+1,'settings must not scroll horizontally');
  if(!mobile)assert(settingsBox.contentHeight<=settingsBox.height+1,'desktop settings should fit all rows without vertical scrolling');
  await page.evaluate(()=>{
    const listeners=new Map();testHls={subtitleTracks:[{id:4,name:'English',lang:'eng'},{id:8,name:'English commentary',lang:'en'}],subtitleTrack:-1,subtitleDisplay:false,on(event,handler){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(handler);},off(event,handler){listeners.get(event)?.delete(handler);},emit(event,data){for(const handler of listeners.get(event)||[])handler(event,data);},listeners};
  });
  await page.waitForFunction(()=>testHls.subtitleTrack===0);
  assert.equal(await page.evaluate(()=>testHls.subtitleDisplay),false,'HLS must load cues without rendering a second native subtitle');
  await page.evaluate(()=>{testHls.emit('cues',{type:'subtitles',track:'subtitles4',cues:[new VTTCue(0,3,'First English line')]});testHls.emit('cues',{type:'subtitles',track:'subtitles8',cues:[new VTTCue(0,3,'Commentary line')]});});
  assert.equal(await text(page),'First English line');assert(await page.locator('.video-caption').isVisible());
  await page.getByLabel('选择字幕轨道',{exact:true}).selectOption('hls:1');assert.equal(await text(page),'Commentary line');
  await page.getByLabel('选择字幕轨道',{exact:true}).selectOption('off');assert(!(await page.locator('.video-caption').isVisible()));
  await page.evaluate(()=>testHls.emit('tracks',{}));assert.equal(await page.getByLabel('选择字幕轨道',{exact:true}).inputValue(),'off','manifest updates must preserve explicit Off');
  await page.getByLabel('选择字幕轨道',{exact:true}).selectOption('hls:0');
  assert.equal(await page.locator('.movie-subtitles').count(),0);await page.locator('[name=offset]').fill('2');assert.equal(await text(page),'');
  await tick(page,3);assert.equal(await text(page),'First English line');
  await page.locator('[name=offset]').fill('-1');await tick(page,1);assert.equal(await text(page),'First English line');await tick(page,2.5);assert.equal(await text(page),'');
  await page.locator('[name=offset]').fill('0');await tick(page,1);
  await page.locator('.subtitle-size').evaluate(el=>{el.value='32';el.dispatchEvent(new Event('input'));});
  assert.equal(await page.locator('.video-caption').evaluate(el=>el.style.getPropertyValue('--caption-size')),'32px');
  await page.locator('.subtitle-toggle').click();assert(!(await page.locator('.video-caption').isVisible()));await page.locator('.subtitle-toggle').click();assert(await page.locator('.video-caption').isVisible());
  // A browser-created HLS TextTrack must not duplicate the logical HLS choices.
  await page.evaluate(()=>document.querySelector('video').addTextTrack('subtitles','English','en'));
  await page.waitForTimeout(30);assert.equal(await page.getByLabel('选择字幕轨道',{exact:true}).locator('option').count(),3);
  await page.evaluate(()=>disposeMovieSubtitles());
  assert.equal(await page.locator('.video-caption,.subtitle-settings-dock,.movie-cc-button,.movie-cc-menu,.movie-subtitles').count(),0);
  assert.equal(await page.evaluate(()=>[...testHls.listeners.values()].reduce((n,s)=>n+s.size,0)),0);
  assert.deepEqual(errors,[]);await context.close();
  // Native TextTracks model Safari's HLS subtitles, including ISO language differences.
  const native=await setup(browser,mobile),p=native.page;
  await p.evaluate(()=>{const video=document.querySelector('video');const track=video.addTextTrack('subtitles','English','en');track.addCue(new VTTCue(0,3,'Native subtitle'));video.dispatchEvent(new Event('loadedmetadata'));});
  await tick(p,1);assert.equal(await text(p),'Native subtitle');assert(await p.locator('.video-caption').isVisible());
  await p.evaluate(()=>{const video=document.querySelector('video');video.textTracks[0].mode='showing';video.textTracks.dispatchEvent(new Event('change'));});
  assert.equal(await p.evaluate(()=>document.querySelector('video').textTracks[0].mode),'hidden','native rendering stays off while the custom caption remains visible');
  await p.getByLabel('选择字幕轨道',{exact:true}).selectOption('off');assert(!(await p.locator('.video-caption').isVisible()));
  await p.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('loadedmetadata')));assert.equal(await p.getByLabel('选择字幕轨道',{exact:true}).inputValue(),'off');
  await p.evaluate(()=>disposeMovieSubtitles());assert.deepEqual(native.errors,[]);await native.context.close();
  console.log(`PASS ${mobile?'mobile touch':'desktop'}: HLS delayed tracks, same-language isolation, native tracks, Off persistence, seek, positive/negative offset, style, visibility and disposal.`);
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

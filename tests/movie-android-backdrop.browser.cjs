process.chdir(require('node:path').resolve(__dirname,'..'));
const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({
      viewport:{width:390,height:844},
      userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile YQXYYAndroid/1.5'
    });
    const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScdnyAAAAABJRU5ErkJggg==','base64');
    await page.route('http://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<main id="app"></main>'}));
    await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:pixel}));
    await page.goto('http://fixture.test/');
    await page.addStyleTag({content:fs.readFileSync('css/movies.css','utf8')});
    await page.addStyleTag({content:fs.readFileSync('css/unified-player.css','utf8')});
    await page.addScriptTag({content:fs.readFileSync('js/movies.js','utf8')});
    await page.addScriptTag({content:fs.readFileSync('js/desktop-player.js','utf8')});
    await page.addScriptTag({content:fs.readFileSync('js/movie-subtitles.js','utf8')});
    await page.addScriptTag({content:fs.readFileSync('js/app.js','utf8').replace('App.start();','')});
    await page.evaluate(()=>{
      class Hls {static isSupported(){return true;}static Events={ERROR:'error'};on(){}loadSource(){}attachMedia(){}destroy(){}stopLoad(){}}
      window.Hls=Hls;
      window.MediaShelf={bindCards(){},bindPlayer(){},record(){},card(){return '';},movieFilm(){return {};}};
      document.documentElement.classList.add('sf-android-app');
      window.MovieClassroom.getLibrary=async()=>({
        series:[{films:[['test-film','Test film','测试电影']]}],
        playableById:new Map([['test-film',{
          id:'test-film',title:'Test film',titleZh:'测试电影',tmdbId:9502,tmdbTitle:'Test film',
          mediaType:'movie',playerMode:'dulo',embedUrl:'https://third-party.invalid/watch',
          directSources:[{url:'https://media.invalid/test.m3u8',label:'直链播放'}],
          embeddedSources:[]
        }]])
      });
      window.fetch=(url)=> {
        if(String(url).startsWith('/.netlify/functions/movie-backdrop?')){
          window.backdropApiRequest=String(url);
          return Promise.resolve({ok:true,json:async()=>({
            url:'https://image.tmdb.org/t/p/w1280/landscape.jpg',
            source:'tmdb-title-page'
          })});
        }
        return Promise.reject(new Error('Unexpected request: '+url));
      };
      window.app={el:()=>document.getElementById('app'),escapeHtml:s=>String(s),
        subtitleControls:App.subtitleControls,subtitlePreferences:App.subtitlePreferences,
        applySubtitlePreferences:App.applySubtitlePreferences};
      return MovieClassroom.renderWatch(app,'test-film');
    });
    await page.waitForSelector('.movie-start-poster .movie-start-artwork');
    assert.match(await page.evaluate(()=>window.backdropApiRequest),/id=9502/);
    assert.equal(await page.locator('.movie-start-artwork').getAttribute('src'),
      'https://image.tmdb.org/t/p/w1280/landscape.jpg');
    assert.equal(await page.locator('video').getAttribute('poster'),
      'https://image.tmdb.org/t/p/w1280/landscape.jpg');
    assert(await page.locator('.movie-start-poster').isVisible(),
      'Landscape artwork must be visible above paused Android video');
    assert(await page.locator('.movie-start-play').isVisible(),
      'Tap-to-play overlay must remain visible on Android');
    const bounds=await page.locator('.movie-start-poster').boundingBox();
    assert(bounds.width>bounds.height,'Movie pre-play artwork should be landscape in the video frame');
    await page.locator('video').dispatchEvent('play');
    assert.equal(await page.locator('.movie-start-poster').count(),0);
    console.log('PASS: Android WebView gets TMDB landscape artwork before video play and removes it on playback.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

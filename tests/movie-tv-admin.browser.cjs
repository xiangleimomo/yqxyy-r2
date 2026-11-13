const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://admin.test/**',route=>route.fulfill({contentType:'text/html',body:'<main id="app"></main>'}));
    await page.goto('https://admin.test/');
    await page.addScriptTag({content:fs.readFileSync('js/movie-library.js','utf8')});
    await page.addScriptTag({content:fs.readFileSync('js/movies.js','utf8')});
    await page.evaluate(()=>{
      window.savedRows=[];
      const client={
        from:()=>({
          select(){
            const q={order(){return q;},eq(){return q;},then(resolve){return Promise.resolve({data:structuredClone(savedRows),error:null}).then(resolve);}};
            return q;
          },
          upsert(input){
            const incoming=Array.isArray(input)?input:[input];
            for(const row of incoming){
              const old=savedRows.findIndex(existing=>existing.id===row.id);
              if(old>=0)savedRows[old]=structuredClone(row);else savedRows.push(structuredClone(row));
            }
            const copied=structuredClone(incoming);
            const reply={data:copied,error:null};
            const query={single:async()=>({data:copied[0],error:null}),then:fn=>Promise.resolve(reply).then(fn)};
            return {select:()=>query};
          }
        })
      };
      window.SFCloud={user:{id:'00000000-0000-0000-0000-000000000001'},isAdmin:()=>true,client};
      window.app={el:()=>document.getElementById('app'),escapeHtml:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
      MovieLibrary.search=async()=>[{title:'Test TV',titleZh:'测试电视剧',tmdbId:9502,mediaType:'tv',year:2020,posterUrl:'https://example.com/poster.jpg'}];
      MovieLibrary.verifyPlayback=async()=>{};
      return MovieLibrary.renderAdmin(app);
    });
    const choose=async()=>{
      await page.locator('#movieMetaSearch').fill('Test');
      await page.locator('#movieMetaSearchButton').click();
      await page.locator('.movie-meta-result').click();
    };
    await choose();
    assert(await page.locator('.movie-tv-fields').isVisible());
    await page.locator('[name=episode_end]').fill('3');
    assert.match(await page.locator('.movie-tv-preview').innerText(),/3 集/);
    await page.getByRole('button',{name:'批量发布剧集'}).click();
    await page.locator('.movie-tv-admin-group').waitFor();
    assert.equal(await page.evaluate(()=>savedRows.length),3);
    assert.equal(await page.locator('.movie-tv-admin-group').count(),1);
    await page.locator('.movie-tv-admin-group summary').click();
    assert.equal(await page.locator('.movie-tv-admin-group .movie-edit').count(),3);
    await choose();
    await page.locator('[name=tv_episode_urls]').fill(
      'S2E1|https://cdn.example.com/season2-1.m3u8\nS2E2|https://cdn.example.com/season2-2.m3u8');
    assert.match(await page.locator('.movie-tv-preview').innerText(),/2 集/);
    await page.getByRole('button',{name:'批量发布剧集'}).click();
    await page.locator('.movie-tv-admin-group').waitFor();
    const state=await page.evaluate(async()=>{
      const rows=structuredClone(savedRows),groups=MovieLibrary.asGroups(rows);
      const data={'data/movie-series.json':[],'data/movie-playback.json':{},'data/movie-hub-catalog.json':{films:[]},'data/movie-hub-providers.json':[],'data/movie-posters.json':{}};
      const library=await MovieClassroom.getLibrary({getJSON:async key=>data[key]});
      return {rows:rows.length,groups:groups.map(g=>({id:g.id,count:g.films.length,cover:g.cover})),
        episode:library.playableById.get('tmdb-tv-9502-s2-e1')?.directSources[0]?.url};
    });
    assert.equal(state.rows,5);
    assert.equal(state.groups.length,1);
    assert.equal(state.groups[0].count,5);
    assert.equal(state.groups[0].cover,'https://example.com/poster.jpg');
    assert.equal(state.episode,'https://cdn.example.com/season2-1.m3u8');
    console.log('PASS: TV bulk publish, per-show poster, multi-season batch, source precedence.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

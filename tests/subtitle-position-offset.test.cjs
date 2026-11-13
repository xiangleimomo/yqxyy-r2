const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('js/app.js','utf8');
const movie=fs.readFileSync('js/movie-subtitles.js','utf8');
const css=fs.readFileSync('css/unified-player.css','utf8');
test('all lesson and movie players have an adjustable caption-height control',()=>{
  assert.match(app,/class="subtitle-position"/);
  assert.match(app,/key,suffix\]\]\.forEach|\.subtitle-position','captionY','%'/);
  assert.match(movie,/subtitle-position/);
  assert.match(movie,/pointerdown/);
  assert.doesNotMatch(movie,/if\(matchMedia\('\(max-width:1100px\), \(pointer:coarse\)'\)\.matches\)return/);
});
test('movie and Little Fox separately persist 0.5-second subtitle timing shifts',()=>{
  assert.match(app,/storyfox-subtitle-offset:/);
  assert.match(app,/offsetSeconds-0\.5/);
  assert.match(app,/offsetSeconds\+0\.5/);
  assert.match(movie,/storyfox-movie-subtitle-offset:/);
  assert.match(movie,/Math\.round\(\(delta===null\?0:current\+delta\)\*2\)\/2/);
});
test('Android no longer forces all caption lines above a 104px bottom restriction',()=>{
  assert.doesNotMatch(css,/top:min\(var\(--caption-y,84%\),calc\(100% - 104px\)\)/);
  assert.match(css,/top:var\(--caption-y,88%\)!important/);
  assert.match(css,/\.subtitle-controls \.subtitle-timing-setting/);
});

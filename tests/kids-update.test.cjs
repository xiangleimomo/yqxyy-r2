const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('Mobile app provides a separate children cartoons shelf and curated recommendations',()=>{
  const app=fs.readFileSync('js/mobile-app.js','utf8');
  const media=fs.readFileSync('js/media-shelf.js','utf8');
  const routes=fs.readFileSync('js/app.js','utf8');
  const categories=fs.readFileSync('js/movie-library.js','utf8');
  assert.match(app,/#\/movies\/kids/g);
  for(const title of ['海绵宝宝','布鲁伊','小猪佩奇','汪汪队立大功'])assert.ok(app.includes(title));
  assert.match(categories,/kids:'儿童动画'/);
  assert.match(media,/\['kids','儿童动画'\]/);
  assert.match(routes,/'kids','documentary'/);
});
test('Release metadata and app version checks reject older versions',()=>{
  const window={};
  vm.runInNewContext(fs.readFileSync('js/app-updates.js','utf8'),{window});
  const updates=window.YQXYYUpdates;
  assert.equal(updates.newer('1.4.0','1.3.0'),true);
  assert.equal(updates.newer('1.3.0','1.4.0'),false);
  assert.equal(updates.newer('1.4.0','1.4.0'),false);
  const details=updates.parseRelease({body:'Version: v1.4.0\nCommit: 1234567890abcdef1234567890abcdef12345678'});
  assert.equal(details.version,'1.4.0');
  assert.equal(details.sha,'1234567890abcdef1234567890abcdef12345678');
});
test('Android version bridge is read-only except for a trusted release URL',()=>{
  const java=fs.readFileSync('android/app/src/main/java/com/yqxyy/english/MainActivity.java','utf8');
  const gradle=fs.readFileSync('android/app/build.gradle','utf8');
  assert.match(java,/class UpdateBridge/);
  assert.match(java,/@JavascriptInterface public String getVersionName/);
  assert.match(java,/@JavascriptInterface public String getBuildSha/);
  assert.match(java,/github\.com\/xiangleimomo\/yqxyy-r2\/releases\/tag\/android-app-latest/);
  assert.match(gradle,/APP_BUILD_SHA/);
});

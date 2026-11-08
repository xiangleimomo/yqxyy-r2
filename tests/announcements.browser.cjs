const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('http://localhost:8888/**',r=>r.fulfill({contentType:'text/html',body:'<aside id="siteAnnouncements"></aside><main id="app"></main>'}));
  await page.goto('http://localhost:8888/#/announcement-admin');
  await page.addScriptTag({content:fs.readFileSync('js/announcements.js','utf8')});
  await page.addStyleTag({content:fs.readFileSync('css/announcements.css','utf8')});
  await page.evaluate(async()=>{window.SFCloud={isAdmin:()=>true};window.testApp={el:()=>document.querySelector('#app')};await SiteAnnouncements.render(testApp,true);});
  await page.locator('[name=title]').fill('本周打卡活动');await page.locator('[name=body]').fill('完成五天打卡，领取奖励。<img src=x onerror=alert(1)>');
  await page.locator('[name=kind]').selectOption('activity');await page.locator('[name=reward_note]').fill('活动勋章');await page.locator('[name=published]').check();await page.locator('[name=pinned]').check();
  await page.getByRole('button',{name:'保存公告',exact:true}).click();
  await page.waitForSelector('.announcement-card');assert.equal(await page.locator('#siteAnnouncements').isVisible(),false);assert.equal(await page.locator('.announcement-card img').count(),0);
  await page.getByRole('button',{name:'编辑 / 撤下'}).click();await page.locator('[name=published]').uncheck();await page.getByRole('button',{name:'保存公告',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem(SiteAnnouncements.key))[0].published===false);
  assert.equal(await page.locator('#siteAnnouncements details').count(),0);
  await page.evaluate(async()=>{SFCloud.isAdmin=()=>false;location.hash='#/announcements';await SiteAnnouncements.render(testApp);});assert.match(await page.locator('.announcement-dialog').innerText(),/暂无公告/);await page.getByRole('button',{name:'关闭公告'}).click();await page.waitForSelector('dialog',{state:'detached'});
  await page.evaluate(async()=>{location.hash='#/announcement-admin';await SiteAnnouncements.render(testApp,true);});assert.equal(await page.locator('form').count(),0);
  const checks=await page.evaluate(async()=>{let denied=false;try{await SiteAnnouncements.save({title:'bad'});}catch{denied=true;}return {denied,future:SiteAnnouncements.active({published:true,starts_at:'2099-01-01T00:00:00Z'}),expired:SiteAnnouncements.active({published:true,ends_at:'2000-01-01T00:00:00Z'}),draft:SiteAnnouncements.active({published:false})};});assert.deepEqual(checks,{denied:true,future:false,expired:false,draft:false});
  await page.evaluate(async()=>{localStorage.setItem(SiteAnnouncements.key,JSON.stringify([
   {id:'old',title:'旧置顶公告',body:'Old',published:true,pinned:true,created_at:'2026-01-01T00:00:00Z'},
   {id:'new',title:'最近公告',body:'New',published:true,created_at:'2026-02-01T00:00:00Z'},
   {id:'draft',title:'新草稿',published:false,created_at:'2026-03-01T00:00:00Z'}
  ]));document.querySelector('#app').innerHTML='<a href="#/announcements">公告</a>';SiteAnnouncements.mount();});
  assert.equal(await page.locator('dialog').count(),0);await page.getByRole('link',{name:'公告',exact:true}).click();await page.waitForSelector('.announcement-dialog .announcement-card');assert.equal(await page.locator('.announcement-dialog .announcement-card').count(),1);assert.match(await page.locator('dialog').innerText(),/最近公告/);assert.doesNotMatch(await page.locator('dialog').innerText(),/旧置顶公告|新草稿/);await page.keyboard.press('Escape');await page.waitForSelector('dialog',{state:'detached'});assert.equal(await page.locator('dialog').count(),0);
  console.log('PASS: local admin publish/edit/withdraw, public visibility, schedule, escaped content and ordinary-user guards.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

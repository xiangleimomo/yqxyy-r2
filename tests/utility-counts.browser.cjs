const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.route('http://localhost:8888/**',r=>r.fulfill({contentType:'text/html',body:'<nav><a id="navAnnouncements" href="#/announcements">公告</a><a id="navCheckin"></a><a id="navHonors"></a></nav><aside id="siteAnnouncements"></aside>'}));await page.goto('http://localhost:8888');
 for(const name of ['announcements','utility-counts'])await page.addScriptTag({content:fs.readFileSync('js/'+name+'.js','utf8')});
 await page.evaluate(()=>{
  window.SFCloud={user:{id:'alice'},isAdmin:()=>false,client:{rpc:async()=>({data:{works:[{template_id:'a',earned:true},{template_id:'b',earned:false}],manual_works:[{template_id:'a',earned:true},{template_id:'a',earned:true},{template_id:'c',earned:true}],awards:[{id:'h1'}]}})}};
  window.testApp={storage:k=>k==='checkins'?['2026-01-01','2026-01-01','bad','2099-01-01']:k==='progress'?{x:{updatedAt:'2026-01-02T12:00:00'},y:{updatedAt:'2026-01-02T13:00:00'}}:{}};
  localStorage.setItem(SiteAnnouncements.key,JSON.stringify([{id:'a',title:'Old',body:'old',published:true,created_at:'2026-01-01'},{id:'b',title:'Latest',body:'new',published:true,created_at:'2026-01-02'},{id:'draft',published:false}]));
  UtilityCounts.refresh(testApp);SiteAnnouncements.mount();
 });
 await page.waitForFunction(()=>document.querySelector('#navHonors span')?.textContent==='3'&&document.querySelector('#navAnnouncements span')?.textContent==='2');assert.equal(await page.locator('#navCheckin span').innerText(),'2');
 await page.locator('#navAnnouncements').click();await page.waitForSelector('.announcement-card');await page.waitForFunction(()=>document.querySelector('#navAnnouncements span').textContent==='1');assert.match(await page.locator('dialog').innerText(),/Latest/);await page.getByRole('button',{name:'全部标为已读'}).click();await page.waitForFunction(()=>document.querySelector('#navAnnouncements span').textContent==='0');await page.keyboard.press('Escape');await page.waitForSelector('dialog',{state:'detached'});
 await page.evaluate(()=>{SFCloud.user={id:'bob'};UtilityCounts.refresh(testApp);});await page.waitForFunction(()=>document.querySelector('#navAnnouncements span').textContent==='2');
 await page.evaluate(()=>{SFCloud.user={id:'alice'};UtilityCounts.refresh(testApp);});await page.waitForFunction(()=>document.querySelector('#navAnnouncements span').textContent==='0');
 await page.evaluate(()=>{SFCloud.user=null;UtilityCounts.refresh(testApp);});assert.equal(await page.locator('#navHonors span').innerText(),'0');
 console.log('PASS: unique historical check-in days, deduplicated earned honors, unread/latest/all-read counts and account isolation.');
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});

const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {samplePdf}=require('./helpers/pdf-fixture.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://pdf-fixture.test/**',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="app" class="app-shell"></main></body></html>'});
      const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
      const mime=path.extname(file)==='.css'?'text/css':path.extname(file)==='.js'?'application/javascript':'application/octet-stream';
      if(file.startsWith(root+path.sep)&&fs.existsSync(file))return route.fulfill({path:file,contentType:mime});
      return route.fulfill({status:404,body:''});
    });
    await page.goto('https://pdf-fixture.test/');
    for(const css of ['css/books.css','css/reader-enhancements.css'])await page.addStyleTag({url:'https://pdf-fixture.test/'+css});
    await page.addScriptTag({url:'https://pdf-fixture.test/js/books.js'});
    const pdf=samplePdf(6,[[300,500],[300,500],[300,500],[300,500],[300,500],[300,500]]);
    await page.evaluate(async data=>{
      window.BookCommunity={progressKey:()=> 'pdf-fit-test-location',record:()=>{},flushProgress:()=>{}};
      const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
      const file=new File([bytes],'portrait-spread.pdf',{type:'application/pdf'});
      const item={id:'local-fit-test',localFile:file,kind:'book',title:'Portrait PDF',titleZh:'测试'};
      const app={el:()=>document.getElementById('app'),escapeHtml:s=>String(s)};
      BookReader.renderPdfReader(app,item);
      await BookReader.openPdfFlipbook(item);
    },pdf.toString('base64'));
    await page.waitForSelector('.stf__parent');
    const check=async numbers=>{
      await page.waitForTimeout(1100);
      const results=await page.evaluate(numbers=>{
        const surface=document.querySelector('.pdf-flipbook-surface').getBoundingClientRect();
        return numbers.map(number=>{
          const image=document.querySelector('img[data-pdf-page="'+number+'"]');
          const r=image?.getBoundingClientRect();
          return {number,valid:!!(image?.naturalWidth&&r&&r.width>0&&r.height>0&&r.left>=surface.left-3&&r.right<=surface.right+3&&r.top>=surface.top-3&&r.bottom<=surface.bottom+3),image:r?.toJSON(),surface:surface.toJSON()};
        });
      },numbers);
      for(const p of results)assert(p.valid,'PDF page '+p.number+' clipped: '+JSON.stringify(p));
    };
    await check([1]);
    await page.evaluate(()=>BookReader.pageFlip.flipNext());
    await page.waitForFunction(()=>BookReader.pageFlip.getCurrentPageIndex()===1);
    await check([2,3]);
    await page.setViewportSize({width:844,height:390});
    await page.waitForTimeout(450);
    await check([2,3]);
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(450);
    await check([2,3]);
    assert.deepEqual(errors,[]);
    console.log('PASS: phone PDF cover and double spread fit in both simulated and native landscape');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

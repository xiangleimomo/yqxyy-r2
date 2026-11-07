import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { serveData } from '../netlify/lib/r2-proxy.mjs';
import { getObject, objectURL } from '../netlify/lib/r2.mjs';

test('R2 updates appear on the next request without changing the website URL', async () => {
  let text = 'version 1';
  const fetcher = async key => { assert.equal(key, 'data/series-list.json'); return new Response(text); };
  const req = () => new Request('https://example.test/data/series-list.json?v=123');
  assert.equal(await (await serveData(req(), fetcher)).text(), 'version 1');
  text = 'version 2';
  const response = await serveData(req(), fetcher);
  assert.equal(await response.text(), 'version 2');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('PDF/media ranges and validators pass through without cookies or authorization', async () => {
  const req = new Request('https://example.test/data/book.pdf', {headers:{range:'bytes=0-3',cookie:'private',authorization:'private','if-range':'"v1"'}});
  const response = await serveData(req, async (key, options) => {
    assert.equal(key, 'data/book.pdf');
    assert.equal(options.headers.get('range'), 'bytes=0-3');
    assert.equal(options.headers.get('if-range'), '"v1"');
    assert.equal(options.headers.has('cookie'), false);
    assert.equal(options.headers.has('authorization'), false);
    return new Response('%PDF',{status:206,headers:{'Content-Range':'bytes 0-3/100','Accept-Ranges':'bytes','Content-Type':'application/pdf'}});
  });
  assert.equal(response.status,206);
  assert.equal(response.headers.get('content-range'),'bytes 0-3/100');
  assert.equal(await response.text(),'%PDF');
});
test('HEAD and conditional responses have no body; HLS and VTT keep correct MIME', async () => {
  for (const [file, mime] of [['001.m3u8','application/vnd.apple.mpegurl'],['001.vtt','text/vtt; charset=utf-8']]) {
    const response = await serveData(new Request('https://example.test/data/'+file,{method:'HEAD'}), async (_, options) => {
      assert.equal(options.method,'HEAD'); return new Response('ignored');
    });
    assert.equal(await response.text(),''); assert.equal(response.headers.get('content-type'),mime);
  }
  const res = await serveData(new Request('https://example.test/data/a.json'),async()=>new Response(null,{status:304}));
  assert.equal(res.status,304); assert.equal(await res.text(),'');
});
test('missing files, ranges, upstream errors and exceptions do not become the SPA homepage', async () => {
  for (const status of [404,416,403,500]) {
    const response = await serveData(new Request('https://example.test/data/missing.json'),async()=>new Response('upstream',{status}));
    assert.equal(response.status,[404,416].includes(status)?status:502);
  }
  assert.equal((await serveData(new Request('https://example.test/data/a'),async()=>{throw Error('secret');})).status,503);
});
test('write methods, traversal, malformed encoding and non-data paths are blocked', async () => {
  const never = async()=>{throw Error('Must not fetch');};
  assert.equal((await serveData(new Request('https://example.test/data/a',{method:'PUT'}),never)).status,405);
  for(const path of ['/data/%ZZ','/data/a%2f..%2fb','/data/a%5cb','/data/a%00b','/other/file','/data/']) assert.equal((await serveData(new Request('https://example.test'+path),never)).status,400);
});
test('UTF-8 paths are decoded once', async () => {
  await serveData(new Request('https://example.test/data/%E4%B8%AD%E6%96%87%20a.pdf'),async key=>{assert.equal(key,'data/中文 a.pdf');return new Response('ok');});
});
test('shared client signs a read-only request to the fixed R2 endpoint', async () => {
  const saved={...process.env};
  Object.assign(process.env,{R2_ENDPOINT:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',R2_BUCKET:'test-bucket',R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test-secret'});
  try {
    await getObject('data/中文 a.json',{fetcher:async req=>{
      assert.ok(req.headers.get('authorization').startsWith('AWS4-HMAC-SHA256 '));
      assert.equal(req.method,'GET');assert.equal(new URL(req.url).pathname,'/test-bucket/data/%E4%B8%AD%E6%96%87%20a.json');
      return new Response('{}');
    }});
    await assert.rejects(()=>getObject('data/a',{method:'PUT'}));
    assert.throws(()=>objectURL('data/../secret'));
    process.env.R2_ENDPOINT='https://example.com'; assert.throws(()=>objectURL('data/a'));
  } finally {
    for (const name of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY']) {if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
  }
});
test('publish directory excludes credentials, server code and resources', () => {
  if(!fs.existsSync('dist/index.html'))return;
  for(const name of ['data','.env','netlify','node_modules','.git']) assert.equal(fs.existsSync('dist/'+name),false);
});

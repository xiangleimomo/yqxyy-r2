const test=require('node:test');
const assert=require('node:assert/strict');
const {handler}=require('../netlify/functions/movie-backdrop.js');
test('TMDB backdrop endpoint returns verified landscape path without exposing credentials',async()=>{
  const originalFetch=global.fetch,key=process.env.TMDB_API_KEY,token=process.env.TMDB_READ_ACCESS_TOKEN;
  try{
    process.env.TMDB_API_KEY='test-private-key';
    delete process.env.TMDB_READ_ACCESS_TOKEN;
    let requested;
    global.fetch=async(url)=>{requested=url;return {ok:true,json:async()=>({id:49444,backdrop_path:'/7BdxZXbSkUiVeCRXKD3hi9KYeWm.jpg'})};};
    const res=await handler({httpMethod:'GET',queryStringParameters:{id:'49444',type:'movie'}});
    assert.equal(res.statusCode,200);
    assert.equal(JSON.parse(res.body).url,'https://image.tmdb.org/t/p/w1280/7BdxZXbSkUiVeCRXKD3hi9KYeWm.jpg');
    assert.match(String(requested),/\/movie\/49444/);
    assert(!res.body.includes('test-private-key'));
    global.fetch=async()=>({ok:true,json:async()=>({id:49444,backdrop_path:'https://untrusted.example/evil.jpg'})});
    const bad=await handler({httpMethod:'GET',queryStringParameters:{id:'49444',type:'movie'}});
    assert.equal(bad.statusCode,200);assert.equal(JSON.parse(bad.body).url,null);
    assert.equal((await handler({httpMethod:'GET',queryStringParameters:{id:'-1',type:'tv'}})).statusCode,400);
  } finally {
    global.fetch=originalFetch;
    if(key===undefined)delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY=key;
    if(token===undefined)delete process.env.TMDB_READ_ACCESS_TOKEN; else process.env.TMDB_READ_ACCESS_TOKEN=token;
  }
});

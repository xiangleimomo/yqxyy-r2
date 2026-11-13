const test=require('node:test');
const assert=require('node:assert/strict');
const {handler}=require('../netlify/functions/movie-tv-seasons.js');
const event=(id='387')=>({httpMethod:'GET',queryStringParameters:{id}});
test('TMDB season proxy never guesses counts without server credentials',async()=>{
  const oldKey=process.env.TMDB_API_KEY,oldToken=process.env.TMDB_READ_ACCESS_TOKEN;
  delete process.env.TMDB_API_KEY;delete process.env.TMDB_READ_ACCESS_TOKEN;
  try{
    const result=await handler(event());
    assert.equal(result.statusCode,503);
    assert.equal(JSON.parse(result.body).configured,false);
  }finally{
    if(oldKey===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=oldKey;
    if(oldToken===undefined)delete process.env.TMDB_READ_ACCESS_TOKEN;else process.env.TMDB_READ_ACCESS_TOKEN=oldToken;
  }
});
test('TMDB proxy extracts real positive episode counts, never includes specials',async()=>{
  const oldKey=process.env.TMDB_API_KEY,oldFetch=global.fetch;
  process.env.TMDB_API_KEY='test-token';
  global.fetch=async(url)=>({
    ok:true,json:async()=>({id:387,name:'SpongeBob SquarePants',seasons:[
      {season_number:0,episode_count:20,name:'Specials'},
      {season_number:1,episode_count:41,name:'Season 1'},
      {season_number:2,episode_count:39,name:'Season 2'},
      {season_number:3,episode_count:0,name:'Unannounced'}
    ]})
  });
  try{
    const result=await handler(event());
    const data=JSON.parse(result.body);
    assert.equal(result.statusCode,200);
    assert.equal(data.id,387);
    assert.deepEqual(data.seasons.map(x=>[x.season_number,x.episode_count]),[[1,41],[2,39]]);
    assert.equal(data.source,'TMDB');
  }finally{
    global.fetch=oldFetch;
    if(oldKey===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=oldKey;
  }
});
test('malformed TMDB IDs are rejected before calling upstream',async()=>{
  for(const id of ['0','-1','../../etc/passwd','spongebob','9999999999999']){
    const result=await handler(event(id));
    assert.equal(result.statusCode,400);
  }
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const code=fs.readFileSync('js/movie-library.js','utf8');
function library(fetchImpl){
  const window={};
  return Function('window','fetch','AbortSignal',code+'; return window.MovieLibrary;')(
    window,fetchImpl,{timeout:()=>undefined}
  );
}
test('normalizes English and Chinese TV show titles without losing letters',()=>{
  const lib=library(()=>{throw Error('should not fetch')});
  assert.equal(lib.normalizeSeriesTitle('SpongeBob SquarePants'),'spongebobsquarepants');
  assert.equal(lib.normalizeSeriesTitle('海绵宝宝'),'海绵宝宝');
  assert.equal(lib.normalizeSeriesTitle('Bluey (2018)'),'bluey2018');
});
test('auto-fetches per-season episode counts while video URLs retain TMDB IDs',async()=>{
  const requests=[];
  const mock=async url=>{
    requests.push(url);
    if(url.includes('/search/shows'))return {ok:true,json:async()=>[
      {show:{id:99,name:'SpongeBob SquarePants',premiered:'1999-05-01'}},
      {show:{id:100,name:'The Sponge',premiered:'2010-05-01'}}
    ]};
    if(url.includes('/shows/99/episodes'))return {ok:true,json:async()=>[
      {season:1,number:1},{season:1,number:2},{season:2,number:1},
      {season:2,number:2},{season:2,number:3},{season:0,number:1}
    ]};
    throw Error('Unexpected '+url);
  };
  const lib=library(mock);
  const seasons=await lib.tvSeasons(387,{title:'SpongeBob SquarePants',title_zh:'海绵宝宝',year:1999});
  assert.equal(seasons.source,'TVmaze + TMDB 第1季已核验');
  assert.deepEqual(seasons.seasons.map(x=>[x.season_number,x.episode_count,x.known_episodes]),[
    [1,41,41],[2,3,3]
  ]);
  assert.equal(seasons.total_episodes,44);
  assert.equal(requests.length,2);
  // TVmaze ID 99 is only for metadata. The player must use TMDB ID 387.
  assert.equal(lib.automaticSource({
    tmdb_id:387,media_type:'tv',season_number:2,episode_number:3
  }).url,'https://api.obj2.top/hls/tv/387/2/3/master.m3u8');
  assert.deepEqual(lib.tvBatchRows({
    tmdb_id:387,category:'kids',media_type:'tv',season_number:2,episode_number:1,
    title:'SpongeBob SquarePants',sort_order:0
  },lib.planTvEpisodes({
    tmdb_id:387,season_number:2,episode_number:1
  },seasons.seasons[1].episode_count)).map(x=>x.playback_sources[0].url),[
    'https://api.obj2.top/hls/tv/387/2/1/master.m3u8',
    'https://api.obj2.top/hls/tv/387/2/2/master.m3u8',
    'https://api.obj2.top/hls/tv/387/2/3/master.m3u8'
  ]);
});
test('does not substitute a different program with an inaccurate debut year',async()=>{
  const lib=library(async()=>({ok:true,json:async()=>[
    {show:{id:99,name:'Bluey',premiered:'1998-10-01'}}
  ]}));
  await assert.rejects(()=>lib.tvSeasons(82728,{title:'Bluey',year:2018}),/未能唯一匹配/);
});
test('an offline verified TMDB season snapshot still prefills SpongeBob S1E41',async()=>{
  const lib=library(async()=>{throw Error('offline')});
  const fallback=await lib.tvSeasons(387,{title:'SpongeBob SquarePants',year:1999});
  assert.equal(fallback.partial,true);
  assert.equal(fallback.seasons.length,1);
  assert.equal(fallback.seasons[0].episode_count,41);
  assert.equal(fallback.seasons[0].season_number,1);
  assert.equal(lib.automaticSource({tmdb_id:387,media_type:'tv',
    season_number:1,episode_number:41}).url,
    'https://api.obj2.top/hls/tv/387/1/41/master.m3u8');
  const noTitle=await lib.tvSeasons(387,{});
  assert.equal(noTitle.seasons[0].episode_count,41);
  await assert.rejects(()=>lib.tvSeasons(82728,{title:'Bluey'}),/网络请求失败/);
});

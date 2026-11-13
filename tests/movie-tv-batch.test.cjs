const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
global.window={};
require('../js/movie-library.js');
const library=window.MovieLibrary;
const base={tmdb_id:5678,media_type:'tv',season_number:1,episode_number:1,
  category:'animated',title:'TV',title_zh:'测试剧',poster_url:'https://example.com/cover.jpg',sort_order:0};
test('auto link range creates numbered episodes',()=>{
  const plan=library.planTvEpisodes(base,4,'');
  assert.equal(plan.length,4);
  assert.deepEqual(plan.map(x=>x.episode),[1,2,3,4]);
  const rows=library.tvBatchRows(base,plan);
  assert.equal(rows[0].id,'tmdb-tv-5678-s1-e1');
  assert.equal(rows[3].playback_sources[0].url,'https://api.obj2.top/hls/tv/5678/1/4/master.m3u8');
});
test('ordered URL list becomes one explicit playback address per episode',()=>{
  const plan=library.planTvEpisodes(base,1,'https://media.example.com/a.m3u8\nhttps://media.example.com/b.mp4');
  const rows=library.tvBatchRows(base,plan);
  assert.deepEqual(rows.map(x=>x.episode_number),[1,2]);
  assert.deepEqual(rows.map(x=>x.playback_sources[1].url),[
    'https://media.example.com/a.m3u8','https://media.example.com/b.mp4']);
});
test('tagged season and episode URLs allow multi-season TV import',()=>{
  const plan=library.planTvEpisodes(base,1,
    'S1E1|https://media.example.com/1.m3u8\nS2E3|https://media.example.com/23.m3u8');
  assert.deepEqual(plan.map(x=>[x.season,x.episode]),[[1,1],[2,3]]);
});
test('duplicate, dangerous, and mismatched episode URLs never reach the database',()=>{
  for(const text of [
    'S1E1|https://media.example.com/1.m3u8\nS1E1|https://media.example.com/2.m3u8',
    'http://media.example.com/1.m3u8',
    'javascript:alert(1)',
    'https://media.example.com/not-a-video',
    'https://user:pass@media.example.com/1.m3u8'
  ])assert.throws(()=>library.planTvEpisodes(base,1,text));
  assert.throws(()=>library.planTvEpisodes(base,4,'https://media.example.com/1.m3u8'));
  assert.throws(()=>library.planTvEpisodes(base,300,''));
});
test('re-import reuses old IDs and preserves individually edited sources',()=>{
  const prior={...base,id:'tmdb-tv-5678',playback_sources:library.validateSources(base,[
    {kind:'direct',label:'已保存的备用',url:'https://media.example.com/backup.m3u8'}
  ])};
  const rows=library.tvBatchRows(base,library.planTvEpisodes(base,2,''),[prior]);
  assert.equal(rows[0].id,'tmdb-tv-5678');
  assert.equal(rows[0].playback_sources.length,2);
  assert.equal(rows[1].id,'tmdb-tv-5678-s1-e2');
});
test('one poster for each TV series, one card per episode inside it',()=>{
  const rows=library.tvBatchRows(base,library.planTvEpisodes(base,3,''));
  const groups=library.asGroups(rows);
  assert.equal(groups.length,1);
  assert.equal(groups[0].cover,base.poster_url);
  assert.equal(groups[0].films.length,3);
  assert.equal(groups[0].films[2][2],'第1季 · 第3集');
  assert.equal(library.adminListHtml(rows,{escapeHtml:s=>String(s)}).match(/movie-tv-admin-group/g).length,1);
});
test('existing TV episode keeps its ID when reclassified into kids animation',()=>{
  const existing={...base,id:'tmdb-tv-5678',category:'animated',episode_number:1,
    playback_sources:library.validateSources(base,[])};
  const moved=library.tvBatchRows({...base,category:'kids'},library.planTvEpisodes(base,1,''),[existing]);
  assert.equal(moved[0].id,'tmdb-tv-5678');
  assert.equal(moved[0].category,'kids');
});
test('existing standalone film remains an individual entry',()=>{
  const movies=library.asGroups([{...base,id:'tmdb-movie-80',media_type:'movie',tmdb_id:80}]);
  assert.equal(movies[0].dynamicCategory,'animated');
  assert.equal(movies[0].films.length,1);
});
test('schema migration and frontend can address multiple TV episodes',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261113160319_movie_tv_episodes_per_series.sql','utf8');
  assert.match(sql,/unique \(media_type, tmdb_id, season_number, episode_number\)/);
  assert.match(sql,/movie_library_id_format/);
  const js=fs.readFileSync('js/movies.js','utf8');
  assert.match(js,/preferredTvSource/);
  assert.match(js,/sf-tv-player/);
});

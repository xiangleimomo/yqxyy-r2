const test=require('node:test');
const assert=require('node:assert/strict');
global.window={};
global.navigator={userAgent:'Mozilla/5.0 Chrome/120'};
require('../js/movie-library.js');
require('../js/movies.js');
const lib=window.MovieLibrary, movies=window.MovieClassroom;

function makeClient(queries){
  const moviesRows=Array.from({length:120},(_,i)=>({
    id:'tmdb-tv-92685-s1-e'+(i+1),category:'kids',media_type:'tv',
    tmdb_id:92685,title:'The Owl House',title_zh:'猫头鹰魔法社',year:2020,
    poster_url:'https://example.com/poster.jpg',season_number:1,
    episode_number:i+1,sort_order:0,published:true,
    playback_sources:[{kind:'direct',label:'本集播放地址',url:'https://example.com/ep'+(i+1)+'.m3u8'}]
  }));
  const film={
    id:'tmdb-movie-9502',category:'animated',media_type:'movie',
    tmdb_id:9502,title:'A Movie',title_zh:'测试电影',year:2008,
    poster_url:'https://example.com/movie.jpg',season_number:1,
    episode_number:1,sort_order:0,published:true,
    playback_sources:[{kind:'direct',label:'手动主源',url:'https://example.com/custom.m3u8'}]
  };
  const list=[
    ...Array.from({length:50},(_,i)=>({...film,id:'tmdb-movie-'+(2000+i),tmdb_id:2000+i})),
    film,moviesRows[0]
  ];
  const summary=list.map(row=>{
    const copy={...row,episode_count:row.media_type==='tv'?120:1};
    delete copy.playback_sources;delete copy.overview;return copy;
  });
  return {
    from(table){
      const filters=[];
      const q={
        select(fields){q.fields=fields;return q;},
        order(){return q;},
        eq(name,value){filters.push([name,value]);return q;},
        async range(first,last){
          queries.push({table,fields:q.fields,filters:[...filters],first,last});
          await new Promise(r=>setImmediate(r));
          let rows=table==='movie_library_catalog'?summary:
            table==='movie_library_seasons'?[{category:'kids',tmdb_id:92685,season_number:1,episode_count:120}]:
            table==='movie_library'?moviesRows:[];
          if(table==='movie_library'&&filters.some(([k,v])=>k==='id'&&v===film.id))rows=[film];
          rows=rows.filter(row=>filters.every(([k,v])=>row[k]===v));
          return {data:rows.slice(first,last+1),error:null};
        },
        async then(resolve,reject){
          try{
            queries.push({table,fields:q.fields,filters:[...filters],kind:'list'});
            const data=table==='movie_library_seasons'?[{category:'kids',tmdb_id:92685,season_number:1,episode_count:120}]:[];
            return resolve({data,error:null});
          }catch(err){if(reject)return reject(err);throw err;}
        },
        async maybeSingle(){
          queries.push({table,fields:q.fields,filters:[...filters],kind:'one'});
          return {data:filters.some(([k,v])=>k==='id'&&v===film.id)?film:
            moviesRows.find(row=>filters.some(([k,v])=>k==='id'&&v===row.id))||null,error:null};
        }
      };
      return q;
    }
  };
}

test('public shelf fetches only 52 lightweight titles, never private ids or playlist arrays',async()=>{
  const queries=[],client=makeClient(queries);
  window.SFCloud={client};lib.invalidate();
  const [a,b]=await Promise.all([lib.catalog(),lib.catalog()]);
  assert.strictEqual(a,b);
  assert.equal(a.length,52);
  assert.equal(queries.length,1);
  assert.equal(queries[0].table,'movie_library_catalog');
  assert.equal(queries[0].fields,lib.catalogFields);
  assert(!queries[0].fields.includes('playback_sources'));
  assert(!queries[0].fields.includes('created_by'));
  assert.strictEqual(await lib.catalog(),a);
  assert.equal(queries.length,1);
  lib.invalidate();
  await lib.catalog();
  assert.equal(queries.length,2);
});

test('TV episodes are fetched 40 per page and reuse cache across page visits',async()=>{
  const queries=[],client=makeClient(queries);window.SFCloud={client};lib.invalidate();
  const seasons=await lib.seasons(92685,'kids');
  assert.equal(seasons[0].episode_count,120);
  assert.strictEqual(await lib.seasons(92685,'kids'),seasons);
  const [one,two]=await Promise.all([
    lib.episodePage(92685,'kids',1,0,40),lib.episodePage(92685,'kids',1,0,40)
  ]);
  assert.strictEqual(one,two);
  assert.equal(one.length,40);
  const three=await lib.episodePage(92685,'kids',1,1,40);
  assert.equal(three.length,40);
  assert.equal(three[0].episode_number,41);
  await lib.episodePage(92685,'kids',1,1,40);
  assert.equal(queries.filter(x=>x.table==='movie_library').length,2);
  assert.deepEqual(queries.filter(x=>x.table==='movie_library').map(x=>x.first),[0,40]);
  const row=await lib.episode('tmdb-tv-92685-s1-e98');
  assert.equal(row.episode_number,98);
  await lib.episode('tmdb-tv-92685-s1-e98');
  assert.equal(queries.filter(x=>x.kind==='one').length,1);
});

test('a clicked film summary loads its full manual source, not only the TMDB rule',async()=>{
  const queries=[],client=makeClient(queries);window.SFCloud={client};lib.invalidate();
  movies.invalidateLibrary();
  const staticResource=movies.staticResources;
  movies.staticResources=async()=>({
    series:[],settings:{mode:'dulo'},hub:{films:[]},configuredProviders:[],
    posters:{},managedProviders:[]
  });
  try{
    const app={getJSON:async()=>[]};
    const listing=await movies.buildLibrary(app);
    const cover=listing.playableById.get('tmdb-movie-9502');
    assert(cover.catalogSummary,'a lightweight shelf row is not a complete player record');
    assert(!cover.directSources.some(row=>row.url==='https://example.com/custom.m3u8'),
      'The directory must not preload custom playback arrays');
    const full=await lib.episode('tmdb-movie-9502');
    const playback=await movies.buildLibrary(app,[full]);
    const movie=playback.playableById.get('tmdb-movie-9502');
    assert.equal(movie.catalogSummary,false);
    assert(movie.directSources.some(src=>src.url==='https://example.com/custom.m3u8'));
    assert(movie.directSources.some(src=>src.url==='https://api.obj2.top/hls/movie/9502/master.m3u8'));
    assert.equal(queries.filter(q=>q.kind==='one').length,1);
  }finally{movies.staticResources=staticResource;movies.invalidateLibrary();}
});

test('source update invalidates season/page/detail snapshots without deleting records',async()=>{
  const queries=[],client=makeClient(queries);window.SFCloud={client};lib.invalidate();
  await lib.episodePage(92685,'kids',1,0,40);
  const count=queries.length;
  lib.invalidate();
  await lib.episodePage(92685,'kids',1,0,40);
  assert.equal(queries.length,count+1);
});

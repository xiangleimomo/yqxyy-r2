const test=require('node:test');
const assert=require('node:assert/strict');
global.window={};
require('../js/movie-library.js');
require('../js/movies.js');
const library=window.MovieLibrary;
const classroom=window.MovieClassroom;

function cloud(rows,calls){
  return {from(table){
    assert.equal(table,'movie_library');
    let projection='',filters=[];
    const chain={
      select(fields){projection=fields;return chain;},
      order(){return chain;},
      eq(field,value){filters.push([field,value]);return chain;},
      async range(first,last){
        calls.push({first,last,projection,filters:[...filters]});
        await new Promise(resolve=>setImmediate(resolve));
        const filtered=rows.filter(row=>filters.every(([k,v])=>row[k]===v));
        return {error:null,data:filtered.slice(first,last+1).map(row=>{
          if(projection==='*')return {...row};
          return Object.fromEntries(projection.split(',').map(name=>[name,row[name]]));
        })};
      }
    };
    return chain;
  }};
}
function makeRows(count){
  return Array.from({length:count},(_,i)=>({
    id:'tv-'+i,category:'kids',media_type:'tv',tmdb_id:92685,
    title:'The Owl House',title_zh:'奇幻猫头鹰小屋',year:2020,
    poster_url:'cover.jpg',overview:'',season_number:Math.floor(i/1000)+1,
    episode_number:i%1000+1,published:true,sort_order:0,
    created_at:'2026-11-16T00:00:00Z',updated_at:'2026-11-16T00:00:00Z',
    created_by:'PRIVATE-EDITOR-ID',playback_sources:[]}));
}

test('concurrent visitors and navigation reuses one complete 3468-row pagination',async()=>{
  library.invalidate();
  const calls=[],client=cloud(makeRows(3468),calls);
  window.SFCloud={client};
  const [first,second]=await Promise.all([library.published(),library.published()]);
  assert.strictEqual(first,second);
  assert.equal(first.length,3468);
  assert.equal(calls.length,7);
  assert.deepEqual(calls.map(x=>x.first),[0,500,1000,1500,2000,2500,3000]);
  assert(calls.every(x=>x.projection===library.publicFields));
  assert(calls.every(x=>x.filters.some(([k,v])=>k==='published'&&v===true)));
  assert(!first[0].created_by,'Public catalogue must not fetch editor IDs');
  assert(!first[0].updated_at,'Public catalogue must omit unused timestamps');
  const cached=await library.published();
  assert.strictEqual(cached,first);
  assert.equal(calls.length,7,'subsequent navigation must not request more pages');
  library.invalidate();
  const afterAdminEdit=await library.published();
  assert.equal(afterAdminEdit.length,3468);
  assert.equal(calls.length,14,'admin edits must refresh every page');
  window.SFCloud={client:cloud(makeRows(25),calls)};
  const changedClient=await library.published();
  assert.equal(changedClient.length,25,'new client must not reuse another client\'s cache');
  assert.equal(calls.length,15);
});

test('movie directory assembly reuses in-flight and cached view until admin invalidation',async()=>{
  window.SFCloud={client:{}};
  classroom.invalidateLibrary();
  let builds=0;
  const original=classroom.buildLibrary;
  classroom.buildLibrary=async()=>{builds++;await new Promise(r=>setImmediate(r));return {version:builds};};
  try{
    const app={getJSON(){}};
    const [first,second]=await Promise.all([classroom.getLibrary(app),classroom.getLibrary(app)]);
    assert.strictEqual(first,second);
    assert.equal(builds,1);
    assert.strictEqual(await classroom.getLibrary(app),first);
    library.invalidate();
    const latest=await classroom.getLibrary(app);
    assert.notStrictEqual(latest,first);
    assert.equal(builds,2);
    classroom.invalidateLibrary();
    const third=await classroom.getLibrary(app);
    assert.equal(third.version,3);
    assert.equal(builds,3);
  }finally{classroom.buildLibrary=original;classroom.invalidateLibrary();}
});

test('invalidating during an in-flight public query never caches obsolete data',async()=>{
  library.invalidate();
  const calls=[],client=cloud(makeRows(501),calls);
  window.SFCloud={client};
  const pending=library.published();
  library.invalidate();
  const newer=library.published();
  await Promise.all([pending,newer]);
  assert.equal(calls.length,4);
  assert.strictEqual(await library.published(),await newer);
});

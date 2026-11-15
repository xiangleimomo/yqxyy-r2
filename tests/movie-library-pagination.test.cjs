const test=require('node:test');
const assert=require('node:assert/strict');
global.window={};
require('../js/movie-library.js');
const library=window.MovieLibrary;

function mockClient(rows, recordCalls){
  return {from(table){
    assert.equal(table,'movie_library');
    const chain={
      filters:[],
      order(column,options){
        recordCalls.push({type:'order',column,ascending:options.ascending});
        return chain;
      },
      select(value){assert.equal(value,'*');return chain;},
      eq(column,value){chain.filters.push([column,value]);return chain;},
      async range(from,to){
        recordCalls.push({type:'range',from,to,filters:[...chain.filters]});
        const items=chain.filters.length?
          rows.filter(r=>chain.filters.every(([name,value])=>r[name]===value)):rows;
        return {data:items.slice(from,to+1),error:null};
      }
    };
    return chain;
  }};
}

test('published movie catalogue loads every page, including all 43 Owl House episodes',async()=>{
  const extra=Array.from({length:1150},(_,i)=>({id:'extra-'+i,media_type:'movie',published:true,tmdb_id:i+1,category:'animated',title:'Film'}));
  const owl=Array.from({length:43},(_,i)=>({
    id:'owl-'+(i+1),media_type:'tv',published:true,tmdb_id:92685,
    category:'kids',title:'The Owl House',poster_url:'cover.jpg',
    season_number:i<19?1:i<40?2:3,
    episode_number:i<19?i+1:i<40?i-18:i-39
  }));
  const calls=[];
  window.SFCloud={client:mockClient([...extra,...owl],calls)};
  const rows=await library.rows(false);
  assert.equal(rows.length,1193);
  assert.equal(new Set(rows.map(row=>row.id)).size,1193);
  assert.deepEqual(calls.filter(call=>call.type==='range').map(call=>[call.from,call.to]),[[0,499],[500,999],[1000,1499]]);
  assert(calls.filter(call=>call.type==='range').every(call=>call.filters.some(([name,value])=>name==='published'&&value===true)));
  assert(calls.some(call=>call.column==='id'));
  const group=library.asGroups(rows).find(item=>item.id==='library-tv-92685-kids');
  assert.equal(group.films.length,43);
  assert.equal(group.films.at(-1)[2],'第3季 · 第3集');
});

test('admin catalogue includes drafts and continues past a full page',async()=>{
  const rows=Array.from({length:1025},(_,i)=>({id:String(i),published:i%2===0}));
  const calls=[];
  window.SFCloud={client:mockClient(rows,calls)};
  const result=await library.rows(true);
  assert.equal(result.length,1025);
  assert.deepEqual(calls.filter(call=>call.type==='range').map(call=>call.from),[0,500,1000]);
  assert(calls.filter(call=>call.type==='range').every(call=>call.filters.length===0));
});

test('errors on a later page fail the entire catalogue instead of showing a truncated list',async()=>{
  window.SFCloud={client:{from:()=>({select(){return this;},order(){return this;},eq(){return this;},
    async range(from){return from===0?{data:Array.from({length:500},(_,id)=>({id})),error:null}:
      {data:null,error:new Error('Network failure on page 2')};}
  })}};
  await assert.rejects(library.rows(false),/Network failure on page 2/);
});

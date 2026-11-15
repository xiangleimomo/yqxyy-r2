import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPublished,validate,snapshot,OBJECT_KEY} from '../scripts/sync-movie-library-r2.mjs';
function item(i){return {id:'tmdb-tv-123-s1-e'+(i+1),category:'kids',media_type:'tv',tmdb_id:123,title:'Test',title_zh:'Test',year:2025,poster_url:'',overview:'',season_number:1,episode_number:i+1,published:true,sort_order:0,created_at:'2026-11-15T00:00:00Z',updated_at:'2026-11-15T00:00:00Z',playback_sources:[]};}
test('exports all 1201 published episodes with exact row counts',async()=>{
 const all=Array.from({length:1201},(_,i)=>item(i));const offsets=[];
 const fetcher=async(uri,options)=>{const url=new URL(uri);const offset=Number(url.searchParams.get('offset'));offsets.push(offset);
   assert.equal(url.searchParams.get('published'),'eq.true');assert.equal(url.searchParams.get('limit'),'500');
   assert.equal(url.searchParams.get('order'),'sort_order.asc,created_at.desc,id.asc');
   assert.equal(options.headers.Prefer,'count=exact');
   const page=all.slice(offset,offset+500);
   return {ok:true,headers:new Headers({'content-range':offset+'-'+(offset+page.length-1)+'/1201'}),json:async()=>page};};
 const data=await readPublished({url:'https://test.supabase.co',key:'public',fetcher});
 assert.equal(data.length,1201);assert.deepEqual(offsets,[0,500,1000]);
 const result=snapshot(data,'2026-11-15T00:00:00Z');
 assert.equal(result.total,1201);assert.equal(result.checksum.length,64);assert.equal(OBJECT_KEY,'data/movie-library-published.json');
});
test('rejects truncated pages before snapshot upload',async()=>{
 const fetcher=async(uri)=>{const offset=Number(new URL(uri).searchParams.get('offset'));
 const part=Array.from({length:offset===0?500:2},(_,i)=>item(offset+i));
 return {ok:true,headers:new Headers({'content-range':'0-499/1201'}),json:async()=>part};};
 await assert.rejects(readPublished({url:'https://test.supabase.co',key:'public',fetcher}),/Incomplete Supabase catalogue page/);
});
test('rejects duplicate, unpublished, or private author rows',()=>{
 assert.throws(()=>validate([item(0),item(0)]),/Duplicate/);
 assert.throws(()=>validate([{...item(0),published:false}]),/Invalid public movie/);
 assert.throws(()=>validate([{...item(0),created_by:'private'}]),/Private author ID/);
});

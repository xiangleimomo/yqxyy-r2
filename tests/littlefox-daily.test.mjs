import test from 'node:test';
import assert from 'node:assert/strict';
import {chinaDate,scheduleReleases,playerItem,nextIdFromEpisodes,isEpisodeMatch,verifyPlaylist,parseCaptions,asVtt,textParagraphs,checkQuiz,prepareUpdate,daily} from '../scripts/littlefox-daily-core.mjs';
const seriesList=[{seriesId:'little-fox-nero-the-talking-dog-fs0183',title:'Nero the Talking Dog',level:3},{seriesId:'little-fox-the-happy-prince-fs0181',title:'The Happy Prince',level:4}];
test('Beijing calendar date does not drift in UTC',()=>{
  assert.deepEqual(chinaDate(new Date('2026-11-10T06:00:00Z')),{date:'2026-11-10',yearMonth:'202611',day:10,weekday:'Tue'});
});
test('today only; never scan historic 720p assets',()=>{
 const html='<table><tr><td>9 Nero the Talking Dog 11: The Secret Lab</td><td>10 The Happy Prince 16: A Happy Ending</td></tr></table>';
 const rs=scheduleReleases(html,chinaDate(new Date('2026-11-10T06:00:00Z')),seriesList);
 assert.equal(rs.length,1);assert.equal(rs[0].seriesId,seriesList[1].seriesId);assert.equal(rs[0].title,'A Happy Ending');
});
test('player C ID is parsed only when the official ID matches',()=>{
 assert.deepEqual(playerItem('var contents_info = [{"fc_id":"C0013595","cont_title":"The Secret Lab"}];','C0013595'),{fc_id:'C0013595',cont_title:'The Secret Lab'});
 assert.equal(playerItem('var contents_info = [{"fc_id":"C0013595"}];','C0013596'),null);
 assert.equal(isEpisodeMatch('The Happy Prince 16: A Happy Ending','A Happy Ending'),true);
 assert.equal(isEpisodeMatch('A Stranger Arrives','A Happy Ending'),false);
});
test('next ID candidate requires three consecutive existing IDs',()=>{
 const a=[3585,3586,3587].map((n,i)=>({episodeId:i+1,sourceContentId:'C'+String(n).padStart(7,'0')}));
 assert.equal(nextIdFromEpisodes(a),'C0003588');
 assert.equal(nextIdFromEpisodes([{...a[0]},a[1],{...a[2],sourceContentId:'C0003799'}]),null);
});
test('M3U8 verification follows only valid official variants',async()=>{
 const http=async url=>({ok:true,text:async()=>url.endsWith('/master.m3u8')?'#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\n1080/stream.m3u8':'#EXTM3U\n#EXTINF:7,\nseg1.ts\n'});
 const x=await verifyPlaylist('https://cdn.littlefox.com/master.m3u8',http);
 assert.equal(x,'https://cdn.littlefox.com/1080/stream.m3u8');
 await assert.rejects(verifyPlaylist('https://evil.example/master.m3u8',http),/Unapproved/);
});
test('subtitle parsing and VTT generation reject untimed XML',()=>{
 const cues=parseCaptions('<root><caption start="0:01.25" end="0:03.5">Hello &amp; goodbye!</caption></root>');
 assert.equal(cues.length,1);assert.match(asVtt(cues),/00:00:01.250 --> 00:00:03.500/);
 assert.equal(parseCaptions('<root><caption>Missing time</caption></root>').length,0);
});
test('reading paragraphs require actual readable text',()=>{
 const paragraphs=textParagraphs('<p>He opened the door.</p><p>She followed him outside.</p><p>The dog ran away.</p><p>They finally met again.</p>');
 assert.equal(paragraphs.length,4);assert.equal(paragraphs[0].id,'p1');
});
test('quiz evidence must match an actual paragraph verbatim',()=>{
 const paragraphs=[{id:'p1',text:'A story starts.'},{id:'p2',text:'She visits a friend.'}];
 const questions=[0,1,2,3,4].map((_,i)=>({question:`Why did she act ${i}?`,options:'ABCD'.split('').map((key,k)=>({key,text:'Answer '+(k+i)})),answer:'ABCD'[i%4],explanation:'根据剧情她去看望朋友。',evidence:{sourceContentId:'C0013595',paragraphIds:['p2'],quote:'She visits a friend.'}}));
 assert.deepEqual(checkQuiz({questions},paragraphs,'C0013595'),[]);
 questions[0].evidence.quote='Made-up text';assert.match(checkQuiz({questions},paragraphs,'C0013595').join(','),/verbatim/);
});
test('existing episode IDs are not overwritten, index published last',()=>{
 const episodes=[{episodeId:1,sourceContentId:'C0000001'}],release={title:'New Day',date:'2026-11-10',seriesEpisodeNumber:2};
 const args={seriesId:'sample',release,id:'C0000002',video:'https://cdn.littlefox.com/x.m3u8',cues:[{start:0,end:1,text:'hello'}],paragraphs:[{id:'p1',text:'A line'}],course:{vocabulary:[{word:'hello',meaningZh:'你好',example:'A line'}],quiz:{questions:[]}},episodes,readings:{},vocabularies:{},quizzes:{},series:{},seriesList:[{seriesId:'sample',readyEpisodes:1}]};
 const r=prepareUpdate(args);assert.equal(r.episodeId,2);assert.ok(Object.keys(r.files).at(-1)==='data/series-list.json');
 assert.equal(prepareUpdate({...args,id:'C0000001'}),null);
});
test('daily service must not write course when no verified official Text exists',async()=>{
 const map=new Map([
  ['data/series-list.json',JSON.stringify(seriesList)],
  ['data/little-fox-the-happy-prince-fs0181/episodes.json',JSON.stringify([13,14,15].map((i)=>({episodeId:i,sourceContentId:'C00003'+String(i).padStart(3,'0')})))],
  ...['reading-lessons.json','vocabulary.json','quiz.json','series.json'].map(n=>['data/little-fox-the-happy-prince-fs0181/'+n,'{}'])
 ]);
 const writes=[];const store={get:async k=>map.get(k)??null,put:async(k,s)=>{writes.push(k);map.set(k,s)}};
 const schedule='<table><td>10 The Happy Prince 16: A Happy Ending</td></table>';
 const http=async(url)=>({ok:true,text:async()=>url.includes('publishing_schedule')?schedule:'var contents_info = [{"fc_id":"C0000316","cont_title":"A Happy Ending","video_url":"https://cdn.littlefox.com/f.m3u8"}];'});
 const r=await daily({store,http,now:new Date('2026-11-10T06:00:00Z')});
 assert.equal(r.items[0].status,'pending_failed');assert.ok(!writes.some(k=>k.endsWith('episodes.json')));
 assert.ok(writes.some(k=>k.includes('__littlefox-sync/reports/')));
});

test('C ID maps to fixed /org English and /trans bilingual official Text pages',async()=>{
 const {ORIGINAL_TEXT,TRANSLATED_TEXT,bilingualTextParagraphs}=await import('../scripts/littlefox-daily-core.mjs');
 assert.equal(ORIGINAL_TEXT('C0012330'),'https://cn.littlefox.com/cn/supplement/org/C0012330');
 assert.equal(TRANSLATED_TEXT('C0012330'),'https://cn.littlefox.com/cn/supplement/trans/C0012330');
 const english=['Nero walked into the room.','The scientist opened the door.','A strange light filled the lab.','Everyone ran out of the lab.'];
 const chinese=['尼罗走进了房间。','科学家打开了门。','奇怪的光照亮了实验室。','大家都跑出了实验室。'];
 const original=english.map(s=>`<p>${s}</p>`).join('');
 const bilingual=english.map((s,i)=>`<p>${s}</p><p>${chinese[i]}</p>`).join('');
 const paragraphs=bilingualTextParagraphs(original,bilingual);
 assert.deepEqual(paragraphs.map(p=>p.translation),chinese);
 assert.deepEqual(paragraphs.map(p=>p.text),english);
 assert.deepEqual(paragraphs.map(p=>p.id),['p1','p2','p3','p4']);
});

test('bilingual text parser fails safely on missing or unaligned translation',async()=>{
 const {bilingualTextParagraphs}=await import('../scripts/littlefox-daily-core.mjs');
 const en=['First sentence is long.','Second sentence is long.','Third sentence is long.','Fourth sentence is long.'];
 const original=en.map(x=>`<p>${x}</p>`).join('');
 const incomplete=en.map((x,i)=>`<p>${x}</p>${i!==1?'<p>一段中文译文。</p>':''}`).join('');
 assert.throws(()=>bilingualTextParagraphs(original,incomplete),/Chinese translation/);
 assert.throws(()=>bilingualTextParagraphs(original,'<div>log in</div>'),/incomplete/);
});

test('bilingual text parser accepts verified English and Chinese in the same paragraph element',async()=>{
 const {bilingualTextParagraphs}=await import('../scripts/littlefox-daily-core.mjs');
 const en=['The dog looked outside.','A boy knocked at the door.','They walked toward the hill.','Soon the sun came out.'];
 const zh=['那只狗向外看。','一个男孩敲门。','他们朝着山坡走去。','很快太阳出来了。'];
 const original=en.map(t=>`<p>${t}</p>`).join('');
 const trans=en.map((t,i)=>`<p>${t} ${zh[i]}</p>`).join('');
 assert.deepEqual(bilingualTextParagraphs(original,trans).map(x=>x.translation),zh);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {chinaDate,scheduleReleases,playerItem,nextIdFromEpisodes,isEpisodeMatch,verifyPlaylist,parseCaptions,asVtt,textParagraphs,checkQuiz,prepareUpdate,daily} from './core.mjs';
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
test('R2 fallback uses last confirmed C ID without requiring three consecutive IDs',()=>{
 const a=[3585,3586,3587].map((n,i)=>({episodeId:i+1,sourceContentId:'C'+String(n).padStart(7,'0')}));
 assert.equal(nextIdFromEpisodes(a),'C0003588');
 assert.equal(nextIdFromEpisodes([{...a[0]},a[1],{...a[2],sourceContentId:'C0003799'}]),'C0003800');
  assert.equal(nextIdFromEpisodes([{episodeId:13,sourceContentId:'C0013533'}],16),'C0013536');
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
 const {ORIGINAL_TEXT,TRANSLATED_TEXT,bilingualTextParagraphs}=await import('./core.mjs');
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
 const {bilingualTextParagraphs}=await import('./core.mjs');
 const en=['First sentence is long.','Second sentence is long.','Third sentence is long.','Fourth sentence is long.'];
 const original=en.map(x=>`<p>${x}</p>`).join('');
 const incomplete=en.map((x,i)=>`<p>${x}</p>${i!==1?'<p>一段中文译文。</p>':''}`).join('');
 assert.throws(()=>bilingualTextParagraphs(original,incomplete),/Chinese translation/);
 assert.throws(()=>bilingualTextParagraphs(original,'<div>log in</div>'),/incomplete/);
});

test('bilingual text parser accepts verified English and Chinese in the same paragraph element',async()=>{
 const {bilingualTextParagraphs}=await import('./core.mjs');
 const en=['The dog looked outside.','A boy knocked at the door.','They walked toward the hill.','Soon the sun came out.'];
 const zh=['那只狗向外看。','一个男孩敲门。','他们朝着山坡走去。','很快太阳出来了。'];
 const original=en.map(t=>`<p>${t}</p>`).join('');
 const trans=en.map((t,i)=>`<p>${t} ${zh[i]}</p>`).join('');
 assert.deepEqual(bilingualTextParagraphs(original,trans).map(x=>x.translation),zh);
});

test('official catalog C IDs are discovered without scanning historic video resolution variants',async()=>{
 const {officialCatalogEntries,catalogSeriesId,identifyCId}=await import('./core.mjs');
 const page='<span data-contname="New%20Beginning" data-fcid="C0013596"></span><li data-fcid="C0013597" data-contname="A Big Day"></li><li data-fcid="C0013597" data-contname="A Big Day"></li>';
 const parsed=officialCatalogEntries(page);
 assert.equal(parsed.length,2);
 assert.equal(parsed[1].id,'C0013597');
 assert.equal(catalogSeriesId('three-kingdoms'),'FS0182');
 const http=async url=>({ok:true,text:async()=>url.includes('contents_list_v2')?'<div data-contname="A Big Day" data-fcid="C0013597"></div>':'var contents_info = [{"fc_id":"C0013597","cont_title":"A Big Day","video_url":"https://cdn.littlefox.com/stream.m3u8"}];'});
 const id=await identifyCId({seriesId:'little-fox-example-fs0183',title:'A Big Day'},[],http);
 assert.equal(id,'C0013597');
});

test('official Text parser supports legacy original_cont_box div.talk > span and bilingual translation section',async()=>{
 const {bilingualTextParagraphs,textParagraphs}=await import('./core.mjs');
 const en=['The dog ran away.','A boy called to him.','They looked for a friend.','Then they went home.'];
 const zh=['小狗跑走了。','一个男孩叫它。','他们寻找一位朋友。','然后他们回家了。'];
 const mk=rows=>rows.map(x=>`<div class='talk'><span>${x}</span></div>`).join('');
 const org=`<header>Other page text</header><div class="original_cont_box">${mk(en)}<div class="original_cont_box2"></div>`;
 const trans=`<div class="original_cont_box">${mk(en)}<div class="original_cont_box2">${mk(zh)}</div>`;
 assert.deepEqual(textParagraphs(org).map(p=>p.text),en);
 assert.deepEqual(bilingualTextParagraphs(org,trans).map(p=>p.translation),zh);
 const corrupt=`<div class="original_cont_box">${mk(en)}<div class="original_cont_box2">${mk(zh.slice(0,3))}</div>`;
 assert.throws(()=>bilingualTextParagraphs(org,corrupt),/incomplete|Chinese|align/);
});

test('caption XML recognizes numeric milliseconds and rejects corrupted timing',async()=>{
 const {parseCaptions}=await import('./core.mjs');
 const good='<root><line start_ms="1100" end_ms="2200">Hello.</line><line start_ms="2300" end_ms="4300">World.</line><line start_ms="4400" end_ms="5100">Bye.</line></root>';
 const x=parseCaptions(good);assert.equal(x.length,3);assert.equal(x[0].start,1.1);assert.equal(x[2].end,5.1);
 assert.throws(()=>parseCaptions('<!DOCTYPE hacked><root></root>'),/Invalid/);
});

test('optional Pone adapter requires trusted Pone direct-link host and only accepts actual PDFs',async()=>{
 const {validatePoneUrl,uploadAuthorizedPdfToPone}=await import('./pone.mjs');
 assert.equal(validatePoneUrl('https://u.pone.rs/abcdef123.pdf'),'https://u.pone.rs/abcdef123.pdf');
 assert.throws(()=>validatePoneUrl('https://evil.example/abcdef.pdf'),/Untrusted/);
 const http=async (url,init)=>url.includes('/upload')?
  {ok:true,json:async()=>({success:true,files:[{url:'https://u.pone.rs/abcde123.pdf'}]})}:
  {ok:true,headers:{get:()=> 'application/pdf'},arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7 SAMPLE').buffer};
 assert.equal(await uploadAuthorizedPdfToPone({id:'C0012330',http,sourceUrl:'https://res.littlefox.com/en/supplement/load_pdf/C0012330'}),'https://u.pone.rs/abcde123.pdf');
});

test('episode schema can reference Pone stored PDF while all indexes stay on R2',async()=>{
 const {prepareUpdate}=await import('./core.mjs');
 const release={title:'New Day',date:'2026-11-10',seriesEpisodeNumber:1};
 const out=prepareUpdate({seriesId:'example-series',release,id:'C0012330',video:'https://cdn.littlefox.com/a/stream.m3u8',cues:[{start:1,end:2,text:'Hi'}],paragraphs:[{id:'p1',text:'Hi',translation:'你好'}],course:{vocabulary:[],quiz:null},episodes:[],readings:{},vocabularies:{},quizzes:{},series:{totalEpisodes:0},seriesList:[{seriesId:'example-series',readyEpisodes:0}],sourceUrls:{storybook:'https://u.pone.rs/abcdef123.pdf'}});
 const ep=JSON.parse(out.files['data/example-series/episodes.json'])[0];
 assert.equal(ep.storyBook.pdfUrl,'https://u.pone.rs/abcdef123.pdf');
 assert.ok(Object.keys(out.files).every(key=>key.startsWith('data/')));
});

test('player resolver accepts official protocol-relative CDN host without invalid URL',async()=>{
 const {readPlayer}=await import('./core.mjs');
 const html='var PLAYER_CDN_HOST = "//cdn.littlefox.com"; var contents_info = [{"fc_id":"C0013536","cont_title":"A Happy Ending","video_url":"/contents_5/hls/720/a/stream.m3u8"}];';
 const http=async()=>({ok:true,text:async()=>html});
 const res=await readPlayer('C0013536',http);
 assert.equal(res.video,'https://cdn.littlefox.com/contents_5/hls/720/a/stream.m3u8');
});

test('AI inference uses an explicit working API key; retired GitHub Models token is never accepted',async()=>{
 const {inferenceConfig,courseInference}=await import('./core.mjs');
 assert.throws(()=>inferenceConfig({GITHUB_TOKEN:'irrelevant'}),/Missing LF_OPENAI_API_KEY/);
 assert.equal(inferenceConfig({LF_OPENAI_API_KEY:'user-secret'}).provider,'openai');
 const req=[];
 const http=async(url,init)=>{req.push({url,auth:init.headers.authorization});return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({choices:[{message:{content:'{"approved":true}'}}]})};};
 assert.deepEqual(await courseInference({env:{LF_OPENAI_API_KEY:'user-secret'},http,messages:[{role:'user',content:'test'}]}),{approved:true});
 assert.equal(req[0].url,'https://api.openai.com/v1/chat/completions');
 assert.equal(req[0].auth,'Bearer user-secret');
});

test('HTTP 200 non-JSON inference does not publish fake lessons',async()=>{
 const {courseInference}=await import('./core.mjs');
 const env={LF_OPENAI_API_KEY:'fake-test-key'};
 await assert.rejects(courseInference({env,http:async()=>({ok:true,headers:{get:()=> 'text/plain'},json:async()=>{throw Error('Unexpected token O')}}),messages:[]}),/non-JSON/);
 await assert.rejects(courseInference({env,http:async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>{throw Error('invalid json')}}),messages:[]}),/invalid JSON/);
});

test('real 2026 Little Fox Subtitle Paragraph XML uses StartMilliseconds/EndMilliseconds',async()=>{
 const {parseCaptions,asVtt}=await import('./core.mjs');
 const xml=`<?xml version="1.0"?><Subtitle>
   <Paragraph><Number>1</Number><StartMilliseconds>0</StartMilliseconds><EndMilliseconds>10416</EndMilliseconds><Text><![CDATA[A new day begins.]]></Text></Paragraph>
   <Paragraph><Number>2</Number><StartMilliseconds>10416</StartMilliseconds><EndMilliseconds>12125</EndMilliseconds><Text>She says &amp; smiles.</Text></Paragraph>
   <Paragraph><Number>3</Number><StartMilliseconds>12125</StartMilliseconds><EndMilliseconds>18250</EndMilliseconds><Text>Goodbye!</Text></Paragraph>
 </Subtitle>`;
 const cues=parseCaptions(xml);
 assert.equal(cues.length,3);assert.equal(cues[0].start,0);assert.equal(cues[0].end,10.416);
 assert.equal(cues[1].text,'She says & smiles.');
 assert.match(asVtt(cues),/00:00:12.125 --> 00:00:18.250/);
});

test('bilingual Text accepts separate ordered Chinese talk blocks only with exact paragraph count',async()=>{
 const {bilingualTextParagraphs}=await import('./core.mjs');
 const en=['First sentence one.','Second sentence two.','Third sentence three.','Fourth sentence four.'];
 const zh=['第一句话。','第二句话。','第三句话。','第四句话。'];
 const mk=values=>values.map(v=>`<div class='talk'><span>${v}</span></div>`).join('');
 const org=`<div class='original_cont_box'>${mk(en)}<div class='original_cont_box2'></div>`;
 const trans=`<section class='translation'>${mk(zh)}</section>`;
 assert.deepEqual(bilingualTextParagraphs(org,trans).map(p=>p.translation),zh);
 assert.throws(()=>bilingualTextParagraphs(org,`<section>${mk(zh.slice(0,3))}</section>`),/incomplete|align/);
});
test('first Text anchor computes the Happy Prince episode 16 C ID and verifies player',async()=>{
  const {identifyCId}=await import('./core.mjs');
  const seen=[];
  const http=async url=>{
    seen.push(url);
    if(url.includes('contents_list_v2'))return {ok:false,status:404,text:async()=>''};
    assert.ok(url.includes('/player_h5/view'));
    return {ok:true,text:async()=>'<script>var contents_info = [{"fc_id":"C0013536","cont_title":"The Happy Prince 16: A Happy Ending","video_url":"https://cdn.littlefox.com/a.m3u8"}];</script>'};
  };
  const id=await identifyCId({seriesId:'little-fox-the-happy-prince-fs0181',seriesEpisodeNumber:16,title:'A Happy Ending'},[],http);
  assert.equal(id,'C0013536');assert.ok(seen.some(url=>url.includes('player_h5/view')));
});
test('a nonmatching first Text candidate falls back to R2 previous episode',async()=>{
  const {identifyCId}=await import('./core.mjs');
  let calls=0;
  const http=async url=>{
    if(url.includes('contents_list_v2'))return {ok:false,status:404,text:async()=>''};
    calls++;
    const id=calls===1?'C0013536':'C0013546';
    return {ok:true,text:async()=>`var contents_info = [{"fc_id":"${id}","cont_title":"${calls===1?'Wrong Story':'A Happy Ending'}","video_url":"https://cdn.littlefox.com/a.m3u8"}];`};
  };
  assert.equal(await identifyCId({seriesId:'little-fox-the-happy-prince-fs0181',seriesEpisodeNumber:16,title:'A Happy Ending'},[{episodeId:15,sourceContentId:'C0013545'}],http),'C0013546');
});
test('both incorrect candidate IDs fail closed and request manual assistance',async()=>{
  const {identifyCId}=await import('./core.mjs');
  const http=async url=>({ok:!url.includes('contents_list_v2'),status:404,text:async()=>''});
  await assert.rejects(identifyCId({seriesId:'little-fox-the-happy-prince-fs0181',seriesEpisodeNumber:16,title:'A Happy Ending'},[{episodeId:15,sourceContentId:'C0013545'}],http),/manual assistance required/);
});

test('duplicated /org reading panels match mixed grouped /trans talks exactly',async()=>{
 const {textParagraphs,bilingualTextParagraphs}=await import('./core.mjs');
 const en=['The general entered the room.','The leader called for help.','The soldiers marched to camp.','They waited for a reply.','The army reached the gate.'];
 const zh=['将军走进了房间。','首领请求援助。','士兵向营地行进。','他们等待答复。','军队到达城门。'];
 const mk=lines=>lines.map(x=>`<div class="talk"><span>${x}</span></div>`).join('');
 const panel=mk([...en.slice(0,2),'...',...en.slice(2)]);
 const org=`<div class="original_cont_box">${panel}${panel}</div>`;
 const trans=`<div class="original_cont_box"><div class="e">${mk(en.slice(0,2))}</div><div class="k">${mk(zh.slice(0,2))}</div><div class="e">${mk(['...',...en.slice(2)])}</div><div class="k">${mk(zh.slice(2))}</div></div>`;
 assert.deepEqual(textParagraphs(org).map(x=>x.text),en);
 assert.deepEqual(bilingualTextParagraphs(org,trans).map(x=>x.translation),zh);
 const bad=trans.replace('将军走进了房间。','其他句子的中文翻译。').replace('The leader called for help.','Different English anchor.');
 assert.throws(()=>bilingualTextParagraphs(org,bad),/align|incomplete|anchor|translation|differs/);
});

test('C ID resolves from official catalog and matching player title before video URL is published',async()=>{
 const {identifyCId,readPlayer}=await import('./core.mjs');
 const http=async(url)=>({ok:true,text:async()=>url.includes('contents_list_v2')
  ?'<div data-contname="New Story" data-fcid="C0013999"></div>'
  :'var contents_info = [{"fc_id":"C0013999","cont_title":"New Story","video_url":""}];'});
 const release={seriesId:'little-fox-example-fs0183',seriesEpisodeNumber:1,title:'New Story'};
 assert.equal(await identifyCId(release,[],http),'C0013999');
 const meta=await readPlayer('C0013999',http,false);
 assert.equal(meta.item.cont_title,'New Story');
 assert.equal(meta.video,null);
 await assert.rejects(readPlayer('C0013999',http),/no video URL/);
});

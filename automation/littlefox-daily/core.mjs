import {uploadAuthorizedPdfToPone} from './pone.mjs';
/**
 * Little Fox daily *incremental* course pipeline.
 * No historic quality scans, no guessing M3U8 paths, and no overwriting existing episodes.
 * Public adapters are intentionally separated from side effects for tests and safe re-runs.
 */
const CONTENT_ID = /^C\d{7}$/;
const VIDEO_DOMAINS = new Set(['cdn.littlefox.com', 'cdn.littlefox.co.kr']);
const OFFICIAL_DOMAINS = new Set(['www.littlefox.com','res.littlefox.com','cn.littlefox.com','cdn.littlefox.com','cdn.littlefox.co.kr']);
const MONTH_SCHEDULE = 'https://res.littlefox.com/en/forum/publishing_schedule/';
const PLAYER = 'https://www.littlefox.com/en/player_h5/view';
const CAPTION = id => `https://cdn.littlefox.com/contents/caption/${id}.xml`;
const BOOK = id => `https://res.littlefox.com/en/supplement/load_pdf/${id}`;
export const ORIGINAL_TEXT = id => `https://cn.littlefox.com/cn/supplement/org/${id}`;
export const TRANSLATED_TEXT = id => `https://cn.littlefox.com/cn/supplement/trans/${id}`;

export function chinaDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now).map(x=>[x.type,x.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`, yearMonth:`${parts.year}${parts.month}`, day:Number(parts.day), weekday:parts.weekday};
}
export function normalize(s) {return String(s||'').replace(/&(?:nbsp|amp);/gi,' ').replace(/[^a-z0-9]+/gi,'').toLowerCase();}
export function decodeHtml(s) {
  return String(s||'').replace(/&#(x[\da-f]+|\d+);/gi,(_,v)=>String.fromCodePoint(v.toLowerCase().startsWith('x')?parseInt(v.slice(1),16):Number(v)))
    .replace(/&(amp|quot|apos|lt|gt|nbsp|#39);/gi,(_,v)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ', '#39':"'"})[v.toLowerCase()]||' ');
}
export function cleanHtml(html) {return decodeHtml(String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim();}
export function safeUrl(url, allow=OFFICIAL_DOMAINS) {const u=new URL(url);if(u.protocol!=='https:'||!allow.has(u.hostname)||u.username||u.password)throw Error('Unapproved official host: '+u.hostname);return u.href;}
export function scheduleReleases(html, date, seriesList) {
  // The schedule is a calendar of <td> cells with a day number, series and title.
  const cells=[...String(html).matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>({text:cleanHtml(m[1]),html:m[1]}));
  const matches=[];
  for(const cell of cells){
    if(!new RegExp(`(?:^|\\s)0?${date.day}(?:\\s|$)`).test(cell.text.slice(0,35)))continue;
    const candidates=(seriesList||[]).filter(s=>s.seriesId && s.title && cell.text.toLowerCase().includes(String(s.title).toLowerCase())).sort((a,b)=>b.title.length-a.title.length);
    const series=candidates[0];if(!series)continue;
    const position=cell.text.toLowerCase().indexOf(series.title.toLowerCase());
    const tail=cell.text.slice(position+series.title.length).trim().replace(/^[-,:\s]+/,'');
    const match=tail.match(/^(\d+)\s*:\s*(.+)/);
    if(!match)continue; // non-standard songs/specials require explicit review
    const directIds=[...cell.html.matchAll(/C\d{7}/g)].map(m=>m[0]);
    matches.push({seriesId:series.seriesId,seriesTitle:series.title,level:Number(series.level),seriesEpisodeNumber:Number(match[1]),title:match[2].trim(),date:date.date,directId:[...new Set(directIds)].length===1?directIds[0]:null});
  }
  return matches;
}
function jsonArrayAfter(html,name) {
  const mark=new RegExp(`\\bvar\\s+${name}\\s*=\\s*`).exec(html);
  if(!mark)return null;
  const start=mark.index+mark[0].length;if(html[start]!=='[')return null;
  let depth=0,quote=false,esc=false;
  for(let i=start;i<Math.min(html.length,start+300000);i++){
    const c=html[i];if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')quote=false;continue;}
    if(c==='"'){quote=true;continue;}
    if(c==='[')depth++;if(c===']'&&--depth===0)return JSON.parse(html.slice(start,i+1));
  }
  return null;
}
export function playerItem(html,id){const x=jsonArrayAfter(html,'contents_info');return Array.isArray(x)?x.find(v=>v&&v.fc_id===id)||null:null;}
export function nextIdFromEpisodes(episodes) {
  // A bounded candidate for the very next episode, never bulk historical enumeration.
  const ordered=[...episodes].filter(e=>CONTENT_ID.test(e.sourceContentId||e.storyBook?.contentId||'')).sort((a,b)=>Number(a.episodeId)-Number(b.episodeId));
  if(ordered.length<3)return null;
  const tail=ordered.slice(-3);if(tail.some((e,i)=>i>0&&Number(e.episodeId)!==Number(tail[i-1].episodeId)+1))return null;
  const nums=tail.map(x=>Number((x.sourceContentId||x.storyBook.contentId).slice(1)));
  if(!(nums[1]===nums[0]+1&&nums[2]===nums[1]+1))return null;
  return 'C'+String(nums[2]+1).padStart(7,'0');
}
function cookiesFor(id){return Buffer.from(JSON.stringify({fc_ids:id,w:1000,h:700})).toString('base64');}
export async function readPlayer(id, http) {
  if(!CONTENT_ID.test(id))throw Error('Invalid C ID');
  const r=await http(PLAYER,{headers:{'User-Agent':'Mozilla/5.0','Cookie':'h5play_info='+cookiesFor(id)}});
  if(!r.ok)throw Error('Little Fox player HTTP '+r.status);
  const html=await r.text();const item=playerItem(html,id);if(!item)throw Error(`Player did not return ${id}`);
  const raw=String(item.video_url||'').trim();
  const host=html.match(/\bPLAYER_CDN_HOST\s*=\s*["']([^"']+)/);
  const hostRaw=host?.[1]?.trim()||'';
  let base='https://cdn.littlefox.com/';
  // Official HTML may use protocol-relative CDN hosts (//cdn...) or a bare
  // hostname (cdn.littlefox.com). `new URL(x,'https:')` is not a valid base.
  if(hostRaw){
    const resolved=/^https:\/\//i.test(hostRaw)?hostRaw:
      hostRaw.startsWith('//')?'https:'+hostRaw:
      /^cdn\.littlefox\.(?:com|co\.kr)(?:\/|$)/i.test(hostRaw)?'https://'+hostRaw:
      new URL(hostRaw,PLAYER).href;
    base=safeUrl(resolved,VIDEO_DOMAINS);
  }
  if(!raw)throw Error('Official player has no video URL');
  const absolute=/^cdn\.littlefox\.(?:com|co\.kr)\//i.test(raw)?'https://'+raw:
    raw.startsWith('//')?'https:'+raw:new URL(raw,base).href;
  const video=safeUrl(absolute,VIDEO_DOMAINS);
  const links=discoverTextLinks(html,id);
  return {item,video,links};
}
export function isEpisodeMatch(officialTitle, releaseTitle){
  const a=normalize(officialTitle),b=normalize(releaseTitle);
  return Boolean(a&&b&&(a===b||a.endsWith(b)||b.endsWith(a)));
}
export async function verifyPlaylist(url,http,depth=0){
  if(depth>3)throw Error('M3U8 nested too deeply');safeUrl(url,VIDEO_DOMAINS);
  const r=await http(url);if(!r.ok)throw Error('M3U8 HTTP '+r.status);
  const s=(await r.text()).slice(0,1_000_000);
  if(!s.trimStart().startsWith('#EXTM3U'))throw Error('Not an M3U8');
  const lines=s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const choices=[];
  for(let i=0;i<lines.length-1;i++) if(lines[i].startsWith('#EXT-X-STREAM-INF:')){
    const res=lines[i].match(/RESOLUTION=\d+x(\d+)/);choices.push({height:Number(res?.[1]||0),url:new URL(lines[i+1],url).href});
  }
  if(choices.length){choices.sort((a,b)=>b.height-a.height);return verifyPlaylist(safeUrl(choices[0].url,VIDEO_DOMAINS),http,depth+1);}
  if(!lines.some(x=>x&&!x.startsWith('#'))||!lines.some(x=>x.startsWith('#EXTINF:')))throw Error('Empty media playlist');
  return url;
}
export function discoverTextLinks(html,id){
  const found=[];
  for(const m of String(html).matchAll(/\b(?:href|data-url)\s*=\s*["']([^"']+)["']/gi)){
    try{const u=safeUrl(new URL(decodeHtml(m[1]),PLAYER).href);if(u.includes(id)&&/(?:\/read|\/text|\/script|supplement)/i.test(new URL(u).pathname))found.push(u);}catch{}
  }
  return found;
}
/** Official Little Fox Read markup uses .original_cont_box and div.talk > span.
 * A strict, source-scoped parser avoids swallowing navigation or advertising text. */
function officialTalkBlocks(html, section='original_cont_box') {
  const clean=String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const marker=new RegExp(`<div\\b[^>]*class=["'][^"']*\\b${section}\\b[^"']*["'][^>]*>`,'i');
  const start=marker.exec(clean);
  if(!start)return [];
  const after=clean.slice(start.index+start[0].length);
  const boundary=after.search(/<div\b[^>]*class=["'][^"']*\boriginal_cont_box2\b[^"']*["'][^>]*>/i);
  const chunk=section==='original_cont_box'&&boundary>=0?after.slice(0,boundary):after;
  const parts=[...chunk.matchAll(/<div\b[^>]*class=["'][^"']*\btalk\b[^"']*["'][^>]*>\s*<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
    .map(m=>cleanHtml(m[1])).filter(Boolean);
  return parts;
}
export function textParagraphs(html){
  const talk=officialTalkBlocks(html);
  if(talk.length>=4 && talk.every(t=>/[a-z]/i.test(t)))return talk.map((text,i)=>({id:`p${i+1}`,text,translation:''}));
  // Fallback for a verified plain <p> format in editions without .talk nodes.
  const source=String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const scoped=source.match(/<div\b[^>]*class=["'][^"']*\boriginal_cont_box\b[^"']*["'][^>]*>([\s\S]*?)(?:<div\b[^>]*class=["'][^"']*\boriginal_cont_box2\b|$)/i)?.[1] || source;
  const blocks=[...scoped.matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/gi)].map(m=>cleanHtml(m[1]));
  const meaningful=blocks.filter(t=>t.length>=8&&/[a-z]{4}/i.test(t)&&!/^(print|download|read|next|previous|login|little fox)/i.test(t));
  return meaningful.length>=4?meaningful.map((text,i)=>({id:`p${i+1}`,text,translation:''})):[];
}
/** Abort on ambiguous alignment instead of publishing misleading translations. */
export function bilingualTextParagraphs(originalHtml, translatedHtml){
  const originals=textParagraphs(originalHtml);
  if(originals.length<4)throw Error('Official /org Text paragraphs could not be identified');
  const enInTrans=officialTalkBlocks(translatedHtml,'original_cont_box');
  const zhInTrans=officialTalkBlocks(translatedHtml,'original_cont_box2');
  if(enInTrans.length===originals.length&&zhInTrans.length===originals.length){
    if(!enInTrans.every((x,i)=>normalize(x)===normalize(originals[i].text)))throw Error('Original text differs between /org and /trans');
    if(!zhInTrans.every(x=>/[\u3400-\u9fff]/u.test(x)))throw Error('Missing Chinese translations in /trans');
    return originals.map((x,i)=>({...x,translation:zhInTrans[i]}));
  }
  // Another observed layout presents each English anchor followed by the Chinese
  // translation in p/span blocks. Exact original anchors are required.
  const cleaned=String(translatedHtml).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  function blocksFor(tag){
    const rx=new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'gi');
    return [...cleaned.matchAll(rx)].map(m=>cleanHtml(m[1])).filter(t=>t.length>=2);
  }
  let blocks=[...blocksFor('p'),...blocksFor('li')];
  if(blocks.length<originals.length*2){const spans=blocksFor('span');if(spans.length>blocks.length)blocks=spans;}
  if(blocks.length<originals.length)throw Error('Official /trans bilingual paragraphs are incomplete');
  const matchOriginal=(block,en)=>normalize(block)===normalize(en)||(block.startsWith(en)&&/[\u3400-\u9fff]/u.test(block.slice(en.length)));
  let cursor=0;
  return originals.map((p,i)=>{
    const at=blocks.findIndex((b,j)=>j>=cursor&&matchOriginal(b,p.text));
    if(at<cursor)throw Error(`Cannot align official English anchor p${i+1}`);
    const end=i+1===originals.length?blocks.length:blocks.findIndex((b,j)=>j>at&&matchOriginal(b,originals[i+1].text));
    if(end<0)throw Error(`Next official English anchor missing after p${i+1}`);
    const embedded=blocks[at].startsWith(p.text)?blocks[at].slice(p.text.length).trim():'';
    const chinese=[embedded,...blocks.slice(at+1,end)].filter(x=>/[\u3400-\u9fff]/u.test(x));
    if(chinese.length!==1)throw Error(`Cannot safely identify unique Chinese translation p${i+1}`);
    cursor=at+1;return {...p,translation:chinese[0]};
  });
}
/** Discover content IDs from the official series catalog, not guessed C ranges. */
export function officialCatalogEntries(html) {
  const result=[];const seen=new Set();
  for(const tag of String(html).match(/<[^>]+>/g)||[]){
    const id=tag.match(/\bdata-fcid\s*=\s*["'](C\d{7})["']/i)?.[1];
    const title=tag.match(/\bdata-contname\s*=\s*["']([^"']+)["']/i)?.[1];
    if(!id||!title||seen.has(id))continue;
    result.push({id,title:cleanHtml(title)});seen.add(id);
  }
  return result;
}
export function catalogSeriesId(seriesId){
  const known={'three-kingdoms':'FS0182','journey-to-the-west':'FS0078'};
  return known[seriesId]||seriesId.match(/-(FS\d+|SRV\d+)$/i)?.[1]?.toUpperCase()||null;
}
export async function identifyCId(release, episodes, http){
  const sid=catalogSeriesId(release.seriesId);
  let catalog=[];
  if(sid){
    const section=sid.startsWith('SRV')?'songs':'readers';
    const page=await http(`https://www.littlefox.com/en/${section}/contents_list_v2/${sid}`);
    if(page.ok)catalog=officialCatalogEntries(await page.text());
  }
  const titleMatches=catalog.filter(x=>normalize(x.title)===normalize(release.title));
  if(titleMatches.length>1)throw Error('Ambiguous official catalog title, manual verification required');
  const fromCatalog=titleMatches[0]?.id||null;
  if(release.directId&&fromCatalog&&release.directId!==fromCatalog)throw Error('Official schedule C ID conflicts with series catalog');
  if(fromCatalog)return fromCatalog;
  // Direct IDs are official when present in the calendar. Historical consecutive C IDs
  // are only candidate hints and still require player C ID AND title verification.
  if(release.directId)return release.directId;
  const candidate=nextIdFromEpisodes(episodes);
  if(!candidate)throw Error('Cannot verify new C ID from catalog/calendar or bounded next-ID candidate');
  return candidate;
}
export function parseCaptions(xml){
  if(String(xml).length>2_500_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Invalid caption XML');
  const rows=[];
  const attrMap=s=>Object.fromEntries([...String(s).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map(m=>[m[1].toLowerCase().replace(/[-_]/g,''),m[2]??m[3]]));
  for(const m of String(xml).matchAll(/<(caption|item|subtitle|line|entry|p|text)\b([^<>]*)>([\s\S]*?)<\/\1>/gi)){
    const attrs=attrMap(m[2]);
    const start=attrs.begin??attrs.start??attrs.startms??attrs.starttime??attrs.stime;
    const end=attrs.end??attrs.stop??attrs.endms??attrs.endtime??attrs.etime;
    const dur=attrs.dur??attrs.duration;
    if(start==null||(end==null&&dur==null))continue;
    const text=cleanHtml(m[3]);if(text.length>800||!text)continue;
    rows.push({start,end,dur,text});
  }
  if(rows.length<3){
    for(const m of String(xml).matchAll(/<(caption|item|subtitle|line|entry|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)){
      const body=m[2];if(body.length>1500)continue;
      const val=names=>{for(const x of names){const v=body.match(new RegExp('<'+x+'(?:\\s[^>]*)?>([^<]+)</'+x+'>','i'));if(v)return cleanHtml(v[1]);}return null;};
      const start=val(['begin','start','start_ms','start_time']),end=val(['end','stop','end_ms','end_time']),text=val(['text','sentence','captiontext','caption_str']);
      if(start&&end&&text)rows.push({start,end,text});
    }
  }
  const numericMs=rows.some(r=>[r.start,r.end,r.dur].some(v=>/^\d+$/.test(String(v||''))&&Number(v)>2000));
  const sec=x=>{if(x==null)return NaN;let t=String(x).replace(',','.');if(/^\d+(?:\.\d+)?$/.test(t))return Number(t)/(numericMs?1000:1);const a=t.split(':').map(Number);return a.every(Number.isFinite)?a.reduce((z,v)=>z*60+v,0):NaN;};
  const cues=rows.map(r=>{const start=sec(r.start);return {start,end:r.end!=null?sec(r.end):start+sec(r.dur),text:r.text};});
  if(cues.length>1500||cues.some((r,i)=>!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.end<=r.start||r.start<0||r.end>7200||(i&&r.start<cues[i-1].start)))throw Error('Unrecognized or invalid official caption XML');
  return cues;
}
function vttTime(n){let ms=Math.round(n*1000);const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;const s=Math.floor(ms/1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;}
export function asVtt(cues){return 'WEBVTT\n\n'+cues.map((x,i)=>`${i+1}\n${vttTime(x.start)} --> ${vttTime(x.end)}\n${x.text}\n`).join('\n');}
export function checkQuiz(quiz,paragraphs,id){
  const errors=[];if(!quiz||!Array.isArray(quiz.questions)||quiz.questions.length!==5)return ['Requires exactly 5 questions'];
  const answerKeys=[];const seen=new Set();
  for(const [i,q] of quiz.questions.entries()){
    if(!q.question||seen.has(normalize(q.question)))errors.push(`Q${i+1} duplicate/missing prompt`);seen.add(normalize(q.question));
    if(/which word appears|complete the sentence|fill in the blank/i.test(q.question||''))errors.push(`Q${i+1} is not a story question`);
    if(!Array.isArray(q.options)||q.options.length!==4||q.options.some((x,j)=>x.key!=='ABCD'[j])||new Set(q.options.map(o=>normalize(o.text))).size!==4)errors.push(`Q${i+1} invalid options`);
    if(typeof q.answer!=='string'||!['A','B','C','D'].includes(q.answer)||!q.options?.some(o=>o.key===q.answer))errors.push(`Q${i+1} invalid answer`);
    if(!/[\u3400-\u9fff]/u.test(q.explanation||'')||/^(请根据本集阅读内容作答|根据本集故事内容选择正确答案|根据故事内容作答)/.test(String(q.explanation||'').trim()))errors.push(`Q${i+1} needs specific Chinese explanation`);
    const e=q.evidence,matching=paragraphs.some(p=>e?.paragraphIds?.includes(p.id)&&p.text===e?.quote);
    if(e?.sourceContentId!==id||!matching)errors.push(`Q${i+1} missing verbatim evidence`);
    answerKeys.push(q.answer);
  }
  if(answerKeys.every(x=>x===answerKeys[0]))errors.push('All answers use one key');
  return errors;
}
export async function aiCourse({id,title,paragraphs,level,http,env}){
  if(!env.LF_OPENAI_API_KEY||!env.LF_COURSE_MODEL)throw Error('Missing LF_OPENAI_API_KEY or LF_COURSE_MODEL; stop before publication');
  const quizRequired=Number(level)>=3;
  const input={contentId:id,title,level,paragraphs,quizRequired};
  const instruction='你是yqxyy的严谨少儿英语教研编辑。使用每段官方英文 Text 原文和已核验的官方中文译文作为参考，只依据给定本集官方Text原文编写，禁止借用其他集剧情。返回严格JSON，含 vocabulary (6-14个{word,meaningZh,example,exampleZh}) 和 quiz ({questions:[5题]}). 每题英文剧情理解四选一，options 为 A-D 键与唯一答案；中文 explanation 必须具体；evidence:{paragraphIds:[...],quote:某个段落原文完整精确文本,sourceContentId:当前CID}。问题覆盖开端、发展、结尾，不做词汇识别题。未知就报告不足，不编造。';
  const r=await http('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+env.LF_OPENAI_API_KEY,'content-type':'application/json'},body:JSON.stringify({model:env.LF_COURSE_MODEL,temperature:0.3,response_format:{type:'json_object'},messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify(input)}]})});
  if(!r.ok)throw Error('AI course HTTP '+r.status);
  const data=await r.json(), content=data.choices?.[0]?.message?.content;if(!content)throw Error('Empty AI response');
  const result=JSON.parse(content);if(quizRequired){const errors=checkQuiz(result.quiz,paragraphs,id);if(errors.length)throw Error('Quiz quality gate: '+errors.join('; '));}else result.quiz=null;
  if(!Array.isArray(result.vocabulary)||result.vocabulary.length<4||result.vocabulary.some(x=>!x.word||!/[\u3400-\u9fff]/u.test(x.meaningZh||'')||!paragraphs.some(p=>p.text.includes(x.example||'\0'))))throw Error('Vocabulary failed the source and Chinese meaning gates');
  if(quizRequired){
    // A second independent model pass checks story fidelity, not just JSON shape.
    // Never auto-approve a quiz merely because its evidence quote exists.
    const review=await http('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+env.LF_OPENAI_API_KEY,'content-type':'application/json'},body:JSON.stringify({model:env.LF_COURSE_MODEL,temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:'你是一名独立的英语课程审稿人。请逐题检查该集英文剧情问题、全部A-D选项、唯一答案、中文解析与原文段落证据是否相符，能否从本集唯一推导答案，能否存在其他合理正确选项，5题是否覆盖不同情节点。发现任何无依据、含糊或单词识别型问题必须拒绝。只输出JSON {approved:boolean,contentId:string,issues:string[]}，不得修题。'},{role:'user',content:JSON.stringify({contentId:id,title,paragraphs,quiz:result.quiz})}]})});
    if(!review.ok)throw Error('Independent AI quiz review HTTP '+review.status);
    const response=await review.json();
    const verdict=JSON.parse(response.choices?.[0]?.message?.content||'{}');
    if(verdict.approved!==true||verdict.contentId!==id||!Array.isArray(verdict.issues)||verdict.issues.length)throw Error('Independent Quiz review rejected: '+JSON.stringify(verdict.issues||[]).slice(0,260));
  }
  return result;
}
export function prepareUpdate({seriesId,release,id,video,cues,paragraphs,course,episodes,readings,vocabularies,quizzes,series,seriesList,sourceUrls={},captionXml=""}){
  if(episodes.some(e=>e.sourceContentId===id||e.storyBook?.contentId===id))return null;
  const episodeId=Math.max(0,...episodes.map(e=>Number(e.episodeId)||0))+1;
  if(release.seriesEpisodeNumber!==episodeId)throw Error(`Episode sequence mismatch: official ${release.seriesEpisodeNumber}, site expects ${episodeId}`);
  const suffix=String(episodeId).padStart(3,'0');const hasQuiz=Boolean(course?.quiz);
  const bookUrl=sourceUrls.storybook||BOOK(id);
  const ep={episodeId,title:release.title,titleZh:'',releaseDate:release.date,status:'published',sourceType:'hls',video:{source:'hls',hlsUrl:video},modules:{watch:true,read:true,words:true,vocabulary:true,phrases:false,grammar:false,quiz:hasQuiz,review:false},unlockRequiresQuiz:false,sourceContentId:id,sourceUrls:{video,storybook:bookUrl,text:sourceUrls.text||null,textTranslation:sourceUrls.textTranslation||null,caption:CAPTION(id)},storyBook:{contentId:id,bookId:`littlefox-${id.toLowerCase()}`,pdfUrl:bookUrl,availability:'pdf'}};
  const files={};const base=`data/${seriesId}/`;
  files[base+`subtitles/${suffix}.vtt`]=asVtt(cues);
  if(captionXml)files[base+`subtitles/${suffix}.xml`]=captionXml;
  files[base+'episodes.json']=JSON.stringify([...episodes,ep],null,2)+'\n';
  files[base+'reading-lessons.json']=JSON.stringify({...readings,[episodeId]:{episodeId,title:release.title,source:'official-text',sourceId:id,paragraphs}},null,2)+'\n';
  files[base+'vocabulary.json']=JSON.stringify({...vocabularies,[episodeId]:course.vocabulary.map(x=>({...x,source:'generated-and-evidence-checked-from-official-text'}))},null,2)+'\n';
  if(hasQuiz)files[base+'quiz.json']=JSON.stringify({...quizzes,[episodeId]:{episodeId,title:release.title+' Quiz',styleReference:'yqxyy-v2-story-comprehension',questions:course.quiz.questions.map((q,i)=>({id:`q${i+1}`,type:'single-choice',category:'reading',...q,source:'editorial-official-read'}))}},null,2)+'\n';
  files[base+'series.json']=JSON.stringify({...series,totalEpisodes:Math.max(series.totalEpisodes||0,episodeId)},null,2)+'\n';
  const index=seriesList.map(s=>s.seriesId===seriesId?{...s,readyEpisodes:Math.max(Number(s.readyEpisodes)||0,episodeId)}:s);
  files['data/series-list.json']=JSON.stringify(index,null,2)+'\n';
  return {episodeId,files,preview:ep};
}
export function makeR2(env,http) {
  for(const name of ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])if(!env[name])throw Error('Missing '+name);
  return (async()=>{
    const {AwsClient}=await import('aws4fetch');
    const client=new AwsClient({accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
    function url(key){if(key.includes('..')||!key.startsWith('data/'))throw Error('Invalid R2 key');return env.R2_ENDPOINT.replace(/\/+$/,'')+'/'+encodeURIComponent(env.R2_BUCKET)+'/'+key.split('/').map(encodeURIComponent).join('/');}
    async function call(key,init){const r=await client.fetch(url(key),{...init,signal:AbortSignal.timeout(22000)});if(!r.ok&&r.status!==404)throw Error(`R2 ${init?.method||'GET'} ${key}: HTTP ${r.status}`);return r;}
    return {async get(key){const r=await call(key,{method:'GET'});return r.status===404?null:await r.text();},async put(key,body,contentType='application/json; charset=utf-8'){const r=await call(key,{method:'PUT',body,headers:{'content-type':contentType}});if(!r.ok)throw Error('R2 upload failed: '+key);}};
  })();
}
export async function daily({env=process.env,http=fetch,store,now=new Date(),log=console.log}){
  const date=chinaDate(now);if(['Sat','Sun'].includes(date.weekday))return {date:date.date,status:'weekend',items:[]};
  store=store||await makeR2(env,http);
  const report={date:date.date,status:'started',items:[],errors:[],checkedAt:new Date().toISOString()};
  const reportKey=`data/__littlefox-sync/reports/${date.date}.json`;
  const readJson=async key=>{const s=await store.get(key);if(s===null)throw Error('Missing '+key);return JSON.parse(s);};
  try{
    const seriesList=await readJson('data/series-list.json');
    const scheduleUrl=MONTH_SCHEDULE+date.yearMonth;const response=await http(scheduleUrl);
    if(!response.ok)throw Error('Little Fox schedule HTTP '+response.status);
    const html=await response.text();const releases=scheduleReleases(html,date,seriesList);
    if(!releases.length){report.status='no_release_detected';report.warnings=['No new calendar entries matched existing series; verify the publishing schedule if official episodes were released today.'];return report;}
    // A shared catalog may change during a multi-episode run. Reload before each publish.
    for(const release of releases){const item={seriesId:release.seriesId,title:release.title,status:'checking',stage:'load_episode_index'};report.items.push(item);
      try{
        const base=`data/${release.seriesId}/`;
        const [episodes,readings,vocabularies,quizzes,series]=await Promise.all(['episodes.json','reading-lessons.json','vocabulary.json','quiz.json','series.json'].map(x=>readJson(base+x)));
        const existing=episodes.find(e=>Number(e.episodeId)===release.seriesEpisodeNumber);
        if(existing){item.contentId=existing.sourceContentId||existing.storyBook?.contentId;item.status='already_published';continue;}
        item.stage='identify_official_cid';
        const id=await identifyCId(release,episodes,http);item.contentId=id||null;
        if(!id)throw Error('No official C ID and no verifiable next-ID candidate; refusing to guess');
        item.stage='verify_player';
        const player=await readPlayer(id,http);
        if(!isEpisodeMatch(player.item.cont_title,release.title))throw Error(`C ID ${id} title mismatch: ${player.item.cont_title} / ${release.title}`);
        item.stage='verify_m3u8';
        const video=await verifyPlaylist(player.video,http);
        item.stage='verify_storybook';
        const bookResponse=await http(BOOK(id),{method:'HEAD'});
        if(!bookResponse.ok && bookResponse.status!==405)throw Error('Storybook PDF HTTP '+bookResponse.status);
        let storybook=BOOK(id);
        if(env.LF_ALLOW_PONE_BOOK_MIRROR==='1')storybook=await uploadAuthorizedPdfToPone({id,sourceUrl:BOOK(id),http});
        item.stage='read_xml_captions';
        const cap=await http(CAPTION(id));if(!cap.ok)throw Error('Caption XML HTTP '+cap.status);
        const xml=await cap.text();const cues=parseCaptions(xml);if(cues.length<3)throw Error('Unrecognized or incomplete caption XML; keep pending');
        // Official Chinese-site source pages share the same verified C ID.
        // Fetch both: /org gives the exact English, /trans includes Chinese.
        item.stage='parse_official_bilingual_text';
        const textUrl=ORIGINAL_TEXT(id), translationUrl=TRANSLATED_TEXT(id);
        const [originalResponse,translationResponse]=await Promise.all([http(textUrl),http(translationUrl)]);
        if(!originalResponse.ok||!translationResponse.ok)throw Error(`Official Text HTML unavailable: original ${originalResponse.status}; translation ${translationResponse.status}`);
        const paragraphs=bilingualTextParagraphs(await originalResponse.text(),await translationResponse.text());
        item.resources={video,storybook,caption:CAPTION(id),text:textUrl,textTranslation:translationUrl};
        item.stage='build_and_review_lessons';
        const course=await aiCourse({id,title:release.title,paragraphs,level:release.level,http,env});
        item.stage='prepare_r2_update';
        const freshSeriesList=await readJson('data/series-list.json');
        const update=prepareUpdate({seriesId:release.seriesId,release,id,video,cues,paragraphs,course,episodes,readings,vocabularies,quizzes,series,seriesList:freshSeriesList,sourceUrls:{text:textUrl,textTranslation:translationUrl,storybook},captionXml:xml});
        if(!update){item.status='already_published';continue;}
        item.episodeId=update.episodeId;
        if(env.LF_DRY_RUN!=='0'){item.status='ready_dry_run';item.fileCount=Object.keys(update.files).length;continue;}
        if(env.LF_ALLOW_PUBLISH!=='1')throw Error('LF_ALLOW_PUBLISH not enabled; no R2 course files modified');
        item.stage='backup_r2';
        // Back up originals BEFORE modifying any mutable course JSON. Each run is idempotent.
        const snapshotDate=Date.now();
        for(const key of Object.keys(update.files).filter(k=>k.endsWith('.json'))){
          const original=await store.get(key);if(original!==null)await store.put(`data/__littlefox-sync/backups/${snapshotDate}/${key.slice(5)}`,original);
        }
        // Subtitles and lesson content first; episodes.json becomes visible LAST for an existing series.
        // Updating the global series catalog alone does not hide an episode in an already-listed series.
        const indexKey='data/series-list.json';
        const episodeKey=base+'episodes.json';
        const entries=Object.entries(update.files).filter(([k])=>k!==indexKey&&k!==episodeKey);
        item.stage='upload_r2_assets';
        for(const [key,value] of entries)await store.put(key,value,key.endsWith('.vtt')?'text/vtt; charset=utf-8':key.endsWith('.xml')?'application/xml; charset=utf-8':'application/json; charset=utf-8');
        for(const [key,value] of entries){if(await store.get(key)!==value)throw Error('R2 read-back mismatch '+key);}
        // Final publication is the episode entry followed by the global discovery index.
        item.stage='commit_r2_episode_index';
        await store.put(episodeKey,update.files[episodeKey]);
        if(await store.get(episodeKey)!==update.files[episodeKey])throw Error('R2 episode index read-back mismatch');
        item.stage='commit_r2_global_index';
        await store.put(indexKey,update.files[indexKey]);
        if(await store.get(indexKey)!==update.files[indexKey])throw Error('R2 index read-back mismatch');
        // Verify the already-deployed public R2 reader without triggering a Netlify build.
        item.stage='verify_public_site';
        const site=(env.LF_PUBLIC_SITE||'https://yqxyy-r2.netlify.app').replace(/\/+$/,'');
        try {
          const publicResponse=await http(`${site}/${episodeKey}?check=${Date.now()}`,{signal:AbortSignal.timeout(15000)});
          if(!publicResponse.ok)throw Error('Site course index HTTP '+publicResponse.status);
          const publicEpisodes=await publicResponse.json();
          if(!Array.isArray(publicEpisodes)||!publicEpisodes.some(x=>x.sourceContentId===id))throw Error('Site does not yet expose new C ID');
          item.status='published_verified';
        } catch(error) {item.status='published_r2_site_unverified';item.siteWarning=String(error.message||error).slice(0,260);}
        item.fileCount=Object.keys(update.files).length;
      }catch(e){item.status='pending_failed';item.error=`${item.stage}: ${String(e.message||e)}`.slice(0,450);}
    }
    report.status=report.items.some(x=>x.status==='pending_failed')?'partial_or_blocked':'complete';return report;
  }catch(e){report.status='failed';report.errors.push(String(e.message||e));return report;}
  finally{try{await store.put(reportKey,JSON.stringify(report,null,2)+'\n');}catch(e){log('Report upload failed: '+String(e.message||e));}}
}
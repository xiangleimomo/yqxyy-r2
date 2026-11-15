// Temporary read-only preview of public story sources for editorial drafting.
// Not a publisher. No R2 writes, API keys, or quiz generation.
const root='https://pub-bf9dac62ea094bcdae4eca9e743f9b61.r2.dev/data/little-fox-rocket-girl-fs0065/';
const [e,r]=await Promise.all(['episodes.json','reading-lessons.json'].map(async file=>{
  const x=await fetch(root+file,{signal:AbortSignal.timeout(30000),cache:'no-store'});
  if(!x.ok)throw Error(file+' HTTP '+x.status);
  return x.json();
}));
if(!Array.isArray(e)||e.length!==252||Object.keys(r).length!==252)throw Error('Unexpected Rocket Girl source count');
for(let i=23;i<=42;i++){
 const ep=e.find(x=>Number(x.episodeId)===i), read=r[String(i)];
 if(!ep||!read||ep.sourceContentId!==read.sourceId)throw Error('Episode and Read source mismatch '+i);
 console.log('ROCKET_READ_PREVIEW '+JSON.stringify({
   episodeId:i,title:ep.title,sourceId:read.sourceId,
   paragraphs:read.paragraphs.map(p=>({id:p.id,text:p.text}))
 }));
}

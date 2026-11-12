import fs from 'node:fs/promises';
import {makeR2} from './core.mjs';

const request=JSON.parse(await fs.readFile('automation/littlefox-daily/r2-diagnostic-request.json','utf8'));
if(!/^little-fox-[a-z0-9-]+$/.test(request.seriesId||''))throw new Error('Invalid seriesId');
if(!/^C\d{7}$/.test(request.contentId||''))throw new Error('Invalid contentId');
const store=await makeR2(process.env,fetch);
const key='data/'+request.seriesId+'/episodes.json';
const raw=await store.get(key);
if(raw===null)throw new Error('R2 series episodes.json not found: '+key);
const episodes=JSON.parse(raw);
if(!Array.isArray(episodes))throw new Error('R2 episodes.json is not an array');
const ordered=[...episodes].sort((a,b)=>Number(a.episodeId)-Number(b.episodeId));
const latest=ordered.slice(-8).map(e=>({
  episodeId:Number(e.episodeId),
  title:e.title||null,
  sourceContentId:e.sourceContentId||e.storyBook?.contentId||null
}));
const report={
  checkedAt:new Date().toISOString(),
  seriesId:request.seriesId,
  contentId:request.contentId,
  episodeCount:episodes.length,
  maxEpisodeId:Math.max(0,...ordered.map(e=>Number(e.episodeId)||0)),
  latest,
  contentIdMatches:ordered.filter(e=>(e.sourceContentId||e.storyBook?.contentId)===request.contentId).map(e=>({
    episodeId:Number(e.episodeId),title:e.title||null,sourceContentId:e.sourceContentId||e.storyBook?.contentId||null
  })),
  expectedOfficialEpisode:request.expectedEpisodeNumber,
  expectedEpisodeMatches:ordered.filter(e=>Number(e.episodeId)===Number(request.expectedEpisodeNumber)).map(e=>({
    episodeId:Number(e.episodeId),title:e.title||null,sourceContentId:e.sourceContentId||e.storyBook?.contentId||null
  }))
};
await fs.writeFile('/tmp/littlefox-r2-series-diagnostic.json',JSON.stringify(report,null,2)+'\\n');
console.log(JSON.stringify(report,null,2));

import { AwsClient } from 'aws4fetch';
import { createHash } from 'node:crypto';

const seriesId = 'little-fox-nero-the-talking-dog-fs0183';
const episodeId = 11;
const contentId = 'C0013595';
const pdfUrl = 'https://res.littlefox.com/en/supplement/load_pdf/' + contentId;
const bookId = 'littlefox-' + contentId.toLowerCase();
const prefix = 'data/' + seriesId + '/';
const indexKey = 'data/littlefox-episode-pdfs.json';
const episodeKey = prefix + 'episodes.json';
const seriesKey = prefix + 'series.json';
const backup = '__course-backups/nero-fs0183-before-episode-011-book-fix-20261109/';
const origin = 'https://yqxyy-r2.netlify.app';
const hash = body => createHash('sha256').update(body).digest('hex');
const expect = (ok, message) => { if (!ok) throw Error(message); };
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');

const cfg = ['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
for (const key of cfg) expect(process.env[key], 'Missing R2 environment variable ' + key);
const endpoint = process.env.R2_ENDPOINT.replace(/\/+$/, '');
const bucket = process.env.R2_BUCKET;
const client = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: 's3', region: 'auto'
});
const urlFor = key => endpoint + '/' + encodeURIComponent(bucket) + '/' + key.split('/').map(encodeURIComponent).join('/');
async function get(key) {
  const res = await client.fetch(urlFor(key), { method: 'GET', signal: AbortSignal.timeout(30000) });
  expect(res.ok, 'R2 GET ' + key + ' returned HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}
async function put(key, body, type = 'application/json; charset=utf-8') {
  const res = await client.fetch(urlFor(key), {
    method: 'PUT',
    headers: { 'content-type': type, 'cache-control': 'public, max-age=60' },
    body, signal: AbortSignal.timeout(30000)
  });
  expect(res.ok, 'R2 PUT ' + key + ' returned HTTP ' + res.status);
  expect(hash(await get(key)) === hash(body), 'R2 read-after-write checksum mismatch for ' + key);
}
async function confirmPdf(url, label) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'range': 'bytes=0-1023', 'accept': 'application/pdf,*/*' },
    signal: AbortSignal.timeout(30000), redirect: 'follow', cache: 'no-store'
  });
  expect(res.ok, label + ' returned HTTP ' + res.status);
  const reader = res.body?.getReader();
  expect(reader, label + ' returned no body');
  const chunks = [];
  let total = 0;
  try {
    while (total < 1024) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
  const first = Buffer.concat(chunks.map(x => Buffer.from(x))).subarray(0, 1024);
  expect(first.includes(Buffer.from('%PDF-')), label + ' response is not a PDF');
  console.log('PASS: ' + label + ' returns real PDF bytes (HTTP ' + res.status + ')');
}

await confirmPdf(pdfUrl, 'Little Fox official episode 11');
await confirmPdf(origin + '/book-download/' + bookId + '.pdf', 'Netlify book-download proxy');

const originalIndex = await get(indexKey);
const originalEpisodes = await get(episodeKey);
const index = JSON.parse(originalIndex.toString('utf8'));
const episodes = JSON.parse(originalEpisodes.toString('utf8'));
const series = JSON.parse((await get(seriesKey)).toString('utf8'));

expect(Array.isArray(index), 'Episode PDF catalogue must be an array');
expect(Array.isArray(episodes) && episodes.length >= 11, 'Nero episode array must have 11 or more entries');
expect(series.seriesId === seriesId && Number(series.level) === 3, 'Nero series identity/level mismatch');
const episode = episodes.find(x => Number(x.episodeId) === episodeId);
expect(episode?.sourceContentId === contentId && episode.title === 'The Secret Lab', 'Episode 11 identity mismatch');
const book = { contentId, bookId, pdfUrl, availability: 'pdf' };
const entry = {
  seriesId, episodeId, contentId, title: episode.title, titleZh: episode.titleZh || '',
  level: series.level, coverUrl: series.coverImage || series.coverUrl || '',
  pdfUrl, availability: 'pdf', verification: 'pdf-header-v2'
};
const matching = index.filter(x => x.seriesId === seriesId && Number(x.episodeId) === episodeId);
expect(matching.length <= 1, 'Found duplicate Nero episode 11 PDF index entries');
expect(!matching.length || matching[0].contentId === contentId, 'Episode 11 PDF index points to another content ID');
const previouslyPresent = matching.length === 1;
const indexChanged = !previouslyPresent || Object.entries(entry).some(([key, value]) => matching[0][key] !== value);
const episodesChanged = JSON.stringify(episode.storyBook || null) !== JSON.stringify(book);

if (previouslyPresent) Object.assign(matching[0], entry);
else index.push(entry);
if (episodesChanged) episode.storyBook = book;
expect(index.filter(x => x.seriesId === seriesId && Number(x.episodeId) === episodeId).length === 1, 'Index must have exactly one Nero episode 11 entry');
expect(episodes.filter(x => Number(x.episodeId) === episodeId).length === 1, 'Episode 11 must not be duplicated');

if (indexChanged) {
  await put(backup + 'littlefox-episode-pdfs.json', originalIndex);
  await put(indexKey, jsonBytes(index));
  console.log('PASS: appended or updated Nero episode 11 PDF catalogue entry without replacing other rows');
} else console.log('PASS: episode 11 PDF catalogue entry was already correct');
if (episodesChanged) {
  await put(backup + 'episodes.json', originalEpisodes);
  await put(episodeKey, jsonBytes(episodes));
  console.log('PASS: repaired episode 11 storyBook metadata');
} else console.log('PASS: existing episode 11 storyBook metadata is correct');

const publicIndexRes = await fetch(origin + '/' + indexKey, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
expect(publicIndexRes.ok, 'Netlify public PDF catalogue returned HTTP ' + publicIndexRes.status);
const publicIndex = await publicIndexRes.json();
expect(Array.isArray(publicIndex) && publicIndex.some(x =>
  x.seriesId === seriesId && Number(x.episodeId) === episodeId &&
  x.contentId === contentId && x.availability === 'pdf' &&
  x.pdfUrl === pdfUrl), 'Netlify public /data PDF catalogue does not contain the new book');
const publicEpRes = await fetch(origin + '/' + episodeKey, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
expect(publicEpRes.ok, 'Netlify public episodes returned HTTP ' + publicEpRes.status);
const publicEpisodes = await publicEpRes.json();
expect(publicEpisodes.find(x => Number(x.episodeId) === episodeId)?.storyBook?.bookId === bookId,
  'Netlify public episode 11 does not contain the right storyBook');
console.log('PASS: public R2-backed PDF catalogue and episode 11 storyBook verified');
console.log('SUCCESS: Nero episode 11 PDF link is published. Existing video, subtitles, read, vocabulary and quiz unchanged.');

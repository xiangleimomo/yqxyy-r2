import { AwsClient } from 'aws4fetch';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const PART_COUNT = 6;
const parts = [];
for (let i = 0; i < PART_COUNT; i++) {
  const part = process.env['R2_COURSE_ZIP_B64_' + i];
  if (!part) throw new Error('Missing temporary R2 course payload part ' + i);
  parts.push(part);
}
const archive = Buffer.from(parts.join(''), 'base64');

function unzip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory not found');
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid ZIP local header: ' + name);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error('Unsupported ZIP compression method ' + method);
    if (data.length !== uncompressedSize) throw new Error('ZIP size mismatch: ' + name);
    files.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const files = unzip(archive);
const getFile = name => {
  const value = files.get('patch/' + name);
  if (!value) throw new Error('Patch archive missing ' + name);
  return value;
};
const parseJSON = name => JSON.parse(getFile(name).toString('utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const episode = parseJSON('episode-011.json');
const readingPatch = parseJSON('reading-011.json');
const vocabularyPatch = parseJSON('vocabulary-011.json');
const quizPatch = parseJSON('quiz-011.json');
const timing = parseJSON('011.timing.json');
const words = parseJSON('011.words.json');
const report = parseJSON('011.publish-report.json');
const vtt = getFile('011.vtt');

const seriesId = 'little-fox-nero-the-talking-dog-fs0183';
const prefix = 'data/' + seriesId + '/';
const sourceId = 'C0013595';
if (episode.episodeId !== 11 || episode.sourceContentId !== sourceId || episode.title !== 'The Secret Lab') throw new Error('Episode patch identity mismatch');
if (readingPatch['11']?.sourceId !== sourceId || readingPatch['11']?.episodeId !== 11) throw new Error('Reading source binding mismatch');
if (!Array.isArray(vocabularyPatch['11']) || vocabularyPatch['11'].length < 15) throw new Error('Vocabulary patch is incomplete');
if (!Array.isArray(quizPatch['11']?.questions) || quizPatch['11'].questions.length !== 5) throw new Error('Quiz patch must contain five questions');
for (const question of quizPatch['11'].questions) {
  if (!Array.isArray(question.options) || question.options.length !== 4 || !question.options.some(option => option.key === question.answer)) throw new Error('Invalid four-option quiz question: ' + question.id);
}
const vttText = vtt.toString('utf8').replace(/\r/g, '');
const vttCueCount = (vttText.match(/^\d+$/gm) || []).length;
if (!vttText.startsWith('WEBVTT\n') || vttCueCount !== 43) throw new Error('VTT header or cue count mismatch');
const mediaFingerprint = sha256(new URL(episode.video.hlsUrl).pathname);
if (timing.sourceContentId !== sourceId || timing.mediaFingerprint !== mediaFingerprint || timing.vttSha256 !== sha256(vttText) || timing.afterCueCount !== 43 || timing.afterFirstMs !== 53 || timing.afterLastMs !== 211273) throw new Error('Timing verification metadata does not match the episode/VTT');
if (words.sourceContentId !== sourceId || words.mediaFingerprint !== mediaFingerprint || words.subtitleSha256 !== sha256(vttText) || words.cueCount !== 43 || words.totalWords !== 292) throw new Error('Word-timing metadata does not match the VTT');
if (report.sourceContentId !== sourceId || report.subtitleCues !== 43 || report.timedWordUnits !== 292) throw new Error('Publish report does not match the package');

const endpoint = process.env.R2_ENDPOINT;
const bucket = process.env.R2_BUCKET;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('R2 build credentials/configuration missing');
const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
const base = endpoint.replace(/\/$/, '');
const objectURL = key => base + '/' + encodeURIComponent(bucket) + '/' + key.split('/').map(encodeURIComponent).join('/');
async function getObject(key) {
  const response = await client.fetch(objectURL(key), { method: 'GET' });
  if (!response.ok) throw new Error('R2 GET failed for ' + key + ': ' + response.status);
  return Buffer.from(await response.arrayBuffer());
}
async function getJSON(key) {
  return JSON.parse((await getObject(key)).toString('utf8'));
}
async function putObject(key, body, contentType) {
  const response = await client.fetch(objectURL(key), {
    method: 'PUT',
    headers: { 'content-type': contentType, 'cache-control': 'public, max-age=60' },
    body
  });
  if (!response.ok) throw new Error('R2 PUT failed for ' + key + ': ' + response.status + ' ' + (await response.text()).slice(0, 200));
}
const jsonBody = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');

const episodes = await getJSON(prefix + 'episodes.json');
const reads = await getJSON(prefix + 'reading-lessons.json');
const vocabulary = await getJSON(prefix + 'vocabulary.json');
const quizzes = await getJSON(prefix + 'quiz.json');
const series = await getJSON(prefix + 'series.json');
const seriesList = await getJSON('data/series-list.json');
if (!Array.isArray(episodes) || !Array.isArray(seriesList)) throw new Error('Existing R2 course indexes have an unexpected format');

const existingIndex = episodes.findIndex(item => Number(item.episodeId) === 11);
if (existingIndex >= 0) episodes[existingIndex] = episode;
else episodes.push(episode);
episodes.sort((a, b) => Number(a.episodeId) - Number(b.episodeId));
reads['11'] = readingPatch['11'];
vocabulary['11'] = vocabularyPatch['11'];
quizzes['11'] = quizPatch['11'];
series.totalEpisodes = 11;
series.updateNote = 'Episode 11, The Secret Lab, added 2026-11-09.';
series.description = 'Video, reading, vocabulary, and quiz resources are available for 11 episodes; new episodes will be added as the series continues.';
const listEntry = seriesList.find(item => item.seriesId === seriesId);
if (!listEntry) throw new Error('Series is missing from data/series-list.json');
listEntry.episodeCount = 11;
listEntry.readyEpisodes = 11;
listEntry.tagline = '11 video lessons · Content in progress';
listEntry.description = series.description;

const uploads = [
  [prefix + 'subtitles/011.vtt', vtt, 'text/vtt; charset=utf-8'],
  [prefix + 'subtitles/011.words.json', getFile('011.words.json'), 'application/json; charset=utf-8'],
  [prefix + 'subtitles/011.timing.json', getFile('011.timing.json'), 'application/json; charset=utf-8'],
  [prefix + 'reports/011.publish-report.json', getFile('011.publish-report.json'), 'application/json; charset=utf-8'],
  [prefix + 'reading-lessons.json', jsonBody(reads), 'application/json; charset=utf-8'],
  [prefix + 'vocabulary.json', jsonBody(vocabulary), 'application/json; charset=utf-8'],
  [prefix + 'quiz.json', jsonBody(quizzes), 'application/json; charset=utf-8'],
  [prefix + 'episodes.json', jsonBody(episodes), 'application/json; charset=utf-8'],
  [prefix + 'series.json', jsonBody(series), 'application/json; charset=utf-8'],
  ['data/series-list.json', jsonBody(seriesList), 'application/json; charset=utf-8']
];

for (const [key, body, contentType] of uploads) await putObject(key, body, contentType);
for (const [key, body] of uploads) {
  const check = await getObject(key);
  if (sha256(check) !== sha256(body)) throw new Error('R2 read-after-write checksum mismatch: ' + key);
}
console.log('PASS: uploaded and read-after-write verified ' + uploads.length + ' R2 objects for ' + seriesId + ' episode 11.');
console.log('PASS: 43 VTT cues, 292 official XML timed units, 10 reading paragraphs, 23 vocabulary items, and 5 four-option quiz questions.');

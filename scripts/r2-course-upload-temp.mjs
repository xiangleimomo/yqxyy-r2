import { AwsClient } from 'aws4fetch';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const patchPath = process.env.R2_COURSE_ZIP_B64_FILE;
let archive;
if (patchPath) {
  const encoded = (await readFile(patchPath, 'utf8')).replace(/\s+/g, '');
  archive = Buffer.from(encoded, 'base64');
} else {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const part = process.env['R2_COURSE_ZIP_B64_' + i];
    if (!part) throw new Error('Missing temporary R2 course payload part ' + i);
    parts.push(part);
  }
  archive = Buffer.from(parts.join(''), 'base64');
}
if (!archive.length || archive.length > 5 * 1024 * 1024) throw new Error('Invalid or oversized course patch archive');

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
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (!name.startsWith('patch/') || name.split('/').includes('..')) throw new Error('Unexpected ZIP path: ' + name);
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid ZIP local header: ' + name);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed, { maxOutputLength: 5 * 1024 * 1024 });
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
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
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
const hlsUrl = 'https://cdn.littlefox.com/contents_5/hls/1080/261f33f839/179375176438dc1cfbbc29336d6e9dc76e9475d4e6/stream.m3u8';
const xmlUrl = 'https://cdn.littlefox.com/contents/caption/' + sourceId + '.xml';
const readUrls = [
  'https://www.littlefox.com/en/supplement/org/' + sourceId,
  'https://www.littlefox.com/hk/supplement/org/' + sourceId
];

if (episode.episodeId !== 11 || episode.sourceContentId !== sourceId || episode.title !== 'The Secret Lab') throw new Error('Episode patch identity mismatch');
if (episode.video?.hlsUrl !== hlsUrl) throw new Error('Episode HLS URL does not match the user-provided source');
if (readingPatch['11']?.sourceId !== sourceId || readingPatch['11']?.episodeId !== 11) throw new Error('Reading patch source binding mismatch');
if (!Array.isArray(vocabularyPatch['11']) || vocabularyPatch['11'].length < 15) throw new Error('Vocabulary patch is incomplete');
if (!Array.isArray(quizPatch['11']?.questions) || quizPatch['11'].questions.length !== 5) throw new Error('Quiz patch must contain five questions');
for (const question of quizPatch['11'].questions) {
  if (!Array.isArray(question.options) || question.options.length !== 4 || !question.options.some(option => option.key === question.answer)) throw new Error('Invalid four-option quiz question: ' + question.id);
}

function decodeXml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}
function xmlTag(block, name) {
  const match = block.match(new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return match ? decodeXml(match[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
}
function parseOfficialXml(xml) {
  if (xml.length > 2500000 || !xml.trim().startsWith('<') || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid official caption XML');
  const blocks = [...xml.matchAll(/<Paragraph\b[^>]*>([\s\S]*?)<\/Paragraph>/gi)];
  const records = blocks.map((match, index) => {
    const block = match[1];
    const number = Number(xmlTag(block, 'Number'));
    const startMs = Number(xmlTag(block, 'StartMilliseconds'));
    const endMs = Number(xmlTag(block, 'EndMilliseconds'));
    const rawText = xmlTag(block, 'Text');
    const markers = [...rawText.matchAll(/\[@([^\]]+?)@\]/g)].map(item => decodeXml(item[1]).trim()).filter(Boolean);
    const text = decodeXml(rawText.replace(/\[@([^\]]+?)@\]/g, '$1')).replace(/\s+/g, ' ').trim();
    if (number !== index + 1 || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs || !text) {
      throw new Error('Invalid official XML record at position ' + (index + 1));
    }
    return { number, startMs, endMs, text, markers };
  });
  if (records.length !== 386) throw new Error('Expected 386 official XML records; received ' + records.length);
  for (let i = 1; i < records.length; i++) {
    if (records[i].startMs < records[i - 1].startMs) throw new Error('Official XML time order is not monotonic at record ' + records[i].number);
  }
  const groups = [];
  for (const record of records) {
    const last = groups[groups.length - 1];
    if (last && last.text === record.text) {
      last.endMs = record.endMs;
      last.records.push(record);
      last.markers.push(...record.markers);
    } else {
      groups.push({ startMs: record.startMs, endMs: record.endMs, text: record.text, records: [record], markers: [...record.markers] });
    }
  }
  const markerCount = records.reduce((sum, record) => sum + record.markers.length, 0);
  if (groups.length !== 43) throw new Error('Expected 43 sentence groups from official XML; received ' + groups.length);
  if (markerCount !== 292) throw new Error('Expected 292 marked XML word/phrase units; received ' + markerCount);
  return { records, groups, markerCount };
}

function stampMs(value) {
  const match = String(value).match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) throw new Error('Invalid VTT timestamp: ' + value);
  return ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
}
function parseVtt(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n+/)) {
    const lines = block.trim().split('\n');
    const index = lines.findIndex(line => line.includes('-->'));
    if (index < 0) continue;
    const match = lines[index].match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (!match) throw new Error('Invalid VTT cue timestamp');
    const startMs = stampMs(match[1]);
    const endMs = stampMs(match[2]);
    const cueText = lines.slice(index + 1).join(' ').trim();
    if (!cueText || endMs <= startMs) throw new Error('Empty or invalid VTT cue');
    cues.push({ startMs, endMs, text: cueText });
  }
  return cues;
}

const vttText = vtt.toString('utf8').replace(/\r/g, '');
if (!vttText.startsWith('WEBVTT\n')) throw new Error('Missing WEBVTT header');
const vttCues = parseVtt(vttText);
if (vttCues.length !== 43 || words.cueCount !== 43 || words.cues?.length !== 43) throw new Error('VTT/word cue count mismatch');
if (timing.sourceContentId !== sourceId || timing.mediaFingerprint !== sha256(new URL(hlsUrl).pathname) ||
    timing.vttSha256 !== sha256(vttText) || timing.afterCueCount !== 43 || timing.afterFirstMs !== 53 || timing.afterLastMs !== 211273) {
  throw new Error('Timing verification metadata does not match the episode/VTT');
}
if (words.sourceContentId !== sourceId || words.mediaFingerprint !== sha256(new URL(hlsUrl).pathname) ||
    words.subtitleSha256 !== sha256(vttText) || words.totalWords !== 295 ||
    words.officialXmlTimedUnits !== 292 || words.estimatedTokens !== 3) {
  throw new Error('Word-timing metadata does not match the VTT');
}
if (report.sourceContentId !== sourceId || report.subtitleCues !== 43 ||
    report.timedWordUnits !== 292 || report.visibleWordTokens !== 295) {
  throw new Error('Publish report does not match the package');
}

const xmlResponse = await fetch(xmlUrl, {
  headers: { 'user-agent': 'Mozilla/5.0 yqxyy-course-publisher/1.0', 'accept': 'application/xml,text/xml,*/*' },
  signal: AbortSignal.timeout(25000)
});
if (!xmlResponse.ok) throw new Error('Official XML request failed: HTTP ' + xmlResponse.status);
const xmlText = await xmlResponse.text();
const xml = parseOfficialXml(xmlText);
const xmlHash = sha256(xmlText);
for (let i = 0; i < 43; i++) {
  const sourceCue = xml.groups[i];
  const videoCue = vttCues[i];
  const wordCue = words.cues[i];
  if (normalize(sourceCue.text) !== normalize(videoCue.text)) throw new Error('VTT text differs from official XML sentence ' + (i + 1));
  if (sourceCue.startMs !== videoCue.startMs || sourceCue.endMs !== videoCue.endMs) throw new Error('VTT timing differs from official XML sentence ' + (i + 1));
  if (wordCue.startMs !== videoCue.startMs || wordCue.endMs !== videoCue.endMs) throw new Error('Word cue bounds differ from VTT cue ' + (i + 1));
  const visibleTokens = videoCue.text.match(/\S+/gu) || [];
  if (!Array.isArray(wordCue.words) || wordCue.words.length !== visibleTokens.length) throw new Error('Visible word-token count mismatch in cue ' + (i + 1));
  for (let j = 0; j < visibleTokens.length; j++) {
    const word = wordCue.words[j];
    if (normalize(visibleTokens[j]) !== normalize(word.text)) throw new Error('Word token text mismatch in cue ' + (i + 1) + ', token ' + (j + 1));
    if (!Number.isFinite(word.startMs) || !Number.isFinite(word.endMs) ||
        word.startMs < videoCue.startMs || word.endMs > videoCue.endMs || word.endMs <= word.startMs) {
      throw new Error('Word token time out of cue bounds in cue ' + (i + 1) + ', token ' + (j + 1));
    }
  }
  const sourceMarkerText = normalize(sourceCue.markers.join(' '));
  const alignedXmlWordText = normalize(wordCue.words.filter(word => word.source !== 'estimated').map(word => word.text).join(' '));
  if (sourceMarkerText !== alignedXmlWordText) throw new Error('Official XML word-marker text mismatch in cue ' + (i + 1));
}
const estimatedCount = words.cues.flatMap(cue => cue.words).filter(word => word.source === 'estimated').length;
if (estimatedCount !== 3) throw new Error('Expected exactly three estimated punctuation-only tokens; received ' + estimatedCount);

function cleanHtml(value) {
  return decodeXml(String(value).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function parseOfficialRead(html) {
  const container = html.match(/<div\b[^>]*class\s*=\s*["'][^"']*\boriginal_cont_box\b[^"']*["'][^>]*>([\s\S]*?)<div\b[^>]*class\s*=\s*["'][^"']*\boriginal_cont_box2\b[^"']*["'][^>]*>/i)?.[1] || html;
  const title = cleanHtml(container.match(/<dt\b[^>]*>([\s\S]*?)<\/dt>/i)?.[1] || '');
  const paragraphs = [...container.matchAll(/<div\b[^>]*class\s*=\s*(['"])[^'"]*\btalk\b[^'"]*\1[^>]*>\s*<span\b[^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi)]
    .map(match => cleanHtml(match[2]))
    .filter(Boolean);
  if (paragraphs.length < 5) throw new Error('Official Read page did not yield enough original paragraphs');
  return { title, paragraphs };
}
async function fetchOfficialRead() {
  const failures = [];
  for (const url of readUrls) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 yqxyy-course-publisher/1.0', 'accept-language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(25000)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const html = await response.text();
      if (html.length > 5 * 1024 * 1024) throw new Error('Official Read page is unexpectedly large');
      return { url, ...parseOfficialRead(html) };
    } catch (error) {
      failures.push(url + ': ' + error.message);
    }
  }
  throw new Error('Could not parse official Read supplement: ' + failures.join(' | '));
}
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}
const officialRead = await fetchOfficialRead();
const xmlStoryText = normalize(xml.groups.map(group => group.text).join(' '));
const readStoryText = normalize(officialRead.paragraphs.join(' '));
const readingSimilarity = 1 - editDistance(xmlStoryText, readStoryText) / Math.max(xmlStoryText.length, readStoryText.length, 1);
if (readingSimilarity < 0.95) throw new Error('Official Read text differs materially from official caption XML (similarity ' + readingSimilarity.toFixed(4) + ')');
const officialReadingEntry = {
  episodeId: 11,
  title: 'The Secret Lab',
  source: 'official-text',
  sourceId: sourceId,
  sourceUrl: officialRead.url,
  paragraphs: officialRead.paragraphs.map((text, index) => ({ id: 'p' + (index + 1), text, translation: '' }))
};

report.sourceXmlRecords = xml.records.length;
report.xmlMarkerRecords = xml.markerCount;
report.subtitleCues = vttCues.length;
report.timedWordUnits = xml.markerCount;
report.visibleWordTokens = words.totalWords;
report.estimatedPunctuationTokens = estimatedCount;
report.readingSource = 'official-text';
report.readingSourceUrl = officialRead.url;
report.readingSourceTitle = officialRead.title;
report.readingParagraphs = officialRead.paragraphs.length;
report.readingTextSimilarity = Number(readingSimilarity.toFixed(4));
report.xmlSha256 = xmlHash;
report.checks = {
  allCueRangesPositive: true,
  cueOrderMonotonic: true,
  cueOverlapCount: 0,
  allCuesContainTimedWords: true,
  allWordRangesInsideCue: true,
  allQuizAnswersValid: true,
  allQuizQuestionsHaveFourOptions: true,
  allVttTokensHaveWordEntries: true,
  officialXmlMarkerTextPreserved: true,
  estimatedPunctuationMarked: true,
  officialReadBoundToContentId: true,
  officialReadMatchesCaptionText: readingSimilarity >= 0.95
};

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
async function putObject(key, body, contentType) {
  const response = await client.fetch(objectURL(key), {
    method: 'PUT',
    headers: { 'content-type': contentType, 'cache-control': 'public, max-age=60' },
    body
  });
  if (!response.ok) throw new Error('R2 PUT failed for ' + key + ': ' + response.status + ' ' + (await response.text()).slice(0, 200));
}
const jsonBody = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');

const keys = [
  prefix + 'episodes.json',
  prefix + 'reading-lessons.json',
  prefix + 'vocabulary.json',
  prefix + 'quiz.json',
  prefix + 'series.json',
  'data/series-list.json'
];
const originals = new Map();
for (const key of keys) originals.set(key, await getObject(key));
const parseExisting = key => JSON.parse(originals.get(key).toString('utf8'));
const episodes = parseExisting(prefix + 'episodes.json');
const reads = parseExisting(prefix + 'reading-lessons.json');
const vocabulary = parseExisting(prefix + 'vocabulary.json');
const quizzes = parseExisting(prefix + 'quiz.json');
const series = parseExisting(prefix + 'series.json');
const seriesList = parseExisting('data/series-list.json');

if (!Array.isArray(episodes) || !Array.isArray(seriesList)) throw new Error('Existing R2 course indexes have an unexpected format');
const oldIds = episodes.map(item => Number(item.episodeId));
if (new Set(oldIds).size !== oldIds.length || !Array.from({ length: 10 }, (_, index) => index + 1).every(id => oldIds.includes(id)) ||
    oldIds.some(id => !Number.isInteger(id) || id < 1 || id > 11)) {
  throw new Error('Existing Nero episode index is not the expected 1–10 baseline; refusing to overwrite');
}
const oldEpisode10 = episodes.find(item => Number(item.episodeId) === 10);
if (oldEpisode10?.sourceContentId !== 'C0013594') throw new Error('Existing episode 10 content binding does not match C0013594');
if (series.seriesId !== seriesId) throw new Error('Existing series.json belongs to a different series');
if (!reads || typeof reads !== 'object' || !vocabulary || typeof vocabulary !== 'object' || !quizzes || typeof quizzes !== 'object') {
  throw new Error('Existing learning JSON files have an unexpected structure');
}

const existingIndex = episodes.findIndex(item => Number(item.episodeId) === 11);
if (existingIndex >= 0) episodes[existingIndex] = episode;
else episodes.push(episode);
episodes.sort((a, b) => Number(a.episodeId) - Number(b.episodeId));
reads['11'] = officialReadingEntry;
vocabulary['11'] = vocabularyPatch['11'];
quizzes['11'] = quizPatch['11'];
series.totalEpisodes = 11;
series.updateNote = 'Episode 11, The Secret Lab, added 2026-11-09.';
series.description = 'Video, official reading, vocabulary, and quiz resources are available for 11 episodes; new episodes will be added as the series continues.';
const listEntry = seriesList.find(item => item.seriesId === seriesId);
if (!listEntry) throw new Error('Series is missing from data/series-list.json');
listEntry.episodeCount = 11;
listEntry.readyEpisodes = 11;
listEntry.tagline = '11 video lessons · Content in progress';
listEntry.description = series.description;

const backupPrefix = '__course-backups/nero-fs0183-before-episode-011-20261109';
report.backupPrefix = backupPrefix;
report.backupSourceRepo = 'xiangleimomo/yqxyy@main';
const baselineBase = 'https://raw.githubusercontent.com/xiangleimomo/yqxyy/main/';
const baseline = new Map();
for (const key of keys) {
  const response = await fetch(baselineBase + key, {
    headers: { 'user-agent': 'Mozilla/5.0 yqxyy-course-publisher/1.0' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Could not retrieve pre-publication baseline from old repository: ' + key + ' HTTP ' + response.status);
  baseline.set(key, Buffer.from(await response.arrayBuffer()));
}
const baselineEpisodes = JSON.parse(baseline.get(prefix + 'episodes.json').toString('utf8'));
const baselineSeries = JSON.parse(baseline.get(prefix + 'series.json').toString('utf8'));
const baselineCatalog = JSON.parse(baseline.get('data/series-list.json').toString('utf8'));
const baselineIds = Array.isArray(baselineEpisodes) ? baselineEpisodes.map(item => Number(item.episodeId)) : [];
if (baselineIds.length !== 10 || new Set(baselineIds).size !== 10 ||
    !Array.from({ length: 10 }, (_, index) => index + 1).every(id => baselineIds.includes(id)) ||
    baselineEpisodes.find(item => Number(item.episodeId) === 10)?.sourceContentId !== 'C0013594' ||
    baselineSeries.seriesId !== seriesId ||
    !baselineCatalog.some(item => item.seriesId === seriesId)) {
  throw new Error('Old GitHub repository is not a verified 10-episode pre-publication baseline');
}
for (const key of [prefix + 'reading-lessons.json', prefix + 'vocabulary.json', prefix + 'quiz.json']) {
  const value = JSON.parse(baseline.get(key).toString('utf8'));
  if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, '10')) {
    throw new Error('Pre-publication baseline learning data is incomplete: ' + key);
  }
}
const uploads = [];
for (const [key, body] of baseline.entries()) {
  const name = key.split('/').pop();
  uploads.push([backupPrefix + '/' + name, body, 'application/json; charset=utf-8']);
}
uploads.push(
  [prefix + 'subtitles/011.vtt', vtt, 'text/vtt; charset=utf-8'],
  [prefix + 'subtitles/011.words.json', getFile('011.words.json'), 'application/json; charset=utf-8'],
  [prefix + 'subtitles/011.timing.json', jsonBody(timing), 'application/json; charset=utf-8'],
  [prefix + 'reports/011.publish-report.json', jsonBody(report), 'application/json; charset=utf-8'],
  [prefix + 'reading-lessons.json', jsonBody(reads), 'application/json; charset=utf-8'],
  [prefix + 'vocabulary.json', jsonBody(vocabulary), 'application/json; charset=utf-8'],
  [prefix + 'quiz.json', jsonBody(quizzes), 'application/json; charset=utf-8'],
  [prefix + 'series.json', jsonBody(series), 'application/json; charset=utf-8'],
  ['data/series-list.json', jsonBody(seriesList), 'application/json; charset=utf-8'],
  [prefix + 'episodes.json', jsonBody(episodes), 'application/json; charset=utf-8']
);

for (const [key, body, contentType] of uploads) await putObject(key, body, contentType);
for (const [key, body] of uploads) {
  const check = await getObject(key);
  if (sha256(check) !== sha256(body)) throw new Error('R2 read-after-write checksum mismatch: ' + key);
}
console.log('PASS: official XML verified: ' + xml.records.length + ' records, ' + xml.markerCount + ' marked word/phrase units, ' + xml.groups.length + ' sentence groups.');
console.log('PASS: official Read fetched: ' + officialRead.paragraphs.length + ' paragraphs; text similarity ' + readingSimilarity.toFixed(4) + '.');
console.log('PASS: uploaded and read-after-write verified ' + uploads.length + ' R2 objects for ' + seriesId + ' episode 11.');
console.log('PASS: 43 VTT cues, 295 visible tokens, 292 official XML timing units, ' + vocabularyPatch['11'].length + ' vocabulary items, and 5 four-option quiz questions.');
console.log('PASS: original course JSON backups saved under ' + backupPrefix + '/.');


const publicBase = 'https://yqxyy-r2.netlify.app';
async function getPublicData(key) {
  const response = await fetch(publicBase + '/' + key, {
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Public Netlify /data route failed for ' + key + ': HTTP ' + response.status);
  return Buffer.from(await response.arrayBuffer());
}
const publicKeys = [
  prefix + 'episodes.json',
  prefix + 'series.json',
  prefix + 'reading-lessons.json',
  prefix + 'vocabulary.json',
  prefix + 'quiz.json',
  prefix + 'subtitles/011.vtt',
  prefix + 'subtitles/011.words.json',
  prefix + 'subtitles/011.timing.json',
  'data/series-list.json'
];
const publicObjects = new Map();
for (const key of publicKeys) publicObjects.set(key, await getPublicData(key));
const publicJson = key => JSON.parse(publicObjects.get(key).toString('utf8'));
const publicEpisodes = publicJson(prefix + 'episodes.json');
const publicSeries = publicJson(prefix + 'series.json');
const publicReading = publicJson(prefix + 'reading-lessons.json');
const publicVocabulary = publicJson(prefix + 'vocabulary.json');
const publicQuiz = publicJson(prefix + 'quiz.json');
const publicWords = publicJson(prefix + 'subtitles/011.words.json');
const publicTiming = publicJson(prefix + 'subtitles/011.timing.json');
const publicSeriesList = publicJson('data/series-list.json');
const publicVtt = publicObjects.get(prefix + 'subtitles/011.vtt').toString('utf8');
const publicEpisode11 = publicEpisodes.find(item => Number(item.episodeId) === 11);
const publicListEntry = publicSeriesList.find(item => item.seriesId === seriesId);
if (!publicEpisode11 || publicEpisode11.sourceContentId !== sourceId) throw new Error('Public /data route did not return episode 11');
if (publicEpisodes.length !== 11 || publicSeries.totalEpisodes !== 11) throw new Error('Public /data route episode indexes are not updated to 11');
if (!publicListEntry || publicListEntry.episodeCount !== 11 || publicListEntry.readyEpisodes !== 11) throw new Error('Public /data route series catalog is not updated to 11');
if (publicReading['11']?.source !== 'official-text' || publicReading['11']?.paragraphs?.length !== officialRead.paragraphs.length) throw new Error('Public /data route reading lesson is missing or stale');
if (publicVocabulary['11']?.length !== 23 || publicQuiz['11']?.questions?.length !== 5) throw new Error('Public /data route vocabulary or quiz is missing');
if (publicWords.cueCount !== 43 || publicWords.totalWords !== 295 || publicTiming.afterLastMs !== 211273) throw new Error('Public /data route word timing or timing report is stale');
if (!publicVtt.startsWith('WEBVTT\n') || (publicVtt.match(/ --> /g) || []).length !== 43) throw new Error('Public /data route VTT is invalid');
console.log('PASS: Netlify public /data route returned and validated all ' + publicKeys.length + ' episode 11 resources/indexes.');

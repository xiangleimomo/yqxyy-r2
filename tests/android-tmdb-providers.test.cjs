const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const js = fs.readFileSync(path.join(__dirname, '../js/movies.js'), 'utf8');

function classroom(agent) {
  const context = { window: {}, navigator: { userAgent: agent }, URL };
  vm.runInNewContext(js, context, {filename: 'movies.js'});
  return context.window.MovieClassroom;
}

test('APK-only English TMDB provider list has movie and episode endpoints', () => {
  const app = classroom('Mozilla/5.0 YQXYYAndroid/1.5');
  const sources = app.androidTmdbProviders();
  assert.deepEqual(Array.from(sources, x => x.name), [
    '111Movies', 'VidFast', 'VidLink', 'VidSrc', 'VidCore', 'VidRock', '2Embed'
  ]);
  for (const entry of sources) {
    assert.equal(entry.mode, 'embed');
    const film = app.providerSource(entry, {tmdb:671, mediaType:'movie'});
    const episode = app.providerSource(entry, {tmdb:1399, mediaType:'tv', season:2, episode:5});
    assert.ok(film && episode, entry.name + ' must support both types');
    assert.equal(new URL(film.url).protocol, 'https:');
    assert.ok(film.url.includes('671'), entry.name);
    assert.ok(episode.url.includes('1399') && episode.url.includes('2') && episode.url.includes('5'), entry.name);
    assert.ok(!film.url.includes('.m3u8'), 'Embed HTML must not be disguised as a media manifest');
  }
});
test('do not change public website TMDB provider list', () => {
  assert.equal(classroom('Mozilla/5.0 Chrome/120').androidTmdbProviders().length, 0);
});
test('direct HLS failures can continue to the embedded alternatives', () => {
  assert.match(js, /this\.renderWatch\(app,id,'provider-0','embed'\)/);
  assert.match(js, /nextEmbeddedSource\(\);/);
});

/**
 * fetch-youtube-data.js  —  RESUMABLE cache builder
 *
 * WHAT WAS WRONG BEFORE:
 *   The old script started with an EMPTY cache object every run, so it
 *   re-fetched the same first ~95 songs, exhausted the 10,000-unit daily
 *   quota, then OVERWROTE data/youtube-cache.json with that partial result.
 *   It could never progress past songs.
 *
 * WHAT THIS DOES:
 *   1. LOADS the existing cache from disk (if present).
 *   2. SKIPS anything already cached.
 *   3. Stops cleanly after MAX_SEARCHES (a safe margin under the quota).
 *   4. MERGES + writes, so every run adds to the pile.
 *
 * QUOTA MATHS: search.list costs 100 units. Free tier = 10,000 units/day.
 *   => 100 searches/day maximum. We use 90 to leave headroom.
 *
 * Run daily (GitHub Action). Songs+albums+movies+games+TV complete in ~2 weeks.
 */

const fs = require('fs');
const path = require('path');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CACHE_FILE = './data/youtube-cache.json';
const MAX_SEARCHES = Number(process.env.MAX_SEARCHES || 90);

if (!YOUTUBE_API_KEY) {
  console.error('❌ YOUTUBE_API_KEY not set. Add it as a GitHub Secret.');
  process.exit(1);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- load data lists ---------- */
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

const songs   = readJSON('./data/songs.json', []);
const albums  = readJSON('./data/albums.json', []);
const movies  = readJSON('./data/movies.json', []);
const games   = readJSON('./data/games.json', []);
const tvShows = readJSON('./data/tv-shows.json', []);

/* ---------- THE FIX: load existing cache, don't clobber it ---------- */
const cache = readJSON(CACHE_FILE, null) || {};
cache.songs  = cache.songs  || {};
cache.albums = cache.albums || {};
cache.movies = cache.movies || {};
cache.games  = cache.games  || {};
cache.tv     = cache.tv     || {};

let searchesUsed = 0;
let quotaHit = false;

/* ---------- one YouTube search ---------- */
async function searchYouTube(query) {
  const url = 'https://www.googleapis.com/youtube/v3/search'
    + '?part=snippet&maxResults=1&type=video&safeSearch=strict'
    + '&q=' + encodeURIComponent(query)
    + '&key=' + YOUTUBE_API_KEY;

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    const msg = (data.error.message || '').toLowerCase();
    if (msg.includes('quota')) { quotaHit = true; throw new Error('quota'); }
    throw new Error(data.error.message);
  }
  const item = data.items && data.items[0];
  return item ? item.id.videoId : null;
}

/* ---------- process one category ---------- */
async function processCategory(label, bucket, items, keyFn, queryFn) {
  if (quotaHit) return;

  const pending = items.filter((it) => !bucket[keyFn(it)]);
  console.log(`\n${label}: ${Object.keys(bucket).length}/${items.length} cached · ${pending.length} still to fetch`);

  for (const item of pending) {
    if (quotaHit) break;
    if (searchesUsed >= MAX_SEARCHES) {
      console.log(`   ⏸  Hit safe limit of ${MAX_SEARCHES} searches for today — stopping cleanly.`);
      return;
    }

    const key = keyFn(item);
    try {
      const videoId = await searchYouTube(queryFn(item));
      searchesUsed++;
      if (videoId) {
        bucket[key] = videoId;
        console.log(`   ✅ ${key} → ${videoId}  (${searchesUsed}/${MAX_SEARCHES})`);
      } else {
        console.log(`   ⚠️  no result: ${key}`);
      }
      await delay(200); // be polite: ~5 req/sec
    } catch (err) {
      if (err.message === 'quota') {
        console.log('   🛑 YouTube quota exhausted — saving progress and stopping.');
        return;
      }
      console.log(`   ❌ ${key}: ${err.message}`);
    }
  }
}

/* ---------- main ---------- */
async function run() {
  console.log(`🎬 Resumable YouTube cache builder · budget ${MAX_SEARCHES} searches`);

  // Order matters: finish songs first, then work down the list.
  await processCategory('🎵 SONGS',  cache.songs,  songs,
    (s) => `${s.artist}-${s.song}`,
    (s) => `${s.artist} ${s.song} official audio`);

  await processCategory('💿 ALBUMS', cache.albums, albums,
    (a) => `${a.artist}-${a.album}`,
    (a) => `${a.artist} ${a.album} full album`);

  await processCategory('🎬 MOVIES', cache.movies, movies,
    (m) => m.title,
    (m) => `${m.title} official trailer`);

  await processCategory('🎮 GAMES',  cache.games,  games,
    (g) => g.title,
    (g) => `${g.title} official trailer`);

  await processCategory('📺 TV',     cache.tv,     tvShows,
    (t) => t.title,
    (t) => `${t.title} official trailer`);

  /* ---------- write merged cache ---------- */
  cache.generated = new Date().toISOString();
  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

  const pct = (b, t) => t ? Math.round(Object.keys(b).length / t * 100) : 0;
  console.log('\n📊 CACHE STATUS');
  console.log(`   Songs:  ${Object.keys(cache.songs).length}/${songs.length}   (${pct(cache.songs, songs.length)}%)`);
  console.log(`   Albums: ${Object.keys(cache.albums).length}/${albums.length}  (${pct(cache.albums, albums.length)}%)`);
  console.log(`   Movies: ${Object.keys(cache.movies).length}/${movies.length}  (${pct(cache.movies, movies.length)}%)`);
  console.log(`   Games:  ${Object.keys(cache.games).length}/${games.length}   (${pct(cache.games, games.length)}%)`);
  console.log(`   TV:     ${Object.keys(cache.tv).length}/${tvShows.length}    (${pct(cache.tv, tvShows.length)}%)`);
  console.log(`\n🔎 Searches used this run: ${searchesUsed}`);

  const remaining =
    (songs.length   - Object.keys(cache.songs).length)  +
    (albums.length  - Object.keys(cache.albums).length) +
    (movies.length  - Object.keys(cache.movies).length) +
    (games.length   - Object.keys(cache.games).length)  +
    (tvShows.length - Object.keys(cache.tv).length);

  if (remaining > 0) {
    console.log(`⏳ ${remaining} items left → about ${Math.ceil(remaining / MAX_SEARCHES)} more daily run(s).`);
  } else {
    console.log('🎉 Cache complete — every item has a video ID.');
  }
}

run().catch((e) => { console.error('Fatal:', e); process.exit(1); });

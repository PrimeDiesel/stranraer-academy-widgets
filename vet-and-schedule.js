/**
 * vet-and-schedule.js
 *
 * ONE nightly job that makes the daily-picks data school-safe and correctly dated.
 *
 *   1. VETS every title against objective content signals:
 *        movies/tv  -> certificate (TMDB UK cert if key given, else OMDb US rating)
 *        songs/albums -> iTunes explicit flag + profanity check on the title
 *      Anything over the cap, flagged explicit, or of UNKNOWN rating is rejected.
 *      Unknown = rejected. That is deliberate: safest default for a school.
 *
 *   2. ENRICHES the survivors (poster / cover art / plot / year) into *-cache.json
 *      so the widgets and the planner NEVER call a third-party API.
 *
 *   3. SCHEDULES them across the year into *-schedule.json, pinning seasonal
 *      titles to their proper window (no more Elf in May) and spreading the
 *      rest deterministically so nothing repeats near itself.
 *
 *   4. Writes today.json — the fully-resolved picks for today, ~5KB.
 *
 *   5. Prints a REPORT: what was rejected and why, and how many more titles
 *      you need to reach 365 in each category.
 *
 * RESUMABLE: already-vetted entries are skipped, so re-runs are cheap.
 *
 * ENV:
 *   OMDB_API_KEY   (required for movies/tv)
 *   TMDB_API_KEY   (optional but recommended - gives real UK BBFC certificates)
 */

const fs = require('fs');

const OMDB = process.env.OMDB_API_KEY;
const TMDB = process.env.TMDB_API_KEY || null;
const DATA = './data';

/* ---------------- policy ---------------- */

// Cap = 12A. Unknown ratings are rejected on purpose.
const ALLOWED_UK = ['U', 'PG', '12A', '12'];
const ALLOWED_US = ['G', 'PG', 'PG-13', 'TV-G', 'TV-PG', 'TV-Y', 'TV-Y7', 'Approved', 'Passed'];

// Blunt second net for song/album titles. The iTunes explicit flag does the heavy lifting.
// Blunt second net for song/album titles. iTunes' explicit flag does the heavy
// lifting; this only catches slurs/swearing in a TITLE. Whole-word matches only.
const PROFANITY = [
  'fuck', 'fucking', 'shit', 'bitch', 'cunt', 'nigga', 'nigger',
  'motherfucker', 'wanker', 'twat', 'slut', 'whore',
];

// Seasonal windows: day-of-year ranges (0-based, non-leap reference).
const SEASONS = {
  christmas: { from: 334, to: 358, match: /christmas|santa|elf\b|grinch|nightmare before|scrooge|holiday inn|miracle on/i },
  halloween: { from: 288, to: 303, match: /halloween|hocus pocus|ghostbusters|addams family|coraline|casper/i },
  easter:    { from: 84,  to: 105, match: /easter|hop\b|rise of the guardians/i },
  summer:    { from: 166, to: 227, match: /summer|beach|holiday|vacation/i },
};

/* ---------------- helpers ---------------- */

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, obj) {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}
function hasProfanity(text) {
  const t = (text || '').toLowerCase();
  // Whole words only — otherwise "Hancock" matches, "Scunthorpe" matches, etc.
  return PROFANITY.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(t));
}
function seasonOf(title) {
  for (const [name, s] of Object.entries(SEASONS)) {
    if (s.match.test(title)) return name;
  }
  return null;
}

/* ---------------- rating lookups ---------------- */

// TMDB gives real UK certificates. Preferred when a key is present.
async function ukCertFromTMDB(title) {
  const find = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB}&query=${encodeURIComponent(title)}`)
    .then((r) => r.json()).catch(() => null);
  const hit = find && find.results && find.results[0];
  if (!hit) return null;

  const rel = await fetch(`https://api.themoviedb.org/3/movie/${hit.id}/release_dates?api_key=${TMDB}`)
    .then((r) => r.json()).catch(() => null);
  const gb = rel && rel.results && rel.results.find((r) => r.iso_3166_1 === 'GB');
  const cert = gb && gb.release_dates.map((d) => d.certification).find(Boolean);

  return {
    cert: cert || null,
    year: (hit.release_date || '').slice(0, 4),
    plot: hit.overview || '',
    poster: hit.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : null,
  };
}

async function fromOMDb(title) {
  const d = await fetch(`https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB}`)
    .then((r) => r.json()).catch(() => null);
  if (!d || d.Response === 'False') return null;
  return {
    rated: d.Rated && d.Rated !== 'N/A' ? d.Rated : null,
    year: d.Year || '',
    plot: d.Plot && d.Plot !== 'N/A' ? d.Plot : '',
    poster: d.Poster && d.Poster !== 'N/A' ? d.Poster : null,
    genre: d.Genre || '',
  };
}

// iTunes: free, no key. Gives explicit flag + artwork.
// Rate limit is roughly 20 calls/minute — go slowly and retry, or it silently
// returns nothing and every clean track looks "unknown".
const ITUNES_DELAY = Number(process.env.ITUNES_DELAY || 3000);

function norm(x) { return (x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

/**
 * Ask iTunes for up to 10 matches. A single "clean radio edit" result is NOT
 * proof a track is clean — the original may be explicit and that's what will
 * play on YouTube. So: if ANY matching version is flagged explicit, we treat
 * the track as explicit and reject it.
 */
async function fromITunes(artist, title, entity) {
  const term = `${artist} ${title}`;
  const url = `https://itunes.apple.com/search?entity=${entity}&limit=10&country=GB&term=${encodeURIComponent(term)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 403 || res.status === 429) { await delay(ITUNES_DELAY * attempt * 2); continue; }

      const d = await res.json();
      if (!d || !Array.isArray(d.results)) { await delay(ITUNES_DELAY); continue; }
      if (d.results.length === 0) return { answered: true, found: false };

      const wantA = norm(artist), wantT = norm(title);
      const matches = d.results.filter((r) => {
        const a = norm(r.artistName), t = norm(r.trackName || r.collectionName);
        return (a.includes(wantA) || wantA.includes(a)) && (t.includes(wantT) || wantT.includes(t));
      });
      const pool = matches.length ? matches : [d.results[0]];

      const flags = pool.map((r) => r.trackExplicitness || r.collectionExplicitness).filter(Boolean);
      if (!flags.length) return { answered: true, found: true, known: false };

      // iTunes has THREE states. 'cleaned' means this is a censored edit of a track
      // whose original is explicit — that original is what plays on YouTube.
      // So 'cleaned' is a rejection signal, not a pass.
      const anyExplicit = flags.includes('explicit') || flags.includes('cleaned');
      const clean = pool.find((r) => (r.trackExplicitness || r.collectionExplicitness) === 'notExplicit') || pool[0];

      return {
        answered: true, found: true, known: true,
        explicit: anyExplicit,
        artwork: clean.artworkUrl100 ? clean.artworkUrl100.replace('100x100', '600x600') : null,
        year: (clean.releaseDate || '').slice(0, 4),
      };
    } catch { await delay(ITUNES_DELAY * attempt); }
  }
  return { answered: false };
}

/* ---------------- vetting ---------------- */

const rejected = [];

async function vetMovies(list, cacheFile) {
  const cache = readJSON(cacheFile, {});
  let checked = 0;

  for (const item of list) {
    const title = item.title;
    if (cache[title]) continue;

    let info = null, cert = null, source = '';

    if (TMDB) {
      info = await ukCertFromTMDB(title);
      if (info) { cert = info.cert; source = 'tmdb-uk'; }
      await delay(120);
    }
    if (!cert) {
      const o = await fromOMDb(title);
      if (o) {
        cert = o.rated; source = 'omdb-us';
        info = { ...(info || {}), year: o.year, plot: o.plot, poster: info?.poster || o.poster, genre: o.genre };
      }
      await delay(120);
    }

    checked++;

    const ok = cert && (ALLOWED_UK.includes(cert) || ALLOWED_US.includes(cert));
    if (!ok) {
      rejected.push({ category: 'movie', title, reason: cert ? `rated ${cert}` : 'no rating found' });
      cache[title] = { safe: false, cert: cert || 'unknown' };
      continue;
    }

    cache[title] = {
      safe: true,
      cert, source,
      year: info?.year || '',
      plot: info?.plot || '',
      poster: info?.poster || null,
      genre: info?.genre || '',
      season: seasonOf(title),
    };
    console.log(`  ✅ ${title} — ${cert}`);
  }

  writeJSON(cacheFile, cache);
  console.log(`  checked ${checked} new movie(s)`);
  return cache;
}

async function vetTracks(list, cacheFile, kind) {
  const cache = readJSON(cacheFile, {});
  let pending = 0, cleared = 0;

  for (const item of list) {
    const title = kind === 'song' ? item.song : item.album;
    const key = `${item.artist}-${title}`;
    if (cache[key] && cache[key].v === 3) continue;  // already vetted by THIS version of the rules

    if (hasProfanity(title) || hasProfanity(item.artist)) {
      rejected.push({ category: kind, title: key, reason: 'profanity in title' });
      cache[key] = { safe: false, reason: 'profanity', v: 3 };
      continue;
    }

    const it = await fromITunes(item.artist, title, kind === 'song' ? 'song' : 'album');
    await delay(ITUNES_DELAY);

    // No straight answer, or matched nothing: DON'T cache. A later run retries it.
    if (!it.answered || it.found === false || it.known === false) {
      pending++;
      continue;
    }

    if (it.explicit) {
      rejected.push({ category: kind, title: key, reason: 'explicit original exists' });
      cache[key] = { safe: false, reason: 'explicit', v: 3 };
      continue;
    }

    cache[key] = { safe: true, artwork: it.artwork, year: it.year || item.year || '', v: 3 };
    cleared++;
    console.log(`  ✅ ${key}`);
  }

  writeJSON(cacheFile, cache);
  console.log(`  cleared ${cleared} · ${pending} still awaiting a reply from iTunes (will retry next run)`);
  return cache;
}

/* ---------------- scheduling ---------------- */

/** Deterministic shuffle so the year's order is stable but not alphabetical. */
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a 365-day schedule.
 * Seasonal titles are placed inside their window first; everything else
 * fills the remaining days in a stable shuffled order.
 */
function buildSchedule(safeTitles, cache, year) {
  const schedule = new Array(365).fill(null);

  const seasonal = safeTitles.filter((t) => cache[t]?.season);
  const general  = safeTitles.filter((t) => !cache[t]?.season);

  // 1) place seasonal titles inside their window
  for (const title of seasonal) {
    const s = SEASONS[cache[title].season];
    for (let d = s.from; d <= s.to; d++) {
      if (!schedule[d]) { schedule[d] = title; break; }
    }
  }

  // 2) fill the rest
  const pool = seededShuffle(general, year);
  let p = 0;
  for (let d = 0; d < 365; d++) {
    if (schedule[d]) continue;
    if (!pool.length) break;
    schedule[d] = pool[p % pool.length];
    p++;
  }

  return schedule;
}

function dayOfYear(d = new Date()) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) - 1;
}

/* ---------------- main ---------------- */

async function run() {
  if (!OMDB) { console.error('❌ OMDB_API_KEY not set.'); process.exit(1); }
  console.log(`🎯 Vetting with a 12A cap. UK certs via ${TMDB ? 'TMDB' : 'OMDb (US ratings, approximate)'}.\n`);

  const movies = readJSON(`${DATA}/movies.json`, []);
  const songs  = readJSON(`${DATA}/songs.json`, []);
  const albums = readJSON(`${DATA}/albums.json`, []);

  console.log('🎬 MOVIES');
  const movieCache = await vetMovies(movies, `${DATA}/movie-cache.json`);

  console.log('\n🎵 SONGS');
  const songCache = await vetTracks(songs, `${DATA}/song-cache.json`, 'song');

  console.log('\n💿 ALBUMS');
  const albumCache = await vetTracks(albums, `${DATA}/album-cache.json`, 'album');

  /* ---- schedules ---- */
  const year = new Date().getFullYear();

  const safeMovies = movies.map((m) => m.title).filter((t) => movieCache[t]?.safe);
  const safeSongs  = songs.map((s) => `${s.artist}-${s.song}`).filter((k) => songCache[k]?.safe);
  const safeAlbums = albums.map((a) => `${a.artist}-${a.album}`).filter((k) => albumCache[k]?.safe);

  writeJSON(`${DATA}/movie-schedule.json`, buildSchedule(safeMovies, movieCache, year));
  writeJSON(`${DATA}/song-schedule.json`,  buildSchedule(safeSongs,  songCache,  year + 1));
  writeJSON(`${DATA}/album-schedule.json`, buildSchedule(safeAlbums, albumCache, year + 2));

  /* ---- today.json ---- */
  const d = dayOfYear();
  const todayMovie = readJSON(`${DATA}/movie-schedule.json`, [])[d];
  const todaySong  = readJSON(`${DATA}/song-schedule.json`, [])[d];
  const todayAlbum = readJSON(`${DATA}/album-schedule.json`, [])[d];

  writeJSON(`${DATA}/today.json`, {
    generated: new Date().toISOString(),
    day: d,
    movie: todayMovie ? { title: todayMovie, ...movieCache[todayMovie] } : null,
    song:  todaySong  ? { key: todaySong,  ...songCache[todaySong] }   : null,
    album: todayAlbum ? { key: todayAlbum, ...albumCache[todayAlbum] } : null,
  });

  /* ---- report ---- */
  console.log('\n══════════ REPORT ══════════');
  console.log(`Safe movies: ${safeMovies.length}/${movies.length}  → need ${Math.max(0, 365 - safeMovies.length)} more for a full year`);
  console.log(`Safe songs:  ${safeSongs.length}/${songs.length}   → need ${Math.max(0, 365 - safeSongs.length)} more`);
  console.log(`Safe albums: ${safeAlbums.length}/${albums.length}  → need ${Math.max(0, 365 - safeAlbums.length)} more`);

  if (rejected.length) {
    console.log(`\n🚫 Rejected ${rejected.length} item(s):`);
    for (const r of rejected.slice(0, 60)) console.log(`   [${r.category}] ${r.title} — ${r.reason}`);
    if (rejected.length > 60) console.log(`   …and ${rejected.length - 60} more`);
    writeJSON(`${DATA}/rejected-report.json`, rejected);
    console.log('   full list → data/rejected-report.json');
  }

  console.log('\n✅ Wrote *-cache.json, *-schedule.json and today.json');
}

run().catch((e) => { console.error('Fatal:', e); process.exit(1); });

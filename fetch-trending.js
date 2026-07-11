#!/usr/bin/env node
/*
  fetch-trending.js — snapshots everything the Trending push-screen needs into
  ONE static file: data/trending-cache.json. Runs hourly via GitHub Action so
  pupils never hit a third-party API (and the sleeping Render free tier only
  gets woken by us, not by every visit).

  Sources:
    news / education / tech  -> news-api-2cfx.onrender.com/{news,education,tech}
    sports                   -> sports-news-api-qwsg.onrender.com/news
    music                    -> iTunes GB top-songs RSS, explicit-filtered + blocklist
    movies                   -> TMDB trending, capped at UK 12A-and-under

  Env: TMDB_API_KEY (optional but recommended for real UK BBFC certs).
  Node 18+ (uses global fetch). No other deps.
*/
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(process.cwd(), 'data', 'trending-cache.json');
const TMDB_KEY = process.env.TMDB_API_KEY || '';

const NEWS_BASE   = 'https://news-api-2cfx.onrender.com';
const SPORTS_BASE = 'https://sports-news-api-qwsg.onrender.com';

const MUSIC_LIMIT  = 22;   // clean tracks to keep
const MOVIE_LIMIT  = 20;   // 12A-and-under films to keep
const ARTICLE_LIMIT= 18;   // per news section

// certs we allow for a school audience (UK BBFC + a few TMDB fallbacks)
const CERT_OK = new Set(['U','PG','12A','12','G','TV-G','TV-PG','TV-Y','TV-Y7']);

// music we never surface regardless of what iTunes says
const MUSIC_BLOCKLIST = [
  'bts','tupac','2pac','drake'
];
// whole-word profanity backstop for titles/artists
const PROFANITY = ['fuck','shit','cunt','bitch','nigger','nigga','slut','whore','pussy','cock','wank'];

/* ---------------- helpers ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm  = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function hasProfanity(s){
  const t = ' ' + norm(s) + ' ';
  return PROFANITY.some(w => t.includes(' ' + w + ' '));
}
function isBlockedMusic(artist, title){
  const a = norm(artist), t = norm(title);
  return MUSIC_BLOCKLIST.some(b => a.includes(b)) || hasProfanity(artist) || hasProfanity(title);
}

// fetch JSON with a timeout + one retry (Render free tier cold-starts ~30s)
async function getJSON(url, { tries = 2, timeout = 45000 } = {}){
  for (let i = 0; i < tries; i++){
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'accept': 'application/json' } });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e){
      clearTimeout(timer);
      console.warn(`  fetch failed (${i + 1}/${tries}) ${url} -> ${e.message}`);
      if (i < tries - 1) await sleep(4000);
    }
  }
  return null;
}

/* ---------------- news-style feeds ---------------- */
function mapArticles(payload){
  // Render proxies return NewsAPI-shaped data: {articles:[...]} or a bare array
  const arr = Array.isArray(payload) ? payload
            : (payload && Array.isArray(payload.articles)) ? payload.articles
            : [];
  return arr.map(a => ({
    title:     a.title || a.headline || '',
    source:    (a.source && (a.source.name || a.source)) || a.sourceName || a.author || '',
    url:       a.url || a.link || '',
    image:     a.urlToImage || a.image || a.imageUrl || '',
    published: a.publishedAt || a.published || a.date || '',
    desc:      a.description || a.summary || ''
  })).filter(a => a.title && a.url).slice(0, ARTICLE_LIMIT);
}

async function fetchSection(url){
  const j = await getJSON(url);
  if (!j) return [];
  const list = mapArticles(j);
  console.log(`  ${url} -> ${list.length} articles`);
  return list;
}

/* ---------------- iTunes trending music ---------------- */
async function fetchMusic(){
  const rss = await getJSON('https://itunes.apple.com/gb/rss/topsongs/limit=60/json');
  const entries = (rss && rss.feed && Array.isArray(rss.feed.entry)) ? rss.feed.entry : [];
  console.log(`  iTunes RSS -> ${entries.length} chart entries`);
  const out = [];
  let rank = 0;
  for (const e of entries){
    if (out.length >= MUSIC_LIMIT) break;
    rank++;
    const title  = e['im:name'] && e['im:name'].label;
    const artist = e['im:artist'] && e['im:artist'].label;
    const trackId= e.id && e.id.attributes && e.id.attributes['im:id'];
    if (!title || !artist || !trackId) continue;
    if (isBlockedMusic(artist, title)) { console.log(`    blocked: ${artist} - ${title}`); continue; }

    // lookup for a definitive explicitness verdict + preview + artwork
    await sleep(500); // be polite to iTunes
    const look = await getJSON('https://itunes.apple.com/lookup?country=GB&id=' + trackId);
    const res  = look && look.results && look.results[0];
    const flag = res && res.trackExplicitness;           // 'explicit' | 'cleaned' | 'notExplicit'
    if (flag === 'explicit' || flag === 'cleaned') { console.log(`    explicit: ${artist} - ${title}`); continue; }

    const art100 = res && res.artworkUrl100;
    const bigArt = art100 ? art100.replace('100x100bb', '300x300bb') : '';
    out.push({
      rank: out.length + 1,
      title, artist,
      artwork:    bigArt,
      previewUrl: (res && res.previewUrl) || '',
      appleUrl:   (res && res.trackViewUrl) || '',
      searchUrl:  'https://www.youtube.com/results?search_query=' + encodeURIComponent(artist + ' ' + title)
    });
  }
  console.log(`  music kept: ${out.length}`);
  return out;
}

/* ---------------- TMDB trending films (12A cap) ---------------- */
async function tmdbCertGB(id){
  const j = await getJSON(`https://api.themoviedb.org/3/movie/${id}/release_dates?api_key=${TMDB_KEY}`);
  const results = j && j.results;
  if (!Array.isArray(results)) return null;
  const gb = results.find(r => r.iso_3166_1 === 'GB');
  if (!gb || !Array.isArray(gb.release_dates)) return null;
  for (const rd of gb.release_dates){
    if (rd.certification) return rd.certification.toUpperCase();
  }
  return null;
}

async function fetchMovies(){
  if (!TMDB_KEY){ console.warn('  TMDB_API_KEY not set -> skipping movies'); return []; }
  const trend = await getJSON(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_KEY}&region=GB`);
  const list = (trend && Array.isArray(trend.results)) ? trend.results : [];
  console.log(`  TMDB trending -> ${list.length} films`);
  const out = [];
  for (const m of list){
    if (out.length >= MOVIE_LIMIT) break;
    const cert = await tmdbCertGB(m.id);
    if (!cert || !CERT_OK.has(cert)) { console.log(`    reject (${cert || 'no cert'}): ${m.title}`); continue; }
    out.push({
      rank: out.length + 1,
      title: m.title,
      year:  (m.release_date || '').slice(0, 4),
      cert,
      poster: m.poster_path ? ('https://image.tmdb.org/t/p/w342' + m.poster_path) : '',
      overview: m.overview || '',
      url: 'https://www.themoviedb.org/movie/' + m.id
    });
    await sleep(120);
  }
  console.log(`  movies kept: ${out.length}`);
  return out;
}

/* ---------------- main ---------------- */
(async () => {
  console.log('Building trending-cache.json …');
  const [news, education, tech, sports, music, movies] = await Promise.all([
    fetchSection(NEWS_BASE   + '/news'),
    fetchSection(NEWS_BASE   + '/education'),
    fetchSection(NEWS_BASE   + '/tech'),
    fetchSection(SPORTS_BASE + '/news'),
    fetchMusic(),
    fetchMovies()
  ]);

  const cache = { updated: new Date().toISOString(), news, sports, tech, education, music, movies };

  // don't clobber a good cache with a totally empty pull (e.g. every feed asleep)
  const total = news.length + sports.length + tech.length + education.length + music.length + movies.length;
  if (total === 0 && fs.existsSync(OUT)){
    console.warn('Everything came back empty — keeping the existing cache, not overwriting.');
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(cache, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log(`  news ${news.length} · sports ${sports.length} · tech ${tech.length} · education ${education.length} · music ${music.length} · movies ${movies.length}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

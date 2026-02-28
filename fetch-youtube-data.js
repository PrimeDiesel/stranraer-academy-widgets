const fs = require('fs');
const https = require('https');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

if (!YOUTUBE_API_KEY) {
  console.error('❌ ERROR: YOUTUBE_API_KEY environment variable not set!');
  process.exit(1);
}

// Load your JSON data files
const songs = require('./songs.json');
const albums = require('./albums.json');
const movies = require('./movies.json');
const games = require('./games.json');
const tvShows = require('./tv-shows.json');

async function searchYouTube(query) {
  return new Promise((resolve, reject) => {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
            return;
          }
          if (parsed.items && parsed.items.length > 0) {
            resolve(parsed.items[0].id.videoId);
          } else {
            resolve(null);
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllVideos() {
  const cache = {
    generated: new Date().toISOString(),
    songs: {},
    albums: {},
    movies: {},
    games: {},
    tv: {}
  };
  
  console.log('\n🎵 FETCHING SONGS (' + songs.length + ' total)...');
  let count = 0;
  let successCount = 0;
  
  for (const song of songs) {
    const key = `${song.artist}-${song.song}`;
    const query = `${song.artist} ${song.song} official audio`;
    
    try {
      const videoId = await searchYouTube(query);
      if (videoId) {
        cache.songs[key] = videoId;
        successCount++;
        console.log(`✅ ${++count}/${songs.length}: ${key.substring(0, 60)}...`);
      } else {
        console.log(`⚠️  ${++count}/${songs.length}: ${key.substring(0, 60)}... - NOT FOUND`);
      }
      await delay(200); // Rate limit: 5 requests/second
    } catch (error) {
      console.log(`❌ ${++count}/${songs.length}: ${key.substring(0, 60)}... - ERROR: ${error.message}`);
      if (error.message.includes('quota')) {
        console.log('\n⚠️  QUOTA EXCEEDED! Stopping...');
        break;
      }
    }
  }
  
  console.log(`\n✅ Songs complete: ${successCount}/${songs.length} found`);
  
  console.log('\n💿 FETCHING ALBUMS (' + albums.length + ' total)...');
  count = 0;
  successCount = 0;
  
  for (const album of albums) {
    const key = `${album.artist}-${album.album}`;
    const query = `${album.artist} ${album.album} full album`;
    
    try {
      const videoId = await searchYouTube(query);
      if (videoId) {
        cache.albums[key] = videoId;
        successCount++;
        console.log(`✅ ${++count}/${albums.length}: ${key.substring(0, 60)}...`);
      } else {
        console.log(`⚠️  ${++count}/${albums.length}: ${key.substring(0, 60)}... - NOT FOUND`);
      }
      await delay(200);
    } catch (error) {
      console.log(`❌ ${++count}/${albums.length}: ${key.substring(0, 60)}... - ERROR: ${error.message}`);
      if (error.message.includes('quota')) {
        console.log('\n⚠️  QUOTA EXCEEDED! Stopping...');
        break;
      }
    }
  }
  
  console.log(`\n✅ Albums complete: ${successCount}/${albums.length} found`);
  
  console.log('\n🎬 FETCHING MOVIES (' + movies.length + ' total)...');
  count = 0;
  successCount = 0;
  
  for (const movie of movies) {
    const key = movie.title;
    const query = `${movie.title} official trailer`;
    
    try {
      const videoId = await searchYouTube(query);
      if (videoId) {
        cache.movies[key] = videoId;
        successCount++;
        console.log(`✅ ${++count}/${movies.length}: ${key.substring(0, 60)}...`);
      } else {
        console.log(`⚠️  ${++count}/${movies.length}: ${key.substring(0, 60)}... - NOT FOUND`);
      }
      await delay(200);
    } catch (error) {
      console.log(`❌ ${++count}/${movies.length}: ${key.substring(0, 60)}... - ERROR: ${error.message}`);
      if (error.message.includes('quota')) {
        console.log('\n⚠️  QUOTA EXCEEDED! Stopping...');
        break;
      }
    }
  }
  
  console.log(`\n✅ Movies complete: ${successCount}/${movies.length} found`);
  
  console.log('\n🎮 FETCHING GAMES (' + games.length + ' total)...');
  count = 0;
  successCount = 0;
  
  for (const game of games) {
    const key = game.title;
    const query = `${game.title} ${game.platform || ''} gameplay trailer`.trim();
    
    try {
      const videoId = await searchYouTube(query);
      if (videoId) {
        cache.games[key] = videoId;
        successCount++;
        console.log(`✅ ${++count}/${games.length}: ${key.substring(0, 60)}...`);
      } else {
        console.log(`⚠️  ${++count}/${games.length}: ${key.substring(0, 60)}... - NOT FOUND`);
      }
      await delay(200);
    } catch (error) {
      console.log(`❌ ${++count}/${games.length}: ${key.substring(0, 60)}... - ERROR: ${error.message}`);
      if (error.message.includes('quota')) {
        console.log('\n⚠️  QUOTA EXCEEDED! Stopping...');
        break;
      }
    }
  }
  
  console.log(`\n✅ Games complete: ${successCount}/${games.length} found`);
  
  console.log('\n📺 FETCHING TV SHOWS (' + tvShows.length + ' total)...');
  count = 0;
  successCount = 0;
  
  for (const show of tvShows) {
    const key = show.title;
    const query = `${show.title} tv show intro theme`;
    
    try {
      const videoId = await searchYouTube(query);
      if (videoId) {
        cache.tv[key] = videoId;
        successCount++;
        console.log(`✅ ${++count}/${tvShows.length}: ${key.substring(0, 60)}...`);
      } else {
        console.log(`⚠️  ${++count}/${tvShows.length}: ${key.substring(0, 60)}... - NOT FOUND`);
      }
      await delay(200);
    } catch (error) {
      console.log(`❌ ${++count}/${tvShows.length}: ${key.substring(0, 60)}... - ERROR: ${error.message}`);
      if (error.message.includes('quota')) {
        console.log('\n⚠️  QUOTA EXCEEDED! Stopping...');
        break;
      }
    }
  }
  
  console.log(`\n✅ TV Shows complete: ${successCount}/${tvShows.length} found`);
  
  // Save cache
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }
  
  fs.writeFileSync('./data/youtube-cache.json', JSON.stringify(cache, null, 2));
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ CACHE GENERATION COMPLETE!');
  console.log('='.repeat(70));
  console.log(`📊 FINAL STATS:`);
  console.log(`   Songs:    ${Object.keys(cache.songs).length}/${songs.length} (${Math.round(Object.keys(cache.songs).length/songs.length*100)}%)`);
  console.log(`   Albums:   ${Object.keys(cache.albums).length}/${albums.length} (${Math.round(Object.keys(cache.albums).length/albums.length*100)}%)`);
  console.log(`   Movies:   ${Object.keys(cache.movies).length}/${movies.length} (${Math.round(Object.keys(cache.movies).length/movies.length*100)}%)`);
  console.log(`   Games:    ${Object.keys(cache.games).length}/${games.length} (${Math.round(Object.keys(cache.games).length/games.length*100)}%)`);
  console.log(`   TV Shows: ${Object.keys(cache.tv).length}/${tvShows.length} (${Math.round(Object.keys(cache.tv).length/tvShows.length*100)}%)`);
  console.log(`\n💾 Cache saved to: ./data/youtube-cache.json`);
  console.log(`📅 Generated: ${cache.generated}`);
  console.log('='.repeat(70) + '\n');
}

// Run the script
fetchAllVideos().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});

const fs = require('fs');
const https = require('https');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

async function searchYouTube(query) {
  return new Promise((resolve, reject) => {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.items && parsed.items.length > 0) {
            const item = parsed.items[0];
            const thumbnail = item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url;
            resolve({ videoId: parsed.items[0].id.videoId, thumbnail });
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
    test: { videoId: 'dQw4w9WgXcQ', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }
  };
  
  console.log('✅ Test cache created');
  
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }
  
  fs.writeFileSync('./data/youtube-cache.json', JSON.stringify(cache, null, 2));
  console.log('✅ Cache written to data/youtube-cache.json');
}

fetchAllVideos().catch(console.error);

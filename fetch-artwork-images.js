const fs = require('fs');

// Load artworks and cache
const artworks = JSON.parse(fs.readFileSync('./data/365-artworks-uk.json', 'utf8'));
let cache = { lastUpdated: new Date().toISOString(), stats: {}, artworks: {} };

// Try to load existing cache
try {
  cache = JSON.parse(fs.readFileSync('./data/artwork-cache.json', 'utf8'));
} catch (error) {
  console.log('No existing cache found, starting fresh');
}

console.log('🎨 Fetching artwork images from Met Museum & Art Institute APIs...');
console.log(`📊 Total artworks to process: ${artworks.length}`);

async function searchMetMuseum(artist, title) {
  try {
    const searchQuery = encodeURIComponent(`${artist} ${title}`);
    const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${searchQuery}`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (searchData.objectIDs && searchData.objectIDs.length > 0) {
      const objectId = searchData.objectIDs[0];
      const detailUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`;
      
      const detailResponse = await fetch(detailUrl);
      const detailData = await detailResponse.json();
      
      if (detailData.primaryImage) {
        return { url: detailData.primaryImage, source: 'met' };
      }
    }
    return null;
  } catch (error) {
    console.error(`  ❌ Met Museum error: ${error.message}`);
    return null;
  }
}

async function searchArtInstitute(artist, title) {
  try {
    const searchQuery = encodeURIComponent(`${artist} ${title}`);
    const searchUrl = `https://api.artic.edu/api/v1/artworks/search?q=${searchQuery}&limit=1&fields=id,title,image_id`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.data && data.data.length > 0 && data.data[0].image_id) {
      const imageId = data.data[0].image_id;
      const imageUrl = `https://www.artic.edu/iiif/2/${imageId}/full/843,/0/default.jpg`;
      return { url: imageUrl, source: 'aic' };
    }
    return null;
  } catch (error) {
    console.error(`  ❌ AIC error: ${error.message}`);
    return null;
  }
}

async function fetchAllImages() {
  let successCount = 0;
  let failCount = 0;
  let alreadyCachedCount = 0;
  
  for (let i = 0; i < artworks.length; i++) {
    const artwork = artworks[i];
    const key = `${artwork.artist}-${artwork.title}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // Skip if already cached
    if (cache.artworks[key] && cache.artworks[key].imageUrl) {
      alreadyCachedCount++;
      if (i % 50 === 0) {
        console.log(`📦 Progress: ${i}/${artworks.length} (${alreadyCachedCount} cached, ${successCount} new, ${failCount} failed)`);
      }
      continue;
    }
    
    console.log(`🔍 [${i + 1}/${artworks.length}] Searching: ${artwork.title} by ${artwork.artist}`);
    
    // Try Met Museum first
    let result = await searchMetMuseum(artwork.artist, artwork.title);
    
    // Try Art Institute if Met fails
    if (!result) {
      result = await searchArtInstitute(artwork.artist, artwork.title);
    }
    
    if (result) {
      cache.artworks[key] = {
        day: i,
        title: artwork.title,
        artist: artwork.artist,
        imageUrl: result.url,
        source: result.source
      };
      successCount++;
      console.log(`  ✅ Found image from ${result.source.toUpperCase()}`);
    } else {
      cache.artworks[key] = {
        day: i,
        title: artwork.title,
        artist: artwork.artist,
        imageUrl: null,
        source: null
      };
      failCount++;
      console.log(`  ❌ No image found`);
    }
    
    // Rate limiting - wait 150ms between requests to be nice to APIs
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  
  const totalWithImages = Object.values(cache.artworks).filter(a => a.imageUrl).length;
  
  cache.lastUpdated = new Date().toISOString();
  cache.stats = {
    total: artworks.length,
    withImages: totalWithImages,
    withoutImages: artworks.length - totalWithImages,
    percentage: Math.round((totalWithImages / artworks.length) * 100),
    newlyFetched: successCount,
    alreadyCached: alreadyCachedCount,
    failed: failCount
  };
  
  fs.writeFileSync('./data/artwork-cache.json', JSON.stringify(cache, null, 2));
  
  console.log('\n✅ COMPLETE!');
  console.log(`📊 Total artworks: ${artworks.length}`);
  console.log(`✅ With images: ${totalWithImages} (${cache.stats.percentage}%)`);
  console.log(`🆕 Newly fetched: ${successCount}`);
  console.log(`📦 Already cached: ${alreadyCachedCount}`);
  console.log(`❌ Without images: ${cache.stats.withoutImages}`);
  console.log(`\n💾 Cache saved to: data/artwork-cache.json`);
}

fetchAllImages();

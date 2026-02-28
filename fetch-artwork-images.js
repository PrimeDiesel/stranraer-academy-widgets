const fs = require('fs');

// Load artworks and cache
const artworks = JSON.parse(fs.readFileSync('./data/365-artworks-uk.json', 'utf8'));
let cache = { lastUpdated: new Date().toISOString(), stats: {}, artworks: {} };

// Try to load existing cache
try {
  cache = JSON.parse(fs.readFileSync('./data/artwork-cache.json', 'utf8'));
  console.log('📦 Loaded existing cache');
} catch (error) {
  console.log('🆕 No existing cache found, starting fresh');
}

console.log('🎨 Fetching artwork images - WIKIMEDIA FIRST!\n');
console.log(`📊 Total artworks to process: ${artworks.length}\n`);

// ═══════════════════════════════════════════════════════
// 1. WIKIMEDIA COMMONS (MOST RELIABLE!)
// ═══════════════════════════════════════════════════════
async function searchWikimedia(artist, title) {
  try {
    // Clean search terms
    const searchTerms = `${title} ${artist} painting`;
    const query = encodeURIComponent(searchTerms);
    
    // Search Wikimedia Commons
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${query}&srnamespace=6&srlimit=5&format=json&origin=*`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.query && data.query.search && data.query.search.length > 0) {
      // Try each result until we find an image
      for (const result of data.query.search) {
        const pageTitle = result.title;
        
        // Get image info
        const imageUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=imageinfo&iiprop=url&iiurlwidth=1280&format=json&origin=*`;
        
        const imageResponse = await fetch(imageUrl);
        const imageData = await imageResponse.json();
        
        const pages = imageData.query.pages;
        const pageId = Object.keys(pages)[0];
        
        if (pages[pageId].imageinfo && pages[pageId].imageinfo[0]) {
          const imageUrl = pages[pageId].imageinfo[0].thumburl || pages[pageId].imageinfo[0].url;
          
          // Make sure it's a secure URL and an actual image
          if (imageUrl && imageUrl.startsWith('http') && (imageUrl.includes('.jpg') || imageUrl.includes('.png'))) {
            return { url: imageUrl.replace('http:', 'https:'), source: 'wikimedia' };
          }
        }
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// 2. MET MUSEUM (BACKUP)
// ═══════════════════════════════════════════════════════
async function searchMetMuseum(artist, title) {
  try {
    const searchQuery = encodeURIComponent(`${artist} ${title}`);
    const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${searchQuery}`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (searchData.objectIDs && searchData.objectIDs.length > 0) {
      // Try first 3 results
      for (let i = 0; i < Math.min(3, searchData.objectIDs.length); i++) {
        const objectId = searchData.objectIDs[i];
        const detailUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`;
        
        const detailResponse = await fetch(detailUrl);
        const detailData = await detailResponse.json();
        
        if (detailData.primaryImage) {
          // Check if title roughly matches
          const titleMatch = detailData.title.toLowerCase().includes(title.toLowerCase().split(' ')[0]);
          if (titleMatch) {
            return { url: detailData.primaryImage.replace('http:', 'https:'), source: 'met' };
          }
        }
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// 3. ART INSTITUTE CHICAGO (LAST RESORT - OFTEN WRONG!)
// ═══════════════════════════════════════════════════════
async function searchArtInstitute(artist, title) {
  try {
    const searchQuery = encodeURIComponent(`${artist} ${title}`);
    const searchUrl = `https://api.artic.edu/api/v1/artworks/search?q=${searchQuery}&limit=3&fields=id,title,artist_display,image_id`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.data && data.data.length > 0) {
      // Try to find best match
      for (const artwork of data.data) {
        if (artwork.image_id) {
          // Check if title roughly matches
          const titleMatch = artwork.title.toLowerCase().includes(title.toLowerCase().split(' ')[0]);
          if (titleMatch) {
            const imageId = artwork.image_id;
            const imageUrl = `https://www.artic.edu/iiif/2/${imageId}/full/843,/0/default.jpg`;
            return { url: imageUrl, source: 'aic' };
          }
        }
      }
      
      // If no good match, use first result
      if (data.data[0].image_id) {
        const imageId = data.data[0].image_id;
        const imageUrl = `https://www.artic.edu/iiif/2/${imageId}/full/843,/0/default.jpg`;
        return { url: imageUrl, source: 'aic' };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// MAIN FETCH FUNCTION
// ═══════════════════════════════════════════════════════
async function fetchAllImages() {
  let wikimediaCount = 0;
  let metCount = 0;
  let aicCount = 0;
  let schoolCount = 0;
  let failCount = 0;
  let alreadyCachedCount = 0;
  let updatedCount = 0;
  
  for (let i = 0; i < artworks.length; i++) {
    const artwork = artworks[i];
    const key = `${artwork.artist}-${artwork.title}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // CRITICAL: Preserve school-hosted URLs AND Wikimedia (best sources - never overwrite!)
    if (cache.artworks[key] && cache.artworks[key].imageUrl) {
      const source = cache.artworks[key].source;
      
      // Never overwrite school-hosted or Wikimedia URLs
      if (source === 'school' || source === 'wikimedia') {
        alreadyCachedCount++;
        if (source === 'wikimedia') wikimediaCount++;
        if (source === 'school') schoolCount++;
        if (i % 50 === 0) {
          console.log(`📦 Progress: ${i}/${artworks.length} (${alreadyCachedCount} cached, ${updatedCount} updated)`);
        }
        continue;
      }
    }
    
    console.log(`🔍 [${i + 1}/${artworks.length}] ${artwork.title} by ${artwork.artist}`);
    
    let result = null;
    
    // PRIORITY 1: Wikimedia Commons (most reliable!)
    result = await searchWikimedia(artwork.artist, artwork.title);
    if (result) {
      wikimediaCount++;
      updatedCount++;
      console.log(`  ✅ Wikimedia Commons (best source!)`);
    }
    
    // PRIORITY 2: Met Museum (if Wikimedia fails)
    if (!result) {
      result = await searchMetMuseum(artwork.artist, artwork.title);
      if (result) {
        metCount++;
        updatedCount++;
        console.log(`  ✅ Met Museum`);
      }
    }
    
    // PRIORITY 3: Art Institute (last resort - often wrong)
    if (!result) {
      result = await searchArtInstitute(artwork.artist, artwork.title);
      if (result) {
        aicCount++;
        updatedCount++;
        console.log(`  ⚠️  Art Institute (may be inaccurate)`);
      }
    }
    
    if (result) {
      cache.artworks[key] = {
        day: i,
        title: artwork.title,
        artist: artwork.artist,
        imageUrl: result.url,
        source: result.source
      };
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
    
    // Rate limiting - be nice to APIs
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  const totalWithImages = Object.values(cache.artworks).filter(a => a.imageUrl).length;
  
  cache.lastUpdated = new Date().toISOString();
  cache.stats = {
    total: artworks.length,
    withImages: totalWithImages,
    withoutImages: artworks.length - totalWithImages,
    percentage: Math.round((totalWithImages / artworks.length) * 100),
    newlyFetched: updatedCount,
    alreadyCached: alreadyCachedCount,
    failed: failCount,
    sources: {
      wikimedia: wikimediaCount,
      met: metCount,
      aic: aicCount,
      school: schoolCount
    }
  };
  
  fs.writeFileSync('./data/artwork-cache.json', JSON.stringify(cache, null, 2));
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ COMPLETE!');
  console.log(`📊 Total artworks: ${artworks.length}`);
  console.log(`✅ With images: ${totalWithImages} (${cache.stats.percentage}%)`);
  console.log(`\n📦 IMAGE SOURCES (PRIORITY ORDER):`);
  console.log(`   🏫 School-hosted: ${schoolCount} (BEST - manually curated!)`);
  console.log(`   🥇 Wikimedia Commons: ${wikimediaCount} (GOOD - reliable!)`);
  console.log(`   🥈 Met Museum: ${metCount}`);
  console.log(`   🥉 Art Institute: ${aicCount} (WARNING - often wrong)`);
  console.log(`\n🔄 UPDATES:`);
  console.log(`   🆕 Newly fetched: ${updatedCount}`);
  console.log(`   📦 Already cached: ${alreadyCachedCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n💾 Cache saved to: data/artwork-cache.json');
  console.log('📱 All URLs are HTTPS and mobile-friendly!');
  console.log('🏫 School-hosted URLs PRESERVED!');
  console.log('🎨 Wikimedia prioritized for accuracy!');
}

fetchAllImages();

const fs = require('fs');

// Load books
const books = JSON.parse(fs.readFileSync('./data/books.json', 'utf8'));
let cache = { lastUpdated: new Date().toISOString(), stats: {}, books: {} };

// Try to load existing cache
try {
  cache = JSON.parse(fs.readFileSync('./data/book-covers-cache.json', 'utf8'));
  console.log('📦 Loaded existing cache');
} catch (error) {
  console.log('📦 Starting fresh cache');
}

console.log('📚 Fetching book covers from Google Books API...');
console.log(`📊 Total books: ${books.length}`);

async function fetchBookCover(book) {
  try {
    const query = encodeURIComponent(`${book.title} ${book.author}`);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`;
    
    const response = await fetch(url);
    
    if (response.status === 429) {
      console.log(`  ⚠️ Rate limit hit`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.items && data.items[0]?.volumeInfo?.imageLinks) {
      let coverUrl = data.items[0].volumeInfo.imageLinks.thumbnail;
      
      // Try to get larger image
      if (data.items[0].volumeInfo.imageLinks.large) {
        coverUrl = data.items[0].volumeInfo.imageLinks.large;
      } else if (data.items[0].volumeInfo.imageLinks.medium) {
        coverUrl = data.items[0].volumeInfo.imageLinks.medium;
      }
      
      // Ensure HTTPS
      coverUrl = coverUrl.replace('http:', 'https:');
      
      return coverUrl;
    }
    
    return null;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

async function fetchAllCovers() {
  let successCount = 0;
  let failCount = 0;
  let alreadyCachedCount = 0;
  
  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const key = `${book.title}-${book.author}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // Skip if already cached
    if (cache.books[key]?.coverUrl) {
      alreadyCachedCount++;
      if (i % 50 === 0) {
        console.log(`📦 Progress: ${i}/${books.length} (${alreadyCachedCount} cached, ${successCount} new, ${failCount} failed)`);
      }
      continue;
    }
    
    console.log(`🔍 [${i + 1}/${books.length}] Fetching: "${book.title}" by ${book.author}`);
    
    const coverUrl = await fetchBookCover(book);
    
    if (coverUrl) {
      cache.books[key] = {
        day: i,
        title: book.title,
        author: book.author,
        coverUrl: coverUrl
      };
      successCount++;
      console.log(`  ✅ Found cover`);
    } else {
      cache.books[key] = {
        day: i,
        title: book.title,
        author: book.author,
        coverUrl: null
      };
      failCount++;
      console.log(`  ❌ No cover found`);
    }
    
    // Rate limiting - wait 200ms between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  const totalWithCovers = Object.values(cache.books).filter(b => b.coverUrl).length;
  
  cache.lastUpdated = new Date().toISOString();
  cache.stats = {
    total: books.length,
    withCovers: totalWithCovers,
    withoutCovers: books.length - totalWithCovers,
    percentage: Math.round((totalWithCovers / books.length) * 100),
    newlyFetched: successCount,
    alreadyCached: alreadyCachedCount,
    failed: failCount
  };
  
  fs.writeFileSync('./data/book-covers-cache.json', JSON.stringify(cache, null, 2));
  
  console.log('\n✅ COMPLETE!');
  console.log(`📊 Total books: ${books.length}`);
  console.log(`✅ With covers: ${totalWithCovers} (${cache.stats.percentage}%)`);
  console.log(`🆕 Newly fetched: ${successCount}`);
  console.log(`📦 Already cached: ${alreadyCachedCount}`);
  console.log(`❌ Without covers: ${cache.stats.withoutCovers}`);
  console.log(`\n💾 Cache saved to: data/book-covers-cache.json`);
}

fetchAllCovers();

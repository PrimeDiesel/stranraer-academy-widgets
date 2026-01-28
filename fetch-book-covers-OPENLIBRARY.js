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

console.log('📚 Fetching book covers from Open Library API...');
console.log(`📊 Total books: ${books.length}`);

// Open Library API - searches by title and author
async function fetchFromOpenLibrary(book) {
  try {
    // Try ISBN search first if we had one, otherwise title+author search
    const query = encodeURIComponent(`${book.title} ${book.author}`);
    const url = `https://openlibrary.org/search.json?q=${query}&limit=1`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.docs && data.docs.length > 0) {
      const doc = data.docs[0];
      
      // Get cover from cover_i field (cover ID)
      if (doc.cover_i) {
        // Use Large size (L), Medium (M), or Small (S)
        const coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        return coverUrl;
      }
      
      // Try ISBN if cover_i not available
      if (doc.isbn && doc.isbn.length > 0) {
        const isbn = doc.isbn[0];
        return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

// Fallback: Try Google Books API (but expect rate limits)
async function fetchFromGoogleBooks(book) {
  try {
    const query = encodeURIComponent(`${book.title} ${book.author}`);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`;
    
    const response = await fetch(url);
    
    if (response.status === 429) {
      return null; // Rate limited, skip
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
      
      return coverUrl.replace('http:', 'https:');
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function fetchBookCover(book) {
  // Try Open Library first
  let coverUrl = await fetchFromOpenLibrary(book);
  
  if (coverUrl) {
    console.log(`  ✅ Found on Open Library`);
    return coverUrl;
  }
  
  // Fallback to Google Books
  console.log(`  ⚠️ Not on Open Library, trying Google Books...`);
  coverUrl = await fetchFromGoogleBooks(book);
  
  if (coverUrl) {
    console.log(`  ✅ Found on Google Books`);
    return coverUrl;
  }
  
  return null;
}

async function fetchAllCovers() {
  let successCount = 0;
  let failCount = 0;
  let alreadyCachedCount = 0;
  let openLibraryCount = 0;
  let googleBooksCount = 0;
  
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
    
    console.log(`🔍 [${i + 1}/${books.length}] "${book.title}" by ${book.author}`);
    
    const coverUrl = await fetchBookCover(book);
    
    if (coverUrl) {
      cache.books[key] = {
        day: i,
        title: book.title,
        author: book.author,
        coverUrl: coverUrl,
        source: coverUrl.includes('openlibrary.org') ? 'openlibrary' : 'google'
      };
      
      if (coverUrl.includes('openlibrary.org')) {
        openLibraryCount++;
      } else {
        googleBooksCount++;
      }
      
      successCount++;
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
    
    // Rate limiting - wait 150ms between requests
    await new Promise(resolve => setTimeout(resolve, 150));
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
    failed: failCount,
    openLibrary: openLibraryCount,
    googleBooks: googleBooksCount
  };
  
  fs.writeFileSync('./data/book-covers-cache.json', JSON.stringify(cache, null, 2));
  
  console.log('\n✅ COMPLETE!');
  console.log(`📊 Total books: ${books.length}`);
  console.log(`✅ With covers: ${totalWithCovers} (${cache.stats.percentage}%)`);
  console.log(`📚 From Open Library: ${openLibraryCount}`);
  console.log(`📗 From Google Books: ${googleBooksCount}`);
  console.log(`🆕 Newly fetched: ${successCount}`);
  console.log(`📦 Already cached: ${alreadyCachedCount}`);
  console.log(`❌ Without covers: ${cache.stats.withoutCovers}`);
  console.log(`\n💾 Cache saved to: data/book-covers-cache.json`);
}

fetchAllCovers();

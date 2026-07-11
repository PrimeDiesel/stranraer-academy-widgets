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

// --- title-match guards so we never accept the wrong book's cover ---
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function titleOk(want, got){
  const w=norm(want), g=norm(got);
  if(!g) return false;
  if(g.includes('bible') && !w.includes('bible')) return false;      // the classic mismatch
  if(g.includes(w) || w.includes(g)) return true;
  const W=w.split(' ').filter(Boolean), G=new Set(g.split(' '));
  const hit=W.filter(x=>G.has(x)).length;
  return W.length>0 && (hit/W.length)>=0.6;
}

// Open Library API - searches by title and author, VALIDATED against the title
async function fetchFromOpenLibrary(book) {
  try {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(book.author)}&limit=5&fields=title,author_name,cover_i,isbn`;
    const response = await fetch(url);
    const data = await response.json();
    const docs = (data && data.docs) || [];
    const surname = norm(book.author).split(' ').pop();

    // prefer a doc whose title matches AND author matches AND has a cover
    let pick = docs.find(d => d.cover_i && titleOk(book.title, d.title) &&
      (!surname || (d.author_name || []).some(a => norm(a).includes(surname))));
    // otherwise any title-matching doc with a cover
    if (!pick) pick = docs.find(d => d.cover_i && titleOk(book.title, d.title));
    if (pick && pick.cover_i) {
      return `https://covers.openlibrary.org/b/id/${pick.cover_i}-L.jpg`;
    }

    // ISBN only from a title-matching doc
    const isbnDoc = docs.find(d => titleOk(book.title, d.title) && d.isbn && d.isbn.length > 0);
    if (isbnDoc) {
      return `https://covers.openlibrary.org/b/isbn/${isbnDoc.isbn[0]}-L.jpg`;
    }

    return null;   // no confident match -> let Google Books try
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

// Fallback: Try Google Books API (validated against the title too)
async function fetchFromGoogleBooks(book) {
  try {
    const query = encodeURIComponent(`${book.title} ${book.author}`);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=5`;
    const response = await fetch(url);
    if (response.status === 429) return null; // rate limited, skip
    const data = await response.json();
    const items = (data.items || []).filter(it =>
      it.volumeInfo && it.volumeInfo.imageLinks && titleOk(book.title, it.volumeInfo.title));
    const it = items[0];
    if (it) {
      const L = it.volumeInfo.imageLinks;
      let coverUrl = L.large || L.medium || L.thumbnail;
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

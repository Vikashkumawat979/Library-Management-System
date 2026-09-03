// // =====================================================================
// // Book cover auto-fetch utility
// // =====================================================================
// // Given a book title and/or ISBN, tries to find a real cover image:
// //   1) Open Library Covers API by ISBN   (no API key required)
// //   2) Open Library Search API by title  (no API key required)
// //   3) Google Books API by title         (no API key required for light use)
// // Returns a direct image URL, or null if nothing usable was found —
// // callers should fall back to the existing gradient-placeholder design.
// // =====================================================================
// require('dotenv').config();
// const axios = require('axios');

// const TIMEOUT_MS = 6000;

// function cleanIsbn(isbn) {
//   return (isbn || '').replace(/[^0-9Xx]/g, '');
// }

// // Open Library serves a real image for a valid ISBN, or a tiny 1x1
// // placeholder gif for an unknown one. We HEAD-check content-length to
// // tell the difference so we don't save a broken/blank cover.
// async function tryOpenLibraryByIsbn(isbn) {
//   const clean = cleanIsbn(isbn);
//   if (!clean) return null;
//   const url = `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg?default=false`;
//   try {
//     const res = await axios.get(url, {
//       timeout: TIMEOUT_MS,
//       responseType: 'arraybuffer',
//       validateStatus: () => true
//     });
//     if (res.status === 200 && res.data && res.data.length > 1000) {
//       return `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`;
//     }
//   } catch (err) {
//     console.warn(`[BookCover] Open Library ISBN lookup failed for ${isbn}:`, err.message);
//   }
//   return null;
// }

// async function tryOpenLibraryByTitle(title) {
//   if (!title) return null;
//   try {
//     const res = await axios.get('https://openlibrary.org/search.json', {
//       params: { title, limit: 1 },
//       timeout: TIMEOUT_MS
//     });
//     const doc = res.data && res.data.docs && res.data.docs[0];
//     if (doc && doc.cover_i) {
//       return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
//     }
//     if (doc && doc.isbn && doc.isbn.length) {
//       return tryOpenLibraryByIsbn(doc.isbn[0]);
//     }
//   } catch (err) {
//     console.warn(`[BookCover] Open Library title search failed for "${title}":`, err.message);
//   }
//   return null;
// }

// async function tryGoogleBooks(title, isbn) {
//   try {
//     const q = isbn ? `isbn:${cleanIsbn(isbn)}` : `intitle:${title}`;
//     const params = { q, maxResults: 1 };
//     if (process.env.GOOGLE_BOOKS_API_KEY) params.key = process.env.GOOGLE_BOOKS_API_KEY;

//     const res = await axios.get('https://www.googleapis.com/books/v1/volumes', {
//       params,
//       timeout: TIMEOUT_MS
//     });
//     const item = res.data && res.data.items && res.data.items[0];
//     const imageLinks = item && item.volumeInfo && item.volumeInfo.imageLinks;
//     if (imageLinks) {
//       const link = imageLinks.thumbnail || imageLinks.smallThumbnail;
//       if (link) return link.replace(/^http:/, 'https:');
//     }
//   } catch (err) {
//     console.warn(`[BookCover] Google Books lookup failed for "${title}":`, err.message);
//   }
//   return null;
// }

// /**
//  * Resolves the best available cover image URL for a book.
//  * Tries ISBN first (most accurate), then title-based search, then
//  * Google Books as a final fallback. Never throws — returns null on
//  * total failure so callers can keep using the gradient placeholder.
//  */
// async function fetchBookCover({ title, isbn }) {
//   try {
//     if (isbn) {
//       const byIsbn = await tryOpenLibraryByIsbn(isbn);
//       if (byIsbn) return byIsbn;
//     }
//     if (title) {
//       const byTitle = await tryOpenLibraryByTitle(title);
//       if (byTitle) return byTitle;
//     }
//     const viaGoogle = await tryGoogleBooks(title, isbn);
//     if (viaGoogle) return viaGoogle;
//   } catch (err) {
//     console.warn('[BookCover] Unexpected error resolving cover:', err.message);
//   }
//   return null;
// }

// module.exports = { fetchBookCover };
require('dotenv').config();
const axios = require('axios');

const TIMEOUT_MS = 6000;

function cleanIsbn(isbn) {
  return (isbn || '').replace(/[^0-9Xx]/g, '');
}

async function tryGoogleBooks(title, isbn) {
  try {
    let q = '';
    if (isbn) {
      q = `isbn:${cleanIsbn(isbn)}`;
    } else if (title) {
      q = `intitle:"${title}"`;
    } else {
      return null;
    }

    const params = { q, maxResults: 1 };
    if (process.env.GOOGLE_BOOKS_API_KEY) {
      params.key = process.env.GOOGLE_BOOKS_API_KEY.trim();
    }

    const res = await axios.get('https://www.googleapis.com/books/v1/volumes', {
      params,
      timeout: TIMEOUT_MS
    });

    const item = res.data && res.data.items && res.data.items[0];
    const volumeInfo = item && item.volumeInfo;
    
    if (volumeInfo && volumeInfo.imageLinks) {
      const links = volumeInfo.imageLinks;
      let rawLink = links.medium || links.thumbnail || links.smallThumbnail || links.large || links.extraLarge;
      
      if (rawLink) {
        return rawLink.replace(/^http:/, 'https:');
      }
    }
    
    if (isbn && title && !item) {
      return tryGoogleBooks(title, null);
    }

  } catch (err) {
    console.warn(`[BookCover] Google Books lookup failed for "${title || isbn}":`, err.message);
  }
  return null;
}

async function fetchBookCover({ title, isbn }) {
  try {
    // ONLY GOOGLE BOOKS - NO OPEN LIBRARY AT ALL
    const viaGoogle = await tryGoogleBooks(title, isbn);
    if (viaGoogle) return viaGoogle;
  } catch (err) {
    console.warn('[BookCover] Unexpected error resolving cover:', err.message);
  }
  return null; // Fallback to gradient placeholder
}

module.exports = { fetchBookCover };
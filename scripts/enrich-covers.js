#!/usr/bin/env node
/**
 * Find books missing covers and try to download them from Google Books + Open Library.
 * Run on the VPS: node scripts/enrich-covers.js
 * Then rebuild: bash scripts/build.sh
 */
import 'dotenv/config';
import { getDb, initSchema } from '../src/db/db.js';
import { downloadCover, downloadCoverFromUrl } from '../src/scrapers/lib/cover-downloader.js';
import { RateLimiter } from '../src/scrapers/lib/rate-limiter.js';

const limiter = new RateLimiter(3);
const GOOGLE_BASE = 'https://www.googleapis.com/books/v1/volumes';

async function fetchGoogleCoverUrl(isbn) {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return null;
  try {
    await limiter.wait();
    const res = await fetch(`${GOOGLE_BASE}?q=isbn:${isbn}&maxResults=1&key=${key}`);
    if (!res.ok) return null;
    const data = await res.json();
    const info = data.items?.[0]?.volumeInfo;
    const thumb = info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail;
    if (!thumb) return null;
    // Upgrade to higher-res version
    return thumb.replace('http:', 'https:').replace('zoom=1', 'zoom=3');
  } catch {
    return null;
  }
}

async function enrichCoverForBook(isbn) {
  // 1. Google Books thumbnail
  const googleUrl = await fetchGoogleCoverUrl(isbn);
  if (googleUrl) {
    const path = await downloadCoverFromUrl(isbn, googleUrl);
    if (path) return path;
  }

  // 2. Open Library by ISBN (downloadCover handles both coverId and ISBN fallback)
  const path = await downloadCover(isbn, null);
  return path ?? null;
}

async function run() {
  initSchema();
  const db = getDb();

  const missing = db.prepare(`
    SELECT id, isbn, title, author
    FROM books
    WHERE (cover_path IS NULL OR cover_path = '')
      AND isbn IS NOT NULL
    ORDER BY id ASC
  `).all();

  console.log(`Found ${missing.length} books without a cover.\n`);

  let fixed = 0, failed = 0;

  for (const book of missing) {
    process.stdout.write(`  [${book.id}] ${book.title} (${book.isbn}) ... `);
    try {
      const cover_path = await enrichCoverForBook(book.isbn);
      if (cover_path) {
        db.prepare('UPDATE books SET cover_path = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?')
          .run(cover_path, book.id);
        console.log(`✓ ${cover_path}`);
        fixed++;
      } else {
        console.log('✗ not found');
        failed++;
      }
    } catch (err) {
      console.log(`✗ error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Fixed: ${fixed}, not found: ${failed}`);
  if (fixed > 0) {
    console.log('Run "bash scripts/build.sh" to rebuild the site with new covers.');
  }
}

run().catch(e => { console.error(e); process.exit(1); });

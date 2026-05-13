#!/usr/bin/env node
/**
 * Find books missing covers and try to download them from Google Books + Open Library.
 * Run on the VPS: node scripts/enrich-covers.js
 * Then rebuild: bash scripts/build.sh
 */
import 'dotenv/config';
import { statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getDb, initSchema } from '../src/db/db.js';
import { downloadCover, downloadCoverFromUrl, googleBooksHighRes } from '../src/scrapers/lib/cover-downloader.js';
import { RateLimiter } from '../src/scrapers/lib/rate-limiter.js';

const limiter = new RateLimiter(3);
const GOOGLE_BASE = 'https://www.googleapis.com/books/v1/volumes';
const COVERS_DIR  = process.env.COVERS_DIR ?? './covers';
const MIN_SIZE    = 15_000; // re-download if existing file is below 15 KB

function needsDownload(coverPath) {
  if (!coverPath) return true;
  const full = coverPath.startsWith('/') ? coverPath : join(COVERS_DIR, '..', coverPath);
  if (!existsSync(full)) return true;
  return statSync(full).size < MIN_SIZE;
}

async function fetchGoogleCoverUrl(isbn) {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return null;
  try {
    await limiter.wait();
    const res = await fetch(`${GOOGLE_BASE}?q=isbn:${isbn}&maxResults=1&key=${key}`);
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    const thumb = item?.volumeInfo?.imageLinks?.thumbnail ?? item?.volumeInfo?.imageLinks?.smallThumbnail;
    return googleBooksHighRes(thumb);
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
    SELECT id, isbn, title, author, cover_path
    FROM books
    WHERE isbn IS NOT NULL
    ORDER BY id ASC
  `).all().filter(b => needsDownload(b.cover_path));

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

import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fetchWithAgent } from './http.js';
import { RateLimiter } from './rate-limiter.js';

const COVERS_DIR = process.env.COVERS_DIR ?? './covers';
const limiter = new RateLimiter(3);

async function tryDownload(url, dest) {
  let res;
  try {
    res = await fetchWithAgent(url);
  } catch {
    return false;
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('jpeg') && !ct.includes('jpg')) return false;
  const stream = createWriteStream(dest);
  await pipeline(res.body, stream);
  return true;
}

/**
 * Download a cover from any direct URL (e.g. NYT CDN).
 * Cache-first: skips download if file already exists.
 */
export async function downloadCoverFromUrl(isbn, url) {
  const dest = join(COVERS_DIR, `${isbn}.jpg`);
  if (existsSync(dest)) return `covers/${isbn}.jpg`;
  if (!existsSync(COVERS_DIR)) mkdirSync(COVERS_DIR, { recursive: true });
  await limiter.wait();
  const ok = await tryDownload(url, dest);
  return ok ? `covers/${isbn}.jpg` : null;
}

/**
 * Download cover image for a book.
 * Tries Open Library cover ID first (more reliable), falls back to ISBN lookup.
 * Returns relative path on success, null if no cover found.
 * Cache-first: never re-downloads an existing file.
 */
export async function downloadCover(isbn, coverId = null) {
  const dest = join(COVERS_DIR, `${isbn}.jpg`);
  if (existsSync(dest)) return `covers/${isbn}.jpg`;

  if (!existsSync(COVERS_DIR)) mkdirSync(COVERS_DIR, { recursive: true });

  await limiter.wait();

  // Try by Open Library cover ID first — much better coverage for classic books
  if (coverId) {
    const ok = await tryDownload(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`, dest);
    if (ok) return `covers/${isbn}.jpg`;
  }

  // Fallback: try by ISBN
  await limiter.wait();
  const ok = await tryDownload(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`, dest);
  return ok ? `covers/${isbn}.jpg` : null;
}

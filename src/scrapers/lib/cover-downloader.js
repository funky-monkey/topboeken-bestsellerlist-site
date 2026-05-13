import { createWriteStream, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fetchWithAgent } from './http.js';
import { RateLimiter } from './rate-limiter.js';

const COVERS_DIR = process.env.COVERS_DIR ?? './covers';
const MIN_SIZE_BYTES = 15_000; // files below 15 KB are treated as low-res and re-downloaded
const limiter = new RateLimiter(3);

async function tryDownload(url, dest) {
  let res;
  try {
    res = await fetchWithAgent(url);
  } catch {
    return false;
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.startsWith('image/')) return false;
  const stream = createWriteStream(dest);
  await pipeline(res.body, stream);
  // Reject suspiciously tiny files (placeholder/error images)
  const size = statSync(dest).size;
  if (size < 2000) { require('node:fs').unlinkSync(dest); return false; }
  return true;
}

function isLowRes(dest) {
  try { return statSync(dest).size < MIN_SIZE_BYTES; } catch { return false; }
}

function ensureDir() {
  if (!existsSync(COVERS_DIR)) mkdirSync(COVERS_DIR, { recursive: true });
}

/**
 * Build a high-res Google Books cover URL from any Google Books image URL.
 * Strips zoom/edge params and requests the largest available size.
 */
export function googleBooksHighRes(url) {
  if (!url || !url.includes('books.google.com')) return url;
  try {
    const u = new URL(url.replace('http:', 'https:'));
    u.searchParams.set('zoom', '0');
    u.searchParams.delete('edge');
    return u.toString();
  } catch {
    return url.replace('http:', 'https:').replace(/zoom=\d/, 'zoom=0').replace(/&edge=[^&]+/, '');
  }
}

/**
 * Download a cover from any direct URL (e.g. NYT CDN, Google Books).
 * Re-downloads if the existing file is below MIN_SIZE_BYTES (low-res).
 */
export async function downloadCoverFromUrl(isbn, url) {
  const dest = join(COVERS_DIR, `${isbn}.jpg`);
  if (existsSync(dest) && !isLowRes(dest)) return `covers/${isbn}.jpg`;
  ensureDir();
  await limiter.wait();
  const ok = await tryDownload(url, dest);
  return ok ? `covers/${isbn}.jpg` : null;
}

/**
 * Download cover via Open Library (by cover ID then by ISBN).
 * Re-downloads if existing file is below MIN_SIZE_BYTES.
 */
export async function downloadCover(isbn, coverId = null) {
  const dest = join(COVERS_DIR, `${isbn}.jpg`);
  if (existsSync(dest) && !isLowRes(dest)) return `covers/${isbn}.jpg`;
  ensureDir();

  await limiter.wait();

  if (coverId) {
    const ok = await tryDownload(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`, dest);
    if (ok) return `covers/${isbn}.jpg`;
  }

  await limiter.wait();
  const ok = await tryDownload(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`, dest);
  return ok ? `covers/${isbn}.jpg` : null;
}

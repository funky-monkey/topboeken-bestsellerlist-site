import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fetchWithAgent } from './http.js';
import { RateLimiter } from './rate-limiter.js';

const COVERS_DIR = process.env.COVERS_DIR ?? './covers';
const limiter = new RateLimiter(3);

export async function downloadCover(isbn) {
  const dest = join(COVERS_DIR, `${isbn}.jpg`);
  if (existsSync(dest)) return `covers/${isbn}.jpg`;

  if (!existsSync(COVERS_DIR)) mkdirSync(COVERS_DIR, { recursive: true });

  await limiter.wait();

  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  let res;
  try {
    res = await fetchWithAgent(url);
  } catch {
    return null;
  }

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('jpeg') && !ct.includes('jpg')) return null;

  const stream = createWriteStream(dest);
  await pipeline(res.body, stream);
  return `covers/${isbn}.jpg`;
}

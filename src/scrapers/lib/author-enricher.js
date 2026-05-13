import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const COVERS_DIR = process.env.COVERS_DIR ?? './covers';
const AUTHORS_DIR = join(COVERS_DIR, '..', 'authors');

async function downloadPhoto(slug, photoId) {
  const url  = `https://covers.openlibrary.org/a/id/${photoId}-M.jpg`;
  const dest = join(AUTHORS_DIR, `${slug}.jpg`);
  if (existsSync(dest)) return `authors/${slug}.jpg`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'TopBoeken/1.0' } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    if (!existsSync(AUTHORS_DIR)) mkdirSync(AUTHORS_DIR, { recursive: true });
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return `authors/${slug}.jpg`;
  } catch { return null; }
}

export async function enrichAuthor(name, slug) {
  try {
    const searchRes = await fetch(
      `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(name)}&limit=5`,
      { headers: { 'User-Agent': 'TopBoeken/1.0' } }
    );
    if (!searchRes.ok) return null;
    const { docs } = await searchRes.json();
    if (!docs?.length) return null;

    // Pick the doc whose name best matches — first with same first word
    const firstWord = name.toLowerCase().split(/\s+/)[0];
    const match = docs.find(d => d.name?.toLowerCase().startsWith(firstWord)) ?? docs[0];

    const detailRes = await fetch(
      `https://openlibrary.org${match.key}.json`,
      { headers: { 'User-Agent': 'TopBoeken/1.0' } }
    );
    if (!detailRes.ok) return null;
    const detail = await detailRes.json();

    const bio       = typeof detail.bio === 'object' ? detail.bio?.value : (detail.bio ?? null);
    const birthDate = detail.birth_date ?? match.birth_date ?? null;
    const deathDate = detail.death_date ?? null;
    const photoId   = detail.photos?.find(p => p > 0) ?? null;
    const photoPath = photoId ? await downloadPhoto(slug, photoId) : null;

    return { ol_key: match.key, bio: bio || null, birth_date: birthDate, death_date: deathDate, photo_path: photoPath };
  } catch { return null; }
}

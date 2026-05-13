/**
 * Fetches author bios, birth dates and photos from Open Library for all
 * unique authors in the database. Safe to re-run — skips already-enriched authors.
 * Run: node scripts/enrich-authors.js
 */
import 'dotenv/config';
import { getDb, initSchema } from '../src/db/db.js';
import { textSlug } from '../src/lib/slugify.js';
import { enrichAuthor } from '../src/scrapers/lib/author-enricher.js';

initSchema();
const db = getDb();

// Collect unique authors from non-deleted books with covers
const books = db.prepare("SELECT DISTINCT author FROM books WHERE deleted=0 AND cover_path IS NOT NULL AND cover_path != ''").all();
const authorMap = {};
for (const { author } of books) {
  const slug = textSlug(author);
  if (slug && !authorMap[slug]) authorMap[slug] = author;
}

const pending = Object.entries(authorMap).filter(([slug]) =>
  !db.prepare('SELECT id FROM authors WHERE slug=?').get(slug)
);

console.log(`${Object.keys(authorMap).length} unique authors. ${pending.length} need enrichment.\n`);

const upsert = db.prepare(`
  INSERT INTO authors (name, slug, bio, birth_date, death_date, photo_path, ol_key, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
  ON CONFLICT(slug) DO UPDATE SET
    bio=excluded.bio, birth_date=excluded.birth_date, death_date=excluded.death_date,
    photo_path=coalesce(excluded.photo_path, photo_path), ol_key=excluded.ol_key,
    updated_at=excluded.updated_at
`);

let done = 0, skipped = 0;

for (const [slug, name] of pending) {
  process.stdout.write(`  ${name} ... `);
  const data = await enrichAuthor(name, slug);
  if (data) {
    upsert.run(name, slug, data.bio, data.birth_date, data.death_date, data.photo_path, data.ol_key);
    const parts = [data.bio ? '✓ bio' : '— no bio', data.photo_path ? '✓ photo' : '— no photo'];
    console.log(parts.join(', '));
    done++;
  } else {
    // Still insert with name/slug so the page exists
    upsert.run(name, slug, null, null, null, null, null);
    console.log('— not found in Open Library');
    skipped++;
  }
  await new Promise(r => setTimeout(r, 400)); // be polite
}

console.log(`\nDone. Enriched: ${done}, not found: ${skipped}`);
console.log('Run "bash scripts/build.sh" to rebuild.');

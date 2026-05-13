/**
 * Merges books with the same title + author (case-insensitive, punctuation-normalised).
 * Run: node scripts/merge-duplicates.js
 */
import 'dotenv/config';
import { getDb, initSchema } from '../src/db/db.js';

initSchema();
const db = getDb();

// ── Normalisation helpers ─────────────────────────────────────────────────────

function normTitle(t) {
  return (t ?? '').trim().toUpperCase();
}

function normAuthor(a) {
  // Strip spaces and dots so "J. K. Rowling" and "J.K. Rowling" are identical
  return (a ?? '').trim().toUpperCase().replace(/[\s.]/g, '');
}

function cleanAuthor(a) {
  // Store a clean version: collapse spaces, add space after initials-dot
  return (a ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\.([A-Z])/g, '. $1')
    .replace(/\s+/g, ' ')
    .trim();
}

function bestText(strings) {
  // Returns the longest non-empty string
  return strings.filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? null;
}

// ── Load all non-deleted books ────────────────────────────────────────────────

const books = db.prepare('SELECT * FROM books WHERE deleted = 0').all();

// Group by normalised title + author
const groups = {};
for (const b of books) {
  const key = normTitle(b.title) + '|||' + normAuthor(b.author);
  if (!groups[key]) groups[key] = [];
  groups[key].push(b);
}

const dupeGroups = Object.values(groups).filter(g => g.length > 1);
console.log(`\nFound ${dupeGroups.length} duplicate groups across ${books.length} books.\n`);

// ── Prepare statements ────────────────────────────────────────────────────────

const moveEntries    = db.prepare('INSERT OR IGNORE INTO list_entries (book_id,source_id,genre_id,rank,list_name,week_date,scraped_at) SELECT ?,source_id,genre_id,rank,list_name,week_date,scraped_at FROM list_entries WHERE book_id=?');
const moveGenres     = db.prepare('INSERT OR IGNORE INTO book_genres (book_id,genre_id) SELECT ?,genre_id FROM book_genres WHERE book_id=?');
const moveAffils     = db.prepare('INSERT OR IGNORE INTO book_affiliates (book_id,affiliate_id,url,price,currency,updated_at) SELECT ?,affiliate_id,url,price,currency,updated_at FROM book_affiliates WHERE book_id=?');
const moveArticles   = db.prepare('INSERT OR IGNORE INTO article_books (article_id,book_id,description,position) SELECT article_id,?,description,position FROM article_books WHERE book_id=?');
const deleteBook     = db.prepare('DELETE FROM books WHERE id=?');
const updateCanon    = db.prepare(`UPDATE books SET
  summary=?, summary_nl=?, cover_path=?, publisher=?, pages=?, language=?,
  goodreads_rating=?, goodreads_count=?, is_ebook=?, author=?,
  updated_at=datetime('now','localtime')
  WHERE id=?`);

// ── Merge each group ──────────────────────────────────────────────────────────

let mergedGroups = 0, removedBooks = 0;

db.transaction(() => {
  for (const group of dupeGroups) {
    // Canonical = prefer book with cover, then with NL description, then lowest id
    group.sort((a, b) => {
      if (a.cover_path && !b.cover_path) return -1;
      if (!a.cover_path && b.cover_path) return 1;
      if (a.summary_nl && !b.summary_nl) return -1;
      if (!a.summary_nl && b.summary_nl) return 1;
      return a.id - b.id;
    });

    const [canon, ...dupes] = group;

    // Collect best values from all books in the group
    const summaryEn = bestText(group.map(b => b.summary));
    const summaryNl = bestText(group.map(b => b.summary_nl));
    const cover     = group.find(b => b.cover_path)?.cover_path ?? null;
    const publisher = group.find(b => b.publisher)?.publisher ?? null;
    const pages     = group.find(b => b.pages)?.pages ?? null;
    const language  = group.find(b => b.language)?.language ?? null;
    const rating    = group.find(b => b.goodreads_rating)?.goodreads_rating ?? null;
    const count     = group.find(b => b.goodreads_count)?.goodreads_count ?? null;
    const isEbook   = group.some(b => b.is_ebook) ? 1 : 0;
    const author    = cleanAuthor(canon.author);

    // Move all data from duplicates to canonical
    for (const dupe of dupes) {
      moveEntries.run(canon.id, dupe.id);
      moveGenres.run(canon.id, dupe.id);
      moveAffils.run(canon.id, dupe.id);
      moveArticles.run(canon.id, dupe.id);
      deleteBook.run(dupe.id);
      removedBooks++;
    }

    // Update canonical with best combined data
    updateCanon.run(summaryEn, summaryNl, cover, publisher, pages, language, rating, count, isEbook, author, canon.id);
    mergedGroups++;

    const ids = group.map(b => b.id).join(',');
    const kept = dupes.length;
    console.log(`  ✓ [${canon.id}] "${canon.title}" — ${canon.author} (merged ${kept} dup${kept>1?'s':''}; ids: ${ids})`);
  }
})();

console.log(`\nDone. Merged ${mergedGroups} groups, removed ${removedBooks} duplicate books.`);
console.log('Run "bash scripts/build.sh" to rebuild the site.');

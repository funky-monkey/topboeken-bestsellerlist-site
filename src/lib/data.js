import { getDb } from '../db/db.js';

export function getAllSources() {
  return getDb().prepare('SELECT * FROM sources WHERE active = 1 ORDER BY id').all();
}

export function getAllGenres() {
  return getDb().prepare('SELECT * FROM genres ORDER BY name_nl').all();
}

export function getSourceBySlug(slug) {
  return getDb().prepare('SELECT * FROM sources WHERE slug = ?').get(slug);
}

export function getGenreBySlug(slug) {
  return getDb().prepare('SELECT * FROM genres WHERE slug = ?').get(slug);
}

export function getBookBySlug(slug) {
  return getDb().prepare('SELECT * FROM books WHERE slug = ?').get(slug);
}

function latestWeek(db, sourceSlug) {
  return db.prepare(
    'SELECT MAX(le.week_date) as d FROM list_entries le JOIN sources s ON s.id = le.source_id WHERE s.slug = ?'
  ).get(sourceSlug)?.d ?? new Date().toISOString().slice(0, 10);
}

export function getTopBooksForSource(sourceSlug, genreSlug = null) {
  const db = getDb();
  const latest = latestWeek(db, sourceSlug);

  if (genreSlug) {
    return db.prepare(`
      SELECT b.*, MIN(le.rank) as rank, le.list_name, le.week_date
      FROM list_entries le
      JOIN books b    ON b.id  = le.book_id
      JOIN sources s  ON s.id  = le.source_id
      JOIN book_genres bg ON bg.book_id = b.id
      JOIN genres g   ON g.id  = bg.genre_id
      WHERE s.slug = ? AND le.week_date = ? AND g.slug = ?
      GROUP BY UPPER(TRIM(b.title))
      ORDER BY rank ASC LIMIT 10
    `).all(sourceSlug, latest, genreSlug);
  }

  return db.prepare(`
    SELECT b.*, MIN(le.rank) as rank, le.list_name, le.week_date
    FROM list_entries le
    JOIN books b   ON b.id = le.book_id
    JOIN sources s ON s.id = le.source_id
    WHERE s.slug = ? AND le.week_date = ?
    GROUP BY UPPER(TRIM(b.title))
    ORDER BY rank ASC LIMIT 10
  `).all(sourceSlug, latest);
}

export function getFullListForSource(sourceSlug, limit = 500) {
  const db = getDb();
  const latest = latestWeek(db, sourceSlug);
  return db.prepare(`
    SELECT b.*, MIN(le.rank) as rank, le.list_name
    FROM list_entries le
    JOIN books b   ON b.id = le.book_id
    JOIN sources s ON s.id = le.source_id
    WHERE s.slug = ? AND le.week_date = ?
    GROUP BY le.book_id
    ORDER BY rank ASC LIMIT ?
  `).all(sourceSlug, latest, limit);
}

export function getListsForBook(bookId) {
  return getDb().prepare(`
    SELECT s.name, s.slug, s.accent_color, le.rank, le.list_name
    FROM list_entries le
    JOIN sources s ON s.id = le.source_id
    WHERE le.book_id = ?
    ORDER BY le.rank ASC
  `).all(bookId);
}

export function getAffiliatesForBook(bookId) {
  return getDb().prepare(`
    SELECT a.name, a.slug, a.country, ba.url, ba.price, ba.currency
    FROM book_affiliates ba
    JOIN affiliates a ON a.id = ba.affiliate_id
    WHERE ba.book_id = ? AND a.active = 1
    ORDER BY a.country ASC, a.name ASC
  `).all(bookId);
}

export function getGenresForBook(bookId) {
  return getDb().prepare(`
    SELECT g.name_nl, g.slug
    FROM book_genres bg
    JOIN genres g ON g.id = bg.genre_id
    WHERE bg.book_id = ?
  `).all(bookId);
}

export function getAllBookSlugs() {
  return getDb().prepare('SELECT slug FROM books').all().map(r => r.slug);
}

export function getAllBooksForSearch() {
  return getDb().prepare('SELECT slug, title, author, cover_path FROM books ORDER BY title ASC').all();
}

export function getAllBooks() {
  return getDb().prepare('SELECT slug, updated_at FROM books ORDER BY updated_at DESC').all();
}

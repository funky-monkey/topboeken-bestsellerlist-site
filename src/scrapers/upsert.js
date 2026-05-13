import { getDb } from '../db/db.js';

function nullify(obj) {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (v === undefined || v === null) return [k, null];
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return [k, v];
      if (Buffer.isBuffer(v)) return [k, v];
      return [k, null]; // reject objects, arrays, booleans, etc.
    })
  );
}

export function upsertBook(book) {
  book = nullify(book);
  const db = getDb();
  db.prepare(`
    INSERT INTO books (isbn, title, author, publisher, pages, language,
                       summary, summary_nl, cover_path, goodreads_rating, goodreads_count, is_ebook, slug)
    VALUES (@isbn, @title, @author, @publisher, @pages, @language,
            @summary, @summary_nl, @cover_path, @goodreads_rating, @goodreads_count, @is_ebook, @slug)
    ON CONFLICT(isbn) DO UPDATE SET
      title            = excluded.title,
      author           = excluded.author,
      publisher        = coalesce(excluded.publisher,        publisher),
      pages            = coalesce(excluded.pages,            pages),
      language         = coalesce(excluded.language,         language),
      summary          = coalesce(excluded.summary,          summary),
      summary_nl       = coalesce(excluded.summary_nl,       summary_nl),
      cover_path       = coalesce(excluded.cover_path,       cover_path),
      goodreads_rating = coalesce(excluded.goodreads_rating, goodreads_rating),
      goodreads_count  = coalesce(excluded.goodreads_count,  goodreads_count),
      is_ebook         = excluded.is_ebook,
      updated_at       = datetime('now', 'localtime')
  `).run(book);
  return db.prepare('SELECT id FROM books WHERE isbn = ?').get(book.isbn).id;
}

export function upsertListEntry(entry) {
  getDb().prepare(`
    INSERT INTO list_entries (book_id, source_id, genre_id, rank, list_name, week_date)
    VALUES (@book_id, @source_id, @genre_id, @rank, @list_name, @week_date)
    ON CONFLICT(book_id, source_id, list_name, week_date) DO UPDATE SET
      rank = excluded.rank
  `).run(entry);
}

export function upsertBookGenres(bookId, genreSlugs = []) {
  if (!genreSlugs.length) return;
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO book_genres (book_id, genre_id)
    SELECT ?, id FROM genres WHERE slug = ?
  `);
  db.transaction(() => genreSlugs.forEach(slug => insert.run(bookId, slug)))();
}

export function upsertBookAffiliate({ book_id, affiliate_slug, url }) {
  const db = getDb();
  const affiliate = db.prepare('SELECT id FROM affiliates WHERE slug = ?').get(affiliate_slug);
  if (!affiliate) return;
  db.prepare(`
    INSERT INTO book_affiliates (book_id, affiliate_id, url)
    VALUES (?, ?, ?)
    ON CONFLICT(book_id, affiliate_id) DO UPDATE SET
      url        = excluded.url,
      updated_at = datetime('now', 'localtime')
  `).run(book_id, affiliate.id, url);
}

import { getDb } from '../db/db.js';

export function upsertBook(book) {
  const db = getDb();
  db.prepare(`
    INSERT INTO books (isbn, title, author, publisher, pages, language,
                       summary, cover_path, goodreads_rating, goodreads_count, slug)
    VALUES (@isbn, @title, @author, @publisher, @pages, @language,
            @summary, @cover_path, @goodreads_rating, @goodreads_count, @slug)
    ON CONFLICT(isbn) DO UPDATE SET
      title            = excluded.title,
      author           = excluded.author,
      publisher        = coalesce(excluded.publisher,        publisher),
      pages            = coalesce(excluded.pages,            pages),
      language         = coalesce(excluded.language,         language),
      summary          = coalesce(excluded.summary,          summary),
      cover_path       = coalesce(excluded.cover_path,       cover_path),
      goodreads_rating = coalesce(excluded.goodreads_rating, goodreads_rating),
      goodreads_count  = coalesce(excluded.goodreads_count,  goodreads_count),
      updated_at       = datetime('now')
  `).run(book);
  return db.prepare('SELECT id FROM books WHERE isbn = ?').get(book.isbn).id;
}

export function upsertListEntry(entry) {
  getDb().prepare(`
    INSERT INTO list_entries (book_id, source_id, genre_id, rank, list_name, week_date)
    VALUES (@book_id, @source_id, @genre_id, @rank, @list_name, @week_date)
  `).run(entry);
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
      updated_at = datetime('now')
  `).run(book_id, affiliate.id, url);
}

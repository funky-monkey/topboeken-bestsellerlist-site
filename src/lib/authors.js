import { getDb } from '../db/db.js';
import { textSlug } from './slugify.js';

export function getAllAuthorSlugs() {
  const db    = getDb();
  const books = db.prepare("SELECT DISTINCT author FROM books WHERE deleted=0 AND cover_path IS NOT NULL AND cover_path != ''").all();
  const seen  = new Set();
  const out   = [];
  for (const { author } of books) {
    const slug = textSlug(author);
    if (slug && !seen.has(slug)) { seen.add(slug); out.push({ slug, name: author }); }
  }
  return out;
}

export function getAuthorBySlug(slug) {
  return getDb().prepare('SELECT * FROM authors WHERE slug = ?').get(slug) ?? null;
}

export function getBooksForAuthor(slug) {
  const db    = getDb();
  const books = db.prepare(`
    SELECT b.*, COALESCE(ba_bol.url,'') as bol_url, COALESCE(ba_amz.url,'') as amazon_url
    FROM books b
    LEFT JOIN book_affiliates ba_bol ON ba_bol.book_id = b.id
      AND ba_bol.affiliate_id = (SELECT id FROM affiliates WHERE slug='bol-com')
    LEFT JOIN book_affiliates ba_amz ON ba_amz.book_id = b.id
      AND ba_amz.affiliate_id = (SELECT id FROM affiliates WHERE slug='amazon-nl')
    WHERE b.deleted = 0 AND b.cover_path IS NOT NULL AND b.cover_path != ''
    ORDER BY b.title
  `).all();
  return books.filter(b => textSlug(b.author) === slug);
}

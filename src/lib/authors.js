import { getDb } from '../db/db.js';
import { textSlug } from './slugify.js';

function firstLetter(name) {
  return name.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
}

export function getAuthorsGrouped() {
  const db    = getDb();
  const rows  = db.prepare(`
    SELECT b.author,
           COUNT(*) as book_count,
           SUM(CASE WHEN b.language LIKE 'nl%' THEN 1 ELSE 0 END) as nl_count,
           SUM(CASE WHEN b.language LIKE 'en%' THEN 1 ELSE 0 END) as en_count,
           SUM(CASE WHEN b.language IS NOT NULL THEN 1 ELSE 0 END) as lang_known
    FROM books b
    WHERE b.deleted = 0 AND b.cover_path IS NOT NULL AND b.cover_path != ''
    GROUP BY b.author
    ORDER BY b.author COLLATE NOCASE
  `).all();

  const isDutch = (r) => r.lang_known > 0 && r.nl_count > 0 && r.nl_count >= r.en_count;

  // Deduplicate by slug, keeping highest book_count
  const slugMap = new Map();
  for (const r of rows) {
    const slug = textSlug(r.author);
    if (!slug) continue;
    const prev = slugMap.get(slug);
    if (!prev || r.book_count > prev.book_count) {
      slugMap.set(slug, { name: r.author, slug, book_count: r.book_count, dutch: isDutch(r) });
    }
  }

  function buildGroups(entries) {
    const groups = {};
    for (const entry of entries) {
      const letter = firstLetter(entry.name);
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(entry);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, authors]) => ({ letter, authors: authors.sort((a, b) => a.name.localeCompare(b.name)) }));
  }

  const all     = [...slugMap.values()];
  const dutch   = buildGroups(all.filter(a => a.dutch));
  const intl    = buildGroups(all.filter(a => !a.dutch));

  return { dutch, intl, totalDutch: all.filter(a => a.dutch).length, totalIntl: all.filter(a => !a.dutch).length };
}

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

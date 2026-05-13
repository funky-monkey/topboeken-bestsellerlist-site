import { getDb } from '../db/db.js';

function tableExists() {
  try {
    getDb().prepare("SELECT 1 FROM articles LIMIT 1").get();
    return true;
  } catch { return false; }
}

export function getAllArticles({ publishedOnly = true } = {}) {
  if (!tableExists()) return [];
  const where = publishedOnly ? 'WHERE a.published = 1' : '';
  return getDb().prepare(`
    SELECT a.*, COUNT(ab.id) as book_count
    FROM articles a
    LEFT JOIN article_books ab ON ab.article_id = a.id
    ${where}
    GROUP BY a.id
    ORDER BY a.published_at DESC, a.created_at DESC
  `).all();
}

export function getArticleBySlug(slug) {
  return getDb().prepare('SELECT * FROM articles WHERE slug = ?').get(slug);
}

export function getArticleById(id) {
  return getDb().prepare('SELECT * FROM articles WHERE id = ?').get(id);
}

export function getBooksForArticle(articleId) {
  return getDb().prepare(`
    SELECT b.id, b.title, b.author, b.slug, b.cover_path, b.isbn,
           ab.description as article_description, ab.position,
           coalesce(ba_bol.url, '') as bol_url,
           coalesce(ba_amz.url, '') as amazon_url
    FROM article_books ab
    JOIN books b ON b.id = ab.book_id
    LEFT JOIN book_affiliates ba_bol ON ba_bol.book_id = b.id
      AND ba_bol.affiliate_id = (SELECT id FROM affiliates WHERE slug = 'bol-com')
    LEFT JOIN book_affiliates ba_amz ON ba_amz.book_id = b.id
      AND ba_amz.affiliate_id = (SELECT id FROM affiliates WHERE slug = 'amazon-nl')
    WHERE ab.article_id = ?
    ORDER BY ab.position ASC, ab.id ASC
  `).all(articleId);
}

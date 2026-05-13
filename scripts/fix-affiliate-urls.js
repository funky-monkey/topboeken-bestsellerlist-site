// One-time script: update existing affiliate URLs to use direct product pages
import 'dotenv/config';
import { getDb } from '../src/db/db.js';
import { amazonUrl } from '../src/scrapers/lib/affiliate-links.js';

const db = getDb();

const amazon = db.prepare('SELECT id FROM affiliates WHERE slug=?').get('amazon-nl');
const bol    = db.prepare('SELECT id FROM affiliates WHERE slug=?').get('bol-com');

if (!amazon) { console.error('amazon-nl affiliate not found'); process.exit(1); }

// Update Amazon URLs to direct dp/ links
const books = db.prepare('SELECT b.id, b.isbn FROM books b').all();
let updated = 0;

for (const book of books) {
  if (!book.isbn) continue;
  const url = amazonUrl(book.isbn);
  db.prepare(`
    UPDATE book_affiliates SET url=?, updated_at=datetime('now')
    WHERE book_id=? AND affiliate_id=?
  `).run(url, book.id, amazon.id);
  updated++;
}

console.log(`Updated ${updated} Amazon URLs to direct dp/ links.`);
console.log('Run the scraper to refresh bol.com URLs.');

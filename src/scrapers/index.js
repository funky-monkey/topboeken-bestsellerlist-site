import 'dotenv/config';
import { getDb, initSchema } from '../db/db.js';
import { seedGenres, seedSources, seedAffiliates } from '../db/seed.js';
import { enrichBook } from './lib/enricher.js';
import { upsertBook, upsertListEntry, upsertBookAffiliate, upsertBookGenres } from './upsert.js';
import { amazonUrl, bolUrl } from './lib/affiliate-links.js';
import { scrapeNyTimes }          from './sources/nytimes.js';
import { scrapeBesteller60 }      from './sources/besteller60.js';
import { scrapeBolcom }           from './sources/bolcom.js';
import { scrapeAmazon }           from './sources/amazon.js';
import { scrapeGoodreads }        from './sources/goodreads.js';
import { scrapePublishersWeekly } from './sources/publishers-weekly.js';
import { scrapeWikipedia }        from './sources/wikipedia.js';

const SOURCES = [
  { slug: 'ny-times',          fn: scrapeNyTimes },
  { slug: 'besteller-60',      fn: scrapeBesteller60 },
  { slug: 'bol-com',           fn: scrapeBolcom },
  { slug: 'amazon-nl',         fn: scrapeAmazon },
  { slug: 'goodreads',         fn: scrapeGoodreads },
  { slug: 'publishers-weekly', fn: scrapePublishersWeekly },
  { slug: 'wikipedia',         fn: scrapeWikipedia },
];

async function run() {
  initSchema();
  seedGenres();
  seedSources();
  seedAffiliates();

  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  for (const { slug, fn } of SOURCES) {
    const source = db.prepare('SELECT * FROM sources WHERE slug = ? AND active = 1').get(slug);
    if (!source) { console.log(`Skipping inactive source: ${slug}`); continue; }

    const logId = db.prepare("INSERT INTO scrape_log (source_id, started_at) VALUES (?, datetime('now', 'localtime'))").run(source.id).lastInsertRowid;
    let added = 0, updated = 0;

    try {
      console.log(`\nScraping ${source.name}...`);
      const entries = await fn();
      console.log(`  → ${entries.length} entries found`);

      for (const entry of entries) {
        try {
          const existing = entry.isbn
            ? db.prepare('SELECT id FROM books WHERE isbn = ?').get(entry.isbn)
            : null;

          if (existing) {
            updated++;
            upsertListEntry({ book_id: existing.id, source_id: source.id, genre_id: null, rank: entry.rank, list_name: entry.list_name, week_date: today });
            continue;
          }

          const bookData = await enrichBook({ title: entry.title, author: entry.author, isbn: entry.isbn ?? null, summary: entry.summary ?? null, coverImageUrl: entry.coverImageUrl ?? null });
          if (!bookData) { console.warn(`  Could not resolve ISBN for: ${entry.title}`); continue; }
          added++;

          const bookId = upsertBook(bookData);
          if (bookData.genreSlugs?.length) upsertBookGenres(bookId, bookData.genreSlugs);
          upsertListEntry({ book_id: bookId, source_id: source.id, genre_id: null, rank: entry.rank, list_name: entry.list_name, week_date: today });

          const isbn = bookData.isbn ?? entry.isbn;
          upsertBookAffiliate({ book_id: bookId, affiliate_slug: 'amazon-nl', url: amazonUrl(isbn) });
          const bolLink = await bolUrl(isbn);
          upsertBookAffiliate({ book_id: bookId, affiliate_slug: 'bol-com', url: bolLink });
        } catch (bookErr) {
          console.warn(`  Skipping "${entry.title}": ${bookErr.message}`);
        }
      }

      db.prepare("UPDATE scrape_log SET finished_at=datetime('now', 'localtime'), books_added=?, books_updated=?, status='ok' WHERE id=?").run(added, updated, logId);
      console.log(`  ✓ Done (added: ${added}, updated: ${updated})`);
    } catch (err) {
      db.prepare("UPDATE scrape_log SET finished_at=datetime('now', 'localtime'), status='error', error_msg=? WHERE id=?").run(err.message, logId);
      console.error(`  ✗ Error in ${slug}: ${err.message}`);
    }
  }

  console.log('\nScrape complete.');
}

run().catch(e => { console.error(e); process.exit(1); });

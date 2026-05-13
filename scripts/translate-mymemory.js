/**
 * Translates books with summary but no summary_nl via MyMemory (free, 50K chars/day).
 * Called nightly or via the admin dashboard.
 */
import 'dotenv/config';
import { getDb, initSchema } from '../src/db/db.js';

const EMAIL  = 'sidney@funky-monkey.nl';
const DELAY  = 1200; // ms between requests — stay under rate limit
const LIMIT  = 80;   // max per run (~50K chars)

async function translate(text) {
  const q = text.slice(0, 500); // MyMemory caps at 500 chars per request
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|nl&de=${EMAIL}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails ?? 'MyMemory error');
  return data.responseData?.translatedText ?? null;
}

async function run() {
  initSchema();
  const db = getDb();

  const books = db.prepare(`
    SELECT id, title, author, summary FROM books
    WHERE summary IS NOT NULL AND summary != ''
      AND (summary_nl IS NULL OR summary_nl = '')
    ORDER BY id ASC
    LIMIT ?
  `).all(LIMIT);

  const total = db.prepare(`
    SELECT COUNT(*) as c FROM books
    WHERE summary IS NOT NULL AND summary != ''
      AND (summary_nl IS NULL OR summary_nl = '')
  `).get().c;

  console.log(`${total} boeken wachten op vertaling. Deze run: ${books.length}.`);

  const update = db.prepare("UPDATE books SET summary_nl=?, updated_at=datetime('now','localtime') WHERE id=?");
  let done = 0, failed = 0;

  for (const book of books) {
    process.stdout.write(`  [${book.id}] ${book.title.slice(0, 50)} ... `);
    try {
      const nl = await translate(book.summary);
      if (!nl || nl.length < 10) throw new Error('lege vertaling');
      update.run(nl, book.id);
      console.log('✓');
      done++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, DELAY));
  }

  const remaining = total - done;
  console.log(`\nKlaar. Vertaald: ${done}, mislukt: ${failed}, nog te gaan: ${Math.max(0, remaining - failed)}`);
}

run().catch(e => { console.error(e); process.exit(1); });

/**
 * One-shot batch translator: translates all books with summary but no summary_nl
 * using Claude. Run locally or on VPS:
 *   ANTHROPIC_API_KEY=sk-... node scripts/translate-claude.js
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { getDb, initSchema } from '../src/db/db.js';

const BATCH_SIZE = 10;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function translateBatch(books) {
  const numbered = books.map((b, i) =>
    `${i + 1}. ${b.summary.slice(0, 800)}`
  ).join('\n\n');

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Vertaal de volgende Engelstalige boekomschrijvingen naar natuurlijk Nederlands. Behoud de toon en stijl. Geef alleen de vertalingen terug, genummerd zoals de invoer. Geen extra tekst of uitleg.\n\n${numbered}`,
    }],
  });

  const text = msg.content[0].text;
  const lines = text.split(/\n(?=\d+\.)/).map(s => s.replace(/^\d+\.\s*/, '').trim());
  return lines;
}

async function run() {
  initSchema();
  const db = getDb();

  const books = db.prepare(`
    SELECT id, title, author, summary FROM books
    WHERE summary IS NOT NULL AND summary != ''
      AND (summary_nl IS NULL OR summary_nl = '')
    ORDER BY id ASC
  `).all();

  console.log(`${books.length} boeken te vertalen in batches van ${BATCH_SIZE}\n`);

  const update = db.prepare("UPDATE books SET summary_nl=?, updated_at=datetime('now','localtime') WHERE id=?");
  let done = 0, failed = 0;

  for (let i = 0; i < books.length; i += BATCH_SIZE) {
    const batch = books.slice(i, i + BATCH_SIZE);
    process.stdout.write(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(books.length / BATCH_SIZE)} (${batch.map(b => b.id).join(',')}) ... `);

    try {
      const translations = await translateBatch(batch);
      db.transaction(() => {
        batch.forEach((book, idx) => {
          const t = translations[idx];
          if (t && t.length > 10) {
            update.run(t, book.id);
            done++;
          } else {
            console.warn(`  [skip] geen vertaling voor "${book.title}"`);
            failed++;
          }
        });
      })();
      console.log(`✓ ${translations.filter(t => t?.length > 10).length} vertaald`);
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed += batch.length;
    }

    // Small pause between batches to be kind to the API
    if (i + BATCH_SIZE < books.length) await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nKlaar. Vertaald: ${done}, mislukt: ${failed}`);
  console.log('Run "bash scripts/build.sh" om de site te herbouwen.');
}

run().catch(e => { console.error(e); process.exit(1); });

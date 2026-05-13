/**
 * For each (source, list_name, week_date, rank) with more than one book,
 * keep the book with the most complete data and remove the others' list entries.
 * Books themselves are NOT deleted — just their duplicate list positions.
 */
import 'dotenv/config';
import { getDb, initSchema } from '../src/db/db.js';

initSchema();
const db = getDb();

const conflicts = db.prepare(`
  SELECT source_id, list_name, week_date, rank,
         GROUP_CONCAT(book_id) as bids
  FROM list_entries
  GROUP BY source_id, list_name, week_date, rank
  HAVING COUNT(*) > 1
`).all();

console.log(`Found ${conflicts.length} conflicting list positions.\n`);

function score(book) {
  return (book.cover_path ? 4 : 0)
       + (book.summary_nl ? 2 : 0)
       + (book.summary    ? 1 : 0);
}

const del = db.prepare('DELETE FROM list_entries WHERE book_id=? AND source_id=? AND list_name=? AND week_date=?');
let fixed = 0;

db.transaction(() => {
  for (const c of conflicts) {
    const ids   = c.bids.split(',').map(Number);
    const books = ids.map(id => db.prepare('SELECT * FROM books WHERE id=?').get(id)).filter(Boolean);
    if (books.length < 2) continue;

    books.sort((a, b) => score(b) - score(a)); // best first
    const [keep, ...remove] = books;

    for (const b of remove) {
      del.run(b.id, c.source_id, c.list_name, c.week_date);
      console.log(`  rank ${c.rank} — keep "${keep.title}" (${keep.id}), removed list entry for "${b.title}" (${b.id})`);
      fixed++;
    }
  }
})();

console.log(`\nDone. Removed ${fixed} duplicate list entries. Books themselves were not deleted.`);

import { fetchJson } from '../lib/http.js';

const BASE = 'https://api.nytimes.com/svc/books/v3';

// Hardcoded list slugs — /lists/names.json is unreliable on some API tiers
const LISTS = [
  { slug: 'hardcover-fiction',               name: 'Hardcover Fiction' },
  { slug: 'hardcover-nonfiction',            name: 'Hardcover Nonfiction' },
  { slug: 'paperback-trade-fiction',         name: 'Paperback Trade Fiction' },
  { slug: 'paperback-nonfiction',            name: 'Paperback Nonfiction' },
  { slug: 'young-adult-hardcover',           name: 'Young Adult Hardcover' },
  { slug: 'children-s-middle-grade-hardcover', name: "Children's Middle Grade" },
  { slug: 'advice-how-to-and-miscellaneous', name: 'Advice, How-To & Misc.' },
  { slug: 'graphic-books-and-manga',         name: 'Graphic Books & Manga' },
  { slug: 'business-books',                  name: 'Business Books' },
  { slug: 'audio-fiction',                   name: 'Audio Fiction' },
  { slug: 'audio-nonfiction',                name: 'Audio Nonfiction' },
];

function getKey() {
  const key = process.env.NYTIMES_API_KEY;
  if (!key) throw new Error('NYTIMES_API_KEY is not set');
  return key;
}

export async function scrapeNyTimes() {
  const key = getKey();
  const entries = [];

  for (const list of LISTS) {
    // NY Times free tier: ~10 req/min — wait 6.5s between requests
    await new Promise(r => setTimeout(r, 6500));
    try {
      const data = await fetchJson(
        `${BASE}/lists/current/${list.slug}.json?api-key=${key}`
      );
      for (const book of data.results?.books ?? []) {
        entries.push({
          title:     book.title,
          author:    book.author,
          isbn:      book.primary_isbn13 ?? null,
          rank:      book.rank,
          list_name: list.name,
          summary:   book.description ?? null,
          source:    'ny-times',
        });
      }
      console.log(`  NY Times ${list.name}: ${data.results?.books?.length ?? 0} books`);
    } catch (err) {
      console.warn(`  NY Times: skipping ${list.slug}: ${err.message}`);
    }
  }

  return entries;
}

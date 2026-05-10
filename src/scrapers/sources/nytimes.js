import { fetchJson } from '../lib/http.js';

const BASE = 'https://api.nytimes.com/svc/books/v3';

function getKey() {
  const key = process.env.NYTIMES_API_KEY;
  if (!key) throw new Error('NYTIMES_API_KEY is not set');
  return key;
}

/**
 * One call to /lists/overview.json returns ALL lists and ALL books.
 * Each book also has book_image (NYT cover CDN) and weeks_on_list.
 */
export async function scrapeNyTimes() {
  const data = await fetchJson(
    `${BASE}/lists/overview.json?api-key=${getKey()}`
  );

  if (data.status !== 'OK') {
    throw new Error(`NY Times API error: ${JSON.stringify(data.errors)}`);
  }

  const entries = [];

  for (const list of data.results?.lists ?? []) {
    for (const book of list.books ?? []) {
      entries.push({
        title:         book.title,
        author:        book.author,
        isbn:          book.primary_isbn13 ?? null,
        rank:          book.rank,
        list_name:     list.display_name,
        summary:       book.description ?? null,
        source:        'ny-times',
        // NYT-specific extras stored for enrichment
        coverImageUrl: book.book_image ?? null,
        weeksOnList:   book.weeks_on_list ?? null,
      });
    }
  }

  console.log(`  → ${data.results?.lists?.length ?? 0} lists, ${entries.length} entries`);
  return entries;
}

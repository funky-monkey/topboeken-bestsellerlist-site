import { fetchJson } from '../lib/http.js';

const BASE = 'https://api.nytimes.com/svc/books/v3';

function getKey() {
  const key = process.env.NYTIMES_API_KEY;
  if (!key) throw new Error('NYTIMES_API_KEY is not set');
  return key;
}

export async function scrapeNyTimes() {
  const key = getKey();
  const today = new Date().toISOString().slice(0, 10);

  const { results: lists } = await fetchJson(`${BASE}/lists/names.json?api-key=${key}`);
  const entries = [];

  for (const list of lists) {
    await new Promise(r => setTimeout(r, 6500));
    try {
      const data = await fetchJson(`${BASE}/lists/${today}/${list.list_name_encoded}.json?api-key=${key}`);
      for (const book of data.results?.books ?? []) {
        entries.push({
          title:     book.title,
          author:    book.author,
          isbn:      book.primary_isbn13 ?? null,
          rank:      book.rank,
          list_name: list.display_name,
          summary:   book.description ?? null,
          source:    'ny-times',
        });
      }
    } catch (err) {
      console.warn(`NY Times: skipping ${list.list_name_encoded}: ${err.message}`);
    }
  }

  return entries;
}

import { fetchJson } from './http.js';
import { RateLimiter } from './rate-limiter.js';

// Open Library: max 3 req/sec with identified User-Agent
const limiter = new RateLimiter(3);

const SEARCH_URL = 'https://openlibrary.org/search.json';

export async function lookupIsbn(title, author) {
  await limiter.wait();

  const params = new URLSearchParams({ title, author, limit: '1', fields: 'isbn,title,author_name,publisher,number_of_pages_median,language,first_sentence' });
  const data = await fetchJson(`${SEARCH_URL}?${params}`);

  const doc = data.docs?.[0];
  if (!doc) return null;

  const isbn13 = doc.isbn?.find(i => i.length === 13) ?? doc.isbn?.[0] ?? null;
  if (!isbn13) return null;

  return {
    isbn:      isbn13,
    title:     doc.title ?? title,
    author:    doc.author_name?.[0] ?? author,
    publisher: doc.publisher?.[0] ?? null,
    pages:     doc.number_of_pages_median ?? null,
    language:  doc.language?.[0] ?? null,
    summary:   doc.first_sentence?.value ?? doc.first_sentence ?? null,
    coverUrl:  null,
  };
}

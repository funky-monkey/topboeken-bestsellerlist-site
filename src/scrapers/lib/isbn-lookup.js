import { fetchJson } from './http.js';
import { RateLimiter } from './rate-limiter.js';

const limiter = new RateLimiter(3);
const SEARCH_URL  = 'https://openlibrary.org/search.json';
const GOOGLE_BASE = 'https://www.googleapis.com/books/v1/volumes';

async function lookupGoogleBooks(title, author) {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return null;
  try {
    const q    = encodeURIComponent(`${title} ${author}`);
    const data = await fetchJson(`${GOOGLE_BASE}?q=${q}&maxResults=1&key=${key}`);
    const info = data.items?.[0]?.volumeInfo;
    if (!info) return null;
    const isbn13 = info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier ?? null;
    if (!isbn13) return null;
    return {
      isbn:      isbn13,
      title:     info.title ?? title,
      author:    info.authors?.[0] ?? author,
      publisher: info.publisher ?? null,
      pages:     info.pageCount ?? null,
      language:  info.language ?? null,
      summary:   info.description ?? null,
      coverUrl:  info.imageLinks?.thumbnail?.replace('http:', 'https:') ?? null,
      coverId:   null,
      subjects:  info.categories ?? [],
    };
  } catch { return null; }
}

export async function lookupIsbn(title, author) {
  // Try Google Books first if key is available — better descriptions and genre coverage
  const google = await lookupGoogleBooks(title, author);
  if (google) return google;

  // Fall back to Open Library
  await limiter.wait();

  const params = new URLSearchParams({
    title, author, limit: '1',
    fields: 'isbn,title,author_name,publisher,number_of_pages_median,language,first_sentence,cover_i,subject',
  });
  const data = await fetchJson(`${SEARCH_URL}?${params}`);
  const doc  = data.docs?.[0];
  if (!doc) return null;

  const isbn13 = doc.isbn?.find(i => i.length === 13) ?? doc.isbn?.[0] ?? null;
  if (!isbn13) return null;

  const rawSentence = doc.first_sentence;
  const summary = typeof rawSentence === 'string'
    ? rawSentence
    : (typeof rawSentence?.value === 'string' ? rawSentence.value : null);

  return {
    isbn:      isbn13,
    title:     typeof doc.title === 'string' ? doc.title : title,
    author:    typeof doc.author_name?.[0] === 'string' ? doc.author_name[0] : author,
    publisher: typeof doc.publisher?.[0] === 'string' ? doc.publisher[0] : null,
    pages:     typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
    language:  typeof doc.language?.[0] === 'string' ? doc.language[0] : null,
    summary,
    coverUrl:  null,
    coverId:   typeof doc.cover_i === 'number' ? doc.cover_i : null,
    subjects:  Array.isArray(doc.subject) ? doc.subject.slice(0, 20) : [],
  };
}

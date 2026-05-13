import { fetchJson } from './http.js';
import { RateLimiter } from './rate-limiter.js';

const limiter = new RateLimiter(3);
const SEARCH_URL  = 'https://openlibrary.org/search.json';
const GOOGLE_BASE = 'https://www.googleapis.com/books/v1/volumes';

async function googleBooksSearch(q, lang) {
  const key  = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return null;
  try {
    const data = await fetchJson(
      `${GOOGLE_BASE}?q=${q}&maxResults=5&langRestrict=${lang}&orderBy=relevance&key=${key}`
    );
    return data.items?.find(i => {
      const info = i.volumeInfo;
      if (!info?.industryIdentifiers?.some(id => id.type === 'ISBN_13')) return false;
      // For Dutch: must be explicitly Dutch
      // For English: accept 'en' or undefined (trust langRestrict), reject non-Latin scripts
      if (lang === 'nl') return info.language === 'nl';
      if (lang === 'en') {
        const l = info.language;
        if (l && l !== 'en') return false;
        // Reject non-Latin descriptions (e.g. Tamil, Chinese)
        const desc = info.description ?? '';
        return !desc || /^[\x00-\x7FÀ-ɏ\s]+$/.test(desc.slice(0, 50));
      }
      return true;
    }) ?? null;
  } catch { return null; }
}

function highResCoverUrl(item) {
  const thumb = item?.volumeInfo?.imageLinks?.thumbnail;
  if (!thumb) return null;
  try {
    const u = new URL(thumb.replace('http:', 'https:'));
    u.searchParams.set('zoom', '0');
    u.searchParams.delete('edge');
    return u.toString();
  } catch {
    return thumb.replace('http:', 'https:').replace(/zoom=\d/, 'zoom=0').replace(/&edge=[^&]+/, '');
  }
}

function extractGoogleInfo(item, title, author) {
  const info   = item?.volumeInfo;
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
    coverUrl:  highResCoverUrl(item),
    coverId:   null,
    subjects:  info.categories ?? [],
    is_ebook:  item?.saleInfo?.isEbook === true ? 1 : 0,
  };
}

export async function lookupIsbn(title, author) {
  const key = process.env.GOOGLE_BOOKS_API_KEY;

  if (key) {
    const q = encodeURIComponent(`intitle:${title}+inauthor:${author}`);

    // 1. Try Dutch edition first — Dutch description is most valuable
    const nlItem = await googleBooksSearch(q, 'nl');
    const nlData = extractGoogleInfo(nlItem, title, author);
    if (nlData) {
      // Also try English for subjects/categories if Dutch edition lacks them
      const enItem = await googleBooksSearch(q, 'en');
      const enData = extractGoogleInfo(enItem, title, author);
      return {
        ...nlData,
        summary_nl: nlData.summary,   // Dutch description
        summary:    enData?.summary ?? null, // English description (may be null)
        subjects:   enData?.subjects?.length ? enData.subjects : nlData.subjects,
      };
    }

    // 2. No Dutch edition — use English edition, no Dutch description
    const enItem = await googleBooksSearch(q, 'en');
    const enData = extractGoogleInfo(enItem, title, author);
    if (enData) return { ...enData, summary_nl: null };
  }

  // 3. Fall back to Open Library
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
    isbn:       isbn13,
    title:      typeof doc.title === 'string' ? doc.title : title,
    author:     typeof doc.author_name?.[0] === 'string' ? doc.author_name[0] : author,
    publisher:  typeof doc.publisher?.[0] === 'string' ? doc.publisher[0] : null,
    pages:      typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
    language:   typeof doc.language?.[0] === 'string' ? doc.language[0] : null,
    summary,
    summary_nl: null,
    coverUrl:   null,
    coverId:    typeof doc.cover_i === 'number' ? doc.cover_i : null,
    subjects:   Array.isArray(doc.subject) ? doc.subject.slice(0, 20) : [],
    is_ebook:   0,
  };
}

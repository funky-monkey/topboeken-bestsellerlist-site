import { lookupIsbn } from './isbn-lookup.js';
import { downloadCover, downloadCoverFromUrl } from './cover-downloader.js';
import { bookSlug } from '../../lib/slugify.js';

export async function enrichBook({
  title, author,
  isbn: knownIsbn = null,
  summary: knownSummary = null,
  coverImageUrl = null,   // direct cover URL (e.g. from NYT)
  weeksOnList = null,     // NYT-specific, ignored for now
}) {
  let meta;

  if (knownIsbn) {
    meta = { isbn: knownIsbn, title, author, publisher: null, pages: null, language: null, summary: knownSummary, coverUrl: null, coverId: null };
  } else {
    meta = await lookupIsbn(title, author);
    if (!meta?.isbn) return null;
  }

  // If source provided a direct cover URL (NYT), download that first
  let cover_path = null;
  if (coverImageUrl) {
    cover_path = await downloadCoverFromUrl(meta.isbn, coverImageUrl);
  }
  if (!cover_path) {
    cover_path = await downloadCover(meta.isbn, meta.coverId ?? null);
  }

  return {
    isbn:             meta.isbn,
    title:            meta.title,
    author:           meta.author,
    publisher:        meta.publisher,
    pages:            meta.pages,
    language:         meta.language,
    summary:          meta.summary ?? knownSummary,
    cover_path:       cover_path ?? null,
    goodreads_rating: null,
    goodreads_count:  null,
    slug:             bookSlug(meta.isbn),
  };
}

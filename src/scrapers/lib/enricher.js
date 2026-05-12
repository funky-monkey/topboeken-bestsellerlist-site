import { lookupIsbn } from './isbn-lookup.js';
import { downloadCover, downloadCoverFromUrl } from './cover-downloader.js';
import { getWikipediaDescription } from './wikipedia-enrich.js';
import { mapSubjectsToGenres } from './genre-mapper.js';
import { bookSlug } from '../../lib/slugify.js';

export async function enrichBook({
  title, author,
  isbn: knownIsbn = null,
  summary: knownSummary = null,
  coverImageUrl = null,
  weeksOnList = null,
}) {
  let meta;

  if (knownIsbn) {
    meta = {
      isbn: knownIsbn, title, author,
      publisher: null, pages: null, language: null,
      summary: knownSummary, coverUrl: null, coverId: null, subjects: [],
    };
  } else {
    meta = await lookupIsbn(title, author);
    if (!meta?.isbn) return null;
  }

  // Cover: direct URL (e.g. NYT) → Open Library cover ID → Open Library by ISBN
  let cover_path = null;
  if (coverImageUrl) {
    cover_path = await downloadCoverFromUrl(meta.isbn, coverImageUrl);
  }
  if (!cover_path) {
    cover_path = await downloadCover(meta.isbn, meta.coverId ?? null);
  }

  // Summary: Open Library first_sentence → Wikipedia extract → null
  let summary = meta.summary ?? knownSummary ?? null;
  if (!summary) {
    summary = await getWikipediaDescription(meta.title, meta.author);
  }

  // Genres: map Open Library subjects to our taxonomy
  const genreSlugs = mapSubjectsToGenres(meta.subjects ?? []);

  return {
    isbn:             meta.isbn,
    title:            meta.title,
    author:           meta.author,
    publisher:        meta.publisher,
    pages:            meta.pages,
    language:         meta.language,
    summary,
    cover_path:       cover_path ?? null,
    goodreads_rating: null,
    goodreads_count:  null,
    slug:             bookSlug(meta.isbn),
    genreSlugs,       // passed through to upsert layer for book_genres
  };
}

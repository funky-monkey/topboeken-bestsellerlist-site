import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';

import { initSchema, getDb } from '../../src/db/db.js';
import { seedGenres, seedSources, seedAffiliates } from '../../src/db/seed.js';
import { upsertBook, upsertListEntry, upsertBookAffiliate } from '../../src/scrapers/upsert.js';

beforeAll(() => {
  initSchema();
  seedGenres();
  seedSources();
  seedAffiliates();
});

const BOOK = {
  isbn: '9780735211292', title: 'Atomic Habits', author: 'James Clear',
  publisher: 'Avery', pages: 320, language: 'en',
  summary: 'A framework for habits.', cover_path: 'covers/9780735211292.jpg',
  goodreads_rating: 4.9, goodreads_count: 80000, slug: 'boek-9780735211292',
};

describe('upsertBook', () => {
  it('inserts a new book and returns its id', () => {
    const id = upsertBook(BOOK);
    expect(typeof id).toBe('number');
    expect(getDb().prepare('SELECT title FROM books WHERE isbn = ?').get('9780735211292').title).toBe('Atomic Habits');
  });

  it('is idempotent — same id returned on re-insert', () => {
    const id1 = upsertBook(BOOK);
    const id2 = upsertBook(BOOK);
    expect(id1).toBe(id2);
  });

  it('updates title when changed', () => {
    upsertBook({ ...BOOK, title: 'Atomic Habits (Updated)' });
    expect(getDb().prepare('SELECT title FROM books WHERE isbn = ?').get('9780735211292').title).toBe('Atomic Habits (Updated)');
  });
});

describe('upsertListEntry', () => {
  it('inserts a list entry for a book', () => {
    const bookId = upsertBook(BOOK);
    upsertListEntry({ book_id: bookId, source_id: 1, genre_id: null, rank: 1, list_name: 'Fictie', week_date: '2026-05-10' });
    const count = getDb().prepare('SELECT COUNT(*) as c FROM list_entries WHERE book_id = ?').get(bookId).c;
    expect(count).toBeGreaterThan(0);
  });
});

describe('upsertBookAffiliate', () => {
  it('inserts affiliate link for bol-com', () => {
    const bookId = upsertBook(BOOK);
    upsertBookAffiliate({ book_id: bookId, affiliate_slug: 'bol-com', url: 'https://www.bol.com/nl/s/?searchtext=9780735211292' });
    const row = getDb().prepare('SELECT url FROM book_affiliates WHERE book_id = ?').get(bookId);
    expect(row.url).toContain('bol.com');
  });
});

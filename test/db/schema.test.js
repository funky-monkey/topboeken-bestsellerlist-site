import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';

import { initSchema, getDb } from '../../src/db/db.js';
import { seedGenres, seedSources, seedAffiliates } from '../../src/db/seed.js';

beforeAll(() => {
  initSchema();
  seedGenres();
  seedSources();
  seedAffiliates();
});

describe('schema tables', () => {
  it('creates all 8 tables', () => {
    const tables = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map(r => r.name);
    expect(tables).toContain('sources');
    expect(tables).toContain('genres');
    expect(tables).toContain('books');
    expect(tables).toContain('book_genres');
    expect(tables).toContain('list_entries');
    expect(tables).toContain('affiliates');
    expect(tables).toContain('book_affiliates');
    expect(tables).toContain('scrape_log');
  });
});

describe('seed data', () => {
  it('seeds 14 genres', () => {
    expect(getDb().prepare('SELECT COUNT(*) as c FROM genres').get().c).toBe(14);
  });

  it('seeds 8 sources', () => {
    expect(getDb().prepare('SELECT COUNT(*) as c FROM sources').get().c).toBe(8);
  });

  it('seeds 2 affiliates', () => {
    expect(getDb().prepare('SELECT COUNT(*) as c FROM affiliates').get().c).toBe(2);
  });

  it('all genres have unique slugs', () => {
    const slugs = getDb().prepare('SELECT slug FROM genres').all().map(r => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('foreign key enforcement', () => {
  it('rejects list_entry with invalid book_id', () => {
    expect(() => {
      getDb().prepare(`
        INSERT INTO list_entries (book_id, source_id, rank, list_name, week_date)
        VALUES (99999, 1, 1, 'Test', '2026-01-01')
      `).run();
    }).toThrow();
  });
});

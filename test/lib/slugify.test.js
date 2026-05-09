import { describe, it, expect } from 'vitest';
import { bookSlug, textSlug } from '../../src/lib/slugify.js';

describe('bookSlug', () => {
  it('prefixes isbn with boek-', () => {
    expect(bookSlug('9780735211292')).toBe('boek-9780735211292');
  });
  it('is stable — same isbn always produces same slug', () => {
    expect(bookSlug('9780441013593')).toBe(bookSlug('9780441013593'));
  });
});

describe('textSlug', () => {
  it('lowercases', () => {
    expect(textSlug('Fictie')).toBe('fictie');
  });
  it('replaces spaces with hyphens', () => {
    expect(textSlug('Science Fiction')).toBe('science-fiction');
  });
  it('removes special characters', () => {
    expect(textSlug('Non-fictie!')).toBe('non-fictie');
  });
  it('strips leading and trailing hyphens', () => {
    expect(textSlug('  hello  ')).toBe('hello');
  });
});

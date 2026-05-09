import { getDb } from './db.js';

export function seedGenres() {
  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO genres (name_nl, slug) VALUES (?, ?)');
  const genres = [
    ['Fictie',          'fictie'],
    ['Non-fictie',      'non-fictie'],
    ['Thriller',        'thriller'],
    ['Fantasy',         'fantasy'],
    ['Science Fiction', 'science-fiction'],
    ['Romance',         'romance'],
    ['Biografie',       'biografie'],
    ['Kinderen',        'kinderen'],
    ['Young Adult',     'young-adult'],
    ['Horror',          'horror'],
    ['Zelfhulp',        'zelfhulp'],
    ['Kookboeken',      'kookboeken'],
    ['Business',        'business'],
    ['Comics',          'comics'],
  ];
  db.transaction((rows) => rows.forEach(r => insert.run(...r)))(genres);
}

export function seedSources() {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO sources (name, slug, country, accent_color, url, scrape_config)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const sources = [
    ['Besteller 60',      'besteller-60',      'NL',  '#3b82f6', 'https://www.cpnb.nl',                                       JSON.stringify({ method: 'cheerio' })],
    ['NY Times',          'ny-times',           'US',  '#e8b84b', 'https://www.nytimes.com/books/best-sellers/',               JSON.stringify({ method: 'api' })],
    ['bol.com',           'bol-com',            'NL',  '#10b981', 'https://www.bol.com',                                       JSON.stringify({ method: 'scrape-playwright' })],
    ['Amazon NL',         'amazon-nl',          'NL',  '#ff9900', 'https://www.amazon.nl/gp/bestsellers/books',                JSON.stringify({ method: 'scrape-playwright' })],
    ['Goodreads',         'goodreads',          'US',  '#f97316', 'https://www.goodreads.com/shelf/show/current-bestsellers',  JSON.stringify({ method: 'cheerio' })],
    ['Publishers Weekly', 'publishers-weekly',  'US',  '#8b5cf6', 'https://www.publishersweekly.com',                         JSON.stringify({ method: 'rss' })],
    ['Wikipedia',         'wikipedia',          'INT', '#64748b', 'https://en.wikipedia.org/wiki/List_of_best-selling_books',  JSON.stringify({ method: 'api' })],
    ['Barnes & Noble',    'barnes-noble',       'US',  '#dc2626', 'https://www.barnesandnoble.com',                            JSON.stringify({ method: 'cheerio' })],
  ];
  db.transaction((rows) => rows.forEach(r => insert.run(...r)))(sources);
}

export function seedAffiliates() {
  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO affiliates (name, slug, country) VALUES (?, ?, ?)');
  const affiliates = [
    ['bol.com',   'bol-com',   'NL'],
    ['Amazon NL', 'amazon-nl', 'NL'],
  ];
  db.transaction((rows) => rows.forEach(r => insert.run(...r)))(affiliates);
}

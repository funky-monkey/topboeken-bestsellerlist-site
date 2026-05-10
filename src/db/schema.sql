CREATE TABLE IF NOT EXISTS sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  slug          TEXT    NOT NULL UNIQUE,
  country       TEXT    NOT NULL,
  accent_color  TEXT    NOT NULL DEFAULT '#3b82f6',
  url           TEXT    NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  scrape_config TEXT
);

CREATE TABLE IF NOT EXISTS genres (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name_nl TEXT NOT NULL,
  slug    TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS books (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn             TEXT    NOT NULL UNIQUE,
  title            TEXT    NOT NULL,
  author           TEXT    NOT NULL,
  publisher        TEXT,
  pages            INTEGER,
  language         TEXT,
  summary          TEXT,
  cover_path       TEXT,
  goodreads_rating REAL,
  goodreads_count  INTEGER,
  slug             TEXT    NOT NULL UNIQUE,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS book_genres (
  book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, genre_id)
);

CREATE TABLE IF NOT EXISTS list_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  source_id  INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  genre_id   INTEGER REFERENCES genres(id),
  rank       INTEGER NOT NULL,
  list_name  TEXT    NOT NULL,
  week_date  TEXT    NOT NULL,
  scraped_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(book_id, source_id, list_name, week_date)
);

CREATE TABLE IF NOT EXISTS affiliates (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  slug     TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  country  TEXT NOT NULL DEFAULT 'NL',
  active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS book_affiliates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id      INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  affiliate_id INTEGER NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  url          TEXT    NOT NULL,
  price        REAL,
  currency     TEXT    NOT NULL DEFAULT 'EUR',
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(book_id, affiliate_id)
);

CREATE TABLE IF NOT EXISTS scrape_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER REFERENCES sources(id),
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  books_added   INTEGER NOT NULL DEFAULT 0,
  books_updated INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'running',
  error_msg     TEXT
);

CREATE INDEX IF NOT EXISTS idx_list_entries_source ON list_entries(source_id, week_date);
CREATE INDEX IF NOT EXISTS idx_list_entries_book   ON list_entries(book_id);
CREATE INDEX IF NOT EXISTS idx_list_entries_genre  ON list_entries(genre_id);
CREATE INDEX IF NOT EXISTS idx_book_affiliates_book ON book_affiliates(book_id);
CREATE INDEX IF NOT EXISTS idx_books_slug           ON books(slug);

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(__dirname, '../../data/topboeken.sqlite');

let _db = null;

export function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

const MIGRATIONS = [
  "ALTER TABLE articles ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'",
  "ALTER TABLE articles ADD COLUMN scheduled_for TEXT",
  "ALTER TABLE books ADD COLUMN locked INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE books ADD COLUMN is_ebook INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE books ADD COLUMN deleted  INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE authors ADD COLUMN ol_key TEXT",
];

export function initSchema() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const db = getDb();
  db.exec(sql);
  for (const m of MIGRATIONS) {
    try { db.exec(m); } catch { /* column already exists */ }
  }
}

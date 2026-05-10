import { Router } from 'express';
import multer from 'multer';
import { join } from 'node:path';
import { getDb } from '../../src/db/db.js';
import { layout } from '../views/layout.js';

const COVERS_DIR = process.env.COVERS_DIR ?? '/var/www/top-boeken.nl/html/covers';

const upload = multer({
  storage: multer.diskStorage({
    destination: COVERS_DIR,
    filename: (req, file, cb) => {
      const book = getDb().prepare('SELECT isbn FROM books WHERE id = ?').get(req.params.id);
      cb(null, `${book?.isbn ?? req.params.id}.jpg`);
    },
  }),
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.get('/books', (req, res) => {
  const q     = req.query.q ?? '';
  const db    = getDb();
  const books = q
    ? db.prepare('SELECT * FROM books WHERE title LIKE ? OR author LIKE ? ORDER BY updated_at DESC LIMIT 100').all(`%${q}%`, `%${q}%`)
    : db.prepare('SELECT * FROM books ORDER BY updated_at DESC LIMIT 100').all();

  const rows = books.map(b => `
    <tr>
      <td>${b.cover_path ? `<img src="/${b.cover_path}" width="32" height="46" style="object-fit:cover;vertical-align:middle" onerror="this.style.display='none'">` : ''} &nbsp;${b.title}</td>
      <td>${b.author}</td>
      <td>${b.isbn}</td>
      <td>${b.updated_at?.slice(0, 10) ?? ''}</td>
      <td><a href="/admin/books/${b.id}" class="btn btn-primary" style="padding:4px 10px;font-size:12px">Bewerk</a></td>
    </tr>`).join('');

  res.send(layout('Boeken', `
    <h1>Boeken</h1>
    <form method="get" style="margin-bottom:20px;display:flex;gap:8px">
      <input name="q" value="${q}" placeholder="Zoek op titel of auteur…" style="width:320px;margin-bottom:0">
      <button class="btn btn-primary" type="submit">Zoeken</button>
    </form>
    <table>
      <thead><tr><th>Titel</th><th>Auteur</th><th>ISBN</th><th>Bijgewerkt</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="color:#aaa">Geen boeken gevonden</td></tr>'}</tbody>
    </table>
  `));
});

router.get('/books/:id', (req, res) => {
  const db  = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).send('Boek niet gevonden');

  const genres     = db.prepare('SELECT * FROM genres ORDER BY name_nl').all();
  const bookGenres = db.prepare('SELECT g.* FROM book_genres bg JOIN genres g ON g.id=bg.genre_id WHERE bg.book_id=?').all(book.id);
  const activeSlugs = bookGenres.map(g => g.slug);

  const checkboxes = genres.map(g => `
    <label style="display:inline-flex;align-items:center;gap:6px;margin-right:16px;font-weight:400">
      <input type="checkbox" name="genres" value="${g.id}" ${activeSlugs.includes(g.slug) ? 'checked' : ''}> ${g.name_nl}
    </label>`).join('');

  const flash = req.query.saved ? '<div class="flash flash-ok">Wijzigingen opgeslagen.</div>' : '';
  const coverPreview = book.cover_path
    ? `<img src="/${book.cover_path}" style="height:120px;object-fit:cover;display:block;margin-bottom:8px">`
    : '<p style="color:#aaa;font-size:13px;margin-bottom:8px">Geen cover</p>';

  res.send(layout(`Bewerk — ${book.title}`, `
    <h1>Boek bewerken</h1>
    ${flash}
    <form method="post" action="/admin/books/${book.id}" enctype="multipart/form-data" style="max-width:640px">
      <label>Titel</label><input type="text" name="title" value="${book.title}">
      <label>Auteur</label><input type="text" name="author" value="${book.author}">
      <label>Samenvatting</label><textarea name="summary" rows="5">${book.summary ?? ''}</textarea>
      <label>Cover</label>
      ${coverPreview}
      <input type="file" name="cover" accept="image/*" style="margin-bottom:12px">
      <p style="font-size:12px;color:#888;margin-bottom:12px">Upload een nieuw omslagfoto (JPG/PNG, max 5MB). Laat leeg om de huidige te behouden.</p>
      <label style="margin-bottom:8px">Genres</label>
      <div style="margin-bottom:16px">${checkboxes}</div>
      <button class="btn btn-primary" type="submit">Opslaan</button>
      &nbsp;<a href="/admin/books" class="btn" style="background:#eee;color:#333">Annuleren</a>
    </form>
  `));
});

router.post('/books/:id', upload.single('cover'), (req, res) => {
  const db = getDb();
  const { title, author, summary, genres } = req.body;
  const id = parseInt(req.params.id, 10);

  const book = db.prepare('SELECT isbn, cover_path FROM books WHERE id = ?').get(id);
  const newCoverPath = req.file
    ? `covers/${book.isbn}.jpg`
    : (book.cover_path || null);

  db.prepare("UPDATE books SET title=?, author=?, summary=?, cover_path=?, updated_at=datetime('now') WHERE id=?")
    .run(title, author, summary || null, newCoverPath, id);

  db.prepare('DELETE FROM book_genres WHERE book_id=?').run(id);
  const insertGenre = db.prepare('INSERT OR IGNORE INTO book_genres (book_id, genre_id) VALUES (?,?)');
  const ids = Array.isArray(genres) ? genres : genres ? [genres] : [];
  db.transaction(() => ids.forEach(gid => insertGenre.run(id, parseInt(gid, 10))))();

  res.redirect(`/admin/books/${id}?saved=1`);
});

export default router;

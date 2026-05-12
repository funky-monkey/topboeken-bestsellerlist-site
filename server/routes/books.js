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

const PER_PAGE = 25;
const router = Router();

router.get('/books', (req, res) => {
  const q    = req.query.q ?? '';
  const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const offset = (page - 1) * PER_PAGE;
  const db   = getDb();

  const where = q ? 'WHERE title LIKE ? OR author LIKE ?' : '';
  const args  = q ? [`%${q}%`, `%${q}%`] : [];

  const siteUrl    = process.env.SITE_URL ?? 'https://top-boeken.nl';
  const total      = db.prepare(`SELECT COUNT(*) as c FROM books ${where}`).get(...args).c;
  const books      = db.prepare(`SELECT * FROM books ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(...args, PER_PAGE, offset);
  const totalPages = Math.ceil(total / PER_PAGE);

  const rows = books.map(b => `
    <tr>
      <td>${b.cover_path ? `<img src="/${b.cover_path}" width="32" height="46" style="object-fit:contain;vertical-align:middle;background:#f5f4f1" onerror="this.style.display='none'">` : ''}&nbsp;${b.title}</td>
      <td>${b.author}</td>
      <td style="font-size:12px;color:#888">${b.isbn}</td>
      <td style="font-size:12px;color:#888">${b.updated_at?.slice(0, 10) ?? ''}</td>
      <td style="white-space:nowrap">
        <a href="/admin/books/${b.id}" class="btn btn-primary" style="padding:4px 10px;font-size:12px">Bewerk</a>
        &nbsp;<a href="${siteUrl}/boeken/${b.slug}" target="_blank" class="btn" style="padding:4px 10px;font-size:12px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0">👁</a>
      </td>
    </tr>`).join('');

  function pageUrl(p) {
    const params = new URLSearchParams({ ...(q ? { q } : {}), page: p });
    return `/admin/books?${params}`;
  }

  function pageBtn(p, label, disabled = false, active = false) {
    if (disabled) return `<span class="page-btn page-btn-disabled">${label}</span>`;
    return `<a href="${pageUrl(p)}" class="page-btn${active ? ' page-btn-active' : ''}">${label}</a>`;
  }

  // Build page number buttons — show at most 7 around current page
  const pageNums = [];
  const delta = 3;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - delta && p <= page + delta)) {
      pageNums.push(p);
    }
  }
  // Insert ellipsis markers
  const pageBtns = [];
  let prev = 0;
  for (const p of pageNums) {
    if (prev && p - prev > 1) pageBtns.push(`<span class="page-ellipsis">…</span>`);
    pageBtns.push(pageBtn(p, p, false, p === page));
    prev = p;
  }

  const pagination = totalPages > 1 ? `
    <div class="pagination">
      ${pageBtn(page - 1, '← Vorige', page === 1)}
      ${pageBtns.join('')}
      ${pageBtn(page + 1, 'Volgende →', page === totalPages)}
    </div>` : '';

  res.send(layout('Boeken', `
    <h1>Boeken</h1>
    <form method="get" style="margin-bottom:20px;display:flex;gap:8px;align-items:center">
      <input name="q" value="${q}" placeholder="Zoek op titel of auteur…" style="width:320px;margin-bottom:0">
      <button class="btn btn-primary" type="submit">Zoeken</button>
      <span style="color:#888;font-size:13px;margin-left:8px">${total} boeken${q ? ` voor "${q}"` : ''}</span>
    </form>
    <table>
      <thead><tr><th>Titel</th><th>Auteur</th><th>ISBN</th><th>Bijgewerkt</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="color:#aaa">Geen boeken gevonden</td></tr>'}</tbody>
    </table>
    ${pagination}
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

  const siteUrl = process.env.SITE_URL ?? 'https://top-boeken.nl';
  const flash = req.query.saved
    ? `<div class="flash flash-ok">Wijzigingen opgeslagen. <a href="${siteUrl}/boeken/${book.slug}" target="_blank" style="font-weight:700;color:#166534;text-decoration:underline">Bekijk op site →</a></div>`
    : '';
  const currentCover = book.cover_path
    ? `<img id="cover-preview" src="/${book.cover_path}" style="height:160px;object-fit:contain;display:block;margin-bottom:8px;background:#f5f4f1;padding:4px">`
    : `<div id="cover-preview" style="height:160px;width:112px;background:#f5f4f1;display:flex;align-items:center;justify-content:center;font-size:12px;color:#aaa;margin-bottom:8px">Geen cover</div>`;

  res.send(layout(`Bewerk — ${book.title}`, `
    <h1>Boek bewerken</h1>
    ${flash}
    <form method="post" action="/admin/books/${book.id}" enctype="multipart/form-data" style="max-width:640px">
      <label>Titel</label><input type="text" name="title" value="${book.title}">
      <label>Auteur</label><input type="text" name="author" value="${book.author}">
      <label>Samenvatting</label><textarea name="summary" rows="5">${book.summary ?? ''}</textarea>
      <label>Cover</label>
      ${currentCover}
      <input type="file" name="cover" accept="image/*" style="margin-bottom:8px" id="cover-input">
      <p style="font-size:12px;color:#888;margin-bottom:12px">Upload een nieuw omslagfoto (JPG/PNG, max 5MB). Laat leeg om de huidige te behouden.</p>
      <script>
        document.getElementById('cover-input').addEventListener('change', function() {
          const file = this.files[0];
          if (!file) return;
          const preview = document.getElementById('cover-preview');
          const url = URL.createObjectURL(file);
          preview.outerHTML = '<img id="cover-preview" src="' + url + '" style="height:160px;object-fit:contain;display:block;margin-bottom:8px;background:#f5f4f1;padding:4px">';
        });
      </script>
      <label style="margin-bottom:8px">Genres</label>
      <div style="margin-bottom:16px">${checkboxes}</div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary" type="submit">Opslaan</button>
        <a href="/admin/books" class="btn" style="background:#eee;color:#333">Annuleren</a>
        <a href="${siteUrl}/boeken/${book.slug}" target="_blank" class="btn" style="background:#f0fdf4;color:#166534;border:1.5px solid #bbf7d0;margin-left:auto">👁 Bekijk op site →</a>
      </div>
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

import { Router } from 'express';
import multer from 'multer';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
  const q            = req.query.q ?? '';
  const noCover      = req.query.no_cover === '1';
  const langFilter   = req.query.lang ?? '';
  const lockedOnly   = req.query.locked === '1';
  const deletedOnly  = req.query.deleted === '1';
  const page         = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const deletedFlash = req.query.deleted_flash === '1';
  const sortCol      = ['title','author','language','updated_at'].includes(req.query.sort) ? req.query.sort : 'updated_at';
  const sortDir      = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const offset     = (page - 1) * PER_PAGE;
  const db         = getDb();

  const conditions = [];
  const args = [];
  if (q)           { conditions.push('(title LIKE ? OR author LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  if (noCover)     { conditions.push("(cover_path IS NULL OR cover_path = '')"); }
  if (lockedOnly)  { conditions.push('locked = 1'); }
  if (deletedOnly) { conditions.push('deleted = 1'); }
  else             { conditions.push('deleted = 0'); } // hide deleted by default
  if (langFilter === 'nl')   { conditions.push("summary_nl IS NOT NULL AND summary_nl != ''"); }
  if (langFilter === 'en')   { conditions.push("summary IS NOT NULL AND summary != '' AND (summary_nl IS NULL OR summary_nl = '')"); }
  if (langFilter === 'none') { conditions.push("(summary IS NULL OR summary = '') AND (summary_nl IS NULL OR summary_nl = '')"); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const siteUrl  = process.env.SITE_URL ?? 'https://top-boeken.nl';
  const total    = db.prepare(`SELECT COUNT(*) as c FROM books ${where}`).get(...args).c;
  const books    = db.prepare(`SELECT * FROM books ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`).all(...args, PER_PAGE, offset);

  const bookIds = books.map(b => b.id);
  const sourcesMap = {};
  if (bookIds.length) {
    db.prepare(`
      SELECT le.book_id, s.name, s.accent_color
      FROM list_entries le JOIN sources s ON s.id = le.source_id
      WHERE le.book_id IN (${bookIds.map(() => '?').join(',')})
      GROUP BY le.book_id, s.id
    `).all(...bookIds).forEach(r => {
      if (!sourcesMap[r.book_id]) sourcesMap[r.book_id] = [];
      sourcesMap[r.book_id].push(r);
    });
  }
  const totalPages = Math.ceil(total / PER_PAGE);

  const counts = {
    noCover:  db.prepare("SELECT COUNT(*) as c FROM books WHERE (cover_path IS NULL OR cover_path = '') AND deleted = 0").get().c,
    nl:       db.prepare("SELECT COUNT(*) as c FROM books WHERE summary_nl IS NOT NULL AND summary_nl != '' AND deleted = 0").get().c,
    en:       db.prepare("SELECT COUNT(*) as c FROM books WHERE summary IS NOT NULL AND summary != '' AND (summary_nl IS NULL OR summary_nl = '') AND deleted = 0").get().c,
    none:     db.prepare("SELECT COUNT(*) as c FROM books WHERE (summary IS NULL OR summary = '') AND (summary_nl IS NULL OR summary_nl = '') AND deleted = 0").get().c,
    locked:   db.prepare('SELECT COUNT(*) as c FROM books WHERE locked = 1 AND deleted = 0').get().c,
    deleted:  db.prepare('SELECT COUNT(*) as c FROM books WHERE deleted = 1').get().c,
  };

  const rows = books.map(b => {
    const sources = sourcesMap[b.id] ?? [];
    const sourceBadges = sources.map(s =>
      `<span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700;color:#fff;background:${s.accent_color};margin-right:3px;white-space:nowrap">${s.name}</span>`
    ).join('');

    const langBadge = b.summary_nl
      ? `<span title="Nederlandse omschrijving" style="font-size:11px;padding:1px 5px;background:#dcfce7;color:#166534;border-radius:3px;font-weight:700">NL</span>`
      : b.summary
        ? `<span title="Alleen Engelse omschrijving" style="font-size:11px;padding:1px 5px;background:#fef9c3;color:#854d0e;border-radius:3px;font-weight:700">EN</span>`
        : `<span title="Geen omschrijving" style="font-size:11px;padding:1px 5px;background:#f3f4f6;color:#9ca3af;border-radius:3px;font-weight:700">—</span>`;

    const lockBadge    = b.locked  ? `<span title="Vergrendeld" style="font-size:12px">🔒</span>` : '';
    const deletedBadge = b.deleted ? `<span title="Verwijderd" style="font-size:11px;padding:1px 5px;background:#fef2f2;color:#991b1b;border-radius:3px;font-weight:700">DEL</span>` : '';

    return `
    <tr>
      <td>
        ${b.cover_path ? `<img src="/${b.cover_path}" width="28" height="40" style="object-fit:contain;vertical-align:middle;background:#f5f4f1;margin-right:6px" onerror="this.style.display='none'">` : '<span style="display:inline-block;width:28px;margin-right:6px"></span>'}${b.title}
      </td>
      <td style="font-size:13px;color:#555">${b.author}</td>
      <td style="white-space:nowrap">${langBadge} ${lockBadge} ${deletedBadge}</td>
      <td>${sourceBadges || '<span style="color:#ccc;font-size:12px">—</span>'}</td>
      <td style="font-size:12px;color:#888">${b.updated_at?.slice(0, 10) ?? ''}</td>
      <td style="white-space:nowrap">
        <a href="/admin/books/${b.id}" class="btn btn-primary" style="padding:4px 10px;font-size:12px">Bewerk</a>
        &nbsp;<a href="${siteUrl}/boeken/${b.slug}" target="_blank" class="btn" style="padding:4px 10px;font-size:12px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0">👁</a>
        ${b.deleted
          ? `&nbsp;<form method="post" action="/admin/books/${b.id}/restore" style="display:inline;margin:0"><button class="btn" style="padding:4px 10px;font-size:12px;color:#166534;border-color:#bbf7d0" type="submit">↩</button></form>`
          : `&nbsp;<form method="post" action="/admin/books/${b.id}/delete" style="display:inline;margin:0" onsubmit="return confirm('${b.title.replace(/'/g, "\\'")} verwijderen?')"><button class="btn" style="padding:4px 10px;font-size:12px;color:#dc2626;border-color:#fecaca" type="submit">🗑</button></form>`
        }
      </td>
    </tr>`;
  }).join('');

  function activeFilters() {
    return { ...(q ? { q } : {}), ...(noCover ? { no_cover: '1' } : {}), ...(langFilter ? { lang: langFilter } : {}), ...(lockedOnly ? { locked: '1' } : {}), ...(deletedOnly ? { deleted: '1' } : {}) };
  }

  function sortUrl(col) {
    const dir = sortCol === col && sortDir === 'DESC' ? 'asc' : 'desc';
    return `/admin/books?${new URLSearchParams({ ...activeFilters(), sort: col, dir })}`;
  }

  function sortTh(label, col) {
    const active = sortCol === col;
    const arrow  = active ? (sortDir === 'DESC' ? ' ↓' : ' ↑') : '';
    return `<th><a href="${sortUrl(col)}" style="color:${active ? '#232323' : '#aaa'};text-decoration:none;font-weight:${active ? '700' : '600'}">${label}${arrow}</a></th>`;
  }

  function pageUrl(p) {
    return `/admin/books?${new URLSearchParams({ ...activeFilters(), sort: sortCol, dir: sortDir.toLowerCase(), page: p })}`;
  }

  function pageBtn(p, label, disabled = false, active = false) {
    if (disabled) return `<span class="page-btn page-btn-disabled">${label}</span>`;
    return `<a href="${pageUrl(p)}" class="page-btn${active ? ' page-btn-active' : ''}">${label}</a>`;
  }

  const pageNums = [];
  const delta = 3;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - delta && p <= page + delta)) pageNums.push(p);
  }
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

  function filterBtn(label, params, active) {
    const url = `/admin/books?${new URLSearchParams({ ...(q ? { q } : {}), ...params })}`;
    return active
      ? `<a href="/admin/books${q ? `?q=${encodeURIComponent(q)}` : ''}" class="btn" style="background:#232323;color:#fff">${label}</a>`
      : `<a href="${url}" class="btn" style="background:#f5f5f5;color:#555">${label}</a>`;
  }

  res.send(layout('Boeken', `
    <h1>Boeken</h1>
    ${deletedFlash ? `<div class="flash flash-ok">Boek gemarkeerd als verwijderd. <a href="/admin/books?deleted=1">Bekijk verwijderde boeken →</a></div>` : ''}
    <form method="get" style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input name="q" value="${q}" placeholder="Zoek op titel of auteur…" style="width:300px;margin-bottom:0">
      <button class="btn btn-primary" type="submit">Zoeken</button>
      <span style="color:#888;font-size:13px;margin-left:4px">${total} boeken${q ? ` voor "${q}"` : ''}</span>
    </form>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px">
      ${filterBtn('Zonder cover (' + counts.noCover + ')', { no_cover: '1' }, noCover)}
      ${filterBtn('🇳🇱 Nederlands (' + counts.nl + ')', { lang: 'nl' }, langFilter === 'nl')}
      ${filterBtn('🇬🇧 Alleen Engels (' + counts.en + ')', { lang: 'en' }, langFilter === 'en')}
      ${filterBtn('Geen tekst (' + counts.none + ')', { lang: 'none' }, langFilter === 'none')}
      ${filterBtn('🔒 Vergrendeld (' + counts.locked + ')', { locked: '1' }, lockedOnly)}
      ${filterBtn('🗑 Verwijderd (' + counts.deleted + ')', { deleted: '1' }, deletedOnly)}
    </div>
    <table>
      <thead><tr>${sortTh('Titel','title')}${sortTh('Auteur','author')}<th>Taal</th><th>Bronnen</th>${sortTh('Bijgewerkt','updated_at')}<th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="color:#aaa">Geen boeken gevonden</td></tr>'}</tbody>
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
  const flash = book.deleted
    ? `<div class="flash flash-err" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">
        🗑 Dit boek is verwijderd en niet zichtbaar op de site. De scraper slaat het over.
        <form method="post" action="/admin/books/${book.id}/restore" style="display:inline;margin:0">
          <button class="btn" style="padding:2px 10px;font-size:12px;margin-left:12px">↩ Herstel</button>
        </form>
       </div>`
    : req.query.saved
    ? `<div class="flash flash-ok">Wijzigingen opgeslagen. <a href="${siteUrl}/boeken/${book.slug}" target="_blank" style="font-weight:700;color:#166534;text-decoration:underline">Bekijk op site →</a></div>`
    : req.query.error
    ? `<div class="flash flash-err">${req.query.error}</div>`
    : '';
  const coverImg = book.cover_path
    ? `<img src="/${book.cover_path}" style="width:100%;object-fit:contain;display:block;background:#f5f4f1;padding:4px">`
    : `<div style="width:100%;aspect-ratio:7/10;background:#f5f4f1;display:flex;align-items:center;justify-content:center;font-size:12px;color:#aaa">Geen cover</div>`;

  res.send(layout(`Bewerk — ${book.title}`, `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h1 style="margin:0">Boek bewerken</h1>
      <a href="/admin/books" class="btn" style="background:#eee;color:#333">← Terug</a>
    </div>
    ${flash}
    <form method="post" action="/admin/books/${book.id}" enctype="multipart/form-data">
      <div style="display:grid;grid-template-columns:1fr 280px;gap:32px;align-items:start">

        <!-- LEFT: text fields -->
        <div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
            <div><label>Titel</label><input type="text" name="title" value="${book.title}" style="width:100%"></div>
            <div><label>Auteur</label><input type="text" name="author" value="${book.author}" style="width:100%"></div>
            <div><label>ISBN</label><input type="text" name="isbn" value="${book.isbn ?? ''}" style="width:100%"></div>
            <div><label>Uitgever</label><input type="text" name="publisher" value="${book.publisher ?? ''}" style="width:100%"></div>
            <div><label>Pagina's</label><input type="number" name="pages" value="${book.pages ?? ''}" style="width:100%"></div>
            <div><label>Taal</label><input type="text" name="language" value="${book.language ?? ''}" placeholder="nl, en…" style="width:100%"></div>
            <div><label>Goodreads rating</label><input type="number" name="goodreads_rating" step="0.01" min="0" max="5" value="${book.goodreads_rating ?? ''}" style="width:100%"></div>
            <div><label>Goodreads stemmen</label><input type="number" name="goodreads_count" value="${book.goodreads_count ?? ''}" style="width:100%"></div>
          </div>
          <label>Engelse omschrijving</label>
          <textarea name="summary" rows="5">${book.summary ?? ''}</textarea>
          <label>Nederlandse omschrijving</label>
          <textarea name="summary_nl" rows="5">${book.summary_nl ?? ''}</textarea>
        </div>

        <!-- RIGHT: cover + genres + actions -->
        <div>
          <label>Cover</label>
          <div id="cover-preview-wrap" style="margin-bottom:8px;background:#f5f4f1">
            ${coverImg}
          </div>
          <button type="button" id="redownload-btn" class="btn" style="width:100%;font-size:12px;margin-bottom:12px">
            🔄 Opnieuw ophalen
          </button>

          <label style="margin-bottom:4px">Bestand uploaden</label>
          <input type="file" name="cover" accept="image/*" id="cover-input" style="margin-bottom:8px">

          <label style="margin-bottom:4px">Of: URL</label>
          <div style="display:flex;gap:6px;margin-bottom:4px">
            <input type="text" name="cover_url" id="cover-url-input" placeholder="https://…" style="margin-bottom:0;flex:1;min-width:0">
            <button type="button" onclick="previewUrl()" class="btn" style="background:#eee;color:#333;white-space:nowrap;padding:6px 10px">👁</button>
          </div>
          <p style="font-size:11px;color:#aaa;margin-bottom:16px">Upload heeft voorrang op URL.</p>

          <label style="margin-bottom:8px">Genres</label>
          <div style="margin-bottom:16px;display:flex;flex-direction:column;gap:4px">
            ${genres.map(g => `
              <label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:13px;cursor:pointer">
                <input type="checkbox" name="genres" value="${g.id}" ${activeSlugs.includes(g.slug) ? 'checked' : ''}> ${g.name_nl}
              </label>`).join('')}
          </div>

          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-primary" type="submit" style="width:100%">Opslaan</button>
            <div style="display:flex;gap:8px">
              <label style="display:flex;align-items:center;gap:5px;margin:0;cursor:pointer;font-weight:400;font-size:13px">
                <input type="checkbox" name="locked" value="1" ${book.locked ? 'checked' : ''}> 🔒 Vergrendeld
              </label>
              <label style="display:flex;align-items:center;gap:5px;margin:0;cursor:pointer;font-weight:400;font-size:13px">
                <input type="checkbox" name="is_ebook" value="1" ${book.is_ebook ? 'checked' : ''}> 📱 E-book
              </label>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <a href="/admin/books/${book.id}/merge" class="btn" style="font-size:12px;background:#fefce8;color:#854d0e;border-color:#fde68a">⇄ Samenvoegen</a>
              <button type="button" id="delete-btn" class="btn" style="font-size:12px;${book.deleted ? 'background:#dcfce7;color:#166534;border-color:#bbf7d0' : 'color:#dc2626;border-color:#fecaca'}">
                ${book.deleted ? '↩ Herstel' : '🗑 Verwijder'}
              </button>
              <a href="${siteUrl}/boeken/${book.slug}" target="_blank" class="btn" style="font-size:12px;background:#f0fdf4;color:#166534;border-color:#bbf7d0">👁 Site</a>
            </div>
          </div>
        </div>
      </div>

      <script>
        document.getElementById('cover-input').addEventListener('change', function() {
          if (this.files[0]) {
            setPreview(URL.createObjectURL(this.files[0]));
            document.getElementById('cover-url-input').value = '';
          }
        });
        function previewUrl() {
          const url = document.getElementById('cover-url-input').value.trim();
          if (url) setPreview(url);
        }
        document.getElementById('cover-url-input').addEventListener('keydown', function(e) {
          if (e.key === 'Enter') { e.preventDefault(); previewUrl(); }
        });
        function setPreview(src) {
          document.getElementById('cover-preview-wrap').innerHTML =
            '<img src="' + src + '" style="width:100%;object-fit:contain;display:block;background:#f5f4f1;padding:4px" onerror="this.style.outline=\'2px solid red\'">';
        }
        document.getElementById('redownload-btn').addEventListener('click', async function() {
          this.disabled = true; this.textContent = '⏳ Bezig…';
          const r = await fetch('/admin/books/${book.id}/redownload-cover', { method: 'POST' }).catch(() => null);
          if (r?.ok) location.reload(); else { this.disabled = false; this.textContent = '🔄 Opnieuw ophalen'; }
        });
        document.getElementById('delete-btn').addEventListener('click', async function() {
          const isDel = ${book.deleted ? 'true' : 'false'};
          const msg = isDel ? 'Boek herstellen?' : '${book.title.replace(/'/g, "\\'")} verwijderen?';
          if (!confirm(msg)) return;
          const url = isDel ? '/admin/books/${book.id}/restore' : '/admin/books/${book.id}/delete';
          const r = await fetch(url, { method: 'POST' }).catch(() => null);
          if (r) location.href = r.url || '/admin/books/${book.id}';
        });
      </script>
    </form>
  `));
});

async function downloadCoverFromUrl(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TopBoeken/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new Error(`Bestand te klein (${buffer.length} bytes) — waarschijnlijk geen afbeelding`);
  const dir = join(destPath, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(destPath, buffer);
}

router.post('/books/:id', upload.single('cover'), async (req, res) => {
  const db = getDb();
  const { title, author, isbn, publisher, pages, language, summary, summary_nl, goodreads_rating, goodreads_count, genres, cover_url, locked, is_ebook } = req.body;
  const id = parseInt(req.params.id, 10);

  const book = db.prepare('SELECT isbn, cover_path FROM books WHERE id = ?').get(id);
  const coversDir = process.env.COVERS_DIR ?? '/var/www/top-boeken.nl/html/covers';
  let newCoverPath = book.cover_path || null;
  let errorMsg = null;

  if (req.file) {
    // File upload takes priority
    newCoverPath = `covers/${book.isbn}.jpg`;
  } else if (cover_url?.trim()) {
    // Download from URL
    const dest = join(coversDir, `${book.isbn}.jpg`);
    try {
      await downloadCoverFromUrl(cover_url.trim(), dest);
      newCoverPath = `covers/${book.isbn}.jpg`;
    } catch (err) {
      errorMsg = `Cover URL mislukt: ${err.message}`;
    }
  }

  db.prepare(`UPDATE books SET title=?, author=?, isbn=?, publisher=?, pages=?, language=?, summary=?, summary_nl=?,
    goodreads_rating=?, goodreads_count=?, cover_path=?, locked=?, is_ebook=?, updated_at=datetime('now', 'localtime') WHERE id=?`)
    .run(
      title, author, isbn || null, publisher || null,
      pages ? parseInt(pages, 10) : null,
      language || null,
      summary || null, summary_nl || null,
      goodreads_rating ? parseFloat(goodreads_rating) : null,
      goodreads_count  ? parseInt(goodreads_count, 10)  : null,
      newCoverPath, locked ? 1 : 0, is_ebook ? 1 : 0, id
    );

  db.prepare('DELETE FROM book_genres WHERE book_id=?').run(id);
  const insertGenre = db.prepare('INSERT OR IGNORE INTO book_genres (book_id, genre_id) VALUES (?,?)');
  const ids = Array.isArray(genres) ? genres : genres ? [genres] : [];
  db.transaction(() => ids.forEach(gid => insertGenre.run(id, parseInt(gid, 10))))();

  // If cover changed (upload or URL), trigger an async rebuild so static pages update
  if ((req.file || (cover_url?.trim() && !errorMsg)) && !errorMsg) {
    const { spawn } = await import('node:child_process');
    const { dirname, join: pjoin } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const scriptPath = pjoin(dirname(fileURLToPath(import.meta.url)), '../../scripts/build.sh');
    const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' });
    child.unref();
  }

  const qs = errorMsg
    ? `?error=${encodeURIComponent(errorMsg)}`
    : '?saved=1';
  res.redirect(`/admin/books/${id}${qs}`);
});

// ── Merge ─────────────────────────────────────────────────────────────────────

router.get('/books/:id/merge', (req, res) => {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).send('Niet gevonden');

  const q = req.query.q ?? '';
  let results = [];
  if (q) {
    results = db.prepare(`
      SELECT id, title, author, isbn, cover_path FROM books
      WHERE (title LIKE ? OR isbn LIKE ?) AND id != ?
      ORDER BY title ASC LIMIT 8
    `).all(`%${q}%`, `%${q}%`, book.id);
  }

  const rows = results.map(r => `
    <tr>
      <td style="width:36px">${r.cover_path ? `<img src="/${r.cover_path}" width="28" style="vertical-align:middle;object-fit:contain">` : ''}</td>
      <td><strong>${r.title}</strong><br><span style="font-size:12px;color:#888">${r.author} — ISBN ${r.isbn}</span></td>
      <td style="width:140px">
        <form method="post" action="/admin/books/${book.id}/merge" style="margin:0"
          onsubmit="return confirm('Samenvoegen? ${book.title} wordt verwijderd, alle lijstvermeldingen gaan naar het gekozen boek.')">
          <input type="hidden" name="target_id" value="${r.id}">
          <button class="btn btn-primary" style="padding:4px 10px;font-size:12px">← Samenvoegen</button>
        </form>
      </td>
    </tr>`).join('');

  res.send(layout(`Samenvoegen — ${book.title}`, `
    <h1>Boek samenvoegen</h1>
    <div style="background:#fff3cd;border:1px solid #ffc107;padding:12px 16px;border-radius:4px;margin-bottom:24px;font-size:14px">
      <strong>Dit boek wordt verwijderd:</strong> ${book.title} <span style="color:#888">(ISBN ${book.isbn})</span><br>
      Alle lijst­vermeldingen, genres en artikel­koppelingen worden overgezet naar het gekozen doelboek.
    </div>
    <form method="get" style="display:flex;gap:8px;margin-bottom:16px">
      <input name="q" value="${q}" placeholder="Zoek doelboek op titel of ISBN…" style="width:320px;margin:0">
      <button class="btn btn-primary" type="submit">Zoeken</button>
    </form>
    ${results.length ? `<table>${rows}</table>` : (q ? '<p style="color:#aaa;font-size:13px">Geen resultaten.</p>' : '')}
    <p style="margin-top:24px"><a href="/admin/books/${book.id}" class="btn">← Terug</a></p>
  `));
});

router.post('/books/:id/merge', (req, res) => {
  const db = getDb();
  const sourceId = parseInt(req.params.id, 10);
  const targetId = parseInt(req.body.target_id, 10);
  if (!sourceId || !targetId || sourceId === targetId) return res.redirect(`/admin/books/${sourceId}`);

  db.transaction(() => {
    // Move list entries (skip conflicts — target already has that week/list)
    db.prepare(`
      INSERT OR IGNORE INTO list_entries (book_id, source_id, genre_id, rank, list_name, week_date, scraped_at)
      SELECT ?, source_id, genre_id, rank, list_name, week_date, scraped_at FROM list_entries WHERE book_id = ?
    `).run(targetId, sourceId);

    // Move genres
    db.prepare(`
      INSERT OR IGNORE INTO book_genres (book_id, genre_id)
      SELECT ?, genre_id FROM book_genres WHERE book_id = ?
    `).run(targetId, sourceId);

    // Move affiliate links (keep target's if conflict)
    db.prepare(`
      INSERT OR IGNORE INTO book_affiliates (book_id, affiliate_id, url, price, currency, updated_at)
      SELECT ?, affiliate_id, url, price, currency, updated_at FROM book_affiliates WHERE book_id = ?
    `).run(targetId, sourceId);

    // Move article book entries
    db.prepare(`
      INSERT OR IGNORE INTO article_books (article_id, book_id, description, position)
      SELECT article_id, ?, description, position FROM article_books WHERE book_id = ?
    `).run(targetId, sourceId);

    // Delete source (cascades remaining FK references)
    db.prepare('DELETE FROM books WHERE id = ?').run(sourceId);
  })();

  res.redirect(`/admin/books/${targetId}?saved=1`);
});

// ── Cover re-download ─────────────────────────────────────────────────────────

router.post('/books/:id/redownload-cover', async (req, res) => {
  const db   = getDb();
  const book = db.prepare('SELECT id, isbn, title, author, cover_path FROM books WHERE id = ?').get(req.params.id);
  if (!book) return res.redirect(`/admin/books/${req.params.id}?error=Boek+niet+gevonden`);

  // Delete existing file so the downloader won't skip it
  if (book.cover_path) {
    const coversDir = process.env.COVERS_DIR ?? '/var/www/top-boeken.nl/html/covers';
    const { join } = await import('node:path');
    const { unlinkSync, existsSync } = await import('node:fs');
    const full = join(coversDir, `${book.isbn}.jpg`);
    if (existsSync(full)) try { unlinkSync(full); } catch {}
  }

  // Clear cover_path so the site doesn't show a broken image while we fetch
  db.prepare("UPDATE books SET cover_path=NULL, updated_at=datetime('now','localtime') WHERE id=?").run(book.id);

  // Re-fetch from Google Books → Open Library
  const { downloadCover, downloadCoverFromUrl, googleBooksHighRes } = await import('../../src/scrapers/lib/cover-downloader.js');

  let cover_path = null;

  // Try Google Books by ISBN first
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (key) {
    try {
      const gRes  = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${book.isbn}&maxResults=1&key=${key}`);
      const gData = await gRes.json();
      const thumb = gData.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
      if (thumb) cover_path = await downloadCoverFromUrl(book.isbn, googleBooksHighRes(thumb));
    } catch {}
  }

  // Fallback to Open Library
  if (!cover_path) cover_path = await downloadCover(book.isbn, null);

  if (cover_path) {
    db.prepare("UPDATE books SET cover_path=?, updated_at=datetime('now','localtime') WHERE id=?").run(cover_path, book.id);
    // Trigger background rebuild so the site updates
    const { spawn } = await import('node:child_process');
    const { join: pjoin, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const script = pjoin(dirname(fileURLToPath(import.meta.url)), '../../scripts/build.sh');
    const child  = spawn('bash', [script], { detached: true, stdio: 'ignore' });
    child.unref();
    res.redirect(`/admin/books/${book.id}?saved=1`);
  } else {
    res.redirect(`/admin/books/${book.id}?error=Cover+niet+gevonden+via+Google+Books+of+Open+Library`);
  }
});

// ── Soft delete / restore ─────────────────────────────────────────────────────

router.post('/books/:id/delete', (req, res) => {
  getDb().prepare("UPDATE books SET deleted=1, updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
  const back = req.get('Referer') ?? '/admin/books';
  const url  = new URL(back, 'http://x');
  url.searchParams.set('deleted_flash', '1');
  res.redirect(url.pathname + url.search);
});

router.post('/books/:id/restore', (req, res) => {
  getDb().prepare("UPDATE books SET deleted=0, updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
  res.redirect(`/admin/books/${req.params.id}?saved=1`);
});

export default router;

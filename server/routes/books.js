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
  const q          = req.query.q ?? '';
  const noCover    = req.query.no_cover === '1';
  const langFilter = req.query.lang ?? ''; // 'nl' | 'en' | 'none'
  const lockedOnly = req.query.locked === '1';
  const page       = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const offset     = (page - 1) * PER_PAGE;
  const db         = getDb();

  const conditions = [];
  const args = [];
  if (q)          { conditions.push('(title LIKE ? OR author LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  if (noCover)    { conditions.push("(cover_path IS NULL OR cover_path = '')"); }
  if (lockedOnly) { conditions.push('locked = 1'); }
  if (langFilter === 'nl')   { conditions.push("summary_nl IS NOT NULL AND summary_nl != ''"); }
  if (langFilter === 'en')   { conditions.push("summary IS NOT NULL AND summary != '' AND (summary_nl IS NULL OR summary_nl = '')"); }
  if (langFilter === 'none') { conditions.push("(summary IS NULL OR summary = '') AND (summary_nl IS NULL OR summary_nl = '')"); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const siteUrl  = process.env.SITE_URL ?? 'https://top-boeken.nl';
  const total    = db.prepare(`SELECT COUNT(*) as c FROM books ${where}`).get(...args).c;
  const books    = db.prepare(`SELECT * FROM books ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(...args, PER_PAGE, offset);

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
    noCover: db.prepare("SELECT COUNT(*) as c FROM books WHERE cover_path IS NULL OR cover_path = ''").get().c,
    nl:      db.prepare("SELECT COUNT(*) as c FROM books WHERE summary_nl IS NOT NULL AND summary_nl != ''").get().c,
    en:      db.prepare("SELECT COUNT(*) as c FROM books WHERE summary IS NOT NULL AND summary != '' AND (summary_nl IS NULL OR summary_nl = '')").get().c,
    none:    db.prepare("SELECT COUNT(*) as c FROM books WHERE (summary IS NULL OR summary = '') AND (summary_nl IS NULL OR summary_nl = '')").get().c,
    locked:  db.prepare('SELECT COUNT(*) as c FROM books WHERE locked = 1').get().c,
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

    const lockBadge = b.locked
      ? `<span title="Vergrendeld" style="font-size:12px">🔒</span>`
      : '';

    return `
    <tr>
      <td>
        ${b.cover_path ? `<img src="/${b.cover_path}" width="28" height="40" style="object-fit:contain;vertical-align:middle;background:#f5f4f1;margin-right:6px" onerror="this.style.display='none'">` : '<span style="display:inline-block;width:28px;margin-right:6px"></span>'}${b.title}
      </td>
      <td style="font-size:13px;color:#555">${b.author}</td>
      <td style="white-space:nowrap">${langBadge} ${lockBadge}</td>
      <td>${sourceBadges || '<span style="color:#ccc;font-size:12px">—</span>'}</td>
      <td style="font-size:12px;color:#888">${b.updated_at?.slice(0, 10) ?? ''}</td>
      <td style="white-space:nowrap">
        <a href="/admin/books/${b.id}" class="btn btn-primary" style="padding:4px 10px;font-size:12px">Bewerk</a>
        &nbsp;<a href="${siteUrl}/boeken/${b.slug}" target="_blank" class="btn" style="padding:4px 10px;font-size:12px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0">👁</a>
      </td>
    </tr>`;
  }).join('');

  function activeFilters() {
    return { ...(q ? { q } : {}), ...(noCover ? { no_cover: '1' } : {}), ...(langFilter ? { lang: langFilter } : {}), ...(lockedOnly ? { locked: '1' } : {}) };
  }

  function pageUrl(p) {
    return `/admin/books?${new URLSearchParams({ ...activeFilters(), page: p })}`;
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
    </div>
    <table>
      <thead><tr><th>Titel</th><th>Auteur</th><th>Taal</th><th>Bronnen</th><th>Bijgewerkt</th><th></th></tr></thead>
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
  const flash = req.query.saved
    ? `<div class="flash flash-ok">Wijzigingen opgeslagen. <a href="${siteUrl}/boeken/${book.slug}" target="_blank" style="font-weight:700;color:#166534;text-decoration:underline">Bekijk op site →</a></div>`
    : req.query.error
    ? `<div class="flash flash-err">${req.query.error}</div>`
    : '';
  const currentCover = book.cover_path
    ? `<img id="cover-preview" src="/${book.cover_path}" style="height:160px;object-fit:contain;display:block;margin-bottom:8px;background:#f5f4f1;padding:4px">`
    : `<div id="cover-preview" style="height:160px;width:112px;background:#f5f4f1;display:flex;align-items:center;justify-content:center;font-size:12px;color:#aaa;margin-bottom:8px">Geen cover</div>`;

  res.send(layout(`Bewerk — ${book.title}`, `
    <h1>Boek bewerken</h1>
    ${flash}
    <form method="post" action="/admin/books/${book.id}" enctype="multipart/form-data" style="max-width:720px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px">
        <div><label>Titel</label><input type="text" name="title" value="${book.title}" style="width:100%"></div>
        <div><label>Auteur</label><input type="text" name="author" value="${book.author}" style="width:100%"></div>
        <div><label>ISBN</label><input type="text" name="isbn" value="${book.isbn ?? ''}" style="width:100%"></div>
        <div><label>Uitgever</label><input type="text" name="publisher" value="${book.publisher ?? ''}" style="width:100%"></div>
        <div><label>Pagina's</label><input type="number" name="pages" value="${book.pages ?? ''}" style="width:100%"></div>
        <div><label>Taal</label><input type="text" name="language" value="${book.language ?? ''}" placeholder="nl, en…" style="width:100%"></div>
        <div><label>Goodreads rating</label><input type="number" name="goodreads_rating" step="0.01" min="0" max="5" value="${book.goodreads_rating ?? ''}" style="width:100%"></div>
        <div><label>Goodreads stemmen</label><input type="number" name="goodreads_count" value="${book.goodreads_count ?? ''}" style="width:100%"></div>
      </div>
      <label>Engelse omschrijving</label><textarea name="summary" rows="4">${book.summary ?? ''}</textarea>
      <label>Nederlandse omschrijving</label><textarea name="summary_nl" rows="4">${book.summary_nl ?? ''}</textarea>
      <label>Cover</label>
      ${currentCover}

      <label style="margin-bottom:4px">Bestand uploaden</label>
      <input type="file" name="cover" accept="image/*" style="margin-bottom:12px" id="cover-input">

      <label style="margin-bottom:4px">Of: URL van afbeelding</label>
      <div style="display:flex;gap:8px;margin-bottom:4px">
        <input type="url" name="cover_url" id="cover-url-input" placeholder="https://..." style="margin-bottom:0;flex:1">
        <button type="button" onclick="previewUrl()" class="btn" style="background:#eee;color:#333;white-space:nowrap">Voorbeeld</button>
      </div>
      <p style="font-size:12px;color:#888;margin-bottom:16px">Bestand upload heeft voorrang op URL. Laat beide leeg om huidige te bewaren.</p>

      <script>
        document.getElementById('cover-input').addEventListener('change', function() {
          const file = this.files[0];
          if (!file) return;
          const url = URL.createObjectURL(file);
          setPreview(url);
          document.getElementById('cover-url-input').value = '';
        });

        function previewUrl() {
          const url = document.getElementById('cover-url-input').value.trim();
          if (url) setPreview(url);
        }

        document.getElementById('cover-url-input').addEventListener('keydown', function(e) {
          if (e.key === 'Enter') { e.preventDefault(); previewUrl(); }
        });

        function setPreview(src) {
          const el = document.getElementById('cover-preview');
          el.outerHTML = '<img id="cover-preview" src="' + src + '" style="height:160px;object-fit:contain;display:block;margin-bottom:8px;background:#f5f4f1;padding:4px" onerror="this.style.outline=\'2px solid red\'">';
        }
      </script>
      <label style="margin-bottom:8px">Genres</label>
      <div style="margin-bottom:16px">${checkboxes}</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
        <button class="btn btn-primary" type="submit">Opslaan</button>
        <label style="display:flex;align-items:center;gap:6px;margin:0;cursor:pointer;font-weight:400">
          <input type="checkbox" name="locked" value="1" ${book.locked ? 'checked' : ''}> 🔒 Vergrendeld
        </label>
        <label style="display:flex;align-items:center;gap:6px;margin:0;cursor:pointer;font-weight:400">
          <input type="checkbox" name="is_ebook" value="1" ${book.is_ebook ? 'checked' : ''}> 📱 E-book
        </label>
        <a href="/admin/books" class="btn" style="background:#eee;color:#333">Annuleren</a>
        <a href="/admin/books/${book.id}/merge" class="btn" style="background:#fefce8;color:#854d0e;border:1.5px solid #fde68a">⇄ Samenvoegen</a>
        <a href="${siteUrl}/boeken/${book.slug}" target="_blank" class="btn" style="background:#f0fdf4;color:#166534;border:1.5px solid #bbf7d0;margin-left:auto">👁 Bekijk op site →</a>
      </div>
    </form>
  `));
});

async function downloadCoverFromUrl(url, destPath) {
  const res = await fetch(url, { headers: { 'User-Agent': 'TopBoeken/1.0 (sidney@funky-monkey.nl)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('image')) throw new Error(`Geen afbeelding (${ct})`);
  const dir = join(destPath, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Use arrayBuffer — works with Web Streams API from fetch()
  const buffer = Buffer.from(await res.arrayBuffer());
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

export default router;

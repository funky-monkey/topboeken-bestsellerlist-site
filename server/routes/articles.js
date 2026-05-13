import { Router } from 'express';
import { getDb } from '../../src/db/db.js';
import { textSlug } from '../../src/lib/slugify.js';
import { layout } from '../views/layout.js';

const router = Router();

// ── List ─────────────────────────────────────────────────────────────────────

router.get('/articles', (req, res) => {
  const articles = getDb().prepare(`
    SELECT a.*, COUNT(ab.id) as book_count
    FROM articles a
    LEFT JOIN article_books ab ON ab.article_id = a.id
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `).all();

  const statusLabel = { draft: 'Concept', published: 'Gepubliceerd', scheduled: 'Ingepland' };
  const statusColor = {
    draft:     { bg: '#fef9c3', fg: '#854d0e' },
    published: { bg: '#dcfce7', fg: '#166534' },
    scheduled: { bg: '#dbeafe', fg: '#1d4ed8' },
  };

  const rows = articles.map(a => {
    const s = a.status ?? (a.published ? 'published' : 'draft');
    const c = statusColor[s] ?? statusColor.draft;
    const dateStr = s === 'scheduled' ? a.scheduled_for : (a.published_at ?? a.created_at);
    return `
    <tr>
      <td><a href="/admin/articles/${a.id}">${a.title}</a></td>
      <td style="font-size:13px;color:#888">${a.book_count} boeken</td>
      <td>
        <span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;background:${c.bg};color:${c.fg}">
          ${statusLabel[s] ?? s}
        </span>
      </td>
      <td style="font-size:12px;color:#aaa">${(dateStr ?? '').slice(0, 10)}</td>
      <td><a href="/admin/articles/${a.id}" class="btn btn-primary" style="padding:4px 10px;font-size:12px">Bewerk</a></td>
    </tr>`;
  }).join('');

  res.send(layout('Artikelen', `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h1 style="margin:0">Artikelen</h1>
      <a href="/admin/articles/new" class="btn btn-primary">+ Nieuw artikel</a>
    </div>
    <table>
      <thead><tr><th>Titel</th><th>Boeken</th><th>Status</th><th>Datum</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="color:#aaa">Nog geen artikelen</td></tr>'}</tbody>
    </table>
  `));
});

// ── Book search JSON (must be before /:id) ────────────────────────────────────

router.get('/articles/books/search', (req, res) => {
  const q       = (req.query.q ?? '').trim();
  const exclude = (req.query.exclude ?? '').split(',').map(Number).filter(Boolean);
  if (q.length < 2) return res.json([]);

  let rows = getDb().prepare(`
    SELECT id, title, author, isbn, cover_path, goodreads_rating
    FROM books
    WHERE (title LIKE ? OR author LIKE ?)
      AND cover_path IS NOT NULL AND cover_path != ''
    ORDER BY title ASC LIMIT 12
  `).all(`%${q}%`, `%${q}%`);

  if (exclude.length) rows = rows.filter(r => !exclude.includes(r.id));
  res.json(rows.slice(0, 8));
});

// ── New ───────────────────────────────────────────────────────────────────────

router.get('/articles/new', (req, res) => {
  res.send(layout('Nieuw artikel', articleForm(null, null)));
});

router.post('/articles/new', (req, res) => {
  const { title, intro, outro, status, scheduled_for } = req.body;
  const slug = textSlug(title);
  const db = getDb();
  const effectiveStatus = status ?? 'draft';
  const id = db.prepare(`
    INSERT INTO articles (title, slug, intro, outro, status, published_at, scheduled_for, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?,
      CASE WHEN ? = 'published' THEN datetime('now','localtime') ELSE NULL END,
      ?,
      datetime('now','localtime'), datetime('now','localtime'))
  `).run(title, slug, intro || null, outro || null, effectiveStatus, effectiveStatus, scheduled_for || null).lastInsertRowid;
  res.redirect(`/admin/articles/${id}`);
});

// ── Edit ──────────────────────────────────────────────────────────────────────

router.get('/articles/:id', (req, res) => {
  const db = getDb();
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).send('Niet gevonden');

  const books = db.prepare(`
    SELECT b.id, b.title, b.author, b.cover_path, b.goodreads_rating, ab.description, ab.position
    FROM article_books ab JOIN books b ON b.id = ab.book_id
    WHERE ab.article_id = ? ORDER BY ab.position ASC, ab.id ASC
  `).all(article.id);

  const saved = req.query.saved ? '<div class="flash flash-ok">Opgeslagen.</div>' : '';
  res.send(layout(article.title, saved + articleForm(article, books)));
});

router.post('/articles/:id', async (req, res) => {
  const { title, intro, outro, status, scheduled_for } = req.body;
  const db = getDb();
  const prev = db.prepare('SELECT status FROM articles WHERE id = ?').get(req.params.id);
  const nowPublishing = status === 'published' && prev?.status !== 'published';

  db.prepare(`
    UPDATE articles SET title=?, intro=?, outro=?, status=?,
      published_at = CASE WHEN ? THEN datetime('now','localtime') ELSE published_at END,
      scheduled_for = ?,
      updated_at = datetime('now','localtime')
    WHERE id=?
  `).run(title, intro || null, outro || null, status ?? 'draft', nowPublishing ? 1 : 0, scheduled_for || null, req.params.id);

  // Save book descriptions and positions
  const db2 = getDb();
  const update = db2.prepare('UPDATE article_books SET description=?, position=? WHERE article_id=? AND book_id=?');
  for (const key of Object.keys(req.body).filter(k => k.startsWith('desc_'))) {
    const bookId = key.slice(5);
    update.run(req.body[key] || null, parseInt(req.body[`pos_${bookId}`] ?? '0', 10), req.params.id, bookId);
  }

  // Trigger a background rebuild whenever a published/scheduled article is saved
  if (status === 'published' || status === 'scheduled') {
    const { spawn } = await import('node:child_process');
    const { join: pjoin, dirname: pdir } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const script = pjoin(pdir(fileURLToPath(import.meta.url)), '../../scripts/build.sh');
    const child = spawn('bash', [script], { detached: true, stdio: 'ignore' });
    child.unref();
  }

  res.redirect(`/admin/articles/${req.params.id}?saved=1`);
});

// ── Add book ──────────────────────────────────────────────────────────────────

router.post('/articles/:id/books/add', (req, res) => {
  const { book_id } = req.body;
  const db = getDb();
  const maxPos = db.prepare('SELECT MAX(position) as m FROM article_books WHERE article_id=?').get(req.params.id)?.m ?? -1;
  db.prepare('INSERT OR IGNORE INTO article_books (article_id, book_id, position) VALUES (?,?,?)').run(req.params.id, book_id, maxPos + 1);
  res.redirect(`/admin/articles/${req.params.id}`);
});

// ── Remove book ───────────────────────────────────────────────────────────────

router.post('/articles/:id/books/:bookId/remove', (req, res) => {
  getDb().prepare('DELETE FROM article_books WHERE article_id=? AND book_id=?').run(req.params.id, req.params.bookId);
  res.redirect(`/admin/articles/${req.params.id}`);
});

// ── Delete article ────────────────────────────────────────────────────────────

router.post('/articles/:id/delete', (req, res) => {
  getDb().prepare('DELETE FROM articles WHERE id=?').run(req.params.id);
  res.redirect('/admin/articles');
});

// ── View helpers ──────────────────────────────────────────────────────────────

function inlineSearch(article) {
  return `
    <div style="margin-top:16px">
      <input id="book-search-input" data-article-id="${article.id}"
        placeholder="🔍  Zoek boek op titel of auteur om toe te voegen…"
        autocomplete="off" style="width:100%;max-width:500px;margin-bottom:0">
      <div id="book-search-results" style="margin-top:4px;max-width:700px"></div>
    </div>`;
}

function articleForm(article, books) {
  const isNew = !article;
  const status = article?.status ?? (article?.published ? 'published' : 'draft');
  const scheduledFor = article?.scheduled_for ?? '';

  const bookRows = (books ?? []).map((b, i) => `
    <tr data-book-id="${b.id}">
      <td style="width:44px;vertical-align:top;padding-top:8px">
        ${b.cover_path
          ? `<img src="/${b.cover_path}" width="36" style="display:block;object-fit:contain;background:#f5f4f1">`
          : '<div style="width:36px;height:50px;background:#eee"></div>'}
      </td>
      <td style="vertical-align:top;padding:8px 12px 8px 8px">
        <div style="font-weight:600;font-size:14px">${b.title}</div>
        <div style="color:#888;font-size:12px;margin-top:2px">${b.author}${b.goodreads_rating ? ` · ★ ${b.goodreads_rating}` : ''}</div>
        <textarea name="desc_${b.id}" rows="3" placeholder="Omschrijving voor dit artikel (optioneel)…"
          style="width:100%;margin-top:8px;font-size:13px;resize:vertical">${b.description ?? ''}</textarea>
      </td>
      <td style="width:60px;vertical-align:top;padding-top:8px;text-align:center">
        <label style="font-size:10px;color:#aaa;display:block;margin-bottom:2px">Volgorde</label>
        <input type="number" name="pos_${b.id}" value="${b.position ?? i}" min="0"
          style="width:52px;text-align:center;padding:4px;margin-bottom:8px">
        <form method="post" action="/admin/articles/${article?.id}/books/${b.id}/remove" style="margin:0">
          <button class="btn" style="padding:3px 8px;font-size:11px;color:#dc2626;border-color:#fecaca" type="submit">✕</button>
        </form>
      </td>
    </tr>`).join('');

  const publishControls = `
    <div>
      <label>Publicatiestatus</label>
      <select name="status" id="art-status" style="width:auto;margin-bottom:8px">
        <option value="draft"     ${status === 'draft'     ? 'selected' : ''}>Concept — niet zichtbaar</option>
        <option value="published" ${status === 'published' ? 'selected' : ''}>Gepubliceerd — direct live</option>
        <option value="scheduled" ${status === 'scheduled' ? 'selected' : ''}>Ingepland — op datum live</option>
      </select>
      <div id="scheduled-wrap" style="display:${status === 'scheduled' ? 'block' : 'none'};margin-top:4px">
        <label style="font-size:13px;margin-bottom:4px">Publicatiedatum &amp; tijd</label>
        <input type="datetime-local" name="scheduled_for" value="${scheduledFor.slice(0, 16)}"
          style="width:auto">
        <p style="font-size:12px;color:#888;margin-top:4px">Het artikel verschijnt automatisch bij de eerstvolgende site-rebuild na deze datum.</p>
      </div>
      <script>
        document.getElementById('art-status').addEventListener('change', function() {
          document.getElementById('scheduled-wrap').style.display = this.value === 'scheduled' ? 'block' : 'none';
        });
      </script>
    </div>`;

  const searchSection = !isNew ? `<script src="/scripts/article-book-search.js"></script>` : '';

  const deleteBtn = article ? `
    <form method="post" action="/admin/articles/${article.id}/delete" style="margin:0"
      onsubmit="return confirm('Artikel verwijderen?')">
      <button class="btn" style="color:#dc2626;border-color:#fecaca" type="submit">Verwijder</button>
    </form>` : '';

  const siteUrl = process.env.SITE_URL ?? 'https://top-boeken.nl';
  const viewBtn = article && status === 'published'
    ? `<a href="${siteUrl}/blog/${article.slug}" target="_blank" class="btn" style="background:#f0fdf4;color:#166534;border:1.5px solid #bbf7d0;margin-left:auto">👁 Bekijk op site →</a>`
    : '';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h1 style="margin:0">${isNew ? 'Nieuw artikel' : article.title}</h1>
      <a href="/admin/articles" class="btn">← Terug</a>
    </div>
    <form method="post" action="${isNew ? '/admin/articles/new' : `/admin/articles/${article.id}`}">
      <div style="display:grid;gap:20px;max-width:860px">
        <div>
          <label>Titel</label>
          <input name="title" value="${article?.title ?? ''}" required style="width:100%">
        </div>
        <div>
          <label>Intro</label>
          <textarea name="intro" rows="5" placeholder="Inleidende tekst boven de boeken…" style="width:100%">${article?.intro ?? ''}</textarea>
        </div>

        ${isNew
          ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;padding:10px 14px;border-radius:4px;font-size:13px;color:#0369a1">
              💡 Klik op <strong>Aanmaken</strong> — daarna kun je direct boeken zoeken en toevoegen.
             </div>`
          : `<div>
              <label>Boeken in dit artikel <span style="font-weight:400;color:#aaa;font-size:13px">(${(books ?? []).length})</span></label>
              ${books?.length
                ? `<table style="width:100%">${bookRows}`
                  + `<tr><td colspan="3" style="padding-top:16px">${inlineSearch(article)}</td></tr></table>`
                : inlineSearch(article)}
             </div>`
        }

        <div>
          <label>Outro</label>
          <textarea name="outro" rows="4" placeholder="Afsluitende tekst na de boeken…" style="width:100%">${article?.outro ?? ''}</textarea>
        </div>

        ${publishControls}

        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary" type="submit">${isNew ? 'Aanmaken' : 'Opslaan'}</button>
          ${deleteBtn}
          ${viewBtn}
        </div>
      </div>
    </form>
    ${searchSection}
  `;
}

export default router;

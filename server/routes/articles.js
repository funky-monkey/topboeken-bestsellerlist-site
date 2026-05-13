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

  const rows = articles.map(a => `
    <tr>
      <td><a href="/admin/articles/${a.id}">${a.title}</a></td>
      <td style="font-size:13px;color:#888">${a.book_count} boeken</td>
      <td>
        <span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;
          background:${a.published ? '#dcfce7' : '#fef9c3'};color:${a.published ? '#166534' : '#854d0e'}">
          ${a.published ? 'Gepubliceerd' : 'Concept'}
        </span>
      </td>
      <td style="font-size:12px;color:#aaa">${(a.published_at ?? a.created_at).slice(0, 10)}</td>
      <td><a href="/admin/articles/${a.id}" class="btn btn-primary" style="padding:4px 10px;font-size:12px">Bewerk</a></td>
    </tr>`).join('');

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

// ── New ───────────────────────────────────────────────────────────────────────

router.get('/articles/new', (req, res) => {
  res.send(layout('Nieuw artikel', articleForm(null, null)));
});

router.post('/articles/new', (req, res) => {
  const { title, intro, outro, published } = req.body;
  const slug = textSlug(title);
  const db = getDb();
  const now = "datetime('now', 'localtime')";
  const id = db.prepare(`
    INSERT INTO articles (title, slug, intro, outro, published, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ${published ? now : 'NULL'}, ${now}, ${now})
  `).run(title, slug, intro || null, outro || null, published ? 1 : 0).lastInsertRowid;
  res.redirect(`/admin/articles/${id}`);
});

// ── Edit ──────────────────────────────────────────────────────────────────────

router.get('/articles/:id', (req, res) => {
  const db = getDb();
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).send('Niet gevonden');

  const books = db.prepare(`
    SELECT b.id, b.title, b.author, b.cover_path, ab.description, ab.position
    FROM article_books ab JOIN books b ON b.id = ab.book_id
    WHERE ab.article_id = ? ORDER BY ab.position ASC, ab.id ASC
  `).all(article.id);

  const q = req.query.q ?? '';
  let searchResults = [];
  if (q) {
    const existingIds = books.map(b => b.id);
    const rows = db.prepare(`
      SELECT id, title, author, cover_path FROM books
      WHERE (title LIKE ? OR author LIKE ?) AND cover_path IS NOT NULL AND cover_path != ''
      ORDER BY title ASC LIMIT 10
    `).all(`%${q}%`, `%${q}%`);
    searchResults = rows.filter(r => !existingIds.includes(r.id));
  }

  res.send(layout(article.title, articleForm(article, books, q, searchResults)));
});

router.post('/articles/:id', (req, res) => {
  const { title, intro, outro, published } = req.body;
  const db = getDb();
  const wasPublished = db.prepare('SELECT published FROM articles WHERE id = ?').get(req.params.id)?.published;
  const nowPublishing = published && !wasPublished;

  db.prepare(`
    UPDATE articles SET title=?, intro=?, outro=?, published=?,
      published_at = CASE WHEN ? THEN datetime('now','localtime') ELSE published_at END,
      updated_at = datetime('now','localtime')
    WHERE id=?
  `).run(title, intro || null, outro || null, published ? 1 : 0, nowPublishing ? 1 : 0, req.params.id);

  // Save book descriptions and positions
  const descKeys = Object.keys(req.body).filter(k => k.startsWith('desc_'));
  const posKeys  = Object.keys(req.body).filter(k => k.startsWith('pos_'));
  const update   = db.prepare('UPDATE article_books SET description=?, position=? WHERE article_id=? AND book_id=?');
  for (const key of descKeys) {
    const bookId = key.slice(5);
    const posKey = `pos_${bookId}`;
    update.run(req.body[key] || null, parseInt(req.body[posKey] ?? '0', 10), req.params.id, bookId);
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

// ── View helper ───────────────────────────────────────────────────────────────

function articleForm(article, books, q = '', searchResults = []) {
  const isNew = !article;
  const saved = '';

  const bookRows = (books ?? []).map((b, i) => `
    <tr>
      <td style="width:44px;vertical-align:top;padding-top:8px">
        ${b.cover_path ? `<img src="/${b.cover_path}" width="36" style="display:block;object-fit:contain;background:#f5f4f1">` : '<div style="width:36px;height:50px;background:#eee"></div>'}
      </td>
      <td style="vertical-align:top;padding:8px 12px 8px 8px">
        <div style="font-weight:600;font-size:14px">${b.title}</div>
        <div style="color:#888;font-size:12px;margin-top:2px">${b.author}</div>
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

  const searchForm = article ? `
    <form method="get" action="/admin/articles/${article.id}" style="display:flex;gap:8px;margin-top:24px;align-items:center">
      <input name="q" value="${q}" placeholder="Zoek boek op titel of auteur…" style="width:300px;margin:0">
      <button class="btn btn-primary" type="submit">Zoeken</button>
    </form>
    ${searchResults.length ? `
    <table style="margin-top:12px">
      ${searchResults.map(b => `
      <tr>
        <td style="width:32px">${b.cover_path ? `<img src="/${b.cover_path}" width="28" style="vertical-align:middle;object-fit:contain">` : ''}</td>
        <td style="font-size:14px"><strong>${b.title}</strong> — ${b.author}</td>
        <td style="width:90px">
          <form method="post" action="/admin/articles/${article.id}/books/add" style="margin:0">
            <input type="hidden" name="book_id" value="${b.id}">
            <button class="btn btn-primary" style="padding:4px 10px;font-size:12px" type="submit">+ Toevoegen</button>
          </form>
        </td>
      </tr>`).join('')}
    </table>` : (q ? '<p style="color:#aaa;font-size:13px;margin-top:8px">Geen resultaten.</p>' : '')}
  ` : '';

  const deleteBtn = article ? `
    <form method="post" action="/admin/articles/${article.id}/delete" style="margin:0"
      onsubmit="return confirm('Artikel verwijderen?')">
      <button class="btn" style="color:#dc2626;border-color:#fecaca" type="submit">Verwijder artikel</button>
    </form>` : '';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
      <h1 style="margin:0">${isNew ? 'Nieuw artikel' : article.title}</h1>
      <a href="/admin/articles" class="btn">← Terug</a>
    </div>
    <form method="post" action="${isNew ? '/admin/articles/new' : `/admin/articles/${article.id}`}">
      <div style="display:grid;gap:16px;max-width:860px">
        <div>
          <label>Titel</label>
          <input name="title" value="${article?.title ?? ''}" required style="width:100%">
        </div>
        <div>
          <label>Intro</label>
          <textarea name="intro" rows="5" placeholder="Inleidende tekst boven de boeken…" style="width:100%">${article?.intro ?? ''}</textarea>
        </div>

        ${!isNew ? `
        <div>
          <label>Boeken in dit artikel</label>
          ${books?.length ? `<table style="width:100%">${bookRows}</table>` : '<p style="color:#aaa;font-size:13px">Nog geen boeken toegevoegd.</p>'}
        </div>` : ''}

        <div>
          <label>Outro</label>
          <textarea name="outro" rows="4" placeholder="Afsluitende tekst na de boeken…" style="width:100%">${article?.outro ?? ''}</textarea>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <label style="display:flex;align-items:center;gap:8px;margin:0;cursor:pointer">
            <input type="checkbox" name="published" value="1" ${article?.published ? 'checked' : ''}>
            Gepubliceerd
          </label>
          <button class="btn btn-primary" type="submit">${isNew ? 'Aanmaken' : 'Opslaan'}</button>
          ${deleteBtn}
        </div>
      </div>
    </form>
    ${searchForm}
  `;
}

export default router;

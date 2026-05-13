import { Router } from 'express';
import { getDb } from '../../src/db/db.js';
import { layout } from '../views/layout.js';

const router = Router();

// ── List ─────────────────────────────────────────────────────────────────────

router.get('/authors', (req, res) => {
  const db  = getDb();
  const q   = req.query.q ?? '';
  const filter = req.query.filter ?? ''; // 'dutch' | 'intl' | 'no-bio' | 'no-photo'

  const conditions = [];
  const args = [];
  if (q) { conditions.push('(a.name LIKE ?)'); args.push(`%${q}%`); }
  if (filter === 'dutch')    conditions.push('a.is_dutch = 1');
  if (filter === 'intl')     conditions.push('(a.is_dutch = 0 OR a.is_dutch IS NULL)');
  if (filter === 'no-bio')   conditions.push('(a.bio IS NULL OR a.bio = \'\')');
  if (filter === 'no-photo') conditions.push('(a.photo_path IS NULL OR a.photo_path = \'\')');
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const authors = db.prepare(`
    SELECT a.*, COUNT(b.id) as book_count
    FROM authors a
    LEFT JOIN books b ON b.deleted = 0 AND b.cover_path IS NOT NULL AND b.cover_path != ''
      AND b.author = a.name
    ${where}
    GROUP BY a.id
    ORDER BY a.name COLLATE NOCASE
  `).all(...args);

  const counts = {
    total:    db.prepare('SELECT COUNT(*) as c FROM authors').get().c,
    dutch:    db.prepare('SELECT COUNT(*) as c FROM authors WHERE is_dutch = 1').get().c,
    noBio:    db.prepare("SELECT COUNT(*) as c FROM authors WHERE bio IS NULL OR bio = ''").get().c,
    noPhoto:  db.prepare("SELECT COUNT(*) as c FROM authors WHERE photo_path IS NULL OR photo_path = ''").get().c,
  };

  const siteUrl = process.env.SITE_URL ?? 'https://top-boeken.nl';

  const rows = authors.map(a => `
    <tr>
      <td style="width:40px">
        ${a.photo_path ? `<img src="/${a.photo_path}" width="32" height="32" style="object-fit:cover;border-radius:50%;vertical-align:middle">` : '<span style="display:inline-block;width:32px;height:32px;border-radius:50%;background:#eee;vertical-align:middle"></span>'}
      </td>
      <td>
        <a href="/admin/authors/${a.id}" style="font-weight:600;text-decoration:none;color:var(--text)">${a.name}</a>
        ${a.birth_date ? `<span style="font-size:12px;color:#aaa;margin-left:6px">${a.birth_date}${a.death_date ? ' – ' + a.death_date : ''}</span>` : ''}
      </td>
      <td style="font-size:13px;color:#888">${a.book_count ?? 0} boeken</td>
      <td>
        ${a.is_dutch === 1 ? '<span style="font-size:11px;padding:2px 7px;background:#dcfce7;color:#166534;border-radius:3px;font-weight:700">NL</span>'
          : a.is_dutch === 0 ? '<span style="font-size:11px;padding:2px 7px;background:#f1f5f9;color:#64748b;border-radius:3px;font-weight:700">INT</span>'
          : '<span style="font-size:11px;color:#ccc">—</span>'}
      </td>
      <td style="font-size:12px;color:#aaa">${a.bio ? a.bio.slice(0, 60) + '…' : '<span style="color:#ddd">geen bio</span>'}</td>
      <td style="white-space:nowrap">
        <a href="/admin/authors/${a.id}" class="btn btn-primary" style="padding:3px 9px;font-size:12px">Bewerk</a>
        <a href="${siteUrl}/auteurs/${a.slug}" target="_blank" class="btn" style="padding:3px 9px;font-size:12px;background:#f0fdf4;color:#166534;border-color:#bbf7d0">👁</a>
      </td>
    </tr>`).join('');

  function filterBtn(label, val) {
    const active = filter === val;
    const url = `/admin/authors?${new URLSearchParams({ ...(q ? { q } : {}), filter: val })}`;
    return active
      ? `<a href="/admin/authors${q ? '?q=' + encodeURIComponent(q) : ''}" class="btn" style="background:#232323;color:#fff">${label}</a>`
      : `<a href="${url}" class="btn" style="background:#f5f5f5;color:#555">${label}</a>`;
  }

  res.send(layout('Auteurs', `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h1 style="margin:0">Auteurs <span style="font-size:14px;font-weight:400;color:#aaa">${counts.total}</span></h1>
    </div>
    <form method="get" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <input name="q" value="${q}" placeholder="Zoek op naam…" style="width:260px;margin:0">
      <button class="btn btn-primary" type="submit">Zoeken</button>
      <span style="color:#888;font-size:13px">${authors.length} resultaten</span>
    </form>
    <div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap">
      ${filterBtn('🇳🇱 Nederlands (' + counts.dutch + ')', 'dutch')}
      ${filterBtn('Internationaal', 'intl')}
      ${filterBtn('Geen bio (' + counts.noBio + ')', 'no-bio')}
      ${filterBtn('Geen foto (' + counts.noPhoto + ')', 'no-photo')}
    </div>
    <table>
      <thead><tr><th></th><th>Naam</th><th>Boeken</th><th>Taal</th><th>Bio</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="color:#aaa">Geen auteurs gevonden</td></tr>'}</tbody>
    </table>
  `));
});

// ── Edit ──────────────────────────────────────────────────────────────────────

router.get('/authors/:id', (req, res) => {
  const db     = getDb();
  const author = db.prepare('SELECT * FROM authors WHERE id = ?').get(req.params.id);
  if (!author) return res.status(404).send('Niet gevonden');

  const flash = req.query.saved ? '<div class="flash flash-ok">Opgeslagen.</div>' : '';
  const siteUrl = process.env.SITE_URL ?? 'https://top-boeken.nl';

  const photoHtml = author.photo_path
    ? `<img src="/${author.photo_path}" style="width:120px;height:120px;object-fit:cover;border-radius:4px;display:block;margin-bottom:8px">`
    : `<div style="width:120px;height:120px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:8px">✍</div>`;

  res.send(layout(`Bewerk — ${author.name}`, `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h1 style="margin:0">${author.name}</h1>
      <a href="/admin/authors" class="btn">← Terug</a>
    </div>
    ${flash}
    <form method="post" action="/admin/authors/${author.id}" style="max-width:680px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px">
        <div><label>Naam</label><input name="name" value="${author.name}" style="width:100%"></div>
        <div><label>Geboortedatum</label><input name="birth_date" value="${author.birth_date ?? ''}" placeholder="bijv. 31 July 1965" style="width:100%"></div>
        <div><label>Sterfdatum</label><input name="death_date" value="${author.death_date ?? ''}" placeholder="leeg als nog in leven" style="width:100%"></div>
        <div><label>Open Library sleutel</label><input name="ol_key" value="${author.ol_key ?? ''}" placeholder="/authors/OL23919A" style="width:100%"></div>
      </div>
      <label>Biografie</label>
      <textarea name="bio" rows="6">${author.bio ?? ''}</textarea>
      <div style="margin-bottom:16px">
        ${photoHtml}
        <label style="font-size:13px;color:#888">Fotobron: Open Library (via ✍ Auteurs aanvullen)</label>
      </div>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
        <label style="font-weight:600;font-size:12px;color:#555;margin:0">Taal / herkomst</label>
        <label style="display:flex;gap:6px;align-items:center;font-weight:400;cursor:pointer">
          <input type="radio" name="is_dutch" value="1" ${author.is_dutch === 1 ? 'checked' : ''}> Nederlands
        </label>
        <label style="display:flex;gap:6px;align-items:center;font-weight:400;cursor:pointer">
          <input type="radio" name="is_dutch" value="0" ${author.is_dutch === 0 ? 'checked' : ''}> Internationaal
        </label>
        <label style="display:flex;gap:6px;align-items:center;font-weight:400;cursor:pointer">
          <input type="radio" name="is_dutch" value="" ${author.is_dutch === null ? 'checked' : ''}> Automatisch (op basis van boektaal)
        </label>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary" type="submit">Opslaan</button>
        <a href="${siteUrl}/auteurs/${author.slug}" target="_blank" class="btn" style="background:#f0fdf4;color:#166534;border-color:#bbf7d0">👁 Bekijk pagina →</a>
      </div>
    </form>
  `));
});

router.post('/authors/:id', (req, res) => {
  const { name, bio, birth_date, death_date, ol_key, is_dutch } = req.body;
  const isDutch = is_dutch === '' ? null : is_dutch === '1' ? 1 : 0;
  getDb().prepare(`
    UPDATE authors SET name=?, bio=?, birth_date=?, death_date=?, ol_key=?, is_dutch=?,
      updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(name || null, bio || null, birth_date || null, death_date || null, ol_key || null, isDutch, req.params.id);
  res.redirect(`/admin/authors/${req.params.id}?saved=1`);
});

export default router;

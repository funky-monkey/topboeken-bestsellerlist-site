import { Router } from 'express';
import { getDb } from '../../src/db/db.js';
import { layout } from '../views/layout.js';

const router = Router();

router.get('/sources', (req, res) => {
  const sources = getDb().prepare('SELECT * FROM sources ORDER BY name').all();
  const flash = req.query.saved ? '<div class="flash flash-ok">Wijzigingen opgeslagen.</div>' : '';

  const rows = sources.map(s => `
    <tr>
      <td>
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${s.accent_color};vertical-align:middle;margin-right:8px"></span>
        <a href="/admin/sources/${s.id}">${s.name}</a>
      </td>
      <td>${s.country}</td>
      <td><code style="font-size:11px">${s.url}</code></td>
      <td><span style="color:${s.active ? '#16a34a' : '#dc2626'};font-weight:700">${s.active ? 'Actief' : 'Inactief'}</span></td>
    </tr>`).join('');

  res.send(layout('Bronnen', `
    <h1>Bronnen</h1>
    ${flash}
    <table>
      <thead><tr><th>Naam</th><th>Land</th><th>URL</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `));
});

router.get('/sources/:id', (req, res) => {
  const source = getDb().prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);
  if (!source) return res.status(404).send('Bron niet gevonden');
  const flash = req.query.saved ? '<div class="flash flash-ok">Wijzigingen opgeslagen.</div>' : '';

  res.send(layout(`Bewerk — ${source.name}`, `
    <h1>Bron bewerken</h1>
    ${flash}
    <form method="post" action="/admin/sources/${source.id}" style="max-width:640px">
      <label>Naam</label>
      <input type="text" name="name" value="${source.name}" required>

      <label>Slug (URL-naam, niet wijzigen na launch)</label>
      <input type="text" name="slug" value="${source.slug}" required>

      <label>Land</label>
      <select name="country" style="margin-bottom:12px">
        <option value="NL" ${source.country === 'NL' ? 'selected' : ''}>NL</option>
        <option value="US" ${source.country === 'US' ? 'selected' : ''}>US</option>
        <option value="INT" ${source.country === 'INT' ? 'selected' : ''}>INT</option>
      </select>

      <label>Website URL</label>
      <input type="text" name="url" value="${source.url}">

      <label>Accentkleur (hex)</label>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <input type="color" name="accent_color" value="${source.accent_color}" style="width:48px;height:36px;padding:2px;border:1.5px solid #ddd;border-radius:4px;margin:0">
        <input type="text" name="accent_color_text" value="${source.accent_color}" style="width:120px;margin:0" readonly>
      </div>

      <label>Actief</label>
      <select name="active" style="margin-bottom:12px">
        <option value="1" ${source.active ? 'selected' : ''}>Ja</option>
        <option value="0" ${!source.active ? 'selected' : ''}>Nee</option>
      </select>

      <button class="btn btn-primary" type="submit">Opslaan</button>
      &nbsp;<a href="/admin/sources" class="btn" style="background:#eee;color:#333">Annuleren</a>
    </form>
    <script>
      document.querySelector('input[type=color]').addEventListener('input', function() {
        document.querySelector('input[name=accent_color_text]').value = this.value;
      });
    </script>
  `));
});

router.post('/sources/:id', (req, res) => {
  const { name, slug, country, url, accent_color, active } = req.body;
  getDb().prepare(`
    UPDATE sources SET name=?, slug=?, country=?, url=?, accent_color=?, active=? WHERE id=?
  `).run(name, slug, country, url || null, accent_color, parseInt(active, 10), req.params.id);
  res.redirect(`/admin/sources/${req.params.id}?saved=1`);
});

export default router;

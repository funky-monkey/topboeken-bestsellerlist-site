import { Router } from 'express';
import { getDb } from '../../src/db/db.js';
import { layout } from '../views/layout.js';

const router = Router();

router.get('/sources', (req, res) => {
  const sources = getDb().prepare('SELECT * FROM sources ORDER BY name').all();
  const rows = sources.map(s => `
    <tr>
      <td><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${s.accent_color};vertical-align:middle;margin-right:8px"></span>${s.name}</td>
      <td>${s.country}</td>
      <td>${s.slug}</td>
      <td>
        <form method="post" action="/admin/sources/${s.id}" style="display:inline">
          <input type="hidden" name="active" value="${s.active ? 0 : 1}">
          <button class="btn ${s.active ? 'btn-danger' : 'btn-success'}" type="submit" style="padding:4px 10px;font-size:12px">
            ${s.active ? 'Deactiveer' : 'Activeer'}
          </button>
        </form>
      </td>
    </tr>`).join('');

  res.send(layout('Bronnen', `
    <h1>Bronnen</h1>
    <table><thead><tr><th>Naam</th><th>Land</th><th>Slug</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>
  `));
});

router.post('/sources/:id', (req, res) => {
  getDb().prepare('UPDATE sources SET active=? WHERE id=?').run(parseInt(req.body.active, 10), req.params.id);
  res.redirect('/admin/sources');
});

export default router;

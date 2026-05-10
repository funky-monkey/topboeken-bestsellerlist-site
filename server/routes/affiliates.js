import { Router } from 'express';
import { getDb } from '../../src/db/db.js';
import { layout } from '../views/layout.js';

const router = Router();

router.get('/affiliates', (req, res) => {
  const affiliates = getDb().prepare('SELECT * FROM affiliates ORDER BY country, name').all();
  const rows = affiliates.map(a => `
    <tr>
      <td>${a.name}</td><td>${a.slug}</td><td>${a.country}</td>
      <td style="color:${a.active ? '#16a34a' : '#dc2626'};font-weight:700">${a.active ? 'Actief' : 'Inactief'}</td>
    </tr>`).join('');

  res.send(layout('Affiliates', `
    <h1>Affiliates</h1>
    <table><thead><tr><th>Naam</th><th>Slug</th><th>Land</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <h2>Nieuwe affiliate toevoegen</h2>
    <form method="post" action="/admin/affiliates" style="max-width:400px">
      <label>Naam</label><input type="text" name="name" required>
      <label>Slug</label><input type="text" name="slug" required>
      <label>Land (NL/BE/INT)</label><input type="text" name="country" value="NL" required>
      <button class="btn btn-primary" type="submit">Toevoegen</button>
    </form>
  `));
});

router.post('/affiliates', (req, res) => {
  const { name, slug, country } = req.body;
  getDb().prepare('INSERT OR IGNORE INTO affiliates (name, slug, country) VALUES (?,?,?)').run(name, slug, country);
  res.redirect('/admin/affiliates');
});

export default router;

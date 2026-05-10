import { Router } from 'express';
import { getDb } from '../../src/db/db.js';
import { layout } from '../views/layout.js';

const router = Router();

router.get(['/', ''], (req, res) => {
  const db          = getDb();
  const bookCount   = db.prepare('SELECT COUNT(*) as c FROM books').get().c;
  const sourceCount = db.prepare('SELECT COUNT(*) as c FROM sources WHERE active=1').get().c;
  const lastScrapes = db.prepare(`
    SELECT sl.*, s.name as source_name FROM scrape_log sl
    LEFT JOIN sources s ON s.id = sl.source_id
    ORDER BY sl.started_at DESC LIMIT 20
  `).all();

  const rows = lastScrapes.map(s => `
    <tr>
      <td>${s.source_name ?? '—'}</td>
      <td>${s.started_at}</td>
      <td>${s.finished_at ?? '—'}</td>
      <td>${s.books_added} / ${s.books_updated}</td>
      <td style="color:${s.status === 'ok' ? '#16a34a' : '#dc2626'};font-weight:700">${s.status}</td>
    </tr>`).join('');

  res.send(layout('Dashboard', `
    <h1>Dashboard</h1>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-number">${bookCount}</div><div class="stat-label">boeken in database</div></div>
      <div class="stat-card"><div class="stat-number">${sourceCount}</div><div class="stat-label">actieve bronnen</div></div>
    </div>
    <div class="action-row">
      <form method="post" action="/admin/scrape">
        <button class="btn btn-primary" type="submit">▶ Handmatig scrapen</button>
      </form>
      <form method="post" action="/api/rebuild">
        <button class="btn btn-success" type="submit">🚀 Publiceer nu</button>
      </form>
    </div>
    <h2>Recente scrape-runs</h2>
    <table>
      <thead><tr><th>Bron</th><th>Gestart</th><th>Klaar</th><th>Toeg. / Bijgew.</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="color:#aaa">Nog geen runs</td></tr>'}</tbody>
    </table>
  `));
});

export default router;

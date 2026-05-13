import { Router } from 'express';
import { getDb } from '../../src/db/db.js';
import { layout } from '../views/layout.js';

const router = Router();

router.get('/logs', (req, res) => {
  const db   = getDb();
  const logs = db.prepare(`
    SELECT sl.*, s.name as source_name FROM scrape_log sl
    LEFT JOIN sources s ON s.id = sl.source_id
    ORDER BY sl.started_at DESC LIMIT 100
  `).all();

  const total = db.prepare('SELECT COUNT(*) as c FROM scrape_log').get().c;

  const rows = logs.map(l => `
    <tr>
      <td>${l.source_name ?? '—'}</td>
      <td>${l.started_at}</td>
      <td>${l.finished_at ?? '—'}</td>
      <td>${l.books_added} / ${l.books_updated}</td>
      <td style="color:${l.status === 'ok' ? '#16a34a' : '#dc2626'};font-weight:700">${l.status}</td>
      <td style="font-size:12px;color:#dc2626;max-width:300px;word-break:break-word">${l.error_msg ?? ''}</td>
    </tr>`).join('');

  const cleared = req.query.cleared === '1';

  res.send(layout('Scrape logs', `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h1 style="margin:0">Scrape logs <span style="font-size:14px;font-weight:400;color:#aaa">${total} regels</span></h1>
      <form method="post" action="/admin/logs/clear" style="margin:0"
        onsubmit="return confirm('Alle ${total} logregel(s) verwijderen?')">
        <button class="btn" style="color:#dc2626;border-color:#fecaca" type="submit">🗑 Logs wissen</button>
      </form>
    </div>
    ${cleared ? '<div class="flash flash-ok">Logs gewist.</div>' : ''}
    <table>
      <thead><tr><th>Bron</th><th>Gestart</th><th>Klaar</th><th>Toeg. / Bijgew.</th><th>Status</th><th>Fout</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="color:#aaa">Geen logs</td></tr>'}</tbody>
    </table>
  `));
});

router.post('/logs/clear', (req, res) => {
  getDb().prepare('DELETE FROM scrape_log').run();
  res.redirect('/admin/logs?cleared=1');
});

export default router;

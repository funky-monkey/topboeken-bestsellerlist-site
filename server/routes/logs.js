import { Router } from 'express';
import { getDb } from '../../src/db/db.js';
import { layout } from '../views/layout.js';

const router = Router();

router.get('/logs', (req, res) => {
  const logs = getDb().prepare(`
    SELECT sl.*, s.name as source_name FROM scrape_log sl
    LEFT JOIN sources s ON s.id = sl.source_id
    ORDER BY sl.started_at DESC LIMIT 100
  `).all();

  const rows = logs.map(l => `
    <tr>
      <td>${l.source_name ?? '—'}</td>
      <td>${l.started_at}</td>
      <td>${l.finished_at ?? '—'}</td>
      <td>${l.books_added} / ${l.books_updated}</td>
      <td style="color:${l.status === 'ok' ? '#16a34a' : '#dc2626'};font-weight:700">${l.status}</td>
      <td style="font-size:12px;color:#dc2626;max-width:300px;word-break:break-word">${l.error_msg ?? ''}</td>
    </tr>`).join('');

  res.send(layout('Scrape logs', `
    <h1>Scrape logs</h1>
    <table>
      <thead><tr><th>Bron</th><th>Gestart</th><th>Klaar</th><th>Toeg. / Bijgew.</th><th>Status</th><th>Fout</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="color:#aaa">Geen logs</td></tr>'}</tbody>
    </table>
  `));
});

export default router;

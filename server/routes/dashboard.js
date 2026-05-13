import { Router } from 'express';
import { getDb } from '../../src/db/db.js';
import { layout } from '../views/layout.js';

const router = Router();

router.get(['/', ''], (req, res) => {
  const db          = getDb();
  const bookCount   = db.prepare('SELECT COUNT(*) as c FROM books WHERE deleted = 0').get().c;
  const sourceCount = db.prepare('SELECT COUNT(*) as c FROM sources WHERE active=1').get().c;
  const missingNl   = db.prepare("SELECT COUNT(*) as c FROM books WHERE summary IS NOT NULL AND summary != '' AND (summary_nl IS NULL OR summary_nl = '') AND deleted = 0").get().c;
  const missingCover = db.prepare("SELECT COUNT(*) as c FROM books WHERE (cover_path IS NULL OR cover_path = '') AND deleted = 0").get().c;
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
      <div class="stat-card"><div class="stat-number">${missingCover}</div><div class="stat-label">zonder cover</div></div>
      <div class="stat-card"><div class="stat-number">${missingNl}</div><div class="stat-label">zonder NL omschrijving</div></div>
    </div>
    <div class="action-row">
      <form method="post" action="/admin/scrape">
        <button class="btn btn-primary" type="submit">▶ Handmatig scrapen</button>
      </form>
      <form method="post" action="/api/rebuild">
        <button class="btn btn-success" type="submit">🚀 Publiceer nu</button>
      </form>
      <button class="btn" onclick="startStream('covers', this, '/admin/enrich-covers/stream')">
        🖼 Covers herdownloaden (${missingCover})
      </button>
      <button class="btn" onclick="startStream('translate', this, '/admin/translate/stream')" ${missingNl === 0 ? 'disabled' : ''}>
        🌐 Vertalingen aanvullen (${missingNl})
      </button>
      <button class="btn" onclick="startStream('authors', this, '/admin/enrich-authors/stream')">
        ✍ Auteurs aanvullen
      </button>
    </div>

    ${streamPanel('covers', 'Cover downloader')}
    ${streamPanel('translate', 'MyMemory vertaalservice — max 80 per run')}
    ${streamPanel('authors', 'Open Library auteurspagina\'s')}

    <script>
    function streamPanel(id) {
      return document.getElementById(id + '-panel');
    }

    function startStream(id, btn, url) {
      const panel = document.getElementById(id + '-panel');
      const out   = document.getElementById(id + '-out');
      panel.style.display = 'block';
      out.textContent = 'Verbinden…';
      btn.disabled = true;
      btn.dataset.origText = btn.textContent;
      btn.textContent = '⏳ Bezig…';

      const es = new EventSource(url);
      es.onmessage = e => {
        if (out.textContent === 'Verbinden…') out.textContent = '';
        out.textContent += e.data + '\\n';
        out.scrollTop = out.scrollHeight;
        if (e.data.includes('[klaar]')) {
          es.close();
          btn.textContent = '✓ Klaar';
        }
      };
      es.onerror = () => {
        out.textContent += '\\n[verbinding verbroken]\\n';
        es.close();
        btn.disabled = false;
        btn.textContent = btn.dataset.origText;
      };
    }
    </script>

    <h2>Recente scrape-runs</h2>
    <table>
      <thead><tr><th>Bron</th><th>Gestart</th><th>Klaar</th><th>Toeg. / Bijgew.</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="color:#aaa">Nog geen runs</td></tr>'}</tbody>
    </table>
  `));
});

function streamPanel(id, label) {
  return `
    <div id="${id}-panel" style="display:none;margin:16px 0;background:#fff;border:1px solid #e5e5e5;border-radius:4px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:14px">${label}</strong>
        <button onclick="document.getElementById('${id}-panel').style.display='none'" class="btn" style="padding:2px 8px;font-size:12px">✕</button>
      </div>
      <pre id="${id}-out" style="background:#111;color:#e5e5e5;padding:16px;font-size:12px;line-height:1.6;height:240px;overflow-y:auto;white-space:pre-wrap;margin:0;border-radius:3px">Verbinden…</pre>
    </div>`;
}

export default router;

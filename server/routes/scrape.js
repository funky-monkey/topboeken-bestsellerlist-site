import { Router } from 'express';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../views/layout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

router.get('/scrape', (req, res) => {
  res.send(layout('Scrapen', `
    <h1>Handmatig scrapen</h1>
    <p style="color:#666;margin-bottom:16px">Haalt nieuwe data op uit alle actieve bronnen en bouwt daarna de site opnieuw. Duurt 5–15 minuten.</p>
    <form method="post" action="/admin/scrape">
      <button class="btn btn-primary" type="submit">▶ Start scraper</button>
      <a href="/admin/" class="btn" style="margin-left:8px">Terug</a>
    </form>
  `));
});

router.post('/scrape', (req, res) => {
  res.send(layout('Scrapen', `
    <h1>Scraper gestart</h1>
    <p style="color:#666;margin-bottom:16px">Scraper en build draaien op de achtergrond. Live output hieronder.</p>
    <pre id="output" style="background:#111;color:#e5e5e5;padding:20px;font-size:13px;line-height:1.6;min-height:120px;overflow-y:auto;max-height:65vh;white-space:pre-wrap;border-radius:4px">Verbinden…</pre>
    <div id="done-actions" style="display:none;margin-top:16px">
      <a href="/admin/" class="btn btn-primary">Terug naar dashboard</a>
      <a href="/admin/logs" class="btn" style="margin-left:8px">Bekijk logs</a>
      <a href="https://top-boeken.nl" target="_blank" class="btn" style="margin-left:8px">Bekijk site →</a>
    </div>
    <script>
      const out = document.getElementById('output');
      const actions = document.getElementById('done-actions');
      const es = new EventSource('/admin/scrape/stream');
      es.onmessage = e => {
        if (out.textContent === 'Verbinden…') out.textContent = '';
        out.textContent += e.data + '\\n';
        out.scrollTop = out.scrollHeight;
        if (e.data.includes('[klaar]')) {
          es.close();
          actions.style.display = 'block';
        }
      };
      es.onerror = () => {
        out.textContent += '\\n[verbinding verbroken]\\n';
        es.close();
        actions.style.display = 'block';
      };
    </script>
  `));
});

router.get('/scrape/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const scriptPath = join(__dirname, '../../scripts/scrape.sh');
  const child = spawn('bash', [scriptPath], {
    env: { ...process.env },
    cwd: join(__dirname, '../..'),
  });

  const send = line => res.write(`data: ${line}\n\n`);

  child.stdout.on('data', chunk => chunk.toString().split('\n').forEach(l => { if (l.trim()) send(l); }));
  child.stderr.on('data', chunk => chunk.toString().split('\n').forEach(l => { if (l.trim()) send(`[stderr] ${l}`); }));
  child.on('close', code => { send(`[klaar] Gereed (exit ${code})`); res.end(); });

  req.on('close', () => child.kill());
});

export default router;

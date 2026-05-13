import { Router } from 'express';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../../src/db/db.js';
import { layout } from '../views/layout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

router.get('/enrich-covers', (req, res) => {
  const db = getDb();
  const missing = db.prepare(
    "SELECT COUNT(*) as c FROM books WHERE (cover_path IS NULL OR cover_path = '') AND isbn IS NOT NULL"
  ).get().c;

  res.send(layout('Covers aanvullen', `
    <h1>Covers aanvullen</h1>
    <p>${missing} boeken missen een cover en komen in aanmerking.</p>
    <div class="action-row" style="margin-bottom:24px">
      <button id="start-btn" class="btn btn-primary" onclick="startEnrich()">▶ Start cover enricher</button>
      <a href="/admin/" class="btn">Terug</a>
    </div>
    <pre id="output" style="background:#111;color:#e5e5e5;padding:20px;min-height:120px;font-size:13px;line-height:1.6;overflow-y:auto;max-height:60vh;white-space:pre-wrap;border-radius:4px">Klik op Start om te beginnen...</pre>
    <script src="/scripts/enrich-covers.js"></script>
  `));
});

router.get('/enrich-covers/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const scriptPath = join(__dirname, '../../scripts/enrich-covers.js');
  const child = spawn(process.execPath, [scriptPath], {
    env: { ...process.env },
    cwd: join(__dirname, '../..'),
  });

  const send = (line) => res.write(`data: ${line}\n\n`);

  child.stdout.on('data', chunk => {
    chunk.toString().split('\n').forEach(l => { if (l) send(l); });
  });
  child.stderr.on('data', chunk => {
    chunk.toString().split('\n').forEach(l => { if (l) send(`[stderr] ${l}`); });
  });
  child.on('close', code => {
    send(`[klaar] exit ${code}`);
    res.end();
  });

  req.on('close', () => child.kill());
});

export default router;

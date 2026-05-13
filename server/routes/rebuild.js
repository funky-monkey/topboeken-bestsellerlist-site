import { Router } from 'express';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../views/layout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

router.post('/rebuild', (req, res) => {
  res.send(layout('Publiceren', `
    <h1>Site publiceren</h1>
    <p style="color:#666;margin-bottom:16px">De site wordt opnieuw gebouwd. Dit duurt ~30 seconden.</p>
    <pre id="output" style="background:#111;color:#e5e5e5;padding:20px;font-size:13px;line-height:1.6;min-height:80px;overflow-y:auto;max-height:60vh;white-space:pre-wrap;border-radius:4px">Verbinden…</pre>
    <div id="done-actions" style="display:none;margin-top:16px;display:none">
      <a href="/admin/" class="btn btn-primary">Terug naar dashboard</a>
      <a href="https://top-boeken.nl" target="_blank" class="btn" style="margin-left:8px">Bekijk site →</a>
    </div>
    <script>
      const out = document.getElementById('output');
      const actions = document.getElementById('done-actions');
      const es = new EventSource('/api/rebuild/stream');
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
      };
    </script>
  `));
});

router.get('/rebuild/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const scriptPath = join(__dirname, '../../scripts/build.sh');
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

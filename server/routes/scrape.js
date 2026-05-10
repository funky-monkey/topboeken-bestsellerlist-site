import { Router } from 'express';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../views/layout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

router.post('/scrape', (req, res) => {
  const scriptPath = join(__dirname, '../../scripts/scrape.sh');
  const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' });
  child.unref();
  res.send(layout('Scrapen gestart', `
    <h1>Scrapen gestart</h1>
    <p>De scraper draait op de achtergrond. Bekijk de voortgang in de <a href="/admin/logs">logs</a>.</p>
    <p style="margin-top:16px"><a href="/admin" class="btn btn-primary">Terug naar dashboard</a></p>
  `));
});

export default router;

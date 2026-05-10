import { Router } from 'express';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../views/layout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

router.post('/rebuild', (req, res) => {
  const scriptPath = join(__dirname, '../../scripts/build.sh');
  const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' });
  child.unref();
  res.send(layout('Publicatie gestart', `
    <h1>Publiceren gestart</h1>
    <p>De site wordt opnieuw gebouwd en gepubliceerd. Dit duurt ongeveer 30–60 seconden.</p>
    <p style="margin-top:16px"><a href="/admin/" class="btn btn-primary">Terug naar dashboard</a></p>
  `));
});

export default router;

import { Router } from 'express';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../../src/db/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

router.get('/translate/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const script = join(__dirname, '../../scripts/translate-mymemory.js');
  const child  = spawn(process.execPath, [script], {
    env: { ...process.env },
    cwd: join(__dirname, '../..'),
  });

  const send = line => res.write(`data: ${line}\n\n`);
  child.stdout.on('data', chunk => chunk.toString().split('\n').forEach(l => { if (l.trim()) send(l); }));
  child.stderr.on('data', chunk => chunk.toString().split('\n').forEach(l => { if (l.trim()) send(`[err] ${l}`); }));
  child.on('close', code => { send(`[klaar] exit ${code}`); res.end(); });
  req.on('close', () => child.kill());
});

export default router;

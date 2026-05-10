import { Router } from 'express';
import bcrypt from 'bcrypt';
import { loginView } from '../views/login.js';

const router = Router();

router.get('/login', (req, res) => {
  if (req.session?.authenticated) return res.redirect('/admin');
  res.send(loginView());
});

router.post('/login', async (req, res) => {
  const { password } = req.body;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return res.send(loginView('ADMIN_PASSWORD_HASH is not set.'));

  const ok = await bcrypt.compare(password, hash);
  if (!ok) return res.send(loginView('Ongeldig wachtwoord.'));

  req.session.authenticated = true;
  res.redirect('/admin');
});

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/admin/login')));
router.get('/logout',  (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

export default router;

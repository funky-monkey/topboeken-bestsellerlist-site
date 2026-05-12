import { Router } from 'express';

const router = Router();

router.get('/auth-status', (req, res) => {
  res.json({ authenticated: req.session?.authenticated === true });
});

export default router;

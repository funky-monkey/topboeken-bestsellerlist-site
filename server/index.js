import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { requireAuth } from './middleware/auth.js';
import authRoutes       from './routes/auth.js';
import dashboardRoutes  from './routes/dashboard.js';
import booksRoutes      from './routes/books.js';
import sourcesRoutes    from './routes/sources.js';
import affiliatesRoutes from './routes/affiliates.js';
import logsRoutes       from './routes/logs.js';
import scrapeRoutes     from './routes/scrape.js';
import rebuildRoutes    from './routes/rebuild.js';
import authStatusRoutes from './routes/auth-status.js';

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret:            process.env.SESSION_SECRET ?? 'change-me-in-production',
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'strict' },
}));

// Public auth routes
app.use('/admin', authRoutes);

// Protected admin routes
app.use('/admin', requireAuth, dashboardRoutes);
app.use('/admin', requireAuth, booksRoutes);
app.use('/admin', requireAuth, sourcesRoutes);
app.use('/admin', requireAuth, affiliatesRoutes);
app.use('/admin', requireAuth, logsRoutes);
app.use('/admin', requireAuth, scrapeRoutes);

// API routes — auth-status is public (no requireAuth), rebuild is protected
app.use('/api', authStatusRoutes);
app.use('/api', requireAuth, rebuildRoutes);

app.listen(PORT, () => console.log(`CMS running on http://localhost:${PORT}/admin`));

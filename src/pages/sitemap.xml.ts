import type { APIRoute } from 'astro';
import { getAllBooks, getAllSources, getAllGenres } from '../lib/data.js';

export const GET: APIRoute = ({ site }) => {
  const base = site?.toString().replace(/\/$/, '') ?? 'https://top-boeken.nl';
  const books   = getAllBooks();
  const sources = getAllSources();
  const genres  = getAllGenres();

  const urls = [
    { loc: base, priority: '1.0' },
    ...genres.map(g  => ({ loc: `${base}/genre/${g.slug}`,    priority: '0.8' })),
    ...sources.map(s => ({ loc: `${base}/lijsten/${s.slug}`,  priority: '0.8' })),
    ...books.map(b   => ({ loc: `${base}/boeken/${b.slug}`,   lastmod: b.updated_at?.slice(0, 10), priority: '0.9' })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};

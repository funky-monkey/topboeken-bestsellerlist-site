import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';

const URL = 'https://www.cpnb.nl/bestseller-60';

export async function scrapeBesteller60() {
  const html = await fetchText(URL);
  const $ = cheerio.load(html);
  const entries = [];

  // Try multiple selector patterns since CPNB may update their layout
  const rows = $('table tbody tr, .bestseller-list li, .book-list li');

  rows.each((_, row) => {
    const rank  = parseInt($('.rank, td:first-child', row).text().trim(), 10);
    const title = $('.title, td:nth-child(2)', row).text().trim();
    const author= $('.author, td:nth-child(3)', row).text().trim();

    if (rank && title && author) {
      entries.push({ rank, title, author, list_name: 'Besteller 60', source: 'besteller-60', isbn: null, summary: null });
    }
  });

  return entries;
}

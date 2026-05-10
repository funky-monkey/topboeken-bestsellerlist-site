import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';

export async function scrapeWikipedia() {
  const html = await fetchText('https://en.wikipedia.org/api/rest_v1/page/html/List_of_best-selling_books');
  const $ = cheerio.load(html);
  const entries = [];

  // First table = best-selling individual books by estimated sales
  $('table').first().find('tbody tr').each((i, row) => {
    const cells = $('td', row).map((_, td) => $(td).text().trim()).get();
    if (cells.length >= 2 && cells[0] && cells[1] && cells[0] !== 'Book') {
      entries.push({
        rank:      i + 1,
        title:     cells[0],
        author:    cells[1],
        list_name: 'All-Time Bestsellers',
        source:    'wikipedia',
        isbn:      null,
        summary:   null,
      });
    }
  });

  return entries.slice(0, 30);
}

import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';

// Low priority — largely mirrors NY Times. Disabled by default in seed.
export async function scrapeBarnesNoble() {
  const html = await fetchText('https://www.barnesandnoble.com/b/the-new-york-times-bestsellers/_/N-1p3n');
  const $ = cheerio.load(html);
  const entries = [];

  $('.product-shelf-title').each((i, el) => {
    const title  = $(el).text().trim();
    const author = $(el).closest('.product-shelf').find('.contributors a').first().text().trim();
    if (title && author) {
      entries.push({ rank: i + 1, title, author, list_name: 'Barnes & Noble Bestsellers', source: 'barnes-noble', isbn: null, summary: null });
    }
  });

  return entries.slice(0, 20);
}

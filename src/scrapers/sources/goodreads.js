import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';

export async function scrapeGoodreads() {
  const html = await fetchText('https://www.goodreads.com/shelf/show/current-bestsellers');
  const $ = cheerio.load(html);
  const entries = [];

  $('.bookTitle').each((i, el) => {
    const title  = $(el).text().trim();
    const author = $(el).closest('.elementList').find('.authorName').text().trim();
    if (title && author) {
      entries.push({ rank: i + 1, title, author, list_name: 'Current Bestsellers', source: 'goodreads', isbn: null, summary: null });
    }
  });

  return entries.slice(0, 50);
}

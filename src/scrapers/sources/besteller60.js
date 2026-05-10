import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';

export async function scrapeBesteller60() {
  const html = await fetchText('https://www.debestseller60.nl');
  const $ = cheerio.load(html);
  const entries = [];

  // Each book entry has a rank number, author link (/zoeken/Author), and title
  // Parse by finding ISBN numbers and working backwards to title/author
  $('a[href*="/zoeken/"]').each((_, el) => {
    const author = $(el).text().trim();
    if (!author) return;

    const container = $(el).parent();
    const text = container.text();

    // Extract rank from preceding text (digits at start of block)
    const rankMatch = text.match(/^\s*(\d+)/);
    const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;
    if (!rank || rank > 60) return;

    // Title is the next significant text node after the author link
    const title = $(el).next('a').text().trim() || $(el).siblings('a').not('[href*="/zoeken/"]').first().text().trim();

    // ISBN may appear as plain text
    const isbnMatch = text.match(/97[89]\d{10}/);
    const isbn = isbnMatch ? isbnMatch[0] : null;

    if (rank && author && title) {
      entries.push({ rank, title, author, isbn, list_name: 'Besteller 60', source: 'besteller-60', summary: null });
    }
  });

  // Deduplicate by rank, keep first occurrence
  const seen = new Set();
  return entries.filter(e => {
    if (seen.has(e.rank)) return false;
    seen.add(e.rank);
    return true;
  }).sort((a, b) => a.rank - b.rank);
}

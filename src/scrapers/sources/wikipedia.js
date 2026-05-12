import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';

function cleanText(str) {
  return str
    .replace(/\[.*?\]/g, '')  // strip footnotes [1], [a] etc.
    .replace(/\s+/g, ' ')
    .trim();
}

// Detect sales range from h3 heading text
function salesLabel(text, isSeries) {
  const prefix = isSeries ? 'Bestselling Boekenreeksen' : 'Bestverkochte Boeken';
  // More specific ranges first — "50 million and 100 million" must match before plain "100 million"
  if (text.includes('50') && text.includes('100')) return `${prefix} (50–100M exemplaren)`;
  if (text.includes('30') && text.includes('50'))  return `${prefix} (30–50M exemplaren)`;
  if (text.includes('20') && text.includes('50'))  return `${prefix} (20–50M exemplaren)`;
  if (text.includes('20') && text.includes('30'))  return `${prefix} (20–30M exemplaren)`;
  if (text.includes('15') && text.includes('20'))  return `${prefix} (15–20M exemplaren)`;
  if (text.includes('10') && text.includes('20'))  return `${prefix} (10–20M exemplaren)`;
  if (text.includes('100'))                        return `${prefix} (100M+ exemplaren)`;
  return prefix;
}

// Which h2 sections to include (skip "regularly updated", "see also", etc.)
const STOP_SECTIONS = ['regularly', 'see also', 'notes', 'references', 'external'];

export async function scrapeWikipedia() {
  const html = await fetchText(
    'https://en.wikipedia.org/api/rest_v1/page/html/List_of_best-selling_books'
  );
  const $ = cheerio.load(html);
  const entries = [];
  let rank = 1;
  let currentListName = 'Bestverkochte Boeken (100M+ exemplaren)';
  let isSeries = false;
  let stopped = false;

  $('h2, h3, table').each((_, el) => {
    if (stopped) return false;
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().toLowerCase();

    if (tag === 'h2') {
      if (STOP_SECTIONS.some(s => text.includes(s))) { stopped = true; return false; }
      isSeries = text.includes('series');
      return;
    }

    if (tag === 'h3') {
      currentListName = salesLabel($(el).text(), isSeries);
      return;
    }

    // It's a table — parse it
    const headers = $(el).find('th')
      .map((_, th) => cleanText($(th).text()).toLowerCase())
      .get();

    const titleIdx  = headers.findIndex(h => h === 'book' || h === 'series' || h.includes('book') || h.includes('series'));
    const authorIdx = headers.findIndex(h => h.includes('author'));
    const genreIdx  = headers.findIndex(h => h.includes('genre'));

    if (titleIdx === -1 || authorIdx === -1) return; // not a book table

    $(el).find('tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length <= Math.max(titleIdx, authorIdx)) return;

      const title  = cleanText($(cells.eq(titleIdx)).text());
      const author = cleanText($(cells.eq(authorIdx)).text()).split(/[,;&]/)[0].trim();

      if (!title || !author || title.length < 2) return;

      const genre = genreIdx >= 0 ? cleanText($(cells.eq(genreIdx)).text()) : null;

      entries.push({
        rank:      rank++,
        title,
        author,
        list_name: currentListName,
        source:    'wikipedia',
        isbn:      null,
        summary:   genre || null,
      });
    });
  });

  console.log(`  Wikipedia: ${entries.length} entries across all sections`);
  return entries;
}

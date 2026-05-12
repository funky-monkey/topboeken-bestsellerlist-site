import * as cheerio from 'cheerio';

// Low priority — largely mirrors NY Times. Disabled by default in seed.
export async function scrapeBarnesNoble() {
  const res = await fetch('https://www.barnesandnoble.com/b/the-new-york-times-bestsellers/_/N-1p3n', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.google.com/',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'cross-site',
      'sec-fetch-user': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for Barnes & Noble`);

  const html = await res.text();
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

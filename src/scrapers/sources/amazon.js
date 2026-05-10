import { chromium } from 'playwright';

export async function scrapeAmazon() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', locale: 'nl-NL' });
  const page = await context.newPage();
  const entries = [];

  try {
    await page.goto('https://www.amazon.nl/gp/bestsellers/books', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000 + Math.random() * 2000);

    const items = await page.$$eval('.zg-grid-general-faceout', nodes =>
      nodes.slice(0, 20).map((el, i) => ({
        rank:   i + 1,
        title:  el.querySelector('._cDEzb_p13n-sc-css-line-clamp-3_g3dy1, .p13n-sc-truncate')?.textContent?.trim() ?? '',
        author: el.querySelector('.a-size-small.a-color-secondary')?.textContent?.trim() ?? '',
      }))
    );

    for (const item of items) {
      if (item.title) {
        entries.push({ ...item, list_name: 'Amazon NL Bestsellers', source: 'amazon-nl', isbn: null, summary: null });
      }
    }
  } catch (err) {
    console.warn(`Amazon scraper error: ${err.message}`);
  } finally {
    await browser.close();
  }

  return entries;
}

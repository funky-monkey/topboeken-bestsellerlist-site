import { chromium } from 'playwright';

// bol.com affiliate API credentials not yet active.
// Playwright fallback until affiliate account is set up.
export async function scrapeBolcom() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'nl-NL' });
  const page = await context.newPage();
  const entries = [];

  try {
    await page.goto('https://www.bol.com/nl/l/boeken/bestsellers/N/5385/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000 + Math.random() * 2000);

    const items = await page.$$eval('[data-test="product-title"]', nodes =>
      nodes.slice(0, 20).map((el, i) => ({
        rank:   i + 1,
        title:  el.textContent?.trim() ?? '',
        author: el.closest('[data-test="product-item"]')?.querySelector('[data-test="product-seller"]')?.textContent?.trim() ?? '',
      }))
    );

    for (const item of items) {
      if (item.title) {
        entries.push({ ...item, list_name: 'bol.com Bestsellers', source: 'bol-com', isbn: null, summary: null });
      }
    }
  } catch (err) {
    console.warn(`bol.com scraper error: ${err.message}`);
  } finally {
    await browser.close();
  }

  return entries;
}

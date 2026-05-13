import * as cheerio from 'cheerio';

/**
 * Convert ISBN-13 to ISBN-10.
 * Only works for 978-prefixed ISBNs (the vast majority of books).
 * Returns null for 979-prefixed ISBNs (no ISBN-10 equivalent).
 */
function isbn13ToIsbn10(isbn13) {
  if (!isbn13 || !isbn13.startsWith('978')) return null;
  const digits = isbn13.slice(3, 12); // 9 digits after "978", before check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i], 10) * (10 - i);
  }
  const check = (11 - (sum % 11)) % 11;
  return digits + (check === 10 ? 'X' : check.toString());
}

/**
 * Build a direct Amazon NL product URL from ISBN-13.
 * For 978-prefix books: amazon.nl/dp/{isbn10}
 * For 979-prefix books: fall back to search
 */
export function amazonUrl(isbn13, affiliateTag = null) {
  const isbn10 = isbn13ToIsbn10(isbn13);
  const tag = affiliateTag ? `?tag=${affiliateTag}` : '';
  if (isbn10) return `https://www.amazon.nl/dp/${isbn10}${tag}`;
  return `https://www.amazon.nl/s?k=${isbn13}${tag ? '&' + tag.slice(1) : ''}`;
}

/**
 * Fetch the direct bol.com product URL for an ISBN by scraping their search page.
 * Returns the direct product URL, or a search fallback if not found.
 */
export async function bolUrl(isbn13) {
  const searchFallback = `https://www.bol.com/nl/s/?searchtext=${isbn13}`;
  try {
    const res = await fetch(`https://www.bol.com/nl/s/?searchtext=${isbn13}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'nl-NL,nl;q=0.9',
      },
    });
    if (!res.ok) return searchFallback;
    const html = await res.text();
    const $ = cheerio.load(html);

    // First product link on the search results page
    const href = $('[data-test="product-title"]').first().attr('href')
      || $('a.product-title').first().attr('href')
      || $('li.product-item--row a[href*="/nl/nl/p/"]').first().attr('href');

    if (!href) return searchFallback;
    const clean = href.split('?')[0]; // strip query params
    return `https://www.bol.com${clean.startsWith('/') ? '' : '/'}${clean}`;
  } catch {
    return searchFallback;
  }
}

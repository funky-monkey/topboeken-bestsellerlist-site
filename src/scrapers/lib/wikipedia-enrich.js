import { fetchJson } from './http.js';
import { RateLimiter } from './rate-limiter.js';

const limiter = new RateLimiter(3);

/**
 * Try to get a description for a book from Wikipedia.
 * Strategy:
 *   1. Search Wikipedia for "{title} {author}"
 *   2. Take the first result's page summary (the intro extract)
 *   3. Return null if nothing useful found
 */
export async function getWikipediaDescription(title, author) {
  await limiter.wait();

  try {
    // Step 1: search for the book
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('srsearch', `${title} ${author} novel book`);
    searchUrl.searchParams.set('srlimit', '1');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('origin', '*');

    const search = await fetchJson(searchUrl.toString());
    const firstResult = search?.query?.search?.[0];
    if (!firstResult) return null;

    // Step 2: get the page summary (clean intro extract)
    await limiter.wait();
    const pageTitle = encodeURIComponent(firstResult.title.replace(/ /g, '_'));
    const summary = await fetchJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`
    );

    const extract = summary?.extract;
    if (!extract || extract.length < 50) return null;

    // Trim to a reasonable length and stop at a sentence boundary
    if (extract.length <= 500) return extract;
    const trimmed = extract.slice(0, 500);
    const lastDot = trimmed.lastIndexOf('.');
    return lastDot > 200 ? trimmed.slice(0, lastDot + 1) : trimmed;

  } catch {
    return null;
  }
}

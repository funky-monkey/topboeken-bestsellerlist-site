import { parseString } from 'xml2js';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';
import { fetchText } from '../lib/http.js';

const parseXml = promisify(parseString);

export async function scrapePublishersWeekly() {
  const xml = await fetchText('https://www.publishersweekly.com/pw/feeds/recent/index.xml');
  const feed = await parseXml(xml);
  const items = feed?.rss?.channel?.[0]?.item ?? [];

  const bestseller = items.find(i => i.title?.[0]?.toLowerCase().includes('bestseller'));
  if (!bestseller) return [];

  const articleUrl = bestseller.link?.[0];
  if (!articleUrl) return [];

  const html = await fetchText(articleUrl);
  const $ = cheerio.load(html);
  const entries = [];

  $('ol li, .bestseller-list li').each((i, el) => {
    const text = $(el).text().trim();
    const match = text.match(/^(.+?)[,\s]+by\s+(.+)/i);
    if (match) {
      entries.push({ rank: i + 1, title: match[1].trim(), author: match[2].trim(), list_name: 'Publishers Weekly Bestsellers', source: 'publishers-weekly', isbn: null, summary: null });
    }
  });

  return entries;
}

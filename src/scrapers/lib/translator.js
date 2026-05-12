import { fetchJson } from './http.js';
import { RateLimiter } from './rate-limiter.js';

// MyMemory: 50,000 chars/day free with email, no key needed
// https://mymemory.translated.net/doc/spec.php
const limiter = new RateLimiter(2);
const EMAIL   = 'sidney@funky-monkey.nl';

export async function translateToNl(text) {
  if (!text?.trim()) return null;

  // Skip translation for short or already-Dutch-ish texts
  if (text.length > 1500) text = text.slice(0, 1500); // stay well within daily limit

  await limiter.wait();

  try {
    const q   = encodeURIComponent(text);
    const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=en|nl&de=${EMAIL}`;
    const data = await fetchJson(url);

    // responseStatus 200 = success, 206 = quota exceeded
    if (data?.responseStatus !== 200) {
      console.warn(`  MyMemory: status ${data?.responseStatus} — ${data?.responseDetails}`);
      return null;
    }

    return data?.responseData?.translatedText ?? null;
  } catch {
    return null;
  }
}

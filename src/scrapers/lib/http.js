export const USER_AGENT = 'TopBoeken/1.0 (sidney@funky-monkey.nl)';

export async function fetchWithAgent(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res;
}

export async function fetchJson(url, options = {}) {
  const res = await fetchWithAgent(url, options);
  return res.json();
}

export async function fetchText(url, options = {}) {
  const res = await fetchWithAgent(url, options);
  return res.text();
}

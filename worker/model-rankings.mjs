// Read the public leaderboard's displayed metrics, not undocumented API fields.
export const SOURCE = 'https://artificialanalysis.ai/leaderboards/models';
const COMPANIES = {
  anthropic: ['Anthropic', 'https://claude.ai/new'],
  openai: ['OpenAI', 'https://chatgpt.com/'],
  google: ['Google', 'https://gemini.google.com/app'],
  spacexai: ['SpaceXAI', 'https://grok.com/'],
  xai: ['SpaceXAI', 'https://grok.com/'],
  kimi: ['Moonshot AI', 'https://www.kimi.com/'],
  moonshotai: ['Moonshot AI', 'https://www.kimi.com/'],
  meta: ['Meta', 'https://www.meta.ai/'],
  alibaba: ['Alibaba', 'https://qwen.ai/'],
  zai: ['Z AI', 'https://z.ai/chat'],
  deepseek: ['DeepSeek', 'https://chat.deepseek.com/']
};
function text(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
    const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, n) => ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[n]).trim();
}
const key = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
function number(value) {
  return /^\$?\d+(?:\.\d+)?$/.test(value) ? Number(value.replace('$', '')) : null;
}
export function parseRankings(html, now = new Date()) {
  let candidates = [];
  let found = false;
  for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    let columns;
    for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => text(c[1]));
      const headers = cells.map(key);
      if (headers.includes('artificialanalysisintelligenceindex')) {
        columns = ['model', 'creator', 'artificialanalysisintelligenceindex', 'costpertaskusd', 'totalresponses'].map(h => headers.indexOf(h));
        if (columns.some(i => i < 0)) throw new Error('Leaderboard columns changed');
        found = true;
        continue;
      }
      if (!columns) continue;
      const [name, creator, intelligenceText, costText, secondsText] = columns.map(i => cells[i] || '');
      const company = COMPANIES[key(creator)] || (creator ? [creator, SOURCE] : null);
      const intelligence = number(intelligenceText), cost = number(costText), seconds = number(secondsText);
      // Missing values and provisional (*) scores cannot silently become zero.
      if (!company || !name || intelligence === null || cost === null || seconds === null || seconds <= 0 || seconds > 35) continue;
      candidates.push({ name, company: company[0], website: company[1], intelligence, cost, seconds });
    }
  }
  if (!found) throw new Error('Leaderboard table unavailable');
  candidates.sort((a, b) => b.intelligence - a.intelligence || a.cost - b.cost || a.seconds - b.seconds || a.name.localeCompare(b.name));
  const seen = new Set();
  const models = candidates.filter(m => {
    const identity = m.company + ":" + m.name;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).slice(0, 7);
  if (!models.length) throw new Error('No verified qualifying models');
  return { source: SOURCE, updatedAt: now.toISOString(), models };
}

let pending;
let retryAfter = 0;
export async function handleModelRankings(request, env, cache = globalThis.caches?.default, fetcher = fetch) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const cacheKey = new Request(new URL('/api/model-rankings?selection=models-v2', request.url));
  let previous;
  try { previous = await (await cache?.match(cacheKey))?.json(); } catch (_) { /* recover via source */ }
  if (previous && Date.now() - Date.parse(previous.updatedAt) < 3600000) return json({ ...previous, stale: false });
  try {
    if (Date.now() < retryAfter) throw new Error('Source retry cooldown');
    if (!pending) {
      pending = (async () => {
        const response = await fetcher(SOURCE, { signal: AbortSignal.timeout(20000), headers: { Accept: 'text/html' } });
        if (!response.ok) throw new Error('Leaderboard unavailable');
        const data = parseRankings(await response.text());
        try { await cache?.put(cacheKey, new Response(JSON.stringify(data), { headers: { ...headers, 'Cache-Control': 'public, max-age=604800' } })); } catch (_) { /* data still usable */ }
        return data;
      })().finally(() => { pending = null; });
    }
    return json({ ...await pending, stale: false });
  } catch (_) {
    retryAfter = Date.now() + 60000;
    if (!previous) {
      try {
        const fallback = await env.ASSETS.fetch(new Request(new URL('/assets/model-rankings.json', request.url)));
        if (fallback.ok) previous = await fallback.json();
      } catch (_) { /* no snapshot */ }
    }
    return previous ? json({ ...previous, stale: true }) : json({ error: 'Rankings temporarily unavailable.' }, 503);
  }
}

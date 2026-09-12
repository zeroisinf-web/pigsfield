// Read the public leaderboard's displayed metrics, not undocumented API fields.
export const SOURCE = 'https://artificialanalysis.ai/leaderboards/models';
// One table row per company: the most intelligent model that finishes end to end inside
// MAX_SECONDS, for the MAX_COMPANIES highest-placed companies. A leaderboard's top is
// usually three labs listing six configurations of the same two models, which told a
// visitor nothing about who else is worth opening. A company appears once or not at all.
export const MAX_SECONDS = 35;
export const MAX_COMPANIES = 10;
const COMPANIES = {
  anthropic: ['Anthropic', 'https://claude.ai/new'],
  openai: ['OpenAI', 'https://chatgpt.com/'],
  google: ['Google', 'https://gemini.google.com/app'],
  googledeepmind: ['Google', 'https://gemini.google.com/app'],
  spacexai: ['SpaceXAI', 'https://grok.com/'],
  xai: ['SpaceXAI', 'https://grok.com/'],
  kimi: ['Moonshot AI', 'https://www.kimi.com/'],
  moonshotai: ['Moonshot AI', 'https://www.kimi.com/'],
  meta: ['Meta', 'https://www.meta.ai/'],
  alibaba: ['Alibaba', 'https://qwen.ai/'],
  qwen: ['Alibaba', 'https://qwen.ai/'],
  zai: ['Z AI', 'https://z.ai/chat'],
  deepseek: ['DeepSeek', 'https://chat.deepseek.com/'],
  mistral: ['Mistral AI', 'https://chat.mistral.ai/'],
  mistralai: ['Mistral AI', 'https://chat.mistral.ai/'],
  microsoft: ['Microsoft', 'https://copilot.microsoft.com/'],
  amazon: ['Amazon', 'https://nova.amazon.com/'],
  nvidia: ['NVIDIA', 'https://build.nvidia.com/'],
  cohere: ['Cohere', 'https://cohere.com/'],
  perplexity: ['Perplexity', 'https://www.perplexity.ai/']
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
/** Most intelligent first; a tie goes to the cheaper, then the faster, then the name. */
function better(a, b) {
  return b.intelligence - a.intelligence || a.cost - b.cost || a.seconds - b.seconds || a.name.localeCompare(b.name);
}
/**
 * Keep each company's single best qualifying model, then the leading MAX_COMPANIES of them.
 * Idempotent, so a cached or bundled selection can be re-read through it after the rule
 * changes without waiting for the source to be reachable again.
 */
export function selectModels(candidates, limit = MAX_COMPANIES) {
  const best = new Map();
  for (const model of candidates || []) {
    if (!model || !model.name || !model.company || !model.website) continue;
    const { intelligence, cost, seconds } = model;
    // Missing values and provisional (*) scores cannot silently become zero.
    if (![intelligence, cost, seconds].every(Number.isFinite)) continue;
    if (seconds <= 0 || seconds > MAX_SECONDS) continue;
    const held = best.get(model.company);
    if (!held || better(model, held) < 0) best.set(model.company, model);
  }
  return [...best.values()].sort(better).slice(0, limit);
}
export function parseRankings(html, now = new Date()) {
  const candidates = [];
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
      if (!company || !name) continue;
      candidates.push({
        name,
        company: company[0],
        website: company[1],
        intelligence: number(intelligenceText),
        cost: number(costText),
        seconds: number(secondsText)
      });
    }
  }
  if (!found) throw new Error('Leaderboard table unavailable');
  const models = selectModels(candidates);
  if (!models.length) throw new Error('No verified qualifying models');
  return { source: SOURCE, updatedAt: now.toISOString(), models };
}

let pending;
let retryAfter = 0;
export async function handleModelRankings(request, env, cache = globalThis.caches?.default, fetcher = fetch) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  // Cached and bundled selections were written by an earlier rule, so they are re-read
  // through the current one rather than served as they were stored.
  const reselect = data => data && { ...data, models: selectModels(data.models) };
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const cacheKey = new Request(new URL('/api/model-rankings?selection=companies-v3', request.url));
  let previous;
  try { previous = reselect(await (await cache?.match(cacheKey))?.json()); } catch (_) { /* recover via source */ }
  if (previous?.models?.length && Date.now() - Date.parse(previous.updatedAt) < 3600000) return json({ ...previous, stale: false });
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
    if (!previous?.models?.length) {
      try {
        const fallback = await env.ASSETS.fetch(new Request(new URL('/assets/model-rankings.json', request.url)));
        if (fallback.ok) previous = reselect(await fallback.json());
      } catch (_) { /* no snapshot */ }
    }
    return previous?.models?.length ? json({ ...previous, stale: true }) : json({ error: 'Rankings temporarily unavailable.' }, 503);
  }
}

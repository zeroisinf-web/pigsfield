import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRankings, handleModelRankings, selectModels, MAX_MODELS, MAX_PER_COMPANY, MAX_SECONDS, MAX_MINUTES } from '../worker/model-rankings.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = rows => `<table><tr>${['Model','Creator','Artificial Analysis Intelligence Index','Cost per TaskUSD','TotalResponse (s)'].map(c => `<th>${c}</th>`).join('')}</tr>${rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const liveHtml = rows => `<table><tr>${['Model','Artificial Analysis Intelligence Index','Cost per Task USD','Time per Task Minutes'].map(c => `<th>${c}</th>`).join('')}</tr>${rows.map(([model, creator, intel, cost, min]) => `<tr><td><div><img alt="${creator}" src="/img/logos/${creator.toLowerCase()}.svg"/>${model}</div></td><td>${intel}</td><td>${cost}</td><td>${min}</td></tr>`).join('')}</table>`;
test('filters total response, preserves zero cost, allows a second entry per company and breaks ties', () => {
  const data = parseRankings(html([
    ['Slow','OpenAI',99,1,MAX_SECONDS + 0.01], ['Missing','Meta',95,1,'--'], ['Provisional','Google','90*',1,10],
    ['A','OpenAI',80,2,45], ['B','OpenAI',80,0,44], ['C','Anthropic',81,3,40],
    ['D','xAI',79,1,30], ['E','SpaceXAI',78,1,29]
  ]));
  // B outranks the equally intelligent A because it costs less, and both fit inside
  // OpenAI's allowance of two; xAI and SpaceXAI are the same company, so E is D's second
  // and last entry.
  assert.deepEqual(data.models.map(m => m.name), ['C','B','A','D','E']);
  assert.equal(data.models[1].cost, 0);
});
test('parses current Artificial Analysis schema with img alt creator and Time per Task Minutes', () => {
  const data = parseRankings(liveHtml([
    ['Claude Fable 5.2 Max, Default Fallback', 'Anthropic', '65', '$26.54', '40.5'],
    ['GPT-6.2 Astra Max', 'OpenAI', '62', '$4.00', '14.2'],
    ['Gemini 4 Hydrogen Xhigh', 'Google', '54', '$3.16', String(MAX_MINUTES)],
    ['Too Slow Variant', 'Google', '66', '$1.00', String(MAX_MINUTES + 0.1)],
    ['Tencent Hy4', 'Tencent', '35', '$1.03', '13.4']
  ]));
  assert.deepEqual(data.models.map(m => m.name), ['GPT-6.2 Astra Max', 'Gemini 4 Hydrogen Xhigh', 'Tencent Hy4']);
  assert.equal(data.models[0].company, 'OpenAI');
  assert.equal(data.models[0].seconds, 852);
  assert.equal(data.models[1].seconds, MAX_SECONDS);
  assert.equal(data.models[2].website, 'https://yuanbao.tencent.com/');
});
test('caps the table at ten entries and any company at two, and accepts exactly MAX_MINUTES', () => {
  const creators = ['OpenAI','OpenAI','OpenAI','Anthropic','Anthropic','Anthropic','Google','New Lab','Z AI','DeepSeek','Kimi','xAI','Mistral'];
  const data = parseRankings(html(creators.map((c,i) => [`Model ${i}`,c,90-i,1,MAX_SECONDS])));
  assert.equal(data.models.length, MAX_MODELS);
  const perCompany = data.models.reduce((counts, m) => counts.set(m.company, (counts.get(m.company) || 0) + 1), new Map());
  assert.ok([...perCompany.values()].every(count => count <= MAX_PER_COMPANY), 'no company may exceed its allowance');
  // OpenAI's and Anthropic's third listings are dropped; everything below moves up.
  assert.ok(!data.models.some(m => m.name === 'Model 2' || m.name === 'Model 5'));
  assert.deepEqual(data.models.map(m => m.name).slice(0, 4), ['Model 0','Model 1','Model 3','Model 4']);
});
test('company shortcuts resolve aliases and fall back to the source leaderboard', () => {
  const data = parseRankings(html([['One','Moonshot AI',80,1,10], ['Two','Unlisted Lab',70,1,10]]));
  assert.equal(data.models[0].website, 'https://www.kimi.com/');
  assert.equal(data.models[1].website, 'https://artificialanalysis.ai/leaderboards/models');
});
test('reselection is idempotent, so stored data can be re-read through the current rule', () => {
  const lab = (name, intelligence) => ({ name, company: 'Anthropic', website: 'https://claude.ai/new', intelligence, cost: 1, seconds: 10 });
  const once = selectModels([lab('Top', 60), lab('Second', 59), lab('Third', 58)]);
  assert.deepEqual(once.map(m => m.name), ['Top', 'Second']);
  assert.deepEqual(selectModels(once), once);
  assert.deepEqual(selectModels(undefined), []);
  // A duplicate listing must not spend a company's second slot.
  assert.deepEqual(selectModels([lab('Top', 60), lab('Top', 60), lab('Second', 59)]).map(m => m.name), ['Top', 'Second']);
});
test('the bundled snapshot survives the current selection rule', () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'model-rankings.json'), 'utf8'));
  const models = selectModels(snapshot.models);
  assert.ok(models.length, 'the bundled fallback must still produce rows');
  assert.ok(models.length <= MAX_MODELS);
  const perCompany = models.reduce((counts, m) => counts.set(m.company, (counts.get(m.company) || 0) + 1), new Map());
  assert.ok([...perCompany.values()].every(count => count <= MAX_PER_COMPANY));
  assert.ok(models.every(m => m.seconds > 0 && m.seconds <= MAX_SECONDS));
});
test('fails closed when source markup or metrics disappear', () => {
  assert.throws(() => parseRankings('<html>Challenge</html>'));
  assert.throws(() => parseRankings(html([['A','OpenAI',50,'--',20]])));
  assert.throws(() => parseRankings(html([]).replace('TotalResponse (s)','Latency')));
});
test('route serves fresh cache, honors explicit refresh=1, refreshes expired data, then preserves snapshot on source failure', async () => {
  const request = new Request('https://pigsfield.com/api/model-rankings');
  let saved = parseRankings(html([['Cached','OpenAI',50,1,20]]), new Date(Date.now() - 60000));
  const cache = { match: async () => new Response(JSON.stringify(saved)), put: async (_, r) => { saved = await r.json(); } };
  const env = { ASSETS: { fetch: async () => new Response(JSON.stringify(saved)) } };
  let result = await handleModelRankings(request, env, cache, () => { throw Error('must not fetch'); });
  assert.equal((await result.json()).stale, false);
  result = await handleModelRankings(new Request('https://pigsfield.com/api/model-rankings?refresh=1'), env, cache, async () => new Response(liveHtml([['Refreshed','Google',70,'$2.00','10.0']])));
  assert.equal((await result.json()).models[0].name, 'Refreshed');
  saved.updatedAt = '2020-01-01T00:00:00.000Z';
  result = await handleModelRankings(request, env, cache, async () => new Response(html([['New','Google',60,1,10]])));
  assert.equal((await result.json()).models[0].name, 'New');
  saved.updatedAt = '2020-01-01T00:00:00.000Z';
  result = await handleModelRankings(request, env, cache, async () => new Response('Unavailable', {status:503}));
  const stale = await result.json();
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, saved.updatedAt);
  result = await handleModelRankings(request, env, {match: async () => undefined});
  assert.equal((await result.json()).stale, true);
  assert.equal((await handleModelRankings(new Request(request, {method:'POST'}), env)).status, 405);
});

test('AI Studio page and shell do not intercept clicks inside the studio mount', () => {
  const aiHtml = fs.readFileSync(path.join(ROOT, 'ai', 'index.html'), 'utf8');
  assert.doesNotMatch(aiHtml, /class="[^"]*ai-page-content[^"]*"[^>]*data-open-ai/, 'data-open-ai must not wrap #ai-studio-mount');
  assert.match(aiHtml, /<div[^>]*class="[^"]*ai-page-badge[^"]*"[^>]*data-open-ai/, 'data-open-ai is safely anchored on hero badge');

  const siteJs = fs.readFileSync(path.join(ROOT, 'js', 'site.js'), 'utf8');
  assert.match(siteJs, /function\s+openAIStudio\([^)]*\)\s*\{[\s\S]*?if\s*\(\s*page\s*===\s*["']ai["']\s*\)\s*return;/);
  assert.match(siteJs, /if\s*\(\s*page\s*!==\s*["']ai["']\s*\)\s*\{[\s\S]*?qsa\(["']\[data-open-ai\]["']\)/);
});

test('AI Studio preserves launchpad tools, provides fallback rankings, and uses secure Use and Learn links', () => {
  const studioJs = fs.readFileSync(path.join(ROOT, 'js', 'ai-studio.js'), 'utf8');
  assert.match(studioJs, /class="ai-action ai-use"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(studioJs, /class="ai-action ai-learn"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(studioJs, /element\(["']a["'],\s*["']ai-ranking-name["']/);
  assert.match(studioJs, /assets\/model-rankings\.json/);
  assert.doesNotMatch(studioJs, /card\.hidden\s*=\s*rankedCompanies\.has/);
  assert.match(studioJs, /document\.querySelector\(["']dialog\[open\]["']\)/);
});


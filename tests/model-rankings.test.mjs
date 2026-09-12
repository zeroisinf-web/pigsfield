import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRankings, handleModelRankings } from '../worker/model-rankings.mjs';
const html = rows => `<table><tr>${['Model','Creator','Artificial Analysis Intelligence Index','Cost per TaskUSD','TotalResponse (s)'].map(c => `<th>${c}</th>`).join('')}</tr>${rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
test('filters total response, preserves zero cost, deduplicates company and breaks ties', () => {
  const data = parseRankings(html([
    ['Slow','OpenAI',99,1,35.01], ['Missing','Meta',95,1,'--'], ['Provisional','Google','90*',1,10],
    ['A','OpenAI',80,2,35], ['B','OpenAI',80,0,34], ['C','Anthropic',81,3,33],
    ['D','xAI',79,1,30], ['E','SpaceXAI',78,1,29]
  ]));
  assert.deepEqual(data.models.map(m => m.name), ['C','B','D']);
  assert.equal(data.models[1].cost, 0);
});
test('caps at seven distinct listed companies and accepts exactly 35 seconds', () => {
  const creators = ['OpenAI','Anthropic','Meta','Google','Alibaba','Z AI','DeepSeek','Kimi','xAI'];
  const data = parseRankings(html(creators.map((c,i) => [`Model ${i}`,c,90-i,1,35])));
  assert.equal(data.models.length, 7);
  assert.equal(new Set(data.models.map(m => m.company)).size, 7);
});
test('fails closed when source markup or metrics disappear', () => {
  assert.throws(() => parseRankings('<html>Challenge</html>'));
  assert.throws(() => parseRankings(html([['A','OpenAI',50,'--',20]])));
  assert.throws(() => parseRankings(html([]).replace('TotalResponse (s)','Latency')));
});
test('route serves fresh cache, refreshes expired data, then preserves snapshot on source failure', async () => {
  const request = new Request('https://pigsfield.com/api/model-rankings');
  let saved = parseRankings(html([['Cached','OpenAI',50,1,20]]));
  const cache = { match: async () => new Response(JSON.stringify(saved)), put: async (_, r) => { saved = await r.json(); } };
  const env = { ASSETS: { fetch: async () => new Response(JSON.stringify(saved)) } };
  let result = await handleModelRankings(request, env, cache, () => { throw Error('must not fetch'); });
  assert.equal((await result.json()).stale, false);
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

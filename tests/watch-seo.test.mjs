import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {categories, esc} from '../js/pigbang-core.mjs';

const read = file => fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const rows = JSON.parse(read('js/data/pigbang-catalog.json')).items;

test('every workbook title has a crawlable category anchor, description and original-source action', () => {
  for(const category of categories){
    const html=read(`watch/${category.slug}/index.html`);
    const own=rows.filter(x=>x.category===category.id);
    const anchors=[...html.matchAll(/<article id="([^"]+)">/g)].map(x=>x[1]);
    assert.equal(anchors.length,own.length,category.label);
    assert.equal(new Set(anchors).size,own.length);
    for(const row of own){
      assert.ok(anchors.includes(row.slug),row.title);
      assert.ok(html.includes(esc(row.title)),row.title);
      assert.ok(html.includes(esc(row.description)),row.title);
    }
    assert.equal((html.match(/class="directory-action"/g)||[]).length,own.length);
    assert.match(html,/<noscript>/);
    assert.doesNotMatch(html,/<iframe\b/,'players should load only after a user chooses');
  }
});

test('all browse pages have canonical collection metadata and mutually reachable category links', () => {
  for(const category of [null,...categories]){
    const route=category?`/watch/${category.slug}/`:'/watch/';
    const html=read(route.slice(1)+'index.html');
    const canonical='https://pigsfield.com'+route;
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`));
    const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
    assert.equal(graph.find(x=>x['@type']==='CollectionPage').url,canonical);
    assert.equal(graph.find(x=>x['@type']==='ItemList').numberOfItems,category?rows.filter(x=>x.category===category.id).length:rows.length);
    for(const c of categories) assert.ok(html.includes(`href="/watch/${c.slug}/"`));
    assert.match(html,/<select[^>]* id="class"/);
    assert.match(html,/<select[^>]* id="subject"/);
    assert.match(html,/<select[^>]* id="access"/);
    assert.match(html,/<option value="unknown">Check provider<\/option>/);
    assert.ok((html.match(/class="title-card"/g)||[]).length<=36,'first paint should not render thousands of poster cards');
  }
});

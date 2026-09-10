import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Run the real catalog, player URL parser and watch logic. Only the DOM boundary is
// stubbed; browser QA additionally covers painting, focus and native dialog behavior.
function harness() {
  class Element {
    value = ''; innerHTML = ''; textContent = ''; hidden = false; children = [];
    dataset = {}; listeners = {}; attributes = {}; open = false;
    classList = { add() {}, remove() {}, toggle() {} };
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector() { return new Element(); }
    querySelectorAll() { return []; }
    scrollIntoView() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {}
  }
  const nodes = new Map();
  const saved = new Map();
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, new Element());
      return nodes.get(selector);
    },
    querySelectorAll() { return []; },
    createElement() { return new Element(); },
    body: { appendChild(element) { document.dialog = element; } }
  };
  const PF = {
    slug: (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    escapeHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    isYouTubeSearch: (value) => { const url = new URL(value); return /(?:^|\.)youtube\.com$/.test(url.hostname) && url.pathname === '/results'; },
    isSaved: (id) => saved.has(id), getSaved: () => [...saved.values()],
    resourceSymbolFor: () => '◇', classifySource: () => 'website', sourceBrand: () => 'website', sourceMark: () => '<svg></svg>'
  };
  const window = { PF, matchMedia: () => ({ matches: true }) };
  const sandbox = vm.createContext({ window, document, URL, location: { href: 'https://pigsfield.com/watch/', hash: '' }, clearTimeout() {}, requestAnimationFrame(fn) { fn(); } });
  vm.runInContext(read('js/data/pigbang.js'), sandbox);
  vm.runInContext(read('js/player.js'), sandbox);
  const source = read('js/watch.js');
  const boot = source.indexOf('  document.querySelector("#watch-reset")?.addEventListener');
  assert.ok(boot > 0);
  vm.runInContext(source.slice(0, boot) + 'PF.watchTest = { entries, shelves, matches, applyShelfFilter, resetFilters, tile, card, openDetail, revealHash, render, createRotation, featuredEntries }; })();', sandbox);
  return { api: PF.watchTest, nodes, saved, document, sandbox };
}

test('saved-shelf View all restricts results to saved PigBang titles', () => {
  const { api, saved, nodes } = harness();
  const entry = api.entries.find((e) => e.item.name === 'Our Planet');
  const id = `pigbang:${entry.id}`;
  saved.set(id, { id });
  saved.set('other:resource', { id: 'other:resource' });
  const shelf = api.shelves().find((s) => s.id === 'my-list');
  api.applyShelfFilter(shelf);
  assert.deepEqual(Array.from(api.matches(), (e) => e.id), [entry.id]);
  assert.equal(nodes.get('#watch-billboard').hidden, true);
  assert.equal(nodes.get('#watch-count').textContent, '1 result');
});

test('level, type, price and multiword search compose and reset together', () => {
  const { api, nodes } = harness();
  api.applyShelfFilter({ filter: { tab: 'movies', price: 'free', level: '6-8' } });
  nodes.get('#watch-search').value = 'planet wildlife';
  const matches = api.matches();
  assert.ok(matches.length > 0);
  assert.ok(matches.every((e) => e.tab === 'movies' && e.price === 'free' && e.classes.includes('6-8') && e.haystack.includes('planet') && e.haystack.includes('wildlife')));
  api.resetFilters();
  assert.equal(api.matches().length, api.entries.length);
  assert.equal(nodes.get('#watch-billboard').hidden, false);
});

test('empty saved and search results offer a recovery action', () => {
  const { api, nodes } = harness();
  api.applyShelfFilter({ filter: { tab: 'my-list' } });
  assert.match(nodes.get('#watch-grid').innerHTML, /Your next discovery belongs here/);
  assert.match(nodes.get('#watch-grid').innerHTML, /data-reset/);
  api.resetFilters();
  nodes.get('#watch-search').value = 'no-match-23903940';
  api.render();
  assert.match(nodes.get('#watch-grid').innerHTML, /No titles found/);
  assert.equal(nodes.get('#watch-more').hidden, true);
});

test('all catalog titles preserve their source anchors without invented ownership or quality claims', () => {
  const { api } = harness();
  assert.equal(api.entries.length, 589);
  for (const entry of api.entries) {
    const card = api.card(entry);
    for (const raw of entry.item.urls || []) {
      const url = new URL(raw);
      for (const name of [...url.searchParams.keys()]) if (/^utm_/i.test(name)) url.searchParams.delete(name);
      const escaped = url.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      assert.ok(card.includes(`href="${escaped}"`), entry.item.name + ' retains ' + url.hostname);
    }
    assert.doesNotMatch(api.tile(entry), /PIGBANG ORIGINAL|>HD<|#1 Featured/);
  }
});

test('related titles are native keyboard buttons and clicking one replaces the dialog', () => {
  const { api, document } = harness();
  api.openDetail(api.entries.find((e) => e.item.name === 'Our Planet'));
  const dialog = document.dialog;
  assert.equal(dialog.attributes['aria-labelledby'], 'watch-detail-title');
  const related = dialog.innerHTML.match(/<button class="ott-similar-card" type="button" data-detail="([^"]+)"/);
  assert.ok(related);
  const target = { closest: (selector) => selector === '[data-detail]' ? { dataset: { detail: related[1] } } : null };
  for (const callback of dialog.listeners.click) callback({ target });
  const entry = api.entries.find((e) => e.id === related[1]);
  assert.ok(dialog.innerHTML.includes(`id="watch-detail-title">${entry.item.name}</h2>`));
  assert.equal(dialog.open, true);
});

test('saved-card markup follows the current saved state, including removal', () => {
  const { api, saved } = harness();
  const entry = api.entries[0];
  const id = `pigbang:${entry.id}`;
  assert.match(api.card(entry), /aria-pressed="false"/);
  saved.set(id, { id });
  assert.match(api.card(entry), /aria-label="Remove from your list" aria-pressed="true"/);
  saved.delete(id);
  assert.match(api.card(entry), /aria-label="Save to your list" aria-pressed="false"/);
});

test('malformed shared URL fragments do not crash browsing', () => {
  const { api, sandbox } = harness();
  sandbox.location.hash = '#%E0%A4%A';
  assert.doesNotThrow(() => api.revealHash());
});


test('featured collection resolves exactly seven distinct catalog titles with sources', () => {
  const { api } = harness();
  assert.equal(api.featuredEntries.length, 7);
  assert.equal(new Set(api.featuredEntries.map(e => e.id)).size, 7);
  assert.ok(api.featuredEntries.every(e => e.item.urls.length && e.item.desc));
});

test('featured rotation advances every six seconds, wraps, pauses and respects interaction', () => {
  const { api } = harness();
  let tick, interval, blocked = false, cancelled;
  const shown = [];
  const rotation = api.createRotation({ count: 7, show: i => shown.push(i), blocked: () => blocked,
    schedule(fn, ms) { tick = fn; interval = ms; return 42; }, cancel(id) { cancelled = id; } });
  assert.equal(interval, 6000);
  for (let i = 0; i < 7; i++) tick();
  assert.deepEqual(shown, [1, 2, 3, 4, 5, 6, 0]);
  blocked = true; tick(); assert.equal(shown.length, 7);
  blocked = false; rotation.pause(true); tick(); assert.equal(shown.length, 7);
  assert.equal(rotation.isPaused(), true);
  rotation.pause(false); tick(); assert.equal(shown.at(-1), 1);
  rotation.move(-1); rotation.move(-1); assert.equal(shown.at(-1), 6);
  rotation.destroy(); assert.equal(cancelled, 42);
});

test('reduced-motion rotation starts paused but permits manual navigation', () => {
  const { api } = harness();
  let tick;
  const shown = [];
  const rotation = api.createRotation({ count: 7, paused: true, show: i => shown.push(i), blocked: () => false,
    schedule(fn) { tick = fn; }, cancel() {} });
  tick(); assert.equal(shown.length, 0);
  rotation.move(1); assert.deepEqual(shown, [1]);
  rotation.pause(false); tick(); assert.deepEqual(shown, [1, 2]);
});

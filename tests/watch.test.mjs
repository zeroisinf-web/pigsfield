import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { action, accessLabel, card, enrich, filterItems, isSearch, safeUrl, titleHref, videoId } from '../js/pigbang-core.mjs';

const item = (overrides = {}) => ({
  id: 'movies-2', slug: 'our-planet', title: 'Our Planet', year: 2019,
  category: 'movies', format: 'Series', description: 'Explore wildlife and our living planet.',
  classes: ['6-8','9-12'], subjects: ['Science: Biology'], disciplines: ['Science'],
  topics: ['Nature'], access: 'free', sourceUrl: 'https://example.org/our-planet',
  watchUrl: 'https://www.youtube.com/watch?v=GfO-3Oir-qM', ...overrides
});
const fixtures = () => enrich([
  item(),
  item({id:'movies-3',slug:'space',title:'Space',access:'paid',classes:['9-12'],subjects:['Science: Physics'],description:'A voyage into the universe.'}),
  item({id:'apps-2',slug:'biology-lab',title:'Biology Lab',category:'apps',access:'unknown',classes:['6-8'],watchUrl:'https://example.org/lab'}),
  item({id:'channels-2',slug:'wildlife-classroom',title:'Wildlife Classroom',category:'channels',access:'free',watchUrl:'https://www.youtube.com/@classroom'})
]);

test('category, class, subject, access and multiword search compose without including unknown prices', () => {
  const rows = fixtures();
  assert.deepEqual(filterItems(rows,{category:'movies',class:'6-8',subject:'Science: Biology',access:'free',q:'planet WILDLIFE'}).map(x=>x.id),['movies-2']);
  assert.equal(filterItems(rows,{class:'6-8',subject:'Science'}).length,3);
  assert.equal(filterItems(rows,{access:'paid'}).length,1);
  assert.equal(filterItems(rows,{access:'free'}).length,2);
  assert.equal(filterItems(rows,{access:'unknown'})[0].id,'apps-2');
  assert.equal(filterItems(rows,{q:'wildlife missingword'}).length,0);
  assert.equal(filterItems(rows,{}).length,rows.length);
});

test('saved filters intersect the current page and search; an empty saved set stays empty', () => {
  const rows = fixtures();
  assert.deepEqual(filterItems(rows,{saved:true,savedIds:new Set(['apps-2','movies-2']),category:'apps'}).map(x=>x.id),['apps-2']);
  assert.equal(filterItems(rows,{saved:true,savedIds:new Set()}).length,0);
  assert.equal(filterItems(rows,{saved:true}).length,0);
});

test('a provider, verified trailer and unverified trailer search have distinct action labels', () => {
  const [direct, trailer, search, providerSearch] = enrich([
    item(), item({watchUrl:'',trailerUrl:'https://www.youtube.com/watch?v=GfO-3Oir-qM'}),
    item({watchUrl:''}), item({watchUrl:'https://www.youtube.com/results?search_query=Our+Planet'})
  ]);
  assert.deepEqual(action(direct),{url:direct.watchUrl,label:'Watch now',kind:'video'});
  assert.equal(action(trailer).kind,'trailer');
  assert.equal(action(trailer).label,'Watch trailer');
  assert.equal(action(search).kind,'search');
  assert.equal(action(search).label,'Find trailer on YouTube');
  assert.ok(action(search).url.includes('Our%20Planet'));
  assert.equal(action(providerSearch).kind,'external');
  assert.equal(action(providerSearch).label,'Find on provider');
  assert.equal(action(fixtures()[2]).label,'Open app');
  assert.equal(action(fixtures()[3]).label,'Visit channel');
});

test('missing prices stay unknown and rating or ownership claims are not fabricated', () => {
  const unknown = enrich([item({access:'unknown',watchUrl:''})])[0];
  assert.equal(accessLabel(unknown),'Check provider');
  assert.doesNotMatch(card(unknown),/PIGBANG ORIGINAL|AggregateRating|100% free|>Free</i);
  assert.equal(accessLabel({access:'paid'}),'Paid');
});

test('unsafe outbound URLs are dropped and card content is HTML escaped', () => {
  for (const bad of ['javascript:alert(1)','data:text/html,hello','https://user:secret@example.org','not a URL']) assert.equal(safeUrl(bad),'');
  const entry = enrich([item({title:'<img src=x onerror=alert(1)>',id:'evil" onclick="x',watchUrl:'javascript:alert(1)',sourceUrl:'data:text/html,no'})],{'<img src=x onerror=alert(1)>':{image:'/assets/pigbang/test.webp'}})[0];
  const html = card(entry);
  assert.equal(entry.watchUrl,'');
  assert.equal(entry.sourceUrl,'');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.doesNotMatch(html,/<img src=x|data-detail="evil" onclick/);
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(card(entry,true).includes('loading="eager"'));
});

test('real media artwork is same-origin and never invented from a title', () => {
  const [entry] = enrich([item()],{'Our Planet':{image:'/assets/pigbang/our-planet.webp',trailerUrl:'https://www.youtube.com/watch?v=GfO-3Oir-qM'}});
  assert.equal(entry.image,'/assets/pigbang/our-planet.webp');
  const [without] = enrich([item()],{'Our Planet':{image:'https://untrusted.example/image.jpg'}});
  const request = new URL(without.image,'https://pigsfield.com');
  assert.equal(request.pathname,'/api/poster');
  assert.equal(request.searchParams.get('u'),without.watchUrl);
  const [search] = enrich([item({watchUrl:'https://www.youtube.com/results?search_query=test'})]);
  assert.equal(new URL(search.image,'https://pigsfield.com').searchParams.get('u'),search.sourceUrl);
});

test('YouTube parsing rejects search pages, spoofed hosts and malformed IDs', () => {
  const id='GfO-3Oir-qM';
  for(const url of [`https://www.youtube.com/watch?v=${id}`,`https://youtu.be/${id}`,`https://www.youtube.com/shorts/${id}`,`https://www.youtube-nocookie.com/embed/${id}`]) assert.equal(videoId(url),id);
  for(const url of [`https://youtube.com.evil.org/watch?v=${id}`,'https://www.youtube.com/results?search_query=trailer','https://youtu.be/short',`https://www.youtube.com/@channel?v=${id}`,`ftp://www.youtube.com/watch?v=${id}`]) assert.equal(videoId(url),'');
  assert.ok(isSearch('https://www.netflix.com/search?q=planet'));
});

test('every category shares stable title links to the correct browse page', () => {
  assert.equal(titleHref(item()),'/watch/films/#our-planet');
  assert.equal(titleHref(item({category:'apps'})),'/watch/apps/#our-planet');
  assert.equal(titleHref(item({category:'channels'})),'/watch/channels/#our-planet');
});

test('the full workbook catalog retains all rows and source provenance', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../js/data/pigbang-catalog.json',import.meta.url),'utf8'));
  const rows = catalog.items;
  assert.equal(rows.length,2175);
  assert.deepEqual(Object.fromEntries(['movies','apps','channels'].map(c=>[c,rows.filter(x=>x.category===c).length])),{movies:1697,apps:269,channels:209});
  assert.equal(new Set(rows.map(x=>x.id)).size,rows.length);
  assert.equal(new Set(rows.map(x=>x.slug)).size,rows.length);
  for(const row of rows){
    assert.ok(row.source.sheet && Number.isInteger(row.source.row) && row.source.row>=2,row.title);
    assert.ok(['free','paid','unknown'].includes(row.access),row.title);
    assert.ok(Array.isArray(row.classes) && Array.isArray(row.subjects),row.title);
  }
});

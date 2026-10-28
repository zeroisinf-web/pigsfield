import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { action, accessLabel, availableSubjects, card, enrich, filterItems, isSearch, safeUrl, titleHref, videoId } from '../js/pigbang-core.mjs';

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

const subjectFixtures = () => [
  item({id:'biology',classes:['6-8'],disciplines:['Science','Science'],subjects:['Science','Science: Biology','Science: Biology']}),
  item({id:'physics',classes:['9-12'],disciplines:['Physics'],subjects:['Physics: Mechanics']}),
  item({id:'coding',category:'apps',classes:['6-8'],disciplines:['Technology'],subjects:['Technology: Coding']}),
  item({id:'art',classes:['6-8'],disciplines:['Science','Arts'],subjects:['Science: Biology','Arts: Drawing']})
];

test('subject choices include only the selected class and current category, sorted without duplicates', () => {
  assert.deepEqual(availableSubjects(subjectFixtures(),{category:'movies',class:'6-8'}),{
    disciplines:['Arts','Science'],
    topics:['Arts: Drawing','Science: Biology']
  });
  assert.deepEqual(availableSubjects(subjectFixtures(),{category:'apps',class:'6-8'}),{
    disciplines:['Technology'],topics:['Technology: Coding']
  });
  assert.deepEqual(availableSubjects(subjectFixtures(),{category:'movies',class:'no-matching-class'}),{
    disciplines:[],topics:[]
  });
});

test('All classes restores the category subject choices without adding another category’s subjects', () => {
  const rows=subjectFixtures();
  assert.deepEqual(availableSubjects(rows,{category:'movies',class:''}),{
    disciplines:['Arts','Physics','Science'],
    topics:['Arts: Drawing','Physics: Mechanics','Science: Biology']
  });
  assert.deepEqual(availableSubjects(rows,{class:'6-8'}),{
    disciplines:['Arts','Science','Technology'],
    topics:['Arts: Drawing','Science: Biology','Technology: Coding']
  });
});

test('an old subject, search, access or saved-list selection cannot hide otherwise available class subjects', () => {
  const scope={category:'movies',class:'6-8'};
  assert.deepEqual(availableSubjects(subjectFixtures(),{
    ...scope,subject:'Physics: Mechanics',q:'no results',access:'paid',saved:true,savedIds:new Set()
  }),availableSubjects(subjectFixtures(),scope));
});

test('every subject offered for a real catalog class has a matching title in that page category', () => {
  const readItems=file=>JSON.parse(fs.readFileSync(new URL('../js/data/'+file,import.meta.url),'utf8')).items;
  const rows=[...readItems('pigbang-catalog.json'),...readItems('pigbang-additions.json')];
  for(const category of ['movies','apps','channels']){
    for(const level of ['0-5','PG','Teacher Training']){
      const scope={category,class:level};
      const matching=rows.filter(row=>row.category===category&&row.classes.includes(level));
      const {disciplines,topics}=availableSubjects(rows,scope);
      const choices=[...disciplines,...topics];
      assert.equal(new Set(choices).size,choices.length,`${category}/${level} has duplicate subjects`);
      for(const choice of choices)assert.ok(matching.some(row=>row.disciplines.includes(choice)||row.subjects.includes(choice)),`${category}/${level}: ${choice}`);
      for(const row of matching){
        for(const subject of [...row.disciplines,...row.subjects])assert.ok(choices.includes(subject),`${row.title}: missing ${subject}`);
      }
    }
  }
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

test('user-added Netflix title keeps separate provenance, paid access and adult learning stages', () => {
  const added=JSON.parse(fs.readFileSync(new URL('../js/data/pigbang-additions.json',import.meta.url),'utf8')).items;
  const movie=added.find(x=>x.id==='movies-netflix-82790150');
  assert.ok(movie);
  assert.equal(movie.title,'Nukkad Naatak');
  assert.equal(movie.watchUrl,'https://www.netflix.com/in/title/82790150');
  assert.equal(movie.source.kind,'editorial');
  assert.equal(movie.contentRating,'U/A 16+');
  assert.equal(movie.access,'paid');
  const rows=enrich(added);
  assert.equal(filterItems(rows,{class:'Teacher Training',subject:'Education',access:'paid'})[0].id,movie.id);
  assert.equal(filterItems(rows,{class:'0-5'}).length,0);
  assert.equal(filterItems(rows,{access:'free'}).length,0);
});

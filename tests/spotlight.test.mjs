import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {levels,enrich} from '../js/pigbang-core.mjs';
import {SPOTLIGHT_PICKS,spotlightEntries,createSpotlightRotation} from '../js/pigbang-spotlight.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../js/data/'+name,import.meta.url),'utf8'));

test('at least ten distinct catalog spotlights cover every learning stage with real artwork',()=>{
 const items=enrich([...read('pigbang-catalog.json').items,...read('pigbang-additions.json').items],read('pigbang-media.json'));
 const selected=spotlightEntries(items);
 assert.ok(selected.length>=10);
 assert.equal(selected.length,SPOTLIGHT_PICKS.length);
 assert.equal(new Set(selected.map(x=>x.id)).size,selected.length);
 assert.equal(selected[0].title,'Nukkad Naatak');
 const represented=new Set(selected.flatMap(x=>x.spotlightClasses));
 for(const level of levels)assert.ok(represented.has(level),level+' needs a representative');
 for(const item of selected){
  assert.equal(item.category,'movies');
  assert.ok(item.spotlightClasses.length,item.title);
  for(const level of item.spotlightClasses)assert.ok(item.classes.includes(level));
  assert.ok(item.image.startsWith('/assets/pigbang/'),item.title+' should have stored real artwork');
  assert.ok(fs.existsSync(new URL('..'+item.image,import.meta.url)),item.image);
 }
});

test('spotlights advance every five seconds, wrap and respect temporary interaction blockers',()=>{
 let tick,delay,blocked=false,id=0;
 const shown=[],timers=new Set();
 const rotation=createSpotlightRotation({count:12,show:i=>shown.push(i),blocked:()=>blocked,
  setIntervalFn:(fn,ms)=>{tick=fn;delay=ms;timers.add(++id);return id;},clearIntervalFn:id=>timers.delete(id)});
 rotation.goTo(0);rotation.start();
 assert.equal(delay,5000);assert.equal(timers.size,1);
 tick();assert.equal(rotation.index,1);
 blocked=true;tick();assert.equal(rotation.index,1);
 blocked=false;for(let i=0;i<11;i++)tick();assert.equal(rotation.index,0);
 rotation.previous();assert.equal(rotation.index,11);
 rotation.next();assert.equal(rotation.index,0);assert.equal(timers.size,1);
 rotation.stop();assert.equal(timers.size,0);
 assert.ok(shown.length>12);
});

test('explicit and reduced-motion pauses retain manual navigation without restarting automatic rotation',()=>{
 let starts=0,id=0;
 const timers=new Set(),shown=[];
 const rotation=createSpotlightRotation({count:3,paused:true,show:i=>shown.push(i),
  setIntervalFn:()=>{starts++;timers.add(++id);return id;},clearIntervalFn:id=>timers.delete(id)});
 rotation.start();assert.equal(starts,0);
 rotation.next();assert.equal(rotation.index,1);assert.equal(timers.size,0);
 rotation.setPaused(false);assert.equal(timers.size,1);
 rotation.setPaused(true);assert.equal(timers.size,0);
 rotation.previous();assert.equal(rotation.index,0);assert.equal(timers.size,0);
 assert.equal(rotation.paused,true);assert.deepEqual(shown,[1,0]);
 const empty=createSpotlightRotation({count:0,show:()=>assert.fail('no slide exists'),setIntervalFn:()=>assert.fail('no timer needed')});
 empty.start();empty.next();empty.previous();
});

// The catalogue used to be assembled in the browser on four hub pages. It is now generated
// into one page per topic, and these are the guarantees that survived the move:
//
//   * a resource keeps the element id it had, so an old deep link and a saved item still
//     point at the same thing;
//   * a resource keeps its saved-item namespace, so a heart pressed before the split is
//     still filled after it;
//   * nothing was dropped on the way — including the groups too thin for a page of their
//     own, which stay on the hub.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DESTINATIONS, loadCatalog, sourceFor, topicPayload } from "../tools/build-topics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Normalize CRLF so the source-slice markers below match on Windows checkouts too.
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8").replace(/\r\n/g, "\n");

/** Mirrors PF.slug in js/site.js. */
function slug(value) {
  const result = String(value || "resource")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 88);
  return result || "resource";
}

/** Every save id the browser catalogue produced, keyed exactly as it stored them. */
function legacySaveIds(data) {
  const ids = new Map();
  for (const [key] of Object.entries({ school: 1, teach: 1, tools: 1, govt: 1 })) {
    (data[key].sections || []).forEach((section, sectionIndex) => {
      (section.groups || []).forEach((group, groupIndex) => {
        (group.items || []).forEach((item, itemIndex) => {
          const id = slug(`${item.title}-${section.resourceIdSection || sectionIndex + 1}-${groupIndex + 1}-${itemIndex + 1}`);
          ids.set(`${section.saveKey || key}:${id}`, item.title);
        });
      });
    });
  }
  return ids;
}

function groupedItemCount(data) {
  return (data.sections || []).reduce((sectionTotal, section) =>
    sectionTotal + (section.groups || []).reduce((groupTotal, group) => groupTotal + (group.items || []).length, 0), 0);
}

test("moved catalogs preserve their original resource ID section numbers", () => {
  const data = loadCatalog();
  const teacherTraining = data.teacherTraining;
  const vocational = data.teach.sections[0];

  assert.equal(teacherTraining.resourceIdSection, 1);
  assert.equal(teacherTraining.saveKey, "teach");
  assert.equal(vocational.resourceIdSection, 2);
  assert.equal(groupedItemCount(data.school), 171);
  // 23 since the misfiled duplicate of Rajasthan Sampark was merged into /rights/.
  assert.equal(groupedItemCount(data.teach), 23);

  const legacy = legacySaveIds(data);
  let checked = 0;
  for (const destination of DESTINATIONS) {
    for (const topic of destination.topics) {
      for (const item of topicPayload(sourceFor(data, destination, topic))) {
        assert.ok(legacy.has(item.saveId), `${destination.dest}/${topic.slug} invented the save id ${item.saveId}`);
        assert.equal(item.saveId, `${item.saveId.split(":")[0]}:${item.id}`);
        checked++;
      }
    }
  }
  assert.equal(checked, 290, "every resource that has a page of its own must keep its id");
});

test("moved Teacher Training cards retain the legacy save namespace", () => {
  // Teacher Training was filed under /skills/ before it moved to /learn/, and its saved
  // items were namespaced "teach:". They still are, on a page under /learn/.
  const page = read("learn/teacher-training/index.html");
  const saves = [...page.matchAll(/data-save="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(saves.length >= 20, "the Teacher Training page must offer its resources for saving");
  assert.ok(saves.every((id) => id.startsWith("teach:")), "Teacher Training keeps the teach: namespace");
});

test("every resource is reachable at its own anchor without running any JavaScript", () => {
  const data = loadCatalog();
  for (const destination of DESTINATIONS) {
    for (const topic of destination.topics) {
      const page = read(`${destination.dest}/${topic.slug}/index.html`);
      for (const item of topicPayload(sourceFor(data, destination, topic))) {
        assert.ok(page.includes(`id="${item.id}"`), `/${destination.dest}/${topic.slug}/ is missing #${item.id}`);
      }
    }
  }
});

test("splitting the catalogue across pages dropped nothing", () => {
  const data = loadCatalog();
  for (const destination of DESTINATIONS) {
    const total = (data[destination.module].sections || []).reduce((sum, section) =>
      sum + (section.groups || []).reduce((count, group) => count + (group.items || []).length, 0), 0);
    const hub = read(`${destination.dest}/index.html`);
    const onPages = destination.topics.reduce((sum, topic) =>
      sum + topicPayload(sourceFor(data, destination, topic)).length, 0);
    // Whatever did not earn a page of its own has to still be on the hub.
    const onHub = (hub.match(/<article class="topic-item"/g) || []).length;
    assert.equal(onPages + onHub, total, `/${destination.dest}/ lost ${total - onPages - onHub} resources in the split`);
  }
});

test("generated pages nest one H3 per resource beneath the page H1", () => {
  const page = read("learn/nursery-to-class-5/index.html");
  const headings = (page.match(/<h1>/g) || []).length;
  assert.equal(headings, 1);
  assert.equal((page.match(/<article class="topic-item"/g) || []).length, (page.match(/<div class="topic-item-head"><h3>/g) || []).length);
  assert.doesNotMatch(page, /<h2 class="catalog-direct-title">/);
});

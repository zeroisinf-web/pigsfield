import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Normalize CRLF so the source-slice markers below match on Windows checkouts too.
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8").replace(/\r\n/g, "\n");

function slug(value) {
  const result = String(value || "resource")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 88);
  return result || "resource";
}

function catalogData() {
  const context = vm.createContext({ window: {} });
  for (const name of ["school", "teach"]) {
    new vm.Script(read(`js/data/${name}.js`), { filename: `${name}.js` }).runInContext(context);
  }
  return context.window.PF_DATA;
}

function groupedItemCount(data) {
  return (data.sections || []).reduce((sectionTotal, section) =>
    sectionTotal + (section.groups || []).reduce((groupTotal, group) => groupTotal + (group.items || []).length, 0), 0);
}

function compatibilityRuntime(teacherTraining, hash, pathValue = "../learn/") {
  const source = read("js/catalog.js");
  const start = source.indexOf("  function resourceIdFor(");
  const end = source.indexOf("\n\n  if (redirectLegacyTeacherTrainingHash()) return;", start);
  assert.ok(start >= 0 && end > start, "catalog compatibility helpers must remain testable");

  const redirects = [];
  const context = vm.createContext({
    PF: { slug, path: () => pathValue },
    URL,
    key: "teach",
    window: { PF_DATA: { teacherTraining } },
    location: {
      href: `https://pigsfield.com/skills/${hash}`,
      origin: "https://pigsfield.com",
      hash,
      replace(value) { redirects.push(value); }
    },
    redirects
  });
  new vm.Script(`${source.slice(start, end)}\n;globalThis.compatibilityApi = { resourceIdFor, redirectLegacyTeacherTrainingHash };`).runInContext(context);
  return context;
}

test("moved catalogs preserve their original resource ID section numbers", () => {
  const data = catalogData();
  const teacherTraining = data.teacherTraining;
  const vocational = data.teach.sections[0];

  assert.equal(teacherTraining.resourceIdSection, 1);
  assert.equal(teacherTraining.saveKey, "teach");
  assert.equal(vocational.resourceIdSection, 2);
  assert.equal(groupedItemCount(data.school), 171);
  // 23 since the misfiled duplicate of Rajasthan Sampark was merged into /rights/.
  assert.equal(groupedItemCount(data.teach), 23);

  const runtime = compatibilityRuntime(teacherTraining, "");
  [
    [teacherTraining, 7, 1],
    [vocational, 0, 2]
  ].forEach(([section, displayedIndex, preservedIndex]) => {
    (section.groups || []).forEach((group, groupIndex) => {
      (group.items || []).forEach((item, itemIndex) => {
        const actual = runtime.compatibilityApi.resourceIdFor(item, section, displayedIndex, groupIndex, itemIndex);
        const expected = slug(`${item.title}-${preservedIndex}-${groupIndex + 1}-${itemIndex + 1}`);
        assert.equal(actual, expected);
      });
    });
  });
});

test("moved Teacher Training cards retain the legacy save namespace", () => {
  const source = read("js/catalog.js");
  assert.match(source, /const saveId = `\$\{section\.saveKey \|\| key\}:\$\{id\}`;/);
  assert.match(source, /entriesBySaveId\.set\(saveId, entry\)/);
  assert.match(source, /const saveId = entry\.saveId;/);
});

test("legacy Teacher Training hashes hand off from skills to the same resource on learn", () => {
  const data = catalogData();
  const teacherTraining = data.teacherTraining;
  const firstItem = teacherTraining.groups[0].items[0];
  const id = slug(`${firstItem.title}-1-1-1`);
  const runtime = compatibilityRuntime(teacherTraining, `#${id}`);

  assert.equal(runtime.compatibilityApi.redirectLegacyTeacherTrainingHash(), true);
  assert.deepEqual([...runtime.redirects], [`https://pigsfield.com/learn/#${id}`]);

  const unknown = compatibilityRuntime(teacherTraining, "#not-a-teacher-resource");
  assert.equal(unknown.compatibilityApi.redirectLegacyTeacherTrainingHash(), false);
  assert.deepEqual([...unknown.redirects], []);

  const crossOrigin = compatibilityRuntime(teacherTraining, `#${id}`, "https://example.com/learn/");
  assert.equal(crossOrigin.compatibilityApi.redirectLegacyTeacherTrainingHash(), false);
  assert.deepEqual([...crossOrigin.redirects], []);
});

test("direct catalog sections nest non-collapsible group headings at H3", () => {
  const source = read("js/catalog.js");
  assert.match(source, /const headingTag = directSections \? "h3" : "h2";/);
  assert.match(source, /<\$\{headingTag\} class="group-title">/);
  assert.match(source, /<h2 class="catalog-direct-title">/);
});

test("initial deep links reveal only after the shared accordion setup", () => {
  const source = read("js/catalog.js");
  assert.match(source, /window\.addEventListener\("hashchange", revealHash\);/);
  assert.match(source, /if \(document\.readyState === "loading"\) document\.addEventListener\("DOMContentLoaded", revealHash, \{ once: true \}\);\s*else revealHash\(\);/);
  assert.doesNotMatch(source, /document\.addEventListener\("pf:saved-changed"[\s\S]*?\n  revealHash\(\);\n\}\)\(\);/);
});

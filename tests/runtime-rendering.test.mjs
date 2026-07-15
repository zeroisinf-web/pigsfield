import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

test("closed exam panels do not construct their large bodies at startup", () => {
  const source = text("js/exams-page.js");
  assert.match(source, /panelDefinitions\.map\(panelShell\)\.join\(""\)/);
  assert.match(source, /function renderPanel\(details\)[\s\S]*?body\.innerHTML = definition\.render\(\)/);
  assert.match(source, /details\.dataset\.rendered === "true"/);
  assert.doesNotMatch(
    source.match(/root\.innerHTML\s*=\s*`[\s\S]*?`;/)?.[0] || "",
    /render(?:Roadmap|MockTests|CommonSubjects|ExamTrack|Channels)\(/,
    "the initial exam shell must not render hidden panel content"
  );
});

test("closed catalog groups defer cards and use one delegated card listener", () => {
  const source = text("js/catalog.js");
  assert.match(source, /<div class="catalog-group-content"><\/div>/);
  assert.match(source, /function renderGroup\(details\)[\s\S]*?groupEntries\.map\(\(entry\) => renderCard\(entry\)\)/);
  assert.match(source, /root\.addEventListener\("click", handleCatalogClick\)/);
  assert.doesNotMatch(source, /function bindCards\(/);
  assert.match(source, /entriesBySaveId\.get\(button\.dataset\.save\)/);
});

test("PigBang appends the next page without rebuilding visible cards", () => {
  const source = text("js/watch.js");
  assert.match(source, /grid\.addEventListener\("click", handleGridClick\)/);
  assert.match(source, /grid\.insertAdjacentHTML\("beforeend", additions\.map\(card\)\.join\(""\)\)/);
  assert.match(source, /entriesByTab\.get\(activeTab\)/);
  assert.match(source, /cardMarkup\[cacheIndex\]/);
  assert.doesNotMatch(source, /function bindCards\(/);
});

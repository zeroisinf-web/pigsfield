import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = (name) => fs.readFileSync(path.join(ROOT, name), "utf8").replace(/\r\n/g, "\n");

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

test("the whole catalog reaches the DOM without anyone opening an accordion", () => {
  const source = text("js/catalog.js");
  // Sections used to build only on their first `toggle` event. Crawlers, AI answer
  // engines, social preview fetchers and no-JS readers never fire that, so the
  // entire catalog was absent for them. Render up front instead; the sections stay
  // visually collapsed, and .resource-card keeps content-visibility:auto so
  // offscreen cards still skip layout and paint.
  assert.match(
    source,
    /querySelectorAll\("\.catalog-section"\)\)\s*\.forEach\(\(item\) => renderSection\(item,/,
    "every catalog section must render during setup"
  );
  assert.doesNotMatch(
    source,
    /addEventListener\("toggle",[\s\S]{0,160}renderSection\(/,
    "section content must not be gated behind a toggle event"
  );
  // The nested category accordions on /tools/ and /rights/ need the same treatment.
  assert.match(
    source,
    /if \(collapsibleGroups\) content\.querySelectorAll\("details\.catalog-group"\)\.forEach\(renderGroup\)/,
    "category groups must render with their section"
  );
});

test("a YouTube search link is not dressed up as a video", () => {
  const source = text("js/catalog.js");
  // 96 catalogue links point at youtube.com/results?search_query=... . isYouTube() is true
  // for any YouTube host, so these were classified "video": red play styling, a play
  // affordance, and a label reading "Tutorial" for a page that plays nothing. js/player.js
  // parse() returns null for /results, so the play never had anywhere to go.
  assert.match(source, /function isYouTubeSearch\(url\)/, "search links need their own classification");
  assert.match(source, /parsed\.pathname === "\/results"/, "a search is identified by its /results path");
  assert.match(source, /if \(isYouTubeSearch\(url\)\) return "website";/, "a search must not classify as a video");
  assert.match(source, /if \(isYouTubeSearch\(link\.url\)\) return "Search YouTube";/, "the label must say it is a search");
  // The host check must be anchored: a bare dot would also match evilyoutubeXcom.
  assert.match(source, /\/\(\?:\^\|\\\.\)youtube\\\.com\$\/i/, "the host pattern must escape its dots");
});

test("catalog cards use one delegated listener rather than per-card binding", () => {
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

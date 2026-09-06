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

test("the whole catalog reaches the DOM without anyone running any JavaScript", () => {
  // The hubs used to assemble their catalogue in the browser, first on a click and later
  // during setup. Crawlers, AI answer engines, social preview fetchers and no-JS readers
  // get whatever the server sent, so the catalogue is generated into the markup now:
  // tools/build-topics.mjs writes one page per topic and the hubs link to them.
  for (const page of ["learn/nursery-to-class-5/index.html", "rights/anti-corruption/index.html", "tools/ai-tools/index.html"]) {
    const source = text(page);
    assert.match(source, /<article class="topic-item" id="[a-z0-9-]+">/, `${page} must serve its resources as markup`);
    assert.doesNotMatch(source, /js\/(?:catalog|data\/)/, `${page} must not load a catalogue runtime to show its own content`);
  }
  for (const hub of ["learn/index.html", "skills/index.html", "tools/index.html", "rights/index.html"]) {
    const source = text(hub);
    assert.match(source, /<a class="topic-card" href="[a-z0-9-]+\/">/, `${hub} must link its generated pages`);
    assert.doesNotMatch(source, /id="catalog-(?:root|sections)"/, `${hub} must not rebuild the catalogue it links to`);
  }
});

test("a YouTube search link is not dressed up as a video", () => {
  const source = text("js/site.js");
  // 96 catalogue links point at youtube.com/results?search_query=... . A YouTube host test
  // alone calls those "video": red play styling, a play affordance, and a label reading
  // "Tutorial" for a page that plays nothing. js/player.js parse() returns null for
  // /results, so the play never had anywhere to go.
  assert.match(source, /function isYouTubeSearch\(url\)/, "search links need their own classification");
  assert.match(source, /parsed\.pathname === "\/results"/, "a search is identified by its /results path");
  assert.match(source, /if \(isYouTubeSearch\(value\)\) return "website";/, "a search must not classify as a video");
  // The host check must be anchored: a bare dot would also match evilyoutubeXcom.
  assert.match(source, /\/\(\?:\^\|\\\.\)youtube\\\.com\$\/i/, "the host pattern must escape its dots");

  const builder = text("tools/build-topics.mjs");
  assert.match(builder, /isYouTubeSearch\(url\)\s*\?\s*"Search YouTube"/, "the generated label must say it is a search");
  // And the generated pages must actually carry that classification.
  const page = text("tools/files-and-remote-access/index.html");
  assert.match(page, /class="link-button source-website source-brand-website"[^>]*youtube\.com\/results/, "a search link must render as a website, not a video");
});

test("the generated pages and the runtime share one source-button vocabulary", () => {
  // Three copies of these marks had already drifted. build-topics.mjs now evaluates the
  // block in js/site.js rather than keeping a fourth.
  const site = text("js/site.js");
  assert.match(site, /\/\* pf:source-marks:start/);
  assert.match(site, /\/\* pf:source-marks:end \*\//);
  assert.match(text("tools/build-topics.mjs"), /site\.indexOf\("\/\* pf:source-marks:start"\)/);
  for (const file of ["js/watch.js", "js/exams-page.js"]) {
    assert.doesNotMatch(text(file), /sourceMarkParts\s*=\s*\{/, `${file} must not keep its own copy of the marks`);
    assert.match(text(file), /PF\.sourceMark/, `${file} must use the shared mark renderer`);
  }
});

test("PigBang appends the next page without rebuilding visible cards", () => {
  const source = text("js/watch.js");
  assert.match(source, /grid\.addEventListener\("click", handleGridClick\)/);
  assert.match(source, /grid\.insertAdjacentHTML\("beforeend", additions\.map\(card\)\.join\(""\)\)/);
  assert.match(source, /entriesByTab\.get\(activeTab\)/);
  assert.match(source, /cardMarkup\[cacheIndex\]/);
  assert.doesNotMatch(source, /function bindCards\(/);
});

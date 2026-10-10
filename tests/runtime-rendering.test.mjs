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
  for (const page of ["learn/nursery-to-class-5/index.html", "rights/anti-corruption/index.html", "tools/creative-tools/index.html"]) {
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

test("the exam panels reach the DOM without anyone opening them or running JavaScript", () => {
  // The page used to ship an empty #exam-root and build each panel only when a visitor
  // opened it, so no crawler ever saw the syllabus or a single resource link. UPSC, RAS, the
  // NCERT roadmap and the SSC subjects now have pages of their own; the rest stay on the hub.
  const hub = text("exams/index.html");
  assert.match(hub, /<div class="exam-stack" id="exam-sections" data-accordion-scope data-prerendered>/);
  for (const id of ["exam-mock-tests", "exam-channels"]) {
    assert.match(hub, new RegExp(`<details class="exam-panel" id="${id}"[^>]*><summary>[\\s\\S]*?<div class="exam-panel-body"><p>`), `${id} must ship with its body`);
  }
  assert.doesNotMatch(hub, /<details\b[^>]*\sopen/, "every hub panel still starts closed");
  for (const slug of ["upsc", "ras", "ncert-books-for-upsc-ras-ssc", "ssc"]) assert.match(hub, new RegExp(`href="${slug}/"`), `the hub must link to /exams/${slug}/`);

  const pages = { upsc: "exam-ias", ras: "exam-ras", "ncert-books-for-upsc-ras-ssc": "exam-ncert-roadmap", ssc: "exam-common-subjects" };
  for (const [slug, id] of Object.entries(pages)) {
    const page = text(`exams/${slug}/index.html`);
    assert.match(page, new RegExp(`<details class="exam-panel" id="${id}"[^>]*\\sopen><summary><h2 class="exam-panel-heading">[\\s\\S]*?<div class="exam-panel-body"><p>`), `${id} must ship open, with its body, on /exams/${slug}/`);
    assert.doesNotMatch(page, /js\/data\/exams\.js\?/, "the page must not download the data it already carries");
  }
  assert.match(text("exams/ncert-books-for-upsc-ras-ssc/index.html"), /<table class="data-table">/, "the NCERT roadmap table must be in the markup");
  assert.ok((text("exams/upsc/index.html").match(/class="link-button /g) || []).length > 100, "the UPSC resource links must be in the markup");
});

test("a YouTube search link is not dressed up as a playable video", () => {
  const source = text("js/site.js");
  // 96 catalogue links point at youtube.com/results?search_query=... . A YouTube host test
  // alone calls those "video", and a video gets a play affordance — but js/player.js
  // parse() returns null for /results, so the play never had anywhere to go.
  assert.match(source, /function isYouTubeSearch\(url\)/, "search links need their own classification");
  assert.match(source, /parsed\.pathname === "\/results"/, "a search is identified by its /results path");
  assert.match(source, /if \(isYouTubeSearch\(value\)\) return "website";/, "a search must not classify as a video");
  // The host check must be anchored: a bare dot would also match evilyoutubeXcom.
  assert.match(source, /\/\(\?:\^\|\\\.\)youtube\\\.com\$\/i/, "the host pattern must escape its dots");
  assert.match(source, /function isTutorialSearch\(url, label\)/, "tutorial searches need their own classification");

  const builder = text("tools/build-topics.mjs");
  assert.match(builder, /isYouTubeSearch\(url\)\s*\?\s*"Search YouTube"/, "a search that is not a tutorial must still say it is a search");
  // A search the catalogue calls a tutorial looks like the YouTube button and says
  // "Tutorial", but stays an ordinary link: it never gets the in-site player.
  const page = text("tools/files-and-remote-access/index.html");
  assert.match(page, /class="link-button source-tutorial source-brand-youtube"[^>]*youtube\.com\/results[^>]*aria-label="Search YouTube for [^"]+ tutorials"/, "a tutorial search must be a YouTube-branded link named as a search");
  const lanes = [...page.matchAll(/<div class="topic-lane topic-lane-(web|video|app)">([\s\S]*?)<\/div>/g)];
  const searchLanes = lanes.filter(([, , html]) => html.includes("youtube.com/results"));
  assert.ok(searchLanes.length > 0);
  for (const [, lane, html] of searchLanes) {
    assert.equal(lane, "video", "YouTube searches belong in the YouTube column");
    assert.match(html, /source-mark-youtube/);
    assert.match(html, /<span class="source-label">Tutorial<\/span>/);
    assert.doesNotMatch(html, /data-youtube-play/);
  }
  // Rights pages label theirs "YouTube Tutorial"; channel searches elsewhere are not tutorials.
  assert.match(text("rights/anti-corruption/index.html"), /source-tutorial source-brand-youtube/);
  assert.doesNotMatch(text("learn/class-9-to-12/index.html"), /source-tutorial/);
});

test("the generated pages and the runtime share one source-button vocabulary", () => {
  // Three copies of these marks had already drifted. build-topics.mjs now evaluates the
  // block in js/site.js rather than keeping a fourth.
  const site = text("js/site.js");
  assert.match(site, /\/\* pf:source-marks:start/);
  assert.match(site, /\/\* pf:source-marks:end \*\//);
  const builder = text("tools/build-topics.mjs");
  assert.match(builder, /siteBlock\(root, "source-marks"\)/);
  // The resource symbol comes from the same file for the same reason.
  assert.match(site, /\/\* pf:resource-symbols:start/);
  assert.match(builder, /siteBlock\(root, "resource-symbols"\)/);
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
  assert.match(source, /if \(entry\.cardMarkup\) return entry\.cardMarkup;/);
  assert.doesNotMatch(source, /function bindCards\(/);
});

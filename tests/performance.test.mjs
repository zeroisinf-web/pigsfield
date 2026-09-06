import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Size budgets must measure the bytes that actually ship. Git stores text as LF, so a
// CRLF working tree (the Git-for-Windows default) would otherwise inflate every text
// asset by one byte per line and fail these budgets for the wrong reason.
const TEXT_ASSET = /\.(?:css|js|mjs|html|json|txt|xml|svg)$/i;
const normalizeText = (bytes, name) => TEXT_ASSET.test(name)
  ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
  : bytes;
const read = (name) => normalizeText(fs.readFileSync(path.join(ROOT, name)), name);
const readAbsolute = (file) => normalizeText(fs.readFileSync(file), file);
const text = (name) => read(name).toString("utf8");
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const brotliSize = (buffer) => zlib.brotliCompressSync(buffer, {
  // Quality 6 approximates practical CDN compression and keeps CI feedback fast.
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 }
}).length;
const gzipSize = (buffer) => zlib.gzipSync(buffer, { level: 9 }).length;

function withinBudget(file, { raw, gzip, brotli }) {
  const source = read(file);
  assert.ok(source.length <= raw, `${file} is ${kib(source.length)} raw; budget is ${kib(raw)}`);
  const gzipped = gzipSize(source);
  assert.ok(gzipped <= gzip, `${file} is ${kib(gzipped)} gzip; budget is ${kib(gzip)}`);
  const compressed = brotliSize(source);
  assert.ok(compressed <= brotli, `${file} is ${kib(compressed)} Brotli; budget is ${kib(brotli)}`);
}

function localDependencies(htmlFile) {
  const html = text(htmlFile);
  const directory = path.dirname(path.join(ROOT, htmlFile));
  const references = [...html.matchAll(/\b(?:href|src)=(?:"([^"]+)"|'([^']+)')/gi)]
    .map((match) => match[1] || match[2])
    .filter((value) => value && !/^(?:https?:|mailto:|tel:|upi:|#)/i.test(value))
    .map((value) => value.split(/[?#]/, 1)[0])
    // woff2 belongs here: the web font is the single largest asset on every page, and
    // leaving it out meant these budgets never measured it. It is discovered through the
    // <link rel="preload"> in each document head.
    .filter((value) => /\.(?:css|js|png|webp|jpg|jpeg|woff2)$/i.test(value))
    .map((value) => path.resolve(directory, value))
    .filter((value) => fs.existsSync(value));
  return [...new Set(references)];
}

test("the navigation shell stays small enough for a fast first visit", () => {
  withinBudget("index.html", { raw: 25 * 1024, gzip: 8 * 1024, brotli: 6 * 1024 });
  // The hub catalogue is gone, and its stylesheet went with it: the section and category
  // accordions, their sticky summaries and offsets, the three-column resource grid, the
  // generated card artwork and the domain plate underneath it — 8.4 KiB of rules that only
  // ever painted a catalogue the site no longer assembles in the browser. Every selector
  // left is either referenced in markup or composed at runtime (source-brand-${brand} and
  // friends), checked by walking the file against every .html and .js in the repo.
  withinBudget("css/site.css", { raw: 90 * 1024, gzip: 20 * 1024, brotli: 19 * 1024 });
  // +4.4 KiB raw for the three things the deleted js/catalog.js used to carry on its own:
  // the source-button vocabulary (now shared with js/watch.js, js/exams-page.js and, at
  // build time, tools/build-topics.mjs, replacing three drifting copies), the delegated
  // save button the generated pages need, and the table that points a search result at the
  // page holding the resource. It is the one file that got bigger; every route got smaller,
  // because /learn/ alone stopped shipping 122 KiB of catalogue data, catalogue runtime and
  // player to render what its linked pages already serve as HTML.
  withinBudget("js/site.js", { raw: 88 * 1024, gzip: 25 * 1024, brotli: 23 * 1024 });
  // The font was 119.7 KiB carrying opsz 6-144 and wght 1-1000. Trimmed to the ranges the
  // site actually paints (opsz 12-120, wght 400-900) it is 83.6 KiB and renders
  // pixel-identically. This budget stops a future re-export shipping the full axes again.
  withinBudget("assets/google-sans-flex-latin.woff2", { raw: 90 * 1024, gzip: 90 * 1024, brotli: 90 * 1024 });
  withinBudget("assets/pigsfield-logo-ui.webp", { raw: 12 * 1024, gzip: 12 * 1024, brotli: 12 * 1024 });
  withinBudget("assets/pigbang-logo-nav.webp", { raw: 8 * 1024, gzip: 8 * 1024, brotli: 8 * 1024 });
  withinBudget("assets/pigbang-logo-display.webp", { raw: 14 * 1024, gzip: 14 * 1024, brotli: 14 * 1024 });
  withinBudget("assets/pigsfield-icon-192.png", { raw: 30 * 1024, gzip: 30 * 1024, brotli: 30 * 1024 });
  assert.equal(fs.existsSync(path.join(ROOT, "assets/pigbang-logo-ui.webp")), false, "the oversized PigBang UI mark must not return");

  const shell = ["index.html", "css/site.css", "js/site.js", "assets/pigsfield-logo-ui.webp"].map(read);
  const raw = shell.reduce((sum, item) => sum + item.length, 0);
  const gzipped = shell.reduce((sum, item) => sum + gzipSize(item), 0);
  const compressed = shell.reduce((sum, item) => sum + brotliSize(item), 0);
  // The stylesheet gave up more than js/site.js took on, so the shell every page loads is
  // smaller in all three measures than it was before the catalogue came out.
  assert.ok(raw <= 196 * 1024, `home render shell is ${kib(raw)} raw; budget is 196 KiB`);
  assert.ok(gzipped <= 52 * 1024, `home render shell is ${kib(gzipped)} gzip; budget is 52 KiB`);
  assert.ok(compressed <= 48 * 1024, `home render shell is ${kib(compressed)} Brotli; budget is 48 KiB`);
});

test("each route keeps its directly referenced payload within a mobile-safe ceiling", () => {
  // Re-baselined after the hub catalogues were replaced by links to the pages that already
  // held the same resources. These numbers are ~2% above what each route actually ships, so
  // an accidental regression fails but a deliberate change does not need the table rewritten
  // every time. The four hubs are the point of the exercise: /learn/ went from 418 KiB raw
  // and 167 KiB Brotli to 285 and 138, /rights/ from 438 and 171 to 285 and 138 — a whole
  // catalogue's data, its runtime and the YouTube player, none of which a hub needs to list
  // seven links. Every other route improved too, from the stylesheet alone.
  const routes = [
    ["index.html", 303, 145],
    ["learn/index.html", 289, 141],
    ["skills/index.html", 287, 141],
    ["tools/index.html", 289, 141],
    ["rights/index.html", 289, 141],
    ["exams/index.html", 375, 164],
    ["watch/index.html", 521, 198],
    ["about/index.html", 291, 142],
    ["editorial/index.html", 288, 141],
    ["accessibility/index.html", 288, 141],
    ["privacy/index.html", 292, 143],
    ["submit/index.html", 288, 141],
    ["ai/index.html", 287, 141],
    // The generated topic pages carry the resources themselves, and still land well under
    // what the hub used to cost to list them.
    ["learn/nursery-to-class-5/index.html", 331, 145],
    ["learn/teacher-training/index.html", 333, 145],
    ["rights/information-and-records/index.html", 304, 144]
  ];

  for (const [htmlFile, rawBudgetKiB, brotliBudgetKiB] of routes) {
    const files = [...new Set([
      path.join(ROOT, htmlFile),
      ...localDependencies(htmlFile),
      path.join(ROOT, "assets/pigsfield-logo-ui.webp"),
      path.join(ROOT, "assets/pigbang-logo-nav.webp")
    ])];
    const raw = files.reduce((sum, file) => sum + readAbsolute(file).length, 0);
    const compressed = files.reduce((sum, file) => sum + brotliSize(readAbsolute(file)), 0);
    assert.ok(raw <= rawBudgetKiB * 1024, `${htmlFile} direct payload is ${kib(raw)} raw; budget is ${rawBudgetKiB} KiB`);
    assert.ok(compressed <= brotliBudgetKiB * 1024, `${htmlFile} direct payload is ${kib(compressed)} Brotli; budget is ${brotliBudgetKiB} KiB`);
  }
});

test("large optional features remain lazy and the service worker installs a small shell", () => {
  const home = text("index.html");
  assert.doesNotMatch(home, /js\/(?:data\/|catalog|watch|player|ai-studio|ai-worker)/i, "home must not eagerly load catalogs, media or AI");
  for (const page of ["about", "editorial", "accessibility", "privacy", "submit"]) {
    const html = text(`${page}/index.html`);
    assert.doesNotMatch(html, /js\/(?:data\/|catalog|watch|player|ai-studio|ai-worker)/i, `${page} must not eagerly load optional feature bundles`);
  }
  for (const htmlFile of ["index.html", ...["learn", "skills", "tools", "rights", "exams", "watch", "about", "editorial", "accessibility", "privacy", "submit", "ai"].map((route) => `${route}/index.html`)]) {
    const html = text(htmlFile);
    for (const match of html.matchAll(/<script\b([^>]*)\bsrc=(?:"[^"]+"|'[^']+')[^>]*>/gi)) {
      assert.match(match[1] + match[0], /\bdefer\b|\basync\b|type=(?:"module"|'module')/i, `${htmlFile} has a parser-blocking local script`);
    }
  }

  const worker = text("sw.js");
  const entries = [...(worker.match(/const\s+CORE\s*=\s*\[([\s\S]*?)\];/)?.[1] || "").matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  assert.ok(entries.length <= 7, `service-worker install shell has ${entries.length} entries; budget is 7`);
  const installFiles = entries.map((entry) => entry === "./" ? "index.html" : entry.replace(/^\.\//, ""));
  const installRaw = installFiles.reduce((sum, file) => sum + read(file).length, 0);
  assert.ok(installRaw <= 235 * 1024, `service-worker install shell is ${kib(installRaw)} raw; budget is 235 KiB`);
  assert.doesNotMatch(worker.match(/const\s+CORE\s*=\s*\[([\s\S]*?)\];/)?.[1] || "", /(?:data\/|ai-|catalog|watch|player|pigbang)/i);
  assert.match(worker, /navigationPreload\.enable\(\)[\s\S]*event\.preloadResponse/, "repeat navigations should use navigation preload");
});

test("a phone reaches the useful part of a page without scrolling past a poster", () => {
  const css = text("css/site.css");
  // Measured on a 375x812 phone before these rules existed: the catalogue hero ran 467px,
  // the search field sat at 958px and the first resource at 1202px — a screen and a half of
  // scrolling to reach anything. The homepage was worse: the six destinations began at 999px,
  // below a visitor counter, a headline, a paragraph and a 304px video card. The generic
  // hero had no mobile treatment at all, so phones rendered desktop-scale padding and type.
  const mobile = css.slice(css.indexOf("Above-the-fold pass"));
  assert.ok(mobile, "the phone above-the-fold block must exist");
  assert.match(mobile, /@media \(max-width: 52rem\)/, "these rules must not touch desktop");
  assert.match(mobile, /\.page-hero \{ padding: 2rem 0 1\.4rem; \}/, "the catalogue hero must stay compact on phones");
  assert.match(mobile, /\.home-hero \{ padding: 1\.5rem 0 1\.2rem; \}/, "the homepage hero must stay compact on phones");
  // The guide is one pill-shaped line under the hero actions on every width. The 19rem
  // .hero-guide-card poster it replaced is gone, along with the mobile rules that used to
  // fold it down; neither may come back and push the six paths below the fold again.
  assert.match(css, /\.hero-guide \{\s*display: inline-flex;/, "the guide must stay a compact inline row");
  assert.doesNotMatch(css, /hero-guide-card|guide-visual|guide-orbit|home-guide-mark|guide-copy/, "the replaced guide poster must stay deleted");
});

test("runtime work is deferred and long collections skip offscreen rendering", () => {
  const site = text("js/site.js");
  const css = text("css/site.css");
  assert.match(site, /requestIdleCallback\(register,\s*\{\s*timeout:\s*4000\s*\}\)/, "service-worker installation must wait for idle time");
  assert.doesNotMatch(site.match(/function\s+init\(\)\s*\{([\s\S]*?)\n  \}/)?.[1] || "", /startTranslationObserver\(/, "English browsing must not run the translation observer");
  assert.match(site, /setLanguageState\("hi"\);\s*rememberLanguage\("hi"\);\s*startTranslationObserver\(\)/, "translation observation should start only after Hindi is chosen and remembered");
  assert.match(site, /savedLanguage\(\)\s*===\s*"hi"\)\s*restoreSavedHindi\(\)/, "saved Hindi should restore without changing the page URL");
  assert.doesNotMatch(site, /Translator\.availability\(/, "native translator creation must remain in the user-activation path");
  assert.match(site, /SERVER_TRANSLATION_MAX_ITEMS\s*=\s*48[\s\S]{0,100}SERVER_TRANSLATION_MAX_CHARACTERS\s*=\s*10000/, "server translation batches must stay bounded");
  const summaryPinning = site.match(/function\s+pinActivatedSummary\([^)]*\)\s*\{([\s\S]*?)\n  \}\n\n  function setDetailsOpen/)?.[1] || "";
  assert.match(summaryPinning, /setTimeout\(/, "accordion position correction should run once after motion settles");
  assert.doesNotMatch(summaryPinning, /requestAnimationFrame|remainingFrames|maintainPosition/, "accordion pinning must not force layout on every animation frame");
  assert.match(css, /\.resource-card\s*\{[^}]*content-visibility:\s*auto/s);
  assert.match(css, /\.exam-subject\s*\{[^}]*content-visibility:\s*auto/s);
  assert.match(css, /\.syllabus-item\s*\{[^}]*content-visibility:\s*auto/s);
  assert.match(css, /@media\s*\(max-width:\s*52rem\)[\s\S]*?\.site-header[\s\S]*?backdrop-filter:\s*none/, "mobile sticky surfaces must avoid expensive live blur");
});

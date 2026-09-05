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
  // 19 KiB Brotli rather than 18: the stylesheet gained the .resource-warning treatment
  // and the topic-page layout. Verified there is nothing dead left to reclaim first —
  // every remaining unreferenced selector is composed at runtime (source-brand-${brand}
  // and friends), so removing them would break the cards.
  withinBudget("css/site.css", { raw: 100 * 1024, gzip: 22 * 1024, brotli: 19 * 1024 });
  withinBudget("js/site.js", { raw: 82 * 1024, gzip: 24 * 1024, brotli: 20 * 1024 });
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
  assert.ok(raw <= 205 * 1024, `home render shell is ${kib(raw)} raw; budget is 205 KiB`);
  assert.ok(gzipped <= 58 * 1024, `home render shell is ${kib(gzipped)} gzip; budget is 58 KiB`);
  assert.ok(compressed <= 48 * 1024, `home render shell is ${kib(compressed)} Brotli; budget is 48 KiB`);
});

test("each route keeps its directly referenced payload within a mobile-safe ceiling", () => {
  // Re-baselined once the web font was counted (see localDependencies): these numbers are
  // ~4% above what each route actually ships, so an accidental regression fails but a
  // deliberate change does not need the table rewritten every time.
  const routes = [
    ["index.html", 295, 142],
    ["learn/index.html", 410, 165],
    ["skills/index.html", 350, 155],
    ["tools/index.html", 355, 155],
    ["rights/index.html", 430, 168],
    ["exams/index.html", 375, 163],
    ["watch/index.html", 520, 196],
    ["about/index.html", 290, 141],
    ["editorial/index.html", 288, 140],
    ["accessibility/index.html", 288, 140],
    ["privacy/index.html", 290, 140],
    ["submit/index.html", 288, 140],
    ["ai/index.html", 286, 139]
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

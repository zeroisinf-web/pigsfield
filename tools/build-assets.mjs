// Give every directly loaded script, stylesheet and brand asset a content version, so new
// HTML cannot pick up old HTTP or service-worker cache entries after a deployment.
//
// HTML references were versioned from the start. The references held inside JavaScript were
// not, and that is how a deploy could land and still show the old interface: js/site.js
// loads js/ai-studio.js by bare path, and js/ai-studio.js names each brand mark by bare
// path. _headers gives /js/* ten minutes plus a day of stale-while-revalidate and
// /assets/*.svg a week plus a month, and sw.js serves images cache-first — so replacing a
// logo in place left returning visitors on the previous one for days, with nothing in the
// pipeline able to tell them otherwise. A version in the URL makes a replacement a
// different URL, which every one of those layers already handles correctly.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

/** Every page and script, held in memory so a version can be computed from rewritten bytes. */
const sources = new Map();
(function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { collect(file); continue; }
    if (entry.name.endsWith('.html') || entry.name.endsWith('.js')) sources.set(file, fs.readFileSync(file, 'utf8'));
  }
})(root);

function version(target) {
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  // A file this pass also rewrites is hashed from its rewritten bytes, not from disk;
  // otherwise js/site.js would carry the version js/ai-studio.js had before stamping.
  const bytes = sources.has(target) ? Buffer.from(sources.get(target), 'utf8') : fs.readFileSync(target);
  return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}

/** href="css/site.css" / src="../js/site.js", resolved against the page's own directory. */
function versionHtml(source, directory) {
  return source.replace(/\b(href|src)="([^"?:]+\.(?:css|js))(?:\?v=[a-f0-9]+)?"/g, (match, attribute, asset) => {
    const hash = version(path.resolve(directory, asset));
    return hash ? `${attribute}="${asset}?v=${hash}"` : match;
  });
}

/**
 * "js/ai-studio.js", "/assets/claude-symbol.svg", "css/ai-studio.css" — whole string
 * literals naming a site asset, always resolved against the site root because that is what
 * the loaders at the other end do with them (base + path, or assetUrl()). A relative "./"
 * form is deliberately not matched: sw.js writes its precache list that way and
 * tools/build-sw.mjs owns it. Anything that is not a file in this repository is left alone,
 * so a catalog URL is never touched.
 */
function versionJs(source) {
  return source.replace(/"(\/?(?:assets|css|js)\/[A-Za-z0-9._/-]+\.(?:css|js|svg|png|webp))(?:\?v=[a-f0-9]+)?"/g, (match, asset) => {
    const hash = version(path.resolve(root, asset.replace(/^\/+/, '')));
    return hash ? `"${asset}?v=${hash}"` : match;
  });
}

// One pass cannot settle a chain: stamping js/ai-studio.js changes its own version, which
// js/site.js refers to, which every page refers to. Repeat until the whole graph is stable.
const ROUNDS = 12;
let rounds = 0;
for (let dirty = true; dirty && rounds < ROUNDS; rounds++) {
  dirty = false;
  for (const [file, source] of sources) {
    const next = file.endsWith('.html') ? versionHtml(source, path.dirname(file)) : versionJs(source);
    if (next !== source) { sources.set(file, next); dirty = true; }
  }
}
if (rounds >= ROUNDS) {
  console.error(`Asset versions did not settle in ${ROUNDS} rounds — check for a reference cycle.`);
  process.exit(1);
}

let changed = 0;
for (const [file, next] of sources) {
  if (next === fs.readFileSync(file, 'utf8')) continue;
  changed++;
  if (!check) fs.writeFileSync(file, next);
}
if (check && changed) { console.error(`${changed} files need asset versions. Run npm run build:assets before build:sw.`); process.exitCode = 1; }
else console.log(check ? 'All asset versions are current.' : `Versioned assets in ${changed} files.`);

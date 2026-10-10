#!/usr/bin/env node
// Header and footer prerender
//
// The site's navigation used to exist only after js/site.js ran. Googlebot renders
// JavaScript, but Bing's first pass, AI answer engines and link-preview crawlers do not, so
// to them /ai/, /privacy/ and /accessibility/ were linked from nowhere and /exams/ and
// /watch/ from the homepage alone.
//
// This evaluates the pf:chrome block of js/site.js — the same template the browser uses —
// and writes its output into every page's <header data-site-header> and
// <footer data-site-footer>. js/site.js then binds what is already there instead of
// drawing it again, so nothing moves when the script arrives.
//
//   node tools/build-chrome.mjs           write every page
//   node tools/build-chrome.mjs --check   exit 1 if any page's chrome is stale

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", "node_modules"]);

function siteSource(root) {
  return fs.readFileSync(path.join(root, "js", "site.js"), "utf8");
}

function slice(site, startMarker, endMarker, label) {
  const start = site.indexOf(startMarker);
  const end = site.indexOf(endMarker, start);
  if (start < 0 || end <= start) throw new Error(`js/site.js no longer contains ${label}`);
  return site.slice(start, end + endMarker.length);
}

let cached;
function chromeContext(root = ROOT) {
  const site = siteSource(root);
  if (cached && cached.site === site) return cached.context;
  const source = [
    slice(site, "const pageMap = {", "\n  };", "its pageMap"),
    slice(site, "function escapeHtml(value) {", "\n  }", "escapeHtml()"),
    "PF.path = function (key) { return base + (pageMap[key] || \"\"); };",
    slice(site, "/* pf:chrome:start", "/* pf:chrome:end */", "a pf:chrome block"),
    "globalThis.render = { headerMarkup, footerMarkup };"
  ].join("\n");
  const context = vm.createContext({ PF: {}, base: "./", page: "home" });
  vm.runInContext(source, context);
  cached = { site, context };
  return context;
}

/** The year is written by the build and refreshed by js/site.js, so comparisons ignore it. */
const normalize = (html) => html.replace(/<span data-year>\d{4}<\/span>/g, "<span data-year></span>").replace(/\?v=[a-f0-9]{12}(?=["'])/g, "");

export function renderChrome({ base, page, root = ROOT }) {
  const context = chromeContext(root);
  context.base = base;
  context.page = page;
  return {
    header: `<header data-site-header class="site-header">${context.render.headerMarkup().trim()}</header>`,
    footer: `<footer data-site-footer class="site-footer">${context.render.footerMarkup(new Date().getFullYear()).trim()}</footer>`
  };
}

/** Put the chrome into one page's HTML. */
export function applyChrome(html, root = ROOT) {
  const base = html.match(/<html\b[^>]*\bdata-base="([^"]*)"/)?.[1];
  const page = html.match(/<body\b[^>]*\bdata-page="([^"]*)"/)?.[1];
  if (base == null || !page) return html;
  const { header, footer } = renderChrome({ base, page, root });
  return html
    .replace(/<header data-site-header[^>]*>[\s\S]*?<\/header>/, header)
    .replace(/<footer data-site-footer[^>]*>[\s\S]*?<\/footer>/, footer);
}

export function chromeIsCurrent(html, root = ROOT) {
  return normalize(applyChrome(html, root)) === normalize(html);
}

function pages(dir = ROOT) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...pages(full));
    else if (entry.name === "index.html" || (dir === ROOT && entry.name === "404.html")) found.push(full);
  }
  return found;
}

export function build({ root = ROOT, check = false } = {}) {
  const stale = [];
  let count = 0;
  for (const file of pages(root)) {
    const html = fs.readFileSync(file, "utf8");
    if (!/<header data-site-header/.test(html)) continue;
    count += 1;
    if (chromeIsCurrent(html, root)) continue;
    if (check) stale.push(path.relative(root, file));
    else fs.writeFileSync(file, applyChrome(html, root), "utf8");
  }
  return { stale, count };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const { stale, count } = build({ check });
  if (check && stale.length) {
    console.error(`Header or footer is stale on: ${stale.join(", ")}\nRun: npm run build:chrome`);
    process.exitCode = 1;
  } else {
    console.log(check ? `Header and footer are current on all ${count} pages.` : `Wrote the header and footer into ${count} pages.`);
  }
}

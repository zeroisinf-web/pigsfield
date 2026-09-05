#!/usr/bin/env node
// Sitemap generator
//
// sitemap.xml was maintained by hand, so it drifted: every lastmod still read 2026-07-15
// long after the pages changed, and adding 18 topic pages meant 18 chances to mistype a
// URL. tools/validate-site.mjs already asserts the sitemap matches the canonical route
// list exactly, which turned every addition into a build failure to fix by hand.
//
// So the route list is now the single source of truth (tools/routes.mjs) and this writes
// the file from it. Generated and committed, because Cloudflare deploys the repository
// as-is with no build step.
//
//   node tools/build-sitemap.mjs           write sitemap.xml
//   node tools/build-sitemap.mjs --check   exit 1 if sitemap.xml is stale

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ROUTES, SITE_ORIGIN } from "./routes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function renderSitemap() {
  const urls = ROUTES.map(
    (route) => `  <url>
    <loc>${SITE_ORIGIN}${route.path}</loc>
    <lastmod>${route.lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(ROOT, "sitemap.xml");
  const xml = renderSitemap();
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== xml) {
      console.error("sitemap.xml is stale.\nRun: npm run build:sitemap");
      process.exitCode = 1;
    } else {
      console.log(`sitemap.xml matches all ${ROUTES.length} canonical routes.`);
    }
  } else {
    fs.writeFileSync(file, xml, "utf8");
    console.log(`Wrote sitemap.xml with ${ROUTES.length} routes.`);
  }
}

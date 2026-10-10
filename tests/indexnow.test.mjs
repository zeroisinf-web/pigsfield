import test from "node:test";
import assert from "node:assert/strict";

import { changedUrls, indexNowKey } from "../tools/indexnow.mjs";

const url = (loc, lastmod, alternates = "") => `  <url>\n    <loc>${loc}</loc>${alternates}\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
const sitemap = (...urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n${urls.join("\n")}\n</urlset>\n`;
const hreflang = '\n    <xhtml:link rel="alternate" hreflang="hi-IN" href="https://pigsfield.com/hi/rights/"/>';

test("IndexNow announces new and re-dated pages, including ones with hreflang alternates", () => {
  // The first version matched <loc> and <lastmod> only when adjacent, so every page with
  // <xhtml:link> lines between them was silently skipped: all of /hi/rights/.
  const before = sitemap(url("https://pigsfield.com/", "2026-10-09"), url("https://pigsfield.com/rights/", "2026-10-09", hreflang));
  const after = sitemap(
    url("https://pigsfield.com/", "2026-10-09"),
    url("https://pigsfield.com/rights/", "2026-10-10", hreflang),
    url("https://pigsfield.com/hi/rights/", "2026-10-10", hreflang)
  );
  assert.deepEqual(changedUrls(before, after), ["https://pigsfield.com/rights/", "https://pigsfield.com/hi/rights/"]);
  assert.deepEqual(changedUrls(after, after), [], "an unchanged sitemap announces nothing");
});

test("the IndexNow key file at the root contains exactly its own key", () => {
  assert.match(indexNowKey(), /^[a-f0-9]{32}$/);
});

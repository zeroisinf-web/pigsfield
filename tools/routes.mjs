// The canonical public route list — the single source of truth for what Pigsfield
// publishes. tools/validate-site.mjs checks every route here exists and is indexable,
// and tools/build-sitemap.mjs writes sitemap.xml from it, so the two can never disagree.
//
// lastmod is a claim about content, so it is pinned rather than generated: a date that
// moves on every deploy is a freshness signal the page has not earned, and SEO-GROWTH.md
// rules out that kind of trick. Bump a route here only when its content actually changed.

import { TOPICS } from "./build-topics.mjs";

export const SITE_ORIGIN = "https://pigsfield.com";

const HUB = "weekly";
const STATIC = "monthly";
const RARE = "yearly";

export const ROUTES = [
  { path: "/", lastmod: "2026-07-15", changefreq: HUB, priority: "1.0" },

  { path: "/learn/", lastmod: "2026-09-05", changefreq: HUB, priority: "0.9" },
  { path: "/rights/", lastmod: "2026-09-05", changefreq: HUB, priority: "0.9" },
  { path: "/skills/", lastmod: "2026-09-05", changefreq: HUB, priority: "0.8" },
  { path: "/tools/", lastmod: "2026-09-05", changefreq: HUB, priority: "0.8" },
  { path: "/exams/", lastmod: "2026-07-15", changefreq: HUB, priority: "0.8" },
  { path: "/watch/", lastmod: "2026-09-05", changefreq: HUB, priority: "0.8" },

  // Generated topic pages. Slugs come from tools/build-topics.mjs, so a new topic reaches
  // the sitemap and the validator at the same moment it reaches the filesystem.
  // Priority sits just under their hub: these are the pages meant to rank for specific
  // searches, and they carry the actual resources.
  ...TOPICS.map((topic) => ({ path: topic.route, lastmod: "2026-09-05", changefreq: HUB, priority: "0.7" })),

  { path: "/ai/", lastmod: "2026-07-15", changefreq: STATIC, priority: "0.7" },
  { path: "/about/", lastmod: "2026-07-15", changefreq: STATIC, priority: "0.7" },
  { path: "/editorial/", lastmod: "2026-07-15", changefreq: STATIC, priority: "0.6" },
  { path: "/submit/", lastmod: "2026-07-15", changefreq: STATIC, priority: "0.5" },
  { path: "/accessibility/", lastmod: "2026-07-15", changefreq: RARE, priority: "0.5" },
  { path: "/privacy/", lastmod: "2026-07-15", changefreq: RARE, priority: "0.4" }
];

/** Just the paths, in sitemap order. */
export const REQUIRED_ROUTES = ROUTES.map((route) => route.path);

/** Path -> lastmod, for the validator's freshness assertions. */
export const SITEMAP_LASTMOD = new Map(ROUTES.map((route) => [route.path, route.lastmod]));

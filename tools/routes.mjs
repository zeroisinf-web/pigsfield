// The canonical public route list — the single source of truth for what Pigsfield
// publishes. tools/validate-site.mjs checks every route here exists and is indexable,
// and tools/build-sitemap.mjs writes sitemap.xml from it, so the two can never disagree.
//
// lastmod is a claim about content, so it is pinned rather than generated: a date that
// moves on every deploy is a freshness signal the page has not earned, and SEO-GROWTH.md
// rules out that kind of trick. Bump a route here only when its content actually changed.

import { HINDI_PAIRS, TOPICS } from "./build-topics.mjs";
import { EXAM_ROUTES } from "./build-exams.mjs";
import { WATCH_ROUTES } from "./build-watch.mjs";

export const SITE_ORIGIN = "https://pigsfield.com";

const HUB = "weekly";
const STATIC = "monthly";
const RARE = "yearly";

const BASE_ROUTES = [
  { path: "/", lastmod: "2026-10-09", changefreq: HUB, priority: "1.0" },

  { path: "/learn/", lastmod: "2026-09-05", changefreq: HUB, priority: "0.9" },
  { path: "/rights/", lastmod: "2026-10-09", changefreq: HUB, priority: "0.9" },
  { path: "/skills/", lastmod: "2026-10-10", changefreq: HUB, priority: "0.8" },
  { path: "/tools/", lastmod: "2026-10-05", changefreq: HUB, priority: "0.8" },
  { path: "/exams/", lastmod: "2026-10-10", changefreq: HUB, priority: "0.8" },
  { path: "/watch/", lastmod: "2026-10-10", changefreq: HUB, priority: "0.8" },

  // Generated topic pages. Slugs come from tools/build-topics.mjs, so a new topic reaches
  // the sitemap and the validator at the same moment it reaches the filesystem.
  // Priority sits just under their hub: these are the pages meant to rank for specific
  // searches, and they carry the actual resources.
  // Rights pages changed on 2026-10-09: civic tips moved to the right cards, two legal errors fixed.
  ...TOPICS.map((topic) => ({ path: topic.route, lastmod: topic.lastmod || (topic.dest === "rights" ? "2026-10-09" : topic.dest === "tools" ? "2026-10-05" : "2026-09-05"), changefreq: HUB, priority: "0.7" })),

  // The exam guides split out of /exams/ on 2026-10-10.
  ...EXAM_ROUTES.map((path) => ({ path, lastmod: "2026-10-10", changefreq: HUB, priority: "0.8" })),

  // PigBang's crawlable lists, first published on 2026-10-10.
  ...WATCH_ROUTES.map((path) => ({ path, lastmod: "2026-10-10", changefreq: HUB, priority: "0.7" })),

  { path: "/ai/", lastmod: "2026-10-05", changefreq: STATIC, priority: "0.7" },
  { path: "/about/", lastmod: "2026-07-15", changefreq: STATIC, priority: "0.7" },
  { path: "/editorial/", lastmod: "2026-07-15", changefreq: STATIC, priority: "0.6" },
  { path: "/submit/", lastmod: "2026-07-15", changefreq: STATIC, priority: "0.5" },
  { path: "/accessibility/", lastmod: "2026-07-15", changefreq: RARE, priority: "0.5" },
  { path: "/privacy/", lastmod: "2026-07-15", changefreq: RARE, priority: "0.4" }
];

// The Hindi versions follow their English pages, first published on 2026-10-10. Both halves
// of a pair carry the same alternates, so the sitemap states the pairing from each side.
const alternatesFor = (english, hindi) => ({ "en-IN": english, "hi-IN": hindi, "x-default": english });
export const ROUTES = [
  ...BASE_ROUTES.map((route) => {
    const pair = HINDI_PAIRS.find(([english]) => english === route.path);
    return pair ? { ...route, alternates: alternatesFor(...pair) } : route;
  }),
  ...HINDI_PAIRS.map(([english, hindi]) => ({ path: hindi, lastmod: "2026-10-10", changefreq: HUB, priority: english === "/rights/" ? "0.8" : "0.7", alternates: alternatesFor(english, hindi) }))
];

/** Just the paths, in sitemap order. */
export const REQUIRED_ROUTES = ROUTES.map((route) => route.path);

/** Path -> lastmod, for the validator's freshness assertions. */
export const SITEMAP_LASTMOD = new Map(ROUTES.map((route) => [route.path, route.lastmod]));

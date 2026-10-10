#!/usr/bin/env node
// PigBang list pages
//
// PigBang's 589 titles were drawn by js/watch.js in the browser and reachable only through
// buttons and #fragments, so no search engine or answer engine could see a single one of
// them. This writes one crawlable page per shelf type — films, channels, apps — with every
// title in the served HTML, grouped by learning stage, free ones first. /watch/ stays the
// interactive player and links to all three. There is deliberately no page per title: a
// fifteen-word description is not a page.
//
//   node tools/build-watch.mjs           write the pages
//   node tools/build-watch.mjs --check   exit 1 if any page is stale

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyChrome } from "./build-chrome.mjs";
import { esc, langAttr, loadCatalog, renderSources, resourceSymbol, slug } from "./build-topics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://pigsfield.com";

// Mirrors LEVEL_SHELVES in js/watch.js: curriculum order, not alphabetical.
const LEVELS = [
  ["N-5", "Nursery to Class 5"],
  ["6-8", "Class 6 to 8"],
  ["9-12", "Class 9 to 12"],
  ["UG", "Undergraduate"],
  ["PG", "Postgraduate"],
  ["PhD", "PhD & research"],
  ["Vocational & Business", "Vocational & business"],
  ["Teacher Training", "Teacher training"]
];

export const WATCH_PAGES = [
  {
    tab: "channels",
    slug: "channels",
    name: "Channels & playlists",
    title: "Best Educational YouTube Channels & Playlists | Pigsfield",
    h1: "Educational YouTube channels and playlists, by learning stage",
    description: (count) => `${count} educational YouTube channels and playlists for science, maths, history, coding and more, sorted by learning stage from Nursery to PhD.`,
    intro: [
      "These are the YouTube channels and playlists PigBang recommends for learning, grouped by the stage they suit best, from picture-book science for young children to university lectures and research talks. Almost all of them are free to watch. Each entry says who it is for, what subject it covers and where it opens.",
      "A channel suitable for several stages is listed under the earliest one, so older learners should look further up the page as well as at their own stage. Playlists can play inside PigBang with YouTube's privacy-enhanced player, or open on YouTube itself.",
      "A good way to use this list is to pick one channel per subject and follow it for a term rather than sampling dozens. Pigsfield owns none of these channels; if one has gone stale or changed character, the feedback button on every page tells us."
    ]
  },
  {
    tab: "apps",
    slug: "apps",
    name: "Learning apps",
    title: "Learning Apps for Kids, Students & Adults | Pigsfield",
    h1: "Learning apps for every stage, from Nursery to PhD",
    description: (count) => `${count} learning apps for Android, iPhone and the web, from phonics and maths to coding and languages, sorted by learning stage, free ones first.`,
    intro: [
      "Learning apps for phones, tablets and the web, grouped by the stage they suit best. Free apps come first in each group, followed by those that need a subscription or a purchase. The price label on each entry says which, but check the store before you pay, because prices and free tiers change.",
      "The list covers early reading and phonics, maths practice, science simulations, languages, coding, exam practice and tools for teachers. Where an app is on both Google Play and the App Store, both links are given. An app suitable for several stages is listed under the earliest one.",
      "For young children, use apps alongside a parent or teacher rather than instead of them, and read the app's privacy policy before creating an account. Every link opens the app's own store page or website."
    ]
  },
  {
    tab: "movies",
    slug: "films",
    name: "Films & shows",
    title: "Educational Films, Documentaries & Shows | Pigsfield",
    h1: "Educational films, documentaries and shows worth watching",
    description: (count) => `${count} educational films, documentaries and series, free ones first, with where each one streams: YouTube, Netflix, Prime Video, Hotstar and more.`,
    intro: [
      "Films, documentaries and series that teach something, grouped by the stage they suit best: nature and science documentaries, history and biography, economics and business, social issues and Indian cinema with something to say.",
      "Free titles come first in each group. The rest need a subscription to Netflix, Prime Video, Hotstar or another service, and each entry shows where it streams. What a paid service carries changes by region and over time, so check before you plan a class around a title. A title suitable for several stages is listed under the earliest one.",
      "A short discussion afterwards turns a film into a lesson; many of these fit a classroom period or a family evening. Pigsfield hosts none of these films."
    ]
  }
];
export const WATCH_ROUTES = WATCH_PAGES.map((page) => `/watch/${page.slug}/`);

/** One tab's entries, with the ids js/watch.js gives them, duplicates dropped, grouped by
 *  the earliest stage each suits and ordered free first, then by name. */
export function watchGroups(tab) {
  const seen = new Set();
  const entries = (tab.items || []).map((item, index) => ({
    item,
    id: slug(`${item.name}-${tab.id}-${index + 1}`),
    free: /^free$/i.test(String(item.price || "")),
    level: LEVELS.findIndex(([level]) => (item.classes || []).includes(level))
  })).filter((entry) => {
    const key = String(entry.item.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const order = (a, b) => (b.free - a.free) || String(a.item.name).localeCompare(String(b.item.name), "en");
  const groups = LEVELS.map(([, label], index) => ({ label, id: `stage-${slug(label)}`, entries: entries.filter((entry) => entry.level === index).sort(order) }));
  groups.push({ label: "For every stage", id: "stage-every", entries: entries.filter((entry) => entry.level < 0).sort(order) });
  return { groups: groups.filter((group) => group.entries.length), count: entries.length };
}

function renderEntry(entry) {
  const item = entry.item;
  const name = item.name || "Untitled";
  const resource = { title: name, urls: (item.urls || []).map((url) => `|${url}`) };
  const levels = LEVELS.filter(([level]) => (item.classes || []).includes(level)).map(([, label]) => label);
  const meta = [item.price || "", levels.join(", "), item.subject || ""].filter(Boolean).map(esc).join(" · ");
  const share = `<span class="card-tools"><button class="card-tool card-share" type="button" data-share="${esc(entry.id)}" data-share-title="${esc(name)}" aria-label="Share ${esc(name)}"></button></span>`;
  return `<article class="topic-item" id="${esc(entry.id)}"><div class="topic-item-head"><span class="topic-symbol" aria-hidden="true">${resourceSymbol(resource)}</span><h3${langAttr(name)}>${esc(name)}</h3>${share}</div><p class="topic-meta">${meta}</p>${item.desc ? `<p${langAttr(item.desc)}>${esc(item.desc)}</p>` : ""}${renderSources(resource)}<p><a class="text-link" href="../#${esc(entry.id)}">Open in PigBang</a></p></article>`;
}

export function renderWatchPage(page, data = loadCatalog()) {
  const tab = (data.pigbang.tabs || []).find((candidate) => candidate.id === page.tab);
  if (!tab) throw new Error(`js/data/pigbang.js has no "${page.tab}" tab`);
  const { groups, count } = watchGroups(tab);
  const route = `/watch/${page.slug}/`;
  const canonical = `${ORIGIN}${route}`;
  const description = page.description(count);
  const all = groups.flatMap((group) => group.entries);
  const graph = [
    { "@type": "CollectionPage", "@id": `${canonical}#webpage`, url: canonical, name: page.h1, description, inLanguage: "en-IN", isPartOf: { "@id": `${ORIGIN}/#website` }, publisher: { "@id": `${ORIGIN}/#organization` }, breadcrumb: { "@id": `${canonical}#breadcrumb` }, mainEntity: { "@id": `${canonical}#titles` } },
    { "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, itemListElement: [
      { "@type": "ListItem", position: 1, name: "Pigsfield", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "PigBang", item: `${ORIGIN}/watch/` },
      { "@type": "ListItem", position: 3, name: page.name, item: canonical }
    ] },
    { "@type": "ItemList", "@id": `${canonical}#titles`, name: page.name, numberOfItems: count, itemListElement: all.slice(0, 100).map((entry, index) => ({ "@type": "ListItem", position: index + 1, name: entry.item.name, url: `${canonical}#${entry.id}` })) }
  ];
  const image = `${ORIGIN}/assets/og/watch-${page.slug}.jpg`;
  const jump = groups.map((group) => `<a class="button ghost" href="#${group.id}">${esc(group.label)} <small>${group.entries.length}</small></a>`).join("");
  const siblings = WATCH_PAGES.filter((other) => other !== page).map((other) => `<a class="button ghost" href="../${other.slug}/">${esc(other.name)}</a>`).join("");
  // data-page "watch-list" keeps PigBang current in the navigation (js/site.js matches the
  // "watch-" prefix) without the player page's dark theme.
  const html = `<!doctype html>
<html lang="en-IN" data-base="../../">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="referrer" content="strict-origin-when-cross-origin"><meta name="theme-color" content="#f4f1e8">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <link rel="canonical" href="${canonical}"><link rel="icon" href="../../assets/pigsfield-icon-192.png" type="image/png" sizes="192x192"><link rel="manifest" href="../../manifest.json">
  <meta property="og:type" content="website"><meta property="og:site_name" content="Pigsfield"><meta property="og:locale" content="en_IN"><meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="PigBang ${esc(page.name.toLowerCase())}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(page.title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${image}"><meta name="twitter:image:alt" content="PigBang ${esc(page.name.toLowerCase())}">
  <link rel="preload" href="../../assets/google-sans-flex-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="../../css/site.css">
  <script defer src="../../js/site.js"></script>
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
</head>
<body data-page="watch-list">
  <a class="skip-link" href="#main-content">Skip to content</a><header data-site-header></header>
  <main id="main-content">
    <div class="container breadcrumbs"><ol><li><a href="../../">Home</a></li><li><a href="../">PigBang</a></li><li aria-current="page">${esc(page.name)}</li></ol></div>
    <section class="page-hero"><div class="container"><span class="eyebrow">PigBang · ${esc(page.name)}</span><h1>${esc(page.h1)}</h1>${page.intro.map((paragraph) => `<p class="lede">${esc(paragraph)}</p>`).join("")}<p><a class="button brand" href="../">Browse and play in PigBang</a></p></div></section>
    <section class="section"><div class="container">
      <p class="topic-count"><strong>${count}</strong> titles, each opening its original source.</p>
      <nav class="topic-siblings" aria-label="Jump to a learning stage">${jump}</nav>
      ${groups.map((group) => `<section class="topic-leftover" id="${group.id}"><h2>${esc(group.label)}</h2><div class="topic-list">
        ${group.entries.map(renderEntry).join("\n        ")}
      </div></section>`).join("\n      ")}
    </div></section>
    <section class="section alt"><div class="container">
      <h2>More in PigBang</h2>
      <nav class="topic-siblings" aria-label="Other PigBang lists">${siblings}</nav>
    </div></section>
  </main>
  <footer data-site-footer></footer>
</body>
</html>
`;
  return applyChrome(html).replace(/\?v=[a-f0-9]{12}(?=")/g, "");
}

const comparable = (html) => html.replace(/<span data-year>\d{4}<\/span>/g, "<span data-year></span>").replace(/\?v=[a-f0-9]{12}(?=")/g, "");

export function build({ root = ROOT, check = false } = {}) {
  const data = loadCatalog(root);
  const stale = [];
  for (const page of WATCH_PAGES) {
    const file = path.join(root, "watch", page.slug, "index.html");
    const html = renderWatchPage(page, data);
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (comparable(current) === comparable(html)) continue;
    if (check) stale.push(path.relative(root, file));
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, html, "utf8");
    }
  }
  return { stale };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const { stale } = build({ check });
  if (check && stale.length) {
    console.error(`PigBang list pages are stale: ${stale.join(", ")}\nRun: npm run build:watch`);
    process.exitCode = 1;
  } else {
    console.log(check ? `All ${WATCH_PAGES.length} PigBang list pages match js/data/pigbang.js.` : `Wrote ${WATCH_PAGES.length} PigBang list pages.`);
  }
}

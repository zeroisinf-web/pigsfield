#!/usr/bin/env node
// Topic page generator
//
// /learn/ is one URL carrying 171 resources across seven learning stages. That is
// one landing page competing for everything from "nursery rhymes" to "PhD thesis
// help", which is the wrong shape for search: nobody searches for "nursery to PhD".
// People search "NCERT class 10 science" and "free PhD research tools".
//
// This generates a real page per stage, each with its own URL, title, description,
// structured data and — crucially — its resources present in the served HTML rather
// than assembled by JavaScript afterwards. Splitting the catalog across pages also
// keeps every page inside the weight budgets in tests/performance.test.mjs, which
// prerendering all 171 onto /learn/ would have blown through.
//
// Source of truth stays js/data/school.js. These pages are generated and committed,
// because Cloudflare deploys the repository as-is with no build step. To stop them
// drifting from the data, each page carries a digest of the section it was built
// from, and tools/validate-site.mjs fails the build when it no longer matches.
//
//   node tools/build-topics.mjs           write the pages
//   node tools/build-topics.mjs --check   exit 1 if any page is stale (used by the validator)

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://pigsfield.com";

// Hand-written framing per stage. The resources come from the data; the words that
// have to read well to a person (and to a search result) are written, not derived.
export const TOPICS = [
  {
    id: "n5",
    slug: "nursery-to-class-5",
    name: "Nursery to Class 5",
    h1: "Early learning that stays playful.",
    title: "Free Nursery to Class 5 Learning Resources | Pigsfield",
    description: "Free-first books, videos, phonics, maths practice and activity ideas for children aged 4 to 10, organized for parents and primary teachers in India.",
    intro: "Resources for children roughly aged 4 to 10, chosen so a parent or a primary teacher can start straight away. Everything opens on the original provider's own site."
  },
  {
    id: "c68",
    slug: "class-6-to-8",
    name: "Class 6 to 8",
    h1: "Middle school, where curiosity needs structure.",
    title: "Free Class 6 to 8 Study Resources & NCERT | Pigsfield",
    description: "Free-first NCERT material, science and maths lessons, language practice and reference tools for middle-school students aged 11 to 14 in India.",
    intro: "Middle school is where subjects stop being one story and start being several. These resources cover NCERT material, science, maths and language practice for ages 11 to 14."
  },
  {
    id: "c912",
    slug: "class-9-to-12",
    name: "Class 9 to 12",
    h1: "Board years, without the coaching bill.",
    title: "Free Class 9 to 12 Study Material & NCERT | Pigsfield",
    description: "Free-first NCERT solutions, physics, chemistry, biology and maths lessons, past papers and revision tools for secondary and senior-secondary students in India.",
    intro: "Secondary and senior-secondary study material for ages 14 to 18, including NCERT-aligned lessons and revision help. Useful alongside board preparation and entrance exams."
  },
  {
    id: "ug",
    slug: "undergraduate",
    name: "Undergraduate",
    h1: "Degree-level learning you can reach for free.",
    title: "Free Undergraduate Courses & Study Resources | Pigsfield",
    description: "Free-first university lectures, open courseware, degree-level textbooks and subject resources for undergraduate students across India.",
    intro: "Open courseware, university lectures and degree-level references. Some providers offer paid certificates on top of free course material, so check the current terms at the source."
  },
  {
    id: "pg",
    slug: "postgraduate",
    name: "Postgraduate",
    h1: "Master's-level depth, openly available.",
    title: "Free Postgraduate & Master's Study Resources | Pigsfield",
    description: "Free-first advanced courses, specialist lectures and master's-level academic resources for postgraduate students in India.",
    intro: "Advanced coursework and specialist material for master's-level study, including open lectures and academic references."
  },
  {
    id: "phd",
    slug: "phd-and-research",
    name: "PhD & Research",
    h1: "Research support that does not sit behind a paywall.",
    title: "Free PhD & Research Tools, Papers and Support | Pigsfield",
    description: "Free-first preprint archives, open-access journals, reference managers, academic writing help and research tools for doctoral scholars in India.",
    intro: "Preprints, open-access journals, reference managers and writing support for doctoral work. Several of these replace tools that departments otherwise pay for."
  },
  {
    id: "tt",
    slug: "teacher-training",
    name: "Teacher Training",
    h1: "Strong teaching helps every stage flourish.",
    title: "Free Teacher Training Resources & Courses | Pigsfield",
    description: "Free-first teacher training courses, classroom practice guides, pedagogy resources and professional development material for teachers across India.",
    intro: "Professional development, pedagogy and classroom practice. Placed after PhD deliberately: teaching is a discipline of its own, not a fallback."
  }
];

const esc = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function loadSchool(root = ROOT) {
  const context = vm.createContext({ window: {} });
  for (const name of ["school", "teach"]) {
    new vm.Script(fs.readFileSync(path.join(root, "js", "data", `${name}.js`), "utf8")).runInContext(context);
  }
  return context.window.PF_DATA;
}

export function sectionFor(data, id) {
  return (data.school.sections || []).find((section) => section.id === id);
}

/** Everything a page renders, so the digest changes whenever visible content changes. */
export function topicPayload(section) {
  return (section.groups || []).flatMap((group) =>
    (group.items || []).map((item) => ({
      title: item.title || "",
      desc: item.desc || "",
      urls: (item.links || []).flatMap((link) => (link.urls || []).map((url) => `${link.label || ""}|${url}`))
    }))
  );
}

export function digestFor(section) {
  return crypto.createHash("sha256").update(JSON.stringify(topicPayload(section))).digest("hex").slice(0, 16);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function renderResources(section) {
  const items = topicPayload(section);
  return items
    .map((item) => {
      const links = item.urls
        .map((pair) => {
          const [label, url] = [pair.slice(0, pair.indexOf("|")), pair.slice(pair.indexOf("|") + 1)];
          const text = label && !/^(url|link|website|web)$/i.test(label) ? label : hostOf(url);
          return `<a class="link-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span>${esc(text)}</span><span class="topic-host">${esc(hostOf(url))}</span></a>`;
        })
        .join("");
      return `<article class="topic-item"><h3>${esc(item.title)}</h3>${item.desc ? `<p>${esc(item.desc)}</p>` : ""}<div class="topic-sources">${links}</div></article>`;
    })
    .join("\n        ");
}

function renderSiblings(current) {
  return TOPICS.filter((topic) => topic.slug !== current.slug)
    .map((topic) => `<a class="button ghost" href="../${topic.slug}/">${esc(topic.name)}</a>`)
    .join("");
}

export function renderTopicPage(topic, section) {
  const route = `/learn/${topic.slug}/`;
  const canonical = `${ORIGIN}${route}`;
  const items = topicPayload(section);
  const count = items.length;
  const socialDescription = `${topic.name}: ${count} free-first resources on Pigsfield, each linking straight to the original provider.`;

  const itemList = {
    "@type": "ItemList",
    "@id": `${canonical}#resources`,
    name: `${topic.name} resources`,
    numberOfItems: count,
    itemListElement: items.slice(0, 100).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.title
    }))
  };

  const graph = [
    {
      "@type": "CollectionPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: topic.name,
      description: topic.description,
      inLanguage: "en-IN",
      isPartOf: { "@id": `${ORIGIN}/#website` },
      publisher: { "@id": `${ORIGIN}/#organization` },
      breadcrumb: { "@id": `${canonical}#breadcrumb` },
      mainEntity: { "@id": `${canonical}#resources` }
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Pigsfield", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "Nursery to PhD", item: `${ORIGIN}/learn/` },
        { "@type": "ListItem", position: 3, name: topic.name, item: canonical }
      ]
    },
    itemList
  ];

  return `<!doctype html>
<html lang="en-IN" data-base="../../">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="referrer" content="strict-origin-when-cross-origin"><meta name="theme-color" content="#f4f1e8">
  <title>${esc(topic.title)}</title>
  <meta name="description" content="${esc(topic.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <meta name="pf-topic-digest" content="${digestFor(section)}">
  <link rel="canonical" href="${canonical}"><link rel="icon" href="../../assets/pigsfield-icon-192.png" type="image/png" sizes="192x192"><link rel="manifest" href="../../manifest.json">
  <meta property="og:type" content="website"><meta property="og:site_name" content="Pigsfield"><meta property="og:locale" content="en_IN"><meta property="og:title" content="${esc(topic.title)}"><meta property="og:description" content="${esc(socialDescription)}"><meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ORIGIN}/assets/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Pigsfield ${esc(topic.name)} learning resources"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(topic.title)}"><meta name="twitter:description" content="${esc(socialDescription)}"><meta name="twitter:image" content="${ORIGIN}/assets/og.png"><meta name="twitter:image:alt" content="Pigsfield ${esc(topic.name)} learning resources">
  <link rel="preload" href="../../assets/google-sans-flex-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="../../css/site.css">
  <script defer src="../../js/site.js"></script>
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
</head>
<body data-page="learn">
  <a class="skip-link" href="#main-content">Skip to content</a><header data-site-header></header>
  <main id="main-content">
    <div class="container breadcrumbs"><ol><li><a href="../../">Home</a></li><li><a href="../">Nursery to PhD</a></li><li aria-current="page">${esc(topic.name)}</li></ol></div>
    <section class="page-hero"><div class="container"><span class="eyebrow">${esc(topic.name)}</span><h1>${esc(topic.h1)}</h1><p class="lede">${esc(topic.intro)}</p></div></section>
    <section class="section"><div class="container">
      <p class="topic-count"><strong>${count}</strong> free-first ${count === 1 ? "resource" : "resources"}. Pigsfield does not host any of these; every link opens the original provider, where current price, terms and eligibility apply.</p>
      <div class="topic-list">
        ${renderResources(section)}
      </div>
    </div></section>
    <section class="section alt"><div class="container">
      <h2>Other learning stages</h2>
      <nav class="topic-siblings" aria-label="Other learning stages">${renderSiblings(topic)}</nav>
      <p><a class="button ghost" href="../">Browse all Nursery-to-PhD resources</a></p>
    </div></section>
  </main>
  <footer data-site-footer></footer>
</body>
</html>
`;
}

export function outputPathFor(topic, root = ROOT) {
  return path.join(root, "learn", topic.slug, "index.html");
}

export function build({ root = ROOT, check = false } = {}) {
  const data = loadSchool(root);
  const stale = [];
  const written = [];

  for (const topic of TOPICS) {
    const section = sectionFor(data, topic.id);
    if (!section) throw new Error(`js/data/school.js has no section with id "${topic.id}"`);
    const file = outputPathFor(topic, root);
    const html = renderTopicPage(topic, section);

    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== html) stale.push(`/learn/${topic.slug}/`);
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html, "utf8");
    written.push({ route: `/learn/${topic.slug}/`, count: topicPayload(section).length });
  }

  return { stale, written };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const { stale, written } = build({ check });
  if (check) {
    if (stale.length) {
      console.error(`Topic pages are stale: ${stale.join(", ")}\nRun: node tools/build-topics.mjs`);
      process.exitCode = 1;
    } else {
      console.log(`All ${TOPICS.length} topic pages match js/data/school.js.`);
    }
  } else {
    written.forEach((entry) => console.log(`  ${entry.route.padEnd(30)} ${entry.count} resources`));
    console.log(`Wrote ${written.length} topic pages.`);
  }
}

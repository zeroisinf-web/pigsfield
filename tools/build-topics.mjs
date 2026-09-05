#!/usr/bin/env node
// Topic page generator
//
// Each destination was one URL carrying its whole catalogue: /learn/ held 171 resources
// across seven stages, /rights/ held 47 across ten tiers. That is one landing page
// competing for everything at once, which is the wrong shape for search. Nobody searches
// "nursery to PhD" or "citizen arsenal"; they search "NCERT class 10 science" and "how to
// file an RTI".
//
// This generates a real page per topic, each with its own URL, title, description,
// structured data and — crucially — its resources present in the served HTML rather than
// assembled by JavaScript afterwards. Splitting across pages is also the only thing that
// fits: prerendering a whole catalogue onto its hub needs far more Brotli headroom than
// the budgets in tests/performance.test.mjs allow.
//
// Source of truth stays js/data/*.js. Pages are generated and committed, because
// Cloudflare deploys the repository as-is with no build step. To stop them drifting, each
// page carries a digest of the slice it was built from, and tools/validate-site.mjs fails
// the build when it no longer matches.
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
const DATA_MODULES = ["school", "teach", "tools", "exams", "pigbang", "govt"];

// A topic needs at least this many resources to deserve its own URL. A page with one or
// two links is thin content: bad for a reader and worse for search.
const MIN_RESOURCES = 3;

// Hand-written framing. The resources come from the data; the words that have to read well
// to a person, and in a search result, are written rather than derived from group titles
// like "TIER 4 — मानवाधिकार".
export const DESTINATIONS = [
  {
    dest: "learn",
    module: "school",
    parentName: "Nursery to PhD",
    splitBy: "section",
    topics: [
      { key: "n5", slug: "nursery-to-class-5", name: "Nursery to Class 5", h1: "Early learning that stays playful.", title: "Free Nursery to Class 5 Learning Resources | Pigsfield", description: "Free-first books, videos, phonics, maths practice and activity ideas for children aged 4 to 10, organized for parents and primary teachers in India.", intro: "Resources for children roughly aged 4 to 10, chosen so a parent or a primary teacher can start straight away. Everything opens on the original provider's own site." },
      { key: "c68", slug: "class-6-to-8", name: "Class 6 to 8", h1: "Middle school, where curiosity needs structure.", title: "Free Class 6 to 8 Study Resources & NCERT | Pigsfield", description: "Free-first NCERT material, science and maths lessons, language practice and reference tools for middle-school students aged 11 to 14 in India.", intro: "Middle school is where subjects stop being one story and start being several. These resources cover NCERT material, science, maths and language practice for ages 11 to 14." },
      { key: "c912", slug: "class-9-to-12", name: "Class 9 to 12", h1: "Board years, without the coaching bill.", title: "Free Class 9 to 12 Study Material & NCERT | Pigsfield", description: "Free-first NCERT solutions, physics, chemistry, biology and maths lessons, past papers and revision tools for secondary and senior-secondary students in India.", intro: "Secondary and senior-secondary study material for ages 14 to 18, including NCERT-aligned lessons and revision help. Useful alongside board preparation and entrance exams." },
      { key: "ug", slug: "undergraduate", name: "Undergraduate", h1: "Degree-level learning you can reach for free.", title: "Free Undergraduate Courses & Study Resources | Pigsfield", description: "Free-first university lectures, open courseware, degree-level textbooks and subject resources for undergraduate students across India.", intro: "Open courseware, university lectures and degree-level references. Some providers offer paid certificates on top of free course material, so check the current terms at the source." },
      { key: "pg", slug: "postgraduate", name: "Postgraduate", h1: "Master's-level depth, openly available.", title: "Free Postgraduate & Master's Study Resources | Pigsfield", description: "Free-first advanced courses, specialist lectures and master's-level academic resources for postgraduate students in India.", intro: "Advanced coursework and specialist material for master's-level study, including open lectures and academic references." },
      { key: "phd", slug: "phd-and-research", name: "PhD & Research", h1: "Research support that does not sit behind a paywall.", title: "Free PhD & Research Tools, Papers and Support | Pigsfield", description: "Free-first preprint archives, open-access journals, reference managers, academic writing help and research tools for doctoral scholars in India.", intro: "Preprints, open-access journals, reference managers and writing support for doctoral work. Several of these replace tools that departments otherwise pay for." },
      { key: "tt", slug: "teacher-training", name: "Teacher Training", h1: "Strong teaching helps every stage flourish.", title: "Free Teacher Training Resources & Courses | Pigsfield", description: "Free-first teacher training courses, classroom practice guides, pedagogy resources and professional development material for teachers across India.", intro: "Professional development, pedagogy and classroom practice. Placed after PhD deliberately: teaching is a discipline of its own, not a fallback." }
    ]
  },
  {
    dest: "tools",
    module: "tools",
    parentName: "Digital Tools",
    splitBy: "group",
    topics: [
      { key: 0, slug: "ai-tools", name: "AI Tools", h1: "AI you can actually use today, free.", title: "Free AI Tools: ChatGPT, Claude, Gemini | Pigsfield", description: "A free-first guide to AI chat, research and coding assistants usable from India, including ChatGPT, Claude, Gemini, NotebookLM and Indian-language models.", intro: "Assistants for writing, studying, coding and research. Most have a free tier with limits that change often, so check the current terms at the provider." },
      { key: 1, slug: "privacy-and-browsers", name: "Privacy & Browsers", h1: "Browse without being the product.", title: "Privacy Tools, Tor & Brave Browser Guide | Pigsfield", description: "Free-first privacy browsers, tracker blockers, breach checkers and web utilities for safer everyday browsing on Indian phones and laptops.", intro: "Browsers and utilities that reduce tracking, plus tools for checking whether your own data has already leaked." },
      { key: 2, slug: "files-and-remote-access", name: "Files & Remote Access", h1: "Your documents, reachable from anywhere.", title: "DigiLocker, PDF Tools & Remote Desktop | Pigsfield", description: "Free-first tools for Indian document storage, PDF editing, cloud drives, file management and controlling a computer remotely from a phone.", intro: "Government document storage, cloud drives, PDF utilities and remote desktop access — the plumbing that makes study and paperwork portable." },
      { key: 3, slug: "creative-tools", name: "Creative Tools", h1: "Make things without buying a licence.", title: "Free Video, Music & Photo Editing Tools | Pigsfield", description: "Free-first video editors, AI music generators, photo editing and image compression tools for creators and students working on a phone or laptop.", intro: "Editing and generation tools for video, music and images. Several replace subscriptions that would otherwise cost more than a month of data." },
      { key: 4, slug: "research-tools", name: "Research Tools", h1: "Find the source, not the summary.", title: "Free Research Tools, Books & Analytics | Pigsfield", description: "Free-first research libraries, science explainers, community channels and analytics tools for students and independent researchers in India.", intro: "Places to find books, papers, explanations and data. Availability and legality of individual libraries vary by country — check before you rely on one." }
    ]
  },
  {
    dest: "rights",
    module: "govt",
    parentName: "Make Govt Accountable",
    splitBy: "group",
    topics: [
      { key: 0, slug: "information-and-records", name: "Information & Records", h1: "Ask the state what it already knows.", title: "RTI, CAG Reports & Election Affidavits | Pigsfield", description: "How to obtain government information in India using the RTI Act 2005, CAG audit reports and candidate election affidavits, with links to official portals.", intro: "The tools for getting documents, audits and declarations out of the state. Start here before escalating anywhere else — most complaints are stronger with a record attached." },
      { key: 1, slug: "anti-corruption", name: "Anti-Corruption", h1: "Where to report someone taking a bribe.", title: "Report Corruption: Lokpal, CVC, CBI, ACB | Pigsfield", description: "Official channels for reporting corruption in India — Lokpal, Lokayukta, CVC, CBI, ED, the Anti-Corruption Bureau and Income Tax evasion reporting.", intro: "Each body covers a different level and kind of wrongdoing. Sending a complaint to the wrong one wastes months, so read what each actually handles." },
      { key: 2, slug: "courts-and-legal-remedies", name: "Courts & Legal Remedies", h1: "When a complaint is not enough.", title: "PIL, Writ Petition & Consumer Court Guide | Pigsfield", description: "Judicial routes for Indian citizens: public interest litigation, the five constitutional writs under Articles 32 and 226, consumer courts, CAT and civil suits.", intro: "The judicial escalation path. General educational information only — for anything with a deadline attached, confirm the current position with a qualified lawyer." },
      { key: 3, slug: "commissions-and-regulators", name: "Commissions & Regulators", h1: "The body that regulates your problem.", title: "NHRC, NCW, RERA & Ombudsman Complaints | Pigsfield", description: "Indian rights commissions and sector regulators — human rights, women, children, elections, banking ombudsman, telecom and real estate — and how to reach each.", intro: "Rights commissions and sector regulators, each with a defined jurisdiction. Matching your issue to the right one is most of the work." },
      { key: 4, slug: "grievance-portals", name: "Grievance Portals", h1: "The official complaint box, and how to escalate it.", title: "CPGRAMS, PMO & CM Helpline Grievances | Pigsfield", description: "Government grievance portals for India and Rajasthan — CPGRAMS, the PMO portal, CM Helpline 181, Jan Soochna and the Right to Public Service Act.", intro: "Public grievance systems with defined escalation ladders. A grievance that stalls at one level can usually be pushed to the next." },
      { key: 5, slug: "social-audit", name: "Social Audit", h1: "Accountability that happens in the village, not the capital.", title: "Social Audit, Gram Sabha & Jan Sunwai | Pigsfield", description: "Community accountability tools in India — MGNREGA social audits, Gram Sabha powers, Jan Sunwai public hearings and whistleblower protection.", intro: "Collective oversight, where a group can achieve what an individual complaint cannot. The Gram Sabha in particular holds powers most people never use." },
      { key: 6, slug: "parliament-and-representatives", name: "Parliament & Representatives", h1: "Your representative works for you.", title: "Contact Your MP or MLA + NOTA Guide | Pigsfield", description: "How to make written representations to an MP or MLA in India, reach parliamentary and assembly committees, and understand the NOTA option.", intro: "The elected route. A written representation on record is slower than a complaint but carries weight a portal ticket does not." },
      { key: 7, slug: "media-and-fraud-reporting", name: "Media & Fraud Reporting", h1: "When the story or the money is wrong.", title: "Press Council, NBDSA & Fraud Reporting | Pigsfield", description: "Complain about Indian print and television coverage through the Press Council and NBDSA, run digital accountability campaigns, and report Aadhaar or DBT fraud.", intro: "Holding coverage to account, and reporting benefit fraud. Media complaints have short deadlines, so act while the broadcast is recent." },
      { key: 8, slug: "criminal-and-financial-law", name: "Criminal & Financial Law", h1: "The heavier instruments.", title: "FIR, PMLA & Benami Act Explained | Pigsfield", description: "Filing an FIR against official wrongdoing in India, plus plain-language explanations of the Prevention of Money Laundering Act and the Benami Transactions Act.", intro: "Criminal and asset-recovery law. General educational information, not legal advice — these routes carry consequences for the person filing too." },
      { key: 9, slug: "digital-governance", name: "Digital Governance", h1: "Government services that never need a queue.", title: "Cyber Crime, e-Courts & Open Data India | Pigsfield", description: "India's digital governance services — the national cyber crime portal, e-Court case status, Open Government Data, PM Awas grievances and MyGov participation.", intro: "Online services for reporting cybercrime, tracking a court case, reading public data and taking part in policy consultations." }
    ]
  },
  {
    dest: "skills",
    module: "teach",
    parentName: "Vocational & Business",
    splitBy: "group",
    topics: [
      { key: 0, slug: "government-skill-portals", name: "Government Skill Portals", h1: "State-backed training that costs nothing.", title: "Free Govt Skill Courses: NPTEL, SWAYAM | Pigsfield", description: "Free Indian government skill platforms — Skill India, BharatSkills, NPTEL, SWAYAM Plus, Spoken Tutorial, Virtual Labs and AICTE internships.", intro: "Government and IIT-run platforms covering ITI trades, engineering, IT and virtual laboratories. Most issue recognized certificates at no cost." },
      { key: 1, slug: "corporate-training", name: "Corporate Training", h1: "Industry certificates without the invoice.", title: "Free IBM, Microsoft & Google Certificates | Pigsfield", description: "Free corporate training from Infosys Springboard, IBM SkillsBuild, Microsoft Learn, Google Digital Garage, AWS, TCS iON and Cisco, usable from India.", intro: "Company-run programmes in cloud, AI and workplace skills. Free to learn; confirm whether a given certificate costs anything before you count on it." },
      { key: 2, slug: "coding-platforms", name: "Coding Platforms", h1: "Learn to build, project by project.", title: "Free Coding Courses: CS50, freeCodeCamp | Pigsfield", description: "Free project-based programming courses including Harvard CS50, freeCodeCamp, The Odin Project, Kaggle data science and MIT Scratch for beginners.", intro: "Project-first programming courses, from first-ever code to full-stack and data science. All free to work through end to end." }
    ]
  }
];

/** Flat view of every topic with its destination, used by the validator and the sitemap. */
export const TOPICS = DESTINATIONS.flatMap((destination) =>
  destination.topics.map((topic) => ({ ...topic, dest: destination.dest, route: `/${destination.dest}/${topic.slug}/` }))
);

const esc = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function loadCatalog(root = ROOT) {
  const context = vm.createContext({ window: {} });
  for (const name of DATA_MODULES) {
    new vm.Script(fs.readFileSync(path.join(root, "js", "data", `${name}.js`), "utf8")).runInContext(context);
  }
  return context.window.PF_DATA;
}

/** The slice of catalogue a topic renders: a whole section, or one group inside it. */
export function sourceFor(data, destination, topic) {
  const module = data[destination.module];
  if (!module) throw new Error(`js/data/${destination.module}.js did not register its data`);
  if (destination.splitBy === "section") {
    const section = (module.sections || []).find((candidate) => candidate.id === topic.key);
    if (!section) throw new Error(`${destination.module} has no section with id "${topic.key}"`);
    return section;
  }
  const first = (module.sections || [])[0] || {};
  const group = (first.groups || [])[topic.key];
  if (!group) throw new Error(`${destination.module} has no group at index ${topic.key}`);
  return group;
}

/** Everything a page renders, so the digest changes whenever visible content changes. */
export function topicPayload(source) {
  const items = source.groups ? (source.groups || []).flatMap((group) => group.items || []) : source.items || [];
  return items.map((item) => ({
    title: item.title || "",
    desc: item.desc || "",
    warning: item.warning || "",
    urls: (item.links || []).flatMap((link) => (link.urls || []).map((url) => `${link.label || ""}|${url}`))
  }));
}

export function digestFor(source) {
  return crypto.createHash("sha256").update(JSON.stringify(topicPayload(source))).digest("hex").slice(0, 16);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

// Mirrors isYouTubeSearch in js/catalog.js: a /results link is a search, not a video.
function isYouTubeSearch(url) {
  try {
    const parsed = new URL(url);
    return /(?:^|\.)youtube\.com$/i.test(parsed.hostname) && parsed.pathname === "/results";
  } catch {
    return false;
  }
}

function renderResources(source) {
  return topicPayload(source)
    .map((item) => {
      const links = item.urls
        .map((pair) => {
          const split = pair.indexOf("|");
          const label = pair.slice(0, split);
          const url = pair.slice(split + 1);
          const text = isYouTubeSearch(url)
            ? "Search YouTube"
            : label && !/^(url|link|website|web)$/i.test(label)
              ? label
              : hostOf(url);
          return `<a class="link-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span>${esc(text)}</span><span class="topic-host">${esc(hostOf(url))}</span></a>`;
        })
        .join("");
      return `<article class="topic-item"><h3>${esc(item.title)}</h3>${item.desc ? `<p>${esc(item.desc)}</p>` : ""}${item.warning ? `<p class="resource-warning" role="note">${esc(item.warning)}</p>` : ""}<div class="topic-sources">${links}</div></article>`;
    })
    .join("\n        ");
}

function renderSiblings(destination, current) {
  return destination.topics
    .filter((topic) => topic.slug !== current.slug)
    .map((topic) => `<a class="button ghost" href="../${topic.slug}/">${esc(topic.name)}</a>`)
    .join("");
}

export function renderTopicPage(destination, topic, source) {
  const route = `/${destination.dest}/${topic.slug}/`;
  const canonical = `${ORIGIN}${route}`;
  const items = topicPayload(source);
  const count = items.length;
  const social = `${topic.name}: ${count} free-first resources on Pigsfield, each linking straight to the original provider.`;

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
        { "@type": "ListItem", position: 2, name: destination.parentName, item: `${ORIGIN}/${destination.dest}/` },
        { "@type": "ListItem", position: 3, name: topic.name, item: canonical }
      ]
    },
    {
      "@type": "ItemList",
      "@id": `${canonical}#resources`,
      name: `${topic.name} resources`,
      numberOfItems: count,
      itemListElement: items.slice(0, 100).map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.title }))
    }
  ];

  return `<!doctype html>
<html lang="en-IN" data-base="../../">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="referrer" content="strict-origin-when-cross-origin"><meta name="theme-color" content="#f4f1e8">
  <title>${esc(topic.title)}</title>
  <meta name="description" content="${esc(topic.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <meta name="pf-topic-digest" content="${digestFor(source)}">
  <link rel="canonical" href="${canonical}"><link rel="icon" href="../../assets/pigsfield-icon-192.png" type="image/png" sizes="192x192"><link rel="manifest" href="../../manifest.json">
  <meta property="og:type" content="website"><meta property="og:site_name" content="Pigsfield"><meta property="og:locale" content="en_IN"><meta property="og:title" content="${esc(topic.title)}"><meta property="og:description" content="${esc(social)}"><meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ORIGIN}/assets/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Pigsfield ${esc(topic.name)} resources"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(topic.title)}"><meta name="twitter:description" content="${esc(social)}"><meta name="twitter:image" content="${ORIGIN}/assets/og.png"><meta name="twitter:image:alt" content="Pigsfield ${esc(topic.name)} resources">
  <link rel="preload" href="../../assets/google-sans-flex-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="../../css/site.css">
  <script defer src="../../js/site.js"></script>
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
</head>
<body data-page="${esc(destination.dest)}">
  <a class="skip-link" href="#main-content">Skip to content</a><header data-site-header></header>
  <main id="main-content">
    <div class="container breadcrumbs"><ol><li><a href="../../">Home</a></li><li><a href="../">${esc(destination.parentName)}</a></li><li aria-current="page">${esc(topic.name)}</li></ol></div>
    <section class="page-hero"><div class="container"><span class="eyebrow">${esc(topic.name)}</span><h1>${esc(topic.h1)}</h1><p class="lede">${esc(topic.intro)}</p></div></section>
    <section class="section"><div class="container">
      <p class="topic-count"><strong>${count}</strong> free-first ${count === 1 ? "resource" : "resources"}. Pigsfield does not host any of these; every link opens the original provider, where current price, terms and eligibility apply.</p>
      <div class="topic-list">
        ${renderResources(source)}
      </div>
    </div></section>
    <section class="section alt"><div class="container">
      <h2>More in ${esc(destination.parentName)}</h2>
      <nav class="topic-siblings" aria-label="Related topics">${renderSiblings(destination, topic)}</nav>
      <p><a class="button ghost" href="../">Browse all ${esc(destination.parentName)} resources</a></p>
    </div></section>
  </main>
  <footer data-site-footer></footer>
</body>
</html>
`;
}

export function build({ root = ROOT, check = false } = {}) {
  const data = loadCatalog(root);
  const stale = [];
  const written = [];
  const thin = [];

  for (const destination of DESTINATIONS) {
    for (const topic of destination.topics) {
      const source = sourceFor(data, destination, topic);
      const count = topicPayload(source).length;
      if (count < MIN_RESOURCES) {
        thin.push(`/${destination.dest}/${topic.slug}/ has only ${count}`);
        continue;
      }
      const file = path.join(root, destination.dest, topic.slug, "index.html");
      const html = renderTopicPage(destination, topic, source);
      if (check) {
        if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== html) stale.push(`/${destination.dest}/${topic.slug}/`);
        continue;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, html, "utf8");
      written.push({ route: `/${destination.dest}/${topic.slug}/`, count });
    }
  }

  return { stale, written, thin };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const { stale, written, thin } = build({ check });
  if (check) {
    if (stale.length) {
      console.error(`Topic pages are stale: ${stale.join(", ")}\nRun: npm run build:topics`);
      process.exitCode = 1;
    } else {
      console.log(`All ${TOPICS.length} topic pages match js/data/.`);
    }
  } else {
    let dest = "";
    for (const entry of written) {
      const current = entry.route.split("/")[1];
      if (current !== dest) {
        dest = current;
        console.log(`\n/${dest}/`);
      }
      console.log(`  ${entry.route.padEnd(42)} ${entry.count} resources`);
    }
    if (thin.length) console.log(`\nSkipped as too thin for their own page (under ${MIN_RESOURCES}):\n  ${thin.join("\n  ")}`);
    console.log(`\nWrote ${written.length} topic pages.`);
  }
}

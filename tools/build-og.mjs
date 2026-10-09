// Draw one 1200×630 social card per pillar hub and per topic page into assets/og/.
//
// Every page used to share assets/og.png, so a link pasted into WhatsApp looked the same
// whether it led to Class 6 to 8 or to the RTI guide. A card that names the page and how
// many free resources it holds gives a forwarded link a reason to be opened.
//
// The cards are committed images, not built in CI: rendering needs a browser. Run this
// after a page's name, headline or resource count changes, then npm run build:topics so
// the topic pages point at their card; tools/validate-site.mjs fails while a card is
// missing.
//
//   NODE_PATH=$(npm root -g) node tools/build-og.mjs   # uses the global Playwright
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DESTINATIONS, loadCatalog, sourceFor, topicPayload } from "./build-topics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OG_DIRECTORY = "assets/og";

/** The card file for a route: /learn/class-6-to-8/ -> assets/og/learn-class-6-to-8.jpg */
export function ogImageFor(route) {
  return `${OG_DIRECTORY}/${route.replace(/^\/|\/$/g, "").replace(/\//g, "-")}.jpg`;
}

const count = (module) => (module.sections || []).reduce((total, section) =>
  total + (section.groups || []).reduce((sum, group) => sum + (group.items || []).length, 0), 0);

/** What each card says. Hubs are listed by hand; every topic page gets one from its data. */
export function ogCards(data = loadCatalog()) {
  const pigbang = (data.pigbang.tabs || []).reduce((sum, tab) => sum + (tab.items || []).length, 0);
  const hubs = [
    { route: "/learn/", label: "Learning", title: "Nursery to PhD", subtitle: "From first letters to original research.", stat: `${count(data.school)} free resources`, art: "path-learn.svg" },
    { route: "/watch/", label: "Educational OTT", title: "PigBang", subtitle: "Films, channels and apps for curious minds.", stat: `${pigbang} titles to watch`, art: "path-watch.svg" },
    { route: "/exams/", label: "Preparation", title: "Competitive Exams", subtitle: "A roadmap beats a pile of random links.", stat: "UPSC · RAS · SSC · NCERT", art: "path-exams.svg" },
    { route: "/skills/", label: "Capability", title: "Vocational & Business", subtitle: "Turn learning into work that matters.", stat: `${count(data.teach)} free resources`, art: "path-skills.svg" },
    { route: "/tools/", label: "Digital tools", title: "Digital Tools", subtitle: "Use the right tool. Keep your attention.", stat: `${count(data.tools)} free tools`, art: "path-tools.svg" },
    { route: "/rights/", label: "Accountability", title: "Make Govt Accountable", subtitle: "RTI, grievance and legal-aid help, step by step.", stat: `${count(data.govt)} official channels`, art: "path-rights.svg" },
    { route: "/ai/", label: "Always available", title: "AI Studio", subtitle: "Compare the best AI models by cost and speed.", stat: "No login needed", art: "path-tools.svg" }
  ];
  const art = { learn: "path-learn.svg", tools: "path-tools.svg", rights: "path-rights.svg", skills: "path-skills.svg" };
  const topics = DESTINATIONS.flatMap((destination) => destination.topics.map((topic) => {
    const resources = topicPayload(sourceFor(data, destination, topic)).length;
    return {
      route: `/${destination.dest}/${topic.slug}/`,
      label: destination.parentName,
      title: topic.name,
      subtitle: topic.h1,
      stat: `${resources} free ${resources === 1 ? "resource" : "resources"}`,
      art: art[destination.dest]
    };
  }));
  return [...hubs, ...topics];
}

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const asset = (name) => pathToFileURL(path.join(ROOT, "assets", name)).href;

function cardHtml(card) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: "Google Sans Flex"; src: url("${asset("google-sans-flex-latin.woff2")}") format("woff2"); font-weight: 400 900; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; display: grid; grid-template-columns: 1fr 470px; background: #f4f1e8; color: #0a4a3d; font-family: "Google Sans Flex", sans-serif; }
  .text { display: flex; flex-direction: column; padding: 48px 40px 40px 64px; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 34px; font-weight: 800; }
  .brand img { width: 48px; height: 48px; }
  .rule { width: 340px; height: 4px; margin: 22px 0 26px; background: #f2542d; border-radius: 2px; }
  .label { color: #c3350f; font-size: 25px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  h1 { margin-top: 14px; font-size: ${card.title.length > 22 ? 64 : 78}px; font-weight: 900; line-height: 1.02; letter-spacing: -.02em; }
  p { margin-top: 18px; color: #17202c; font-size: 30px; font-weight: 500; line-height: 1.25; }
  .foot { display: flex; align-items: center; gap: 18px; margin-top: auto; }
  .stat { padding: 10px 20px; border-radius: 999px; background: #0f7a63; color: #fff; font-size: 26px; font-weight: 800; }
  .free { color: #4b5563; font-size: 22px; font-weight: 700; }
  .art { position: relative; overflow: hidden; border-left: 6px solid #f2542d; }
  .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .url { margin-top: 18px; color: #0a4a3d; font-size: 22px; font-weight: 800; white-space: nowrap; }
  </style></head><body>
  <div class="text">
    <div class="brand"><img src="${asset("pigsfield-icon-192.png")}" alt="">Pigsfield</div>
    <div class="rule"></div>
    <div class="label">${esc(card.label)}</div>
    <h1>${esc(card.title)}</h1>
    <p>${esc(card.subtitle)}</p>
    <div class="foot"><span class="stat">${esc(card.stat)}</span><span class="free">Free · No login · No ads</span></div>
    <div class="url">pigsfield.com${esc(card.route)}</div>
  </div>
  <div class="art"><img src="${asset(card.art)}" alt=""></div>
  </body></html>`;
}

async function main() {
  const require = createRequire(import.meta.url);
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (_) {
    console.error("Playwright is needed to draw the cards. Run with NODE_PATH pointing at a Playwright install.");
    process.exit(1);
  }
  const cards = ogCards();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pigsfield-og-"));
  fs.mkdirSync(path.join(ROOT, OG_DIRECTORY), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const card of cards) {
    const file = path.join(scratch, "card.html");
    fs.writeFileSync(file, cardHtml(card));
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(ROOT, ogImageFor(card.route)), type: "jpeg", quality: 84 });
  }
  await browser.close();
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(`Drew ${cards.length} social cards into ${OG_DIRECTORY}/.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

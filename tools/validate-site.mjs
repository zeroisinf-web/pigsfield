import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { TOPICS, build as buildTopics } from "./build-topics.mjs";
import { REQUIRED_ROUTES, SITEMAP_LASTMOD, SITE_ORIGIN } from "./routes.mjs";
import { renderSitemap } from "./build-sitemap.mjs";
import { stamp as stampServiceWorker } from "./build-sw.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", "node_modules"]);
const INDEX_ROBOTS_DIRECTIVE = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const ROUTE_SCHEMA_CONTRACT = new Map([
  ["/", { pageType: "WebPage", extraTypes: ["Organization", "WebSite"], breadcrumb: false }],
  ["/learn/", { pageType: "CollectionPage", breadcrumb: true }],
  ["/skills/", { pageType: "CollectionPage", breadcrumb: true }],
  ["/tools/", { pageType: "CollectionPage", breadcrumb: true }],
  ["/exams/", { pageType: "CollectionPage", breadcrumb: true }],
  ["/watch/", { pageType: "CollectionPage", breadcrumb: true }],
  ["/rights/", { pageType: "CollectionPage", breadcrumb: true }],
  ["/ai/", { pageType: "WebPage", extraTypes: ["WebApplication"], breadcrumb: true }],
  ["/about/", { pageType: "AboutPage", breadcrumb: true }],
  ["/editorial/", { pageType: "WebPage", breadcrumb: true }],
  ["/submit/", { pageType: "ContactPage", breadcrumb: true }],
  ["/accessibility/", { pageType: "WebPage", breadcrumb: true }],
  ["/privacy/", { pageType: "WebPage", breadcrumb: true }],
  ...TOPICS.map((topic) => [topic.route, { pageType: "CollectionPage", breadcrumb: true }])
]);
const REQUIRED_DATA = ["school", "teach", "tools", "exams", "pigbang", "govt"];
const DATA_MINIMUMS = { school: 171, teach: 23, tools: 45, govt: 40, pigbang: 500 };
const BANNED_DOMAIN_PATTERNS = [
  /\banimesalt(?:\.in|\.ac)?\b/i,
  /\bhianimes?(?:\.se|\.to|\.tv)?\b/i,
  /\b9anime\b/i,
  /\bkissanime\b/i,
  /\bgogoanime\b/i
];
const BANNED_CLAIM_PATTERNS = [
  /\b100\s*%\s+free\b/i,
  /free education flowing for millions/i,
  /gateway to every free but best/i,
  /universally accessible and absolutely free/i,
  /education is your right[.!]?\s+it must be free/i,
  /every resource (?:is|here is) free/i,
  /all (?:resources|tools|courses) (?:are|is) free/i
];

const errors = [];
let localReferenceCount = 0;
let assertionCount = 0;

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/") || ".";
}

function fail(file, message) {
  errors.push(`${relative(file)}: ${message}`);
}

function check(condition, file, message) {
  assertionCount += 1;
  if (!condition) fail(file, message);
}

function walk(directory, predicate = () => true) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(absolute, predicate));
    else if (predicate(absolute)) found.push(absolute);
  }
  return found;
}

function parseAttributes(tag) {
  const attributes = Object.create(null);
  const pattern = /([:\w-]+)\s*=\s*(["'])(.*?)\2/g;
  for (const match of tag.matchAll(pattern)) attributes[match[1].toLowerCase()] = match[3];
  return attributes;
}

function metas(html) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => parseAttributes(match[0]));
}

function metaValue(metaTags, key) {
  const normalized = key.toLowerCase();
  const tag = metaTags.find((item) => (item.name || item.property || "").toLowerCase() === normalized);
  return tag?.content || "";
}

function metaValues(metaTags, key) {
  const normalized = key.toLowerCase();
  return metaTags
    .filter((item) => (item.name || item.property || "").toLowerCase() === normalized)
    .map((item) => item.content || "");
}

function canonicalValue(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    if ((attributes.rel || "").toLowerCase().split(/\s+/).includes("canonical")) return attributes.href || "";
  }
  return "";
}

function routeFor(file) {
  const rel = relative(file);
  if (rel === "index.html") return "/";
  return `/${path.posix.dirname(rel)}/`;
}

function decodeAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#38;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function normalizedSeoText(value) {
  return decodeAttribute(value).replace(/\s+/g, " ").trim();
}

function schemaTypes(node) {
  const value = node?.["@type"];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function schemaUrl(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.url || value["@id"] || "";
}

function parseJsonLd(html, file) {
  const documents = [];
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => (parseAttributes(match[1]).type || "").toLowerCase() === "application/ld+json");
  check(scripts.length > 0, file, "missing JSON-LD structured data");
  for (const [index, match] of scripts.entries()) {
    try {
      const parsed = JSON.parse(match[2]);
      check(parsed && typeof parsed === "object" && !Array.isArray(parsed), file, `JSON-LD block ${index + 1} must contain an object`);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) documents.push(parsed);
    } catch (error) {
      check(false, file, `JSON-LD block ${index + 1} is invalid: ${error.message}`);
    }
  }
  return documents;
}

function jsonLdNodes(documents) {
  return documents.flatMap((document) => Array.isArray(document["@graph"]) ? document["@graph"] : [document]);
}

function checkLocalReference(file, rawValue) {
  const value = decodeAttribute(rawValue.trim());
  if (!value || value.startsWith("#") || value.startsWith("//")) return;
  if (/^(?:https?:|mailto:|tel:|sms:|upi:|data:|blob:|javascript:)/i.test(value)) return;

  const withoutFragment = value.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) return;

  let decoded;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    fail(file, `malformed local URL: ${rawValue}`);
    return;
  }

  const target = decoded.startsWith("/")
    ? path.resolve(ROOT, `.${decoded}`)
    : path.resolve(path.dirname(file), decoded);
  const insideRoot = target === ROOT || target.startsWith(`${ROOT}${path.sep}`);
  check(insideRoot, file, `local URL escapes the repository: ${rawValue}`);
  if (!insideRoot) return;

  localReferenceCount += 1;
  let resolved = target;
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) resolved = path.join(resolved, "index.html");
  check(fs.existsSync(resolved), file, `broken local reference: ${rawValue}`);
}

function checkHtml(file) {
  const html = fs.readFileSync(file, "utf8");
  const metaTags = metas(html);
  const route = routeFor(file);
  const canonical = canonicalValue(html);
  const expectedCanonical = `${SITE_ORIGIN}${route}`;
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const title = normalizedSeoText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
  const icon = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => parseAttributes(match[0]))
    .find((attributes) => (attributes.rel || "").toLowerCase().split(/\s+/).includes("icon"));

  check(/^<!doctype html>/i.test(html.trimStart()), file, "missing HTML5 doctype");
  check(/<html\b[^>]*\blang=["'](?:en|hi)(?:-[A-Za-z]+)?["']/i.test(html), file, "missing a valid document language");
  check(Boolean(title), file, "missing page title");
  check(title.length <= 65, file, `title is longer than 65 characters (${title.length})`);
  check(metaTags.some((tag) => "charset" in tag), file, "missing charset metadata");
  check(Boolean(metaValue(metaTags, "viewport")), file, "missing viewport metadata");
  check(metaValue(metaTags, "referrer") === "strict-origin-when-cross-origin", file, "referrer policy must be strict-origin-when-cross-origin");
  check(metaValue(metaTags, "description").length >= 50, file, "description metadata is missing or too short");
  check(canonical === expectedCanonical, file, `canonical must be ${expectedCanonical}`);
  check(metaValue(metaTags, "og:title").length > 0, file, "missing og:title");
  check(metaValue(metaTags, "og:description").length > 0, file, "missing og:description");
  check(metaValue(metaTags, "og:url") === expectedCanonical, file, `og:url must be ${expectedCanonical}`);
  check(metaValue(metaTags, "og:image") === "https://pigsfield.com/assets/og.png", file, "og:image must use the finished 1200×630 social card");
  check(metaValue(metaTags, "twitter:card") === "summary_large_image", file, "twitter:card must be summary_large_image");
  check(metaValue(metaTags, "twitter:image") === "https://pigsfield.com/assets/og.png", file, "twitter:image must use the finished social card");
  check(/(?:^|\/)assets\/pigsfield-icon-192\.png$/.test(icon?.href || ""), file, "favicon must use the optimized 192×192 Pigsfield icon");
  check((icon?.type || "").toLowerCase() === "image/png" && icon?.sizes === "192x192", file, "favicon must declare its PNG type and 192x192 size");
  check(h1Count === 1, file, `expected exactly one h1, found ${h1Count}`);
  check(/<main\b[^>]*\bid=["']main-content["']/i.test(html), file, "main landmark must have id=\"main-content\"");

  for (const match of html.matchAll(/\b(?:href|src|action)\s*=\s*(["'])(.*?)\1/gi)) {
    checkLocalReference(file, match[2]);
  }

  check(!/<iframe\b[^>]+(?:youtube\.com|youtube-nocookie\.com)/i.test(html), file, "YouTube embeds must be created lazily by the shared player");

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = parseAttributes(match[1]);
    if (attributes.src || /(?:ld\+json|json)/i.test(attributes.type || "")) continue;
    try {
      new vm.Script(match[2], { filename: `${relative(file)}:inline-script` });
    } catch (error) {
      fail(file, `invalid inline JavaScript: ${error.message}`);
    }
  }
}

function checkSeoContracts(files) {
  const titleOwners = new Map();
  const descriptionOwners = new Map();
  const openGraphFields = ["type", "site_name", "locale", "title", "description", "url", "image", "image:width", "image:height", "image:alt"];
  const twitterFields = ["card", "title", "description", "image", "image:alt"];

  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    const route = routeFor(file);
    const canonical = `${SITE_ORIGIN}${route}`;
    const contract = ROUTE_SCHEMA_CONTRACT.get(route);
    const metaTags = metas(html);
    const title = normalizedSeoText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const description = normalizedSeoText(metaValue(metaTags, "description"));
    const normalizedTitle = title.toLocaleLowerCase("en-IN");
    const normalizedDescription = description.toLocaleLowerCase("en-IN");

    check(Boolean(contract), file, `missing SEO schema contract for ${route}`);
    check(metaValues(metaTags, "robots").length === 1, file, "indexable pages must declare exactly one robots directive");
    check(metaValue(metaTags, "robots") === INDEX_ROBOTS_DIRECTIVE, file, `robots directive must be exactly "${INDEX_ROBOTS_DIRECTIVE}"`);

    check(!titleOwners.has(normalizedTitle), file, `page title duplicates ${titleOwners.get(normalizedTitle) || "another route"}`);
    if (normalizedTitle) titleOwners.set(normalizedTitle, relative(file));
    check(!descriptionOwners.has(normalizedDescription), file, `meta description duplicates ${descriptionOwners.get(normalizedDescription) || "another route"}`);
    if (normalizedDescription) descriptionOwners.set(normalizedDescription, relative(file));

    for (const field of openGraphFields) {
      const values = metaValues(metaTags, `og:${field}`);
      check(values.length === 1 && normalizedSeoText(values[0]).length > 0, file, `og:${field} must appear exactly once with content`);
    }
    check(metaValue(metaTags, "og:type") === "website", file, "og:type must be website");
    check(metaValue(metaTags, "og:site_name") === "Pigsfield", file, "og:site_name must be Pigsfield");
    check(metaValue(metaTags, "og:locale") === "en_IN", file, "og:locale must be en_IN");
    check(metaValue(metaTags, "og:url") === canonical, file, `og:url must match the canonical ${canonical}`);
    check(metaValue(metaTags, "og:image") === `${SITE_ORIGIN}/assets/og.png`, file, "og:image must use the canonical social card URL");
    check(metaValue(metaTags, "og:image:width") === "1200" && metaValue(metaTags, "og:image:height") === "630", file, "Open Graph image dimensions must be 1200×630");

    for (const field of twitterFields) {
      const values = metaValues(metaTags, `twitter:${field}`);
      check(values.length === 1 && normalizedSeoText(values[0]).length > 0, file, `twitter:${field} must appear exactly once with content`);
    }
    check(metaValue(metaTags, "twitter:card") === "summary_large_image", file, "twitter:card must be summary_large_image");
    check(metaValue(metaTags, "twitter:image") === `${SITE_ORIGIN}/assets/og.png`, file, "twitter:image must use the canonical social card URL");

    const nodes = jsonLdNodes(parseJsonLd(html, file));
    if (!contract) continue;
    const pageNode = nodes.find((node) => schemaTypes(node).includes(contract.pageType) && schemaUrl(node.url) === canonical);
    check(Boolean(pageNode), file, `JSON-LD must contain a ${contract.pageType} node for ${canonical}`);
    if (pageNode) {
      check(pageNode.inLanguage === "en-IN", file, `${contract.pageType} JSON-LD must declare inLanguage en-IN`);
      check(schemaUrl(pageNode.isPartOf) === `${SITE_ORIGIN}/#website`, file, `${contract.pageType} JSON-LD must belong to the Pigsfield WebSite entity`);
    }

    for (const type of contract.extraTypes || []) {
      const matchingNode = nodes.find((node) => schemaTypes(node).includes(type));
      check(Boolean(matchingNode), file, `JSON-LD must contain ${type}`);
    }

    const breadcrumb = nodes.find((node) => schemaTypes(node).includes("BreadcrumbList"));
    if (contract.breadcrumb) {
      check(Boolean(breadcrumb), file, "JSON-LD must contain a BreadcrumbList");
      const items = Array.isArray(breadcrumb?.itemListElement) ? breadcrumb.itemListElement : [];
      check(items.length >= 2, file, "BreadcrumbList must contain home and the current page");
      items.forEach((item, index) => check(item?.position === index + 1, file, `breadcrumb position ${index + 1} is invalid`));
      if (items.length) {
        check(schemaUrl(items[0]?.item) === `${SITE_ORIGIN}/`, file, "BreadcrumbList must start at the Pigsfield homepage");
        check(schemaUrl(items.at(-1)?.item) === canonical, file, "BreadcrumbList must end at the current canonical URL");
      }
      if (pageNode && breadcrumb?.["@id"]) {
        check(schemaUrl(pageNode.breadcrumb) === breadcrumb["@id"], file, "page JSON-LD must reference its BreadcrumbList");
      }
    } else {
      check(!breadcrumb, file, "the homepage must not invent a redundant breadcrumb trail");
    }
  }
}

function checkSeoInfrastructure() {
  const robotsFile = path.join(ROOT, "robots.txt");
  const sitemapFile = path.join(ROOT, "sitemap.xml");
  check(fs.existsSync(robotsFile), robotsFile, "missing robots.txt");
  check(fs.existsSync(sitemapFile), sitemapFile, "missing sitemap.xml");
  if (!fs.existsSync(robotsFile) || !fs.existsSync(sitemapFile)) return;

  const robots = fs.readFileSync(robotsFile, "utf8");
  const sitemapDirectives = [...robots.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)].map((match) => match[1]);
  check(/^\s*User-agent:\s*\*\s*$/im.test(robots), robotsFile, "robots.txt must include the universal crawler group");
  check(/^\s*Allow:\s*\/\s*$/im.test(robots), robotsFile, "robots.txt must allow the public site root");
  check(sitemapDirectives.length === 1 && sitemapDirectives[0] === `${SITE_ORIGIN}/sitemap.xml`, robotsFile, "robots.txt must declare the canonical sitemap exactly once");

  const sitemap = fs.readFileSync(sitemapFile, "utf8");
  check(/^\s*<\?xml\s+version=["']1\.0["']\s+encoding=["']UTF-8["']\s*\?>/i.test(sitemap), sitemapFile, "sitemap must have a UTF-8 XML declaration");
  check(/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(sitemap), sitemapFile, "sitemap must use the standard sitemap namespace");
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/gi)];
  const locations = entries.map((entry) => entry[1].match(/<loc>([^<]+)<\/loc>/i)?.[1]?.trim() || "");
  const expectedLocations = REQUIRED_ROUTES.map((route) => `${SITE_ORIGIN}${route}`);
  check(entries.length === REQUIRED_ROUTES.length, sitemapFile, `sitemap must contain exactly ${REQUIRED_ROUTES.length} public routes`);
  check(new Set(locations).size === locations.length, sitemapFile, "sitemap URLs must not be duplicated");
  check(JSON.stringify([...locations].sort()) === JSON.stringify([...expectedLocations].sort()), sitemapFile, "sitemap URL set must exactly match all canonical indexable routes");

  entries.forEach((entry, index) => {
    const loc = locations[index];
    try {
      const url = new URL(loc);
      check(url.origin === SITE_ORIGIN, sitemapFile, `sitemap URL must use the HTTPS apex origin: ${loc}`);
      check(!url.search && !url.hash, sitemapFile, `sitemap URL must not contain a query or fragment: ${loc}`);
    } catch {
      check(false, sitemapFile, `sitemap contains an invalid absolute URL: ${loc}`);
    }
    const lastmod = entry[1].match(/<lastmod>([^<]+)<\/lastmod>/i)?.[1]?.trim() || "";
    const changefreq = entry[1].match(/<changefreq>([^<]+)<\/changefreq>/i)?.[1]?.trim() || "";
    const priority = entry[1].match(/<priority>([^<]+)<\/priority>/i)?.[1]?.trim() || "";
    const expectedLastmod = SITEMAP_LASTMOD.get(new URL(loc).pathname);
    check(lastmod === expectedLastmod, sitemapFile, `sitemap lastmod for ${loc} must be ${expectedLastmod}, not ${lastmod || "(missing)"}`);
    check(["weekly", "monthly", "yearly"].includes(changefreq), sitemapFile, `sitemap changefreq is invalid for ${loc}`);
    check(/^(?:0(?:\.\d)?|1(?:\.0)?)$/.test(priority), sitemapFile, `sitemap priority is invalid for ${loc}`);
  });

  // sitemap.xml is generated from tools/routes.mjs, so hand edits and forgotten
  // regenerations both surface here rather than as a silently wrong sitemap in production.
  check(sitemap === renderSitemap(), sitemapFile, 'sitemap.xml is out of date with tools/routes.mjs — run "npm run build:sitemap"');
}

function checkNotFoundPage() {
  const file = path.join(ROOT, "404.html");
  check(fs.existsSync(file), file, "missing GitHub Pages 404 document");
  if (!fs.existsSync(file)) return;
  const html = fs.readFileSync(file, "utf8");
  const metaTags = metas(html);
  const icon = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => parseAttributes(match[0]))
    .find((attributes) => (attributes.rel || "").toLowerCase().split(/\s+/).includes("icon"));
  check(/^<!doctype html>/i.test(html.trimStart()), file, "missing HTML5 doctype");
  check(/<html\b[^>]*\blang=["']en-IN["']/i.test(html), file, "404 document language must be en-IN");
  check(metaValue(metaTags, "robots") === "noindex, follow", file, "404 document robots directive must be exactly noindex, follow");
  check(canonicalValue(html) === "", file, "404 document must not declare a canonical URL");
  check((html.match(/<h1\b/gi) || []).length === 1, file, "404 document must have exactly one h1");
  check(/<main\b[^>]*\bid=["']main-content["']/i.test(html), file, "404 document must retain its main landmark");
  check(/(?:^|\/)assets\/pigsfield-icon-192\.png$/.test(icon?.href || "") && icon?.sizes === "192x192", file, "404 favicon must use the optimized 192×192 Pigsfield icon");
  for (const match of html.matchAll(/\b(?:href|src|action)\s*=\s*(["'])(.*?)\1/gi)) checkLocalReference(file, match[2]);
}

function parseJavaScript(files) {
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    try {
      new vm.Script(source, { filename: relative(file) });
    } catch (error) {
      fail(file, `JavaScript syntax error: ${error.message}`);
    }
  }
}

function groupedItemCount(value) {
  return (value.sections || []).reduce(
    (total, section) => total + (section.groups || []).reduce((sum, group) => sum + (group.items || []).length, 0),
    0
  );
}

function validateUrlTree(value, file, trail = "data") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateUrlTree(item, file, `${trail}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => validateUrlTree(item, file, `${trail}.${key}`));
    return;
  }
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return;
  try {
    const url = new URL(value);
    check(url.protocol === "https:" || url.protocol === "http:", file, `${trail} uses an unsupported protocol`);
    check(!BANNED_DOMAIN_PATTERNS.some((pattern) => pattern.test(url.hostname)), file, `${trail} uses blocked host ${url.hostname}`);
  } catch {
    fail(file, `${trail} contains an invalid URL: ${value}`);
  }
}

function validateData() {
  const context = vm.createContext({ window: {} });
  for (const name of REQUIRED_DATA) {
    const file = path.join(ROOT, "js", "data", `${name}.js`);
    check(fs.existsSync(file), file, `missing ${name} data module`);
    if (!fs.existsSync(file)) continue;
    try {
      new vm.Script(fs.readFileSync(file, "utf8"), { filename: relative(file) }).runInContext(context);
    } catch (error) {
      fail(file, `data module cannot be evaluated: ${error.message}`);
    }
  }

  const data = context.window.PF_DATA || {};
  for (const name of REQUIRED_DATA) check(Boolean(data[name]), path.join(ROOT, "js", "data", `${name}.js`), `window.PF_DATA.${name} was not registered`);

  for (const name of ["school", "teach", "tools", "govt"]) {
    if (!data[name]) continue;
    const count = groupedItemCount(data[name]);
    check(count >= DATA_MINIMUMS[name], path.join(ROOT, "js", "data", `${name}.js`), `expected at least ${DATA_MINIMUMS[name]} catalog items, found ${count}`);
    validateUrlTree(data[name], path.join(ROOT, "js", "data", `${name}.js`), `PF_DATA.${name}`);
  }

  if (data.school && data.teach) {
    const learningIds = (data.school.sections || []).map((section) => section && section.id);
    const phdIndex = learningIds.indexOf("phd");
    const teacherIndex = learningIds.indexOf("tt");
    check(groupedItemCount(data.school) === 171, path.join(ROOT, "js", "data", "school.js"), "Nursery to PhD must contain exactly 171 resources after Teacher Training moves");
    check(groupedItemCount(data.teach) === 23, path.join(ROOT, "js", "data", "teach.js"), "Vocational & Business must contain exactly 23 resources");
    check(phdIndex >= 0 && teacherIndex === phdIndex + 1, path.join(ROOT, "js", "data", "school.js"), "Teacher Training must appear immediately after PhD");
    const teacherTraining = data.school.sections[teacherIndex];
    const vocational = (data.teach.sections || []).find((section) => section && section.id === "vs");
    check(Boolean(teacherTraining && teacherTraining.highlight && teacherTraining.note), path.join(ROOT, "js", "data", "teach.js"), "Teacher Training must retain its highlighted education note");
    check(teacherTraining?.resourceIdSection === 1, path.join(ROOT, "js", "data", "teach.js"), "Teacher Training must preserve its legacy section-1 resource IDs");
    check(teacherTraining?.saveKey === "teach", path.join(ROOT, "js", "data", "teach.js"), "Teacher Training must preserve its legacy teach: saved-item identity");
    check(vocational?.resourceIdSection === 2, path.join(ROOT, "js", "data", "teach.js"), "Vocational & Business must preserve its legacy section-2 resource IDs");
    check(!(data.teach.sections || []).some((section) => section && section.id === "tt"), path.join(ROOT, "js", "data", "teach.js"), "Teacher Training must not remain inside Vocational & Business");
  }

  if (data.pigbang) {
    const count = (data.pigbang.tabs || []).reduce((sum, tab) => sum + (tab.items || []).length, 0);
    check(count >= DATA_MINIMUMS.pigbang, path.join(ROOT, "js", "data", "pigbang.js"), `expected at least ${DATA_MINIMUMS.pigbang} media items, found ${count}`);
    validateUrlTree(data.pigbang, path.join(ROOT, "js", "data", "pigbang.js"), "PF_DATA.pigbang");
  }

  if (data.exams) {
    check(Array.isArray(data.exams.roadmap?.rows) && data.exams.roadmap.rows.length >= 5, path.join(ROOT, "js", "data", "exams.js"), "exam roadmap is missing or unexpectedly small");
    validateUrlTree(data.exams, path.join(ROOT, "js", "data", "exams.js"), "PF_DATA.exams");
  }

  return {
    school: data.school ? groupedItemCount(data.school) : 0,
    teach: data.teach ? groupedItemCount(data.teach) : 0,
    tools: data.tools ? groupedItemCount(data.tools) : 0,
    govt: data.govt ? groupedItemCount(data.govt) : 0,
    pigbang: data.pigbang ? data.pigbang.tabs.reduce((sum, tab) => sum + tab.items.length, 0) : 0
  };
}

function firstLineNumber(source, pattern) {
  const index = source.search(pattern);
  return index < 0 ? 0 : source.slice(0, index).split(/\r?\n/).length;
}

function checkBannedContent(files) {
  for (const file of files) {
    const rel = relative(file);
    if (rel === "tools/validate-site.mjs" || rel.startsWith("tests/")) continue;
    const source = fs.readFileSync(file, "utf8");

    for (const pattern of BANNED_CLAIM_PATTERNS) {
      if (pattern.test(source)) fail(file, `legacy absolute-free claim at line ${firstLineNumber(source, pattern)}`);
    }

    if (rel === "js/catalog.js") continue; // This file intentionally names blocked hosts in its safety list.
    for (const pattern of BANNED_DOMAIN_PATTERNS) {
      if (pattern.test(source)) fail(file, `blocked media domain at line ${firstLineNumber(source, pattern)}`);
    }
  }
}

function checkCssContract() {
  const file = path.join(ROOT, "css", "site.css");
  check(fs.existsSync(file), file, "missing shared stylesheet");
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, "utf8");
  let depth = 0;
  let line = 1;
  let comment = false;
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "\n") line += 1;
    if (comment) {
      if (character === "*" && next === "/") { comment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (character === "\\") { index += 1; continue; }
      if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "*") { comment = true; index += 1; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth < 0) { fail(file, `unexpected closing brace near line ${line}`); return; }
  }
  check(depth === 0, file, `unbalanced CSS braces (${depth})`);
  const requirements = [
    [/\.ai-studio-dialog\b/, "missing global AI Studio dialog layout"],
    [/\.source-link-pair\s+\.link-button\b/, "missing full-width native source-link styles"],
    [/\.resource-emoji-card\b/, "missing varied resource-symbol styles"],
    [/\.site-nav\s+a\[data-pigbang-link\]/, "missing highlighted PigBang navigation treatment"],
    [/body\[data-page=["']watch["']\]/, "missing scoped dark PigBang OTT theme"],
    [/\.catalog-group-summary\b/, "missing nested category collapse styles"],
    [/\.catalog-section\[open\]\s*>\s*summary[\s\S]{0,600}position:\s*sticky/, "open catalog summaries must remain sticky while their content scrolls"],
    [/@supports\s+selector\(details::details-content\)/, "missing progressive native details animation"],
    [/--catalog-group-sticky-top\s*:/, "missing nested sticky accordion offset"],
    [/@media\s*\(prefers-reduced-motion:\s*reduce\)/, "missing reduced-motion fallback for the dimensional layer"],
    [/--depth-high\s*:/, "missing shared depth tokens"]
  ];
  for (const [pattern, message] of requirements) check(pattern.test(source), file, message);
  check(!/\.source-share-button\b/.test(source), file, "obsolete source share-button styles must not return");
  check(!/\.(?:source-action(?:\b|-)|resource-scene\b|scene-|watch-scene(?:\b|-)|watch-initials\b|resource-emoji-inline\b)/.test(source), file, "obsolete duplicate-symbol styles must not return");
}

function checkBrandContracts() {
  const originalAssets = [
    ["pigsfield-logo.png", "88c643f45266cd78f399eed6db75f9804cf2d7978f9ebc7dc20448a0a8043f3e"],
    ["pigbang-logo.png", "67d0a01d7bfd28e325bf6bc5ebd7f99a23b5c61637cdc056149d58bee25e1a34"]
  ];
  for (const [name, expectedHash] of originalAssets) {
    const file = path.join(ROOT, "assets", name);
    check(fs.existsSync(file), file, `missing supplied ${name} brand asset`);
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    const validPng = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    check(validPng, file, "brand asset is not a valid PNG");
    if (validPng) check(bytes.readUInt32BE(16) === 1254 && bytes.readUInt32BE(20) === 1254, file, "supplied logo must retain its original 1254×1254 dimensions");
    check(createHash("sha256").update(bytes).digest("hex") === expectedHash, file, "supplied logo bytes were changed");
  }

  for (const [name, size] of [["pigsfield-icon-192.png", 192], ["pigsfield-icon-512.png", 512]]) {
    const file = path.join(ROOT, "assets", name);
    check(fs.existsSync(file), file, `missing optimized ${size}×${size} Pigsfield icon`);
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    const validPng = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    check(validPng, file, "optimized icon is not a valid PNG");
    if (validPng) check(bytes.readUInt32BE(16) === size && bytes.readUInt32BE(20) === size, file, `optimized icon must be ${size}×${size}`);
  }

  for (const name of ["pigsfield-logo-ui.webp", "pigbang-logo-nav.webp", "pigbang-logo-display.webp"]) {
    const file = path.join(ROOT, "assets", name);
    check(fs.existsSync(file), file, `missing optimized UI logo ${name}`);
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    check(bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP", file, "optimized UI logo is not a valid WebP");
  }

  const manifestFile = path.join(ROOT, "manifest.json");
  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch (error) {
    check(false, manifestFile, `manifest JSON is invalid: ${error.message}`);
  }
  const manifestIcons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const expectedManifestIcons = [
    { src: "assets/pigsfield-icon-192.png", sizes: "192x192" },
    { src: "assets/pigsfield-icon-512.png", sizes: "512x512" }
  ];
  for (const expected of expectedManifestIcons) {
    check(manifestIcons.some((icon) => icon.src === expected.src && icon.sizes === expected.sizes && icon.type === "image/png" && icon.purpose === "any"), manifestFile, `manifest must declare ${expected.src} as ${expected.sizes} PNG`);
  }
  check(manifestIcons.length === expectedManifestIcons.length, manifestFile, "manifest must contain only the optimized 192×192 and 512×512 app icons");

  const homeFile = path.join(ROOT, "index.html");
  const home = fs.readFileSync(homeFile, "utf8");
  check(/<img\b[^>]*src=["'][^"']*assets\/pigbang-logo-nav\.webp["']/i.test(home), homeFile, "homepage PigBang path must use the compact PigBang logo");
  check(/"@type"\s*:\s*"Organization"[\s\S]{0,500}"logo"\s*:\s*"https:\/\/pigsfield\.com\/assets\/pigsfield-logo\.png"/.test(home), homeFile, "Organization JSON-LD may use only the preserved full-resolution Pigsfield PNG");

  const watchFile = path.join(ROOT, "watch", "index.html");
  check(/<img\b[^>]*src=["'][^"']*assets\/pigbang-logo-display\.webp["']/i.test(fs.readFileSync(watchFile, "utf8")), watchFile, "PigBang page must use the optimized display logo");

  const siteFile = path.join(ROOT, "js", "site.js");
  const site = fs.readFileSync(siteFile, "utf8");
  check((site.match(/assets\/pigsfield-logo-ui\.webp/g) || []).length >= 2, siteFile, "shared header and footer must use the optimized Pigsfield UI logo");
  check(!/<img\b[^>]*src=["'][^"']*assets\/pigsfield-logo\.png/i.test(site), siteFile, "the full-resolution Pigsfield PNG must not be used as a visible header or footer image");
  const officialSocialUrls = [
    "https://www.facebook.com/61579505132769/",
    "https://www.youtube.com/@pigsfield",
    "https://www.instagram.com/pigsfield",
    "https://x.com/pigsfield",
    "https://in.linkedin.com/in/priyadarshan-meghwal-431656210"
  ];
  const siteAnchors = [...site.matchAll(/<a\b[^>]*>/g)].map((match) => parseAttributes(match[0]));
  check(/Our Official Social Media Handles/.test(site) && /class=["']footer-social["']/.test(site), siteFile, "shared footer must identify the official social-media section");
  officialSocialUrls.forEach((url) => {
    const anchor = siteAnchors.find((attributes) => attributes.href === url);
    check(Boolean(anchor), siteFile, `shared footer is missing official social link ${url}`);
    if (anchor) {
      check(anchor.target === "_blank", siteFile, `${url} must preserve native new-tab behavior`);
      check((anchor.rel || "").split(/\s+/).includes("noopener") && (anchor.rel || "").split(/\s+/).includes("noreferrer"), siteFile, `${url} must isolate its external tab`);
      check(Boolean(anchor["aria-label"]), siteFile, `${url} needs an accessible platform label`);
    }
    check(home.includes(`"${url}"`), homeFile, `Organization sameAs is missing the exact official handle ${url}`);
  });

  const visibleHtmlFiles = [
    ...walk(ROOT, (file) => path.basename(file).toLowerCase() === "index.html"),
    path.join(ROOT, "404.html")
  ];
  for (const file of visibleHtmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
      const src = parseAttributes(match[0]).src || "";
      if (/pigsfield-logo/i.test(src)) check(/pigsfield-logo-ui\.webp$/i.test(src), file, `visible Pigsfield logo must use the optimized WebP: ${src}`);
      if (/pigbang-logo/i.test(src)) check(/pigbang-logo-(?:nav|display)\.webp$/i.test(src), file, `visible PigBang logo must use an appropriately sized WebP: ${src}`);
    }
  }

  const runtimeFiles = walk(ROOT, (file) => /\.(?:html|js|css|json)$/i.test(file) && relative(file) !== "tools/validate-site.mjs");
  runtimeFiles.forEach((file) => {
    check(!/assets\/logo\.svg/.test(fs.readFileSync(file, "utf8")), file, "obsolete placeholder logo reference must not return");
  });
}

function checkPerformanceContracts() {
  const assetsIgnoreFile = path.join(ROOT, ".assetsignore");
  check(fs.existsSync(assetsIgnoreFile), assetsIgnoreFile, "missing Cloudflare static-asset exclusion list");
  if (fs.existsSync(assetsIgnoreFile)) {
    const assetsIgnore = fs.readFileSync(assetsIgnoreFile, "utf8");
    check(!/^tools\/\s*$/m.test(assetsIgnore), assetsIgnoreFile, "tools/ must not be excluded wholesale because it contains the public /tools/ page");
    check(/^tools\/validate-site\.mjs\s*$/m.test(assetsIgnore) && /^tools\/check-production\.mjs\s*$/m.test(assetsIgnore), assetsIgnoreFile, "only the non-public tool scripts should be excluded from static assets");
  }
  const file = path.join(ROOT, "sw.js");
  check(fs.existsSync(file), file, "missing service worker");
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, "utf8");
  const coreSource = source.match(/const\s+CORE\s*=\s*\[([\s\S]*?)\];/)?.[1] || "";
  const core = [...coreSource.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  const expectedShell = [
    "./",
    "./404.html",
    "./css/site.css",
    "./js/site.js",
    "./assets/pigsfield-logo-ui.webp",
    "./assets/pigsfield-icon-192.png",
    "./manifest.json"
  ];
  check(coreSource.length > 0, file, "service-worker CORE shell could not be inspected");
  check(JSON.stringify([...core].sort()) === JSON.stringify([...expectedShell].sort()), file, "service worker must precache only the minimal navigation shell");
  check(!core.some((entry) => /(?:ai-studio|ai-worker|\/data\/|catalog\.js|watch\.js|exams-page\.js|player\.js|pigbang|icon-512|og\.png)/i.test(entry)), file, "large AI, catalog, media and non-shell assets must remain on demand");
  check(/request\.mode\s*===\s*["']navigate["'][\s\S]{0,500}fetch\(request\)/.test(source), file, "navigation requests must remain network-first");
  check(/navigationPreload\.enable\(\)/.test(source) && /event\.preloadResponse/.test(source), file, "service-worker navigations should start the network request before worker startup finishes");
  check(/caches\.match\(request\)[\s\S]{0,500}fetch\(request\)[\s\S]{0,500}cache\.put\(request/.test(source), file, "non-shell assets must be fetched and cached on demand");
}

function checkExperienceContracts() {
  const siteFile = path.join(ROOT, "js", "site.js");
  const site = fs.readFileSync(siteFile, "utf8");
  check(/data-open-ai[\s\S]{0,400}data-open-donate[\s\S]{0,300}data-open-feedback/.test(site), siteFile, "AI Studio must stay beside Donate and Feedback in the persistent dock");
  check(/loadScript\(["']js\/ai-studio\.js["']\)/.test(site), siteFile, "global AI Studio must lazy-load from every page");
  check(/function\s+createNativeTranslatorFromClick[\s\S]{0,500}window\.Translator\.create\(\{[\s\S]{0,500}downloadprogress/.test(site), siteFile, "Hindi control must create and monitor the browser's language model directly from the click path");
  check(!/Translator\.availability\(/.test(site), siteFile, "native Translator creation must not lose user activation by awaiting availability first");
  check(/translatorInstance\.translate\(/.test(site), siteFile, "visible content must be translated in place by the browser model");
  check(/sourceLanguage:\s*["']en["'][\s\S]{0,80}targetLanguage:\s*["']hi["']/.test(site), siteFile, "browser translation must request English to Hindi");
  check(/TRANSLATION_ENDPOINT\s*=\s*["']\/api\/translate["']/.test(site) && /fetch\(TRANSLATION_ENDPOINT,[\s\S]{0,300}credentials:\s*["']same-origin["']/.test(site), siteFile, "mobile fallback must use only the same-origin translation endpoint");
  check(/referrerPolicy:\s*["']no-referrer["']/.test(site), siteFile, "translation fallback must not disclose the current page URL as a referrer");
  check(/SERVER_TRANSLATION_TIMEOUT_MS\s*=\s*22000/.test(site) && /new AbortController\(\)/.test(site) && /window\.setTimeout\(\(\)\s*=>\s*controller\.abort\(\),\s*SERVER_TRANSLATION_TIMEOUT_MS\)/.test(site) && /signal:\s*controller\.signal/.test(site) && /finally\s*\{\s*window\.clearTimeout\(timeoutId\)/.test(site), siteFile, "every server translation batch needs a cleared AbortController timeout");
  check(/SERVER_TRANSLATION_MAX_ITEMS\s*=\s*48/.test(site) && /SERVER_TRANSLATION_MAX_CHARACTERS\s*=\s*10000/.test(site), siteFile, "server translation must batch visible strings within bounded request limits");
  check(/JSON\.stringify\(\{\s*text:\s*texts\s*\}\)/.test(site), siteFile, "server translation must send only the visible text batch");
  check(/LANGUAGE_STORAGE_KEY\s*=\s*["']pf-language["']/.test(site) && /savedLanguage\(\)\s*===\s*["']hi["'][\s\S]{0,80}restoreSavedHindi\(\)/.test(site), siteFile, "Hindi preference must survive same-site page loads");
  check(/catch\s*\([^)]*\)\s*\{[\s\S]{0,180}translationProvider\s*=\s*["']server["']/.test(site), siteFile, "native creation or translation failure must switch to the server fallback");
  check(/new MutationObserver\(/.test(site) && /PF\.applyLanguageTo\s*=/.test(site), siteFile, "dynamic content must join in-page translation");
  check(/function\s+translationIsCurrent\(generation\)[\s\S]{0,120}language\s*===\s*["']hi["'][\s\S]{0,100}generation\s*===\s*translationGeneration/.test(site), siteFile, "translation work needs a generation and language guard");
  check(/function\s+requestServerTranslations\(texts,\s*generation\)[\s\S]{0,120}!translationIsCurrent\(generation\)[\s\S]{0,1000}if\s*\(!translationIsCurrent\(generation\)\)\s*return\s+null/.test(site), siteFile, "stale translation requests must stop before fetch and response use");
  check(/for\s*\(const batch of batches\)[\s\S]{0,180}!translationIsCurrent\(generation\)[\s\S]{0,220}requestServerTranslations\(batch,\s*generation\)[\s\S]{0,180}!translationIsCurrent\(generation\)[\s\S]{0,160}translationCache\.set/.test(site), siteFile, "stale server jobs must stop before every batch, request and cache write");
  check(/const handled\s*=\s*job\.catch\([\s\S]{0,180}translationIsCurrent\(generation\)[\s\S]{0,100}handleTranslationFailure\(error\)/.test(site) && /return handled\.finally\([\s\S]{0,260}queuedTranslationJobs\s*=\s*Math\.max[\s\S]{0,500}refreshTranslationBusy\(\)/.test(site), siteFile, "server failures and timeouts must restore English and unlock the language control");
  check(/\\u0900-\\u097F/.test(site), siteFile, "existing Hindi text must not be sent back through the English-to-Hindi translator");
  check(/function\s+destroyNativeTranslator[\s\S]{0,260}translatorInstance\.destroy\(\)[\s\S]{0,120}translatorInstance\s*=\s*null/.test(site), siteFile, "a failed browser translator must be discarded before server fallback");
  check(/Android\|Mobile[\s\S]{0,900}open the browser menu \(⋮ or …\)/.test(site), siteFile, "mobile Chrome needs browser-menu translation guidance");
  check(/id=["']translation-help-dialog["']/.test(site) && /Neither this browser's on-device translator nor Pigsfield's same-origin Hindi service/.test(site) && /A website cannot press or open privileged browser-toolbar controls/.test(site), siteFile, "browser-menu guidance must honestly follow failure of both built-in translation paths");
  check(!/translate\.google\.|Google Translate|location\.(?:assign|replace)\([^)]*translat/i.test(site), siteFile, "language control must not open an external translation website");
  check(!/const\s+HI(?:_|\s*=)/.test(site), siteFile, "hand-maintained translation dictionaries should not remain in runtime code");
  for (const documentName of ["README.md", "privacy/index.html", "accessibility/index.html"]) {
    const documentFile = path.join(ROOT, documentName);
    const documentText = fs.readFileSync(documentFile, "utf8");
    check(/loaded translatable[\s\S]{0,180}(?:labels|accessible labels)[\s\S]{0,120}(?:titles|placeholders)/i.test(documentText), documentFile, "translation disclosure must cover loaded interface labels, titles and placeholders");
    check(/text typed by the visitor[\s\S]{0,40}never/i.test(documentText), documentFile, "translation disclosure must state that visitor-typed text is never included");
  }
  check(/Make Govt Accountable/.test(site), siteFile, "government-accountability destination label is missing");
  check(/Nursery to PhD[\s\S]{0,160}PigBang[\s\S]{0,160}Competitive Exams[\s\S]{0,160}Vocational & Business[\s\S]{0,160}Digital Tools[\s\S]{0,160}Make Govt Accountable/.test(site), siteFile, "primary destinations must keep the requested names and order");
  check(/key\s*===\s*["']watch["']\s*\?\s*["'] data-pigbang-link/.test(site), siteFile, "shared PigBang navigation links must stay highlighted");
  check(/item\.kind\s*===\s*["']pigbang["'][\s\S]{0,80}data-pigbang-link/.test(site), siteFile, "PigBang search results must stay highlighted");
  check(/item\.section\s*===\s*["']PigBang["'][\s\S]{0,80}data-pigbang-item/.test(site), siteFile, "saved PigBang resources must stay highlighted");
  check(/PF\.resourceIdentityFor\s*=\s*function/.test(site) && /PF\.resourceOrganizationKeyFor\s*=\s*function/.test(site) && /PF\.resourceSymbolFor\s*=\s*function/.test(site), siteFile, "shared resource identity and symbol helpers must stay exported");
  check(/function\s+isGenericResourceHost\([^)]+\)[\s\S]{0,300}youtube\\\.com[\s\S]{0,200}play\\\.google\\\.com/.test(site), siteFile, "generic video and app hosts must not replace content identity");
  check(/const\s+organizationHosts\s*=\s*\[\.\.\.new Set\(hosts\.filter\([\s\S]{0,120}!isGenericResourceHost\(host\)[\s\S]{0,80}\.sort\(\)/.test(site), siteFile, "organization hosts must be generic-host-free and URL-order independent");
  check(/const\s+organizationSearchable\s*=\s*`\$\{title\}\s+\$\{organizationHosts\.join\(["']\s["']\)\}`[\s\S]{0,180}candidate\.match\.test\(organizationSearchable\)/.test(site), siteFile, "organization matching must use title and canonical non-generic hosts");
  const identityResolver = site.match(/function\s+resolveResourceIdentity\([^)]*\)\s*\{([\s\S]*?)\r?\n  \}\r?\n\r?\n  PF\.resourceIdentityFor/)?.[1] || "";
  check(identityResolver.length > 0, siteFile, "resource identity resolver could not be inspected");
  check(!/\b(?:description|desc|context|subject|entry\.id|itemIndex|sectionIndex|groupIndex)\b/.test(identityResolver), siteFile, "prose or card position must not alter organization identity and symbols");
  check(/RESOURCE_TOPIC_SYMBOLS\.find\([\s\S]{0,100}pattern\.test\(title\.toLowerCase\(\)\)/.test(identityResolver), siteFile, "logical fallback symbols must be derived from the canonical resource title");
  check(/PF\.resourceEmoji\s*=\s*function\s*\(text,\s*_seed,[^)]*\)[\s\S]{0,180}title:\s*text/.test(site), siteFile, "legacy symbol seeds must be ignored rather than using card indexes");
  check(/function\s+initializeAccordions\([^)]*\)[\s\S]{0,900}new MutationObserver\(/.test(site), siteFile, "dynamic disclosures must join the shared accordion controller");
  check(/function\s+accordionPeers\([^)]*\)[\s\S]{0,500}resource-notes[\s\S]{0,900}candidate\s*!==\s*details/.test(site), siteFile, "accordion peers must be scoped without collapsing independent card notes");
  check(/function\s+setDetailsOpen\([^)]*\)[\s\S]{0,700}peers\.forEach[\s\S]{0,240}animateDetailsState\(details/.test(site), siteFile, "opening one disclosure must close its logical peers");
  check(/details\.animate\([\s\S]{0,300}cubic-bezier/.test(site), siteFile, "older browsers need a smooth Web Animations details fallback");
  check(/prefers-reduced-motion:\s*reduce/.test(site) && /nativeDetailsMotion\(\)/.test(site), siteFile, "accordion motion must respect reduced motion and native details animation");
  check(/document\.addEventListener\(["']click["'],\s*handleSummaryActivation\)/.test(site), siteFile, "summary activation must be delegated for dynamically rendered accordions");

  const homeFile = path.join(ROOT, "index.html");
  const home = fs.readFileSync(homeFile, "utf8");
  check(/href=["']watch\/["'][^>]*data-pigbang-link/.test(home), homeFile, "homepage PigBang destination must stay highlighted");
  check(!/id=["']hero-search-form["']|class=["']trust-strip["']|class=["']how-grid["']|One system\. Six connected pillars\./.test(home), homeFile, "removed homepage search, principle strip and explanatory blocks must stay removed");
  check(/id=["']monthly-visitors["'][^>]*aria-live=["']polite["']/.test(home), homeFile, "homepage needs an honest live monthly visitor status");
  check(/data-monthly-visitor-count/.test(home) && /Best-effort/.test(home), homeFile, "visitor count must identify its best-effort definition");
  check(/href=["']https:\/\/youtu\.be\/2k7OOZZlNrg\?si=vMCzk67HAuWQx-g1["'][^>]*target=["']_blank["'][^>]*rel=["']noopener noreferrer["'][^>]*data-home-video/.test(home), homeFile, "homepage tutorial must keep its exact native YouTube link");
  check(!/src=["']js\/player\.js["']/.test(home) && /src=["']js\/home\.js["']/.test(home), homeFile, "homepage must keep the player lazy and load only its small dedicated runtime");
  check(!/first-of-its-kind/i.test(home), homeFile, "homepage introduction must not make an unsupported first-of-its-kind claim");

  const homeRuntimeFile = path.join(ROOT, "js", "home.js");
  const homeRuntime = fs.readFileSync(homeRuntimeFile, "utf8");
  check(/fetch\(["']\/api\/visitors["'][\s\S]{0,180}method:\s*["']POST["']/.test(homeRuntime), homeRuntimeFile, "homepage visitor count must use the live same-origin endpoint");
  check(/Number\.isSafeInteger\(count\)[\s\S]{0,80}count\s*<\s*1/.test(homeRuntime), homeRuntimeFile, "homepage must reject missing or fabricated visitor totals");
  check(/dataset\.state\s*=\s*["']unavailable["']/.test(homeRuntime), homeRuntimeFile, "homepage must hide the count when its service is unavailable");
  check(/event\.button\s*!==\s*0/.test(homeRuntime) && /script\.src\s*=\s*["']js\/player\.js["']/.test(homeRuntime) && /player\.play\(guide\.href/.test(homeRuntime), homeRuntimeFile, "plain tutorial activation must lazy-load the inbuilt player while modified clicks stay native");

  const watchPageFile = path.join(ROOT, "watch", "index.html");
  const watchPage = fs.readFileSync(watchPageFile, "utf8");
  check(/id=["']watch-count["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/.test(watchPage), watchPageFile, "PigBang result count must announce filter changes");

  const runtimeFiles = walk(ROOT, (file) => /\.(?:html|js|css)$/i.test(file) && relative(file) !== "tools/validate-site.mjs");
  for (const file of runtimeFiles) {
    const source = fs.readFileSync(file, "utf8");
    check(!/(?:PF\.(?:share|openShare)|navigator\.share|data-share(?:\b|-)|source-share-button|id=["']share-dialog["']|class=["'][^"']*\bshare-(?:grid|option)\b)/i.test(source), file, "custom sharing UI or runtime code must not return");
  }

  for (const name of ["catalog.js", "watch.js", "exams-page.js"]) {
    const file = path.join(ROOT, "js", name);
    const source = fs.readFileSync(file, "utf8");
    const providerAnchors = [...source.matchAll(/<a\b[^>]*class=["'][^"']*\blink-button\b[^"']*["'][^>]*>/g)].map((match) => match[0]);
    check(providerAnchors.length > 0, file, "provider controls must render as genuine anchors");
    providerAnchors.forEach((tag) => {
      check(/\bhref=/.test(tag), file, "provider anchor is missing its original href");
      check(/\btarget=["']_blank["']/.test(tag), file, "provider anchor must expose native new-tab behavior");
      check(/\brel=["']noopener noreferrer["']/.test(tag), file, "provider anchor must isolate the external tab");
    });
    check(!/<button\b[^>]*class=["'][^"']*\blink-button\b/i.test(source), file, "provider controls must not be scripted buttons");
    check(!/(?:data-share(?:\b|-)|PF\.openShare|PF\.share)/.test(source), file, "provider share controls must not return");
    check(/a\[data-youtube-play\]/.test(source), file, "supported YouTube anchors must retain optional in-site playback");
    check(/event\.button\s*!==\s*0/.test(source) && /event\.ctrlKey/.test(source) && /event\.metaKey/.test(source) && /event\.shiftKey/.test(source) && /event\.altKey/.test(source), file, "modified and non-primary link activation must remain browser-native");
    check(/event\.preventDefault\(\)[\s\S]{0,160}PF\.YouTube\.play\(anchor\.href/.test(source), file, "only plain YouTube activation should open the in-site player");
    if (name !== "exams-page.js") {
      const functionName = name === "catalog.js" ? "resourceSymbol" : "watchSymbol";
      const symbolRenderer = source.match(new RegExp(`function\\s+${functionName}\\(entry\\)\\s*\\{([\\s\\S]*?)\\n  \\}`))?.[1] || "";
      check(/PF\.resourceSymbolFor\s*\(/.test(symbolRenderer), file, "card renderer must use the shared deterministic resource symbol resolver");
      check(/\btitle\s*:/.test(symbolRenderer) && /\burls\s*:/.test(symbolRenderer) && /\btype\s*:|\btype\s*\n/.test(symbolRenderer), file, "shared symbol resolver needs canonical title, original URLs and resource type");
      check(!/(?:entry\.id|itemIndex|sectionIndex|groupIndex)/.test(symbolRenderer), file, "card indexes must never seed resource symbols");
      check(!/(?:installResourceEmojiPicker|function\s+resourceEmoji)/.test(source), file, "page modules must not duplicate the shared symbol mapping");
      check((source.match(/resource-emoji-card/g) || []).length === 1, file, "each card renderer must emit exactly one content symbol");
    }
    check(!/(?:\bsource-action\b|\bresource-scene\b|\bwatch-scene\b|\bwatch-initials\b|\bresource-emoji-inline\b)/.test(source), file, "provider controls and cards must not emit duplicate symbols");
  }

  const catalogFile = path.join(ROOT, "js", "catalog.js");
  const catalog = fs.readFileSync(catalogFile, "utf8");
  check(/collapsibleGroups/.test(catalog) && /data-catalog-group/.test(catalog), catalogFile, "catalog does not support category-level expand and collapse");
  check(/class=["']catalog-groups["'][^>]*data-accordion-scope/.test(catalog), catalogFile, "nested catalog categories need an independent accordion scope");
  check(/directSections/.test(catalog) && /catalog-direct-section/.test(catalog), catalogFile, "catalog does not support a titled section with its groups shown directly");
  check(/function resourceIdFor\([\s\S]*?section\.resourceIdSection \|\| sectionIndex \+ 1/.test(catalog), catalogFile, "catalog resource IDs must honor preserved section metadata");
  check(/const saveId = `\$\{section\.saveKey \|\| key\}:\$\{id\}`/.test(catalog) && /entriesBySaveId\.set\(saveId, entry\)/.test(catalog) && /const saveId = entry\.saveId/.test(catalog), catalogFile, "catalog cards must honor preserved saved-item namespaces");
  check(/function redirectLegacyTeacherTrainingHash\([\s\S]*?key !== ["']teach["'][\s\S]*?PF\.path\(["']learn["']\)[\s\S]*?target\.origin !== location\.origin[\s\S]*?location\.replace\(target\.href\)/.test(catalog), catalogFile, "legacy Teacher Training hashes must redirect safely from skills to learn");
  check(/const headingTag = directSections \? ["']h3["'] : ["']h2["']/.test(catalog) && /<h2 class=["']catalog-direct-title["']>/.test(catalog), catalogFile, "direct catalog groups must nest H3 headings beneath their H2 section title");
  check(/document\.readyState === ["']loading["'][\s\S]*?DOMContentLoaded["'], revealHash, \{ once: true \}/.test(catalog), catalogFile, "initial catalog deep links must reveal after shared accordion initialization");
  check(!/(?:Expand all|Collapse all|catalog-expand|data-expand-groups|details\[0\]\.open\s*=\s*true)/i.test(catalog), catalogFile, "catalogs must start closed and cannot bypass one-open behavior");
  check(/function genericSearchEntries\([\s\S]*?`\$\{item\.title\}-\$\{section\.resourceIdSection\s*\|\|\s*(?:sectionIndex\s*\+\s*1|1\s*\+\s*sectionIndex)\}-/.test(site), siteFile, "global search resource URLs must honor preserved section metadata");
  const examsFile = path.join(ROOT, "js", "exams-page.js");
  const exams = fs.readFileSync(examsFile, "utf8");
  check(/class=["']exam-stack["'][^>]*data-accordion-scope/.test(exams), examsFile, "exam panels need a shared accordion scope");
  check(/UPSC\/ IAS Complete Foundation Course/.test(exams) && /RAS Complete Foundation Course/.test(exams), examsFile, "UPSC and RAS foundation-course labels are missing");
  check(!/(?:Expand all|Collapse all|data-expand-exams|<details\b[^>]*\sopen(?:\s|=|>))/i.test(exams), examsFile, "exam panels must all start closed and remain one-open");
  const accordionPages = [
    ["index.html", /class=["']faq-list["'][^>]*data-accordion-scope/],
    ...["learn", "skills", "tools", "rights"].map((route) => [`${route}/index.html`, /id=["']catalog-sections["'][^>]*data-accordion-scope/])
  ];
  accordionPages.forEach(([name, pattern]) => {
    const file = path.join(ROOT, ...name.split("/"));
    const source = fs.readFileSync(file, "utf8");
    check(pattern.test(source), file, "expandable peers need an explicit accordion scope");
    check(!/<details\b[^>]*\sopen(?:\s|=|>)/i.test(source), file, "authored disclosures must be closed initially");
    check(!/(?:Expand all|Collapse all|catalog-expand)/i.test(source), file, "expand-all controls conflict with one-open accordion behavior");
  });
  for (const route of ["tools", "rights"]) {
    const file = path.join(ROOT, route, "index.html");
    check(/data-collapsible-groups=["']true["']/.test(fs.readFileSync(file, "utf8")), file, "category collapse is not enabled on this catalog");
  }
  for (const route of ["skills", "tools", "rights"]) {
    const file = path.join(ROOT, route, "index.html");
    check(/data-direct-sections=["']true["']/.test(fs.readFileSync(file, "utf8")), file, "catalog sections must render directly on this route");
  }

  const aiFile = path.join(ROOT, "js", "ai-studio.js");
  const ai = fs.readFileSync(aiFile, "utf8");
  // The studio was rebuilt (3da7dad, b64aed0) into a fixed-model Chat/Image surface with a
  // launchpad of external AI sites. These checks assert the design that actually ships; every
  // guarantee that survived the rebuild is kept and re-pointed at its new home.
  const modeButtons = [...ai.matchAll(/<button\b[^>]*class=["'][^"']*\bai-mode-btn\b[^"']*["'][^>]*>/g)]
    .map((match) => parseAttributes(match[0])["data-mode"])
    .filter(Boolean);
  check(JSON.stringify(modeButtons) === JSON.stringify(["chat", "image"]), aiFile, "AI Studio must expose exactly the Chat and Image modes");
  check(!/data-(?:mode|panel)=["'](?:video|voice|music|document)["']/.test(ai), aiFile, "modes removed from the studio must not return without capability gating");
  check(/class=["']ai-control-bar["']/.test(ai), aiFile, "AI functions and the model tag must share one control bar");
  check(!/<select\b/.test(ai), aiFile, "the studio serves one fixed hosted model, so it must not ship a model chooser");
  check(/Gemma 4 26B A4B/.test(ai), aiFile, "AI Studio must name the hosted model it uses");
  check(/TEXT_ENDPOINT\s*=\s*new URL\(["']\/api\/ai["'],\s*window\.location\.origin\)\.href/.test(ai), aiFile, "text generation must use the same-origin /api/ai endpoint");
  check(/(?:timedFetch|fetch)\(TEXT_ENDPOINT,[\s\S]{0,500}["']X-Pigsfield-Client["']/.test(ai), aiFile, "hosted text requests must carry the anonymous rate-limit identifier");
  check(/task:\s*["'](?:tutor|document)["']/.test(ai), aiFile, "the studio must send a task the Worker accepts");
  check(!/(?:TEXT_PROFILES|responseProfiles?)/.test(ai), aiFile, "invented speed or response-profile choices must not return");
  check(!/(?:gpt-5\.4-mini|cloudflare-ai-gateway|Unified Billing)/i.test(ai), aiFile, "stale third-party model and billing claims must stay removed");
  check(!/(?:glm-4\.7-flash|gpt-oss-120b|qwen3\.6-27b|qwen3-30b-a3b-fp8)/i.test(ai), aiFile, "removed or unavailable model labels must not appear in AI Studio");
  check(!/(?:WebLLM|WebGPU|Qwen3\.5-2B|DeepSeek-R1-Distill|openai-fast|text\.pollinations)/i.test(ai), aiFile, "legacy browser-model and anonymous Pollinations-text paths must stay removed");
  check(/link\.download\s*=/.test(ai), aiFile, "generated output file downloads must remain available");
  check(/IMAGE_ENDPOINT\s*=\s*["']https:\/\/image\.pollinations\.ai\/prompt\//.test(ai), aiFile, "image creation must keep the named Pollinations endpoint");
  check(/IMAGE_MODEL\s*=\s*["']sana["']/.test(ai), aiFile, "anonymous image model must be explicit");

  // The "no login, no provider key" promise moved out of the studio into the AI page copy.
  const aiPageFile = path.join(ROOT, "ai", "index.html");
  const aiPage = fs.readFileSync(aiPageFile, "utf8");
  check(/(?:no|without a) visitor login, additional provider key or model download/i.test(aiPage), aiPageFile, "the AI page must state that the studio needs no visitor login, provider key or model download");

  // Every outbound studio link is a third-party AI site: each must be https and isolated.
  const studioAnchors = [...ai.matchAll(/<a\b[^>]*>/g)].map((match) => parseAttributes(match[0]));
  const externalAnchors = studioAnchors.filter((attributes) => /^https?:/i.test(attributes.href || ""));
  check(externalAnchors.length > 0, aiFile, "AI Studio launchpad must offer external AI websites");
  externalAnchors.forEach((attributes) => {
    const url = attributes.href;
    check(url.startsWith("https://"), aiFile, `${url} must use https`);
    check(attributes.target === "_blank", aiFile, `${url} must preserve native new-tab behavior`);
    const rel = (attributes.rel || "").split(/\s+/);
    check(rel.includes("noopener") && rel.includes("noreferrer"), aiFile, `${url} must isolate the external tab`);
  });
  studioAnchors.forEach((attributes) => {
    const rel = (attributes.rel || "").split(/\s+/);
    check(attributes.target !== "_blank" || (rel.includes("noopener") && rel.includes("noreferrer")), aiFile, "every new-tab link in AI Studio must set rel=noopener noreferrer");
  });
  check(externalAnchors.some((attributes) => attributes.href === "https://artificialanalysis.ai/leaderboards/models"), aiFile, "AI Studio is missing the Artificial Analysis leaderboard link");
  check(externalAnchors.some((attributes) => /qwen\.ai/.test(attributes.href)), aiFile, "AI Studio must keep a Qwen Chat shortcut");
  ["assets/artificial-analysis-symbol.png", "assets/qwen-symbol.png"].forEach((relativePath) => {
    const assetFile = path.join(ROOT, ...relativePath.split("/"));
    check(fs.existsSync(assetFile), assetFile, `missing local official brand symbol ${relativePath}`);
    check(ai.includes(`src="/${relativePath}"`), aiFile, `AI Studio must use the local official brand symbol ${relativePath}`);
  });
  check(!/\bsrc=["']https?:\/\//i.test(ai), aiFile, "AI Studio brand symbols must not make third-party image requests before a visitor opens a link");
  const aiWorkerFile = path.join(ROOT, "js", "ai-worker.js");
  check(!fs.existsSync(aiWorkerFile), aiWorkerFile, "legacy browser model worker must stay deleted");

  const workerFile = path.join(ROOT, "worker", "index.mjs");
  check(fs.existsSync(workerFile), workerFile, "missing Cloudflare Worker entry point");
  if (fs.existsSync(workerFile)) {
    const worker = fs.readFileSync(workerFile, "utf8");
    const workerModels = [
      "@cf/google/gemma-4-26b-a4b-it"
    ];
    workerModels.forEach((model) => check(worker.includes(`id: "${model}"`), workerFile, `missing Cloudflare AI model mapping ${model}`));
    check((worker.match(/tokenField:\s*"max_completion_tokens"/g) || []).length === 1, workerFile, "Gemma must use max_completion_tokens");
    check((worker.match(/tokenField:\s*"max_tokens"/g) || []).length === 0, workerFile, "removed model token fields must stay absent");
    check(!/(?:@cf\/zai-org\/glm-4\.7-flash|@cf\/openai\/gpt-oss-120b|@cf\/qwen\/qwen3-30b-a3b-fp8|qwen3\.6-27b)/i.test(worker), workerFile, "removed or unavailable model mappings must stay absent");
    check(/input\[model\.tokenField\]\s*=\s*900/.test(worker), workerFile, "the selected model must control its token field");
    check(!/(?:gpt-5\.4-mini|openai\/gpt-5\.4-mini|thirdParty|cloudflare-ai-gateway|Unified Billing)/i.test(worker), workerFile, "stale third-party model and billing paths must stay removed");
    check(/url\.pathname\s*===\s*["']\/api\/ai["']/.test(worker), workerFile, "Worker must own the /api/ai route");
    check(/url\.pathname\s*===\s*["']\/api\/translate["']/.test(worker), workerFile, "Worker must own the same-origin /api/translate route");
    check(/TRANSLATION_MODEL\s*=\s*["']@cf\/ai4bharat\/indictrans2-en-indic-1B["']/.test(worker), workerFile, "Hindi fallback must use the exact Cloudflare AI4Bharat model");
    check(/env\.AI\.run\(TRANSLATION_MODEL,\s*\{\s*text:\s*texts,\s*target_language:\s*["']hin_Deva["']/.test(worker), workerFile, "Hindi fallback must use the exact aligned array input contract");
    check(/result\s*&&\s*result\.translations[\s\S]{0,260}Array\.isArray\(translations\)[\s\S]{0,160}translations\.length\s*===\s*texts\.length/.test(worker), workerFile, "Hindi fallback must reject unaligned model output");
    check(/translations\.every\([\s\S]{0,180}value\.trim\(\)[\s\S]{0,180}MAX_TRANSLATION_OUTPUT_ITEM_CHARACTERS/.test(worker) && /outputCharacters\s*>\s*MAX_TRANSLATION_OUTPUT_CHARACTERS/.test(worker), workerFile, "Hindi fallback must reject blank and oversized model output");
    check(/MAX_TRANSLATION_ITEMS\s*=\s*48/.test(worker) && /MAX_TRANSLATION_CHARACTERS\s*=\s*10_000/.test(worker), workerFile, "Hindi translation request arrays need explicit count and size bounds");
    check(/request\.body\.getReader\(\)[\s\S]{0,500}bytes\s*>\s*MAX_BODY_BYTES/.test(worker), workerFile, "AI request bodies must be bounded while streaming, including when Content-Length is missing");
    check(/url\.pathname\s*===\s*["']\/api\/visitors["']/.test(worker), workerFile, "Worker must own the /api/visitors route");
    check(/class\s+MonthlyVisitorCounter\b/.test(worker), workerFile, "monthly visitor total needs strongly coordinated Durable Object storage");
    check(/VISITOR_COOKIE\s*=\s*["']pf_visitor_month["']/.test(worker) && /HttpOnly;\s*SameSite=Lax/.test(worker), workerFile, "visitor deduplication cookie must contain only the month and stay HTTP-only");
    check(/definition:\s*["']Best-effort browser check-ins/.test(worker), workerFile, "visitor endpoint must describe the total honestly");
    check(/automatedRequest\(request\)/.test(worker), workerFile, "visitor total must exclude recognizable automated requests");
    check(/env\.VISITOR_RATE_LIMITER\.limit\(\{\s*key:\s*edgeKey\(request\)\s*\}\)/.test(worker), workerFile, "visitor increments need a separate abuse limit");
    check(!/(?:visitor|counter)[\s\S]{0,180}(?:storage\.put|INSERT)[\s\S]{0,80}(?:CF-Connecting-IP|User-Agent)/i.test(worker), workerFile, "visitor storage must not retain raw addresses or browser agents");
    check(/sameOriginRequest\(request\)/.test(worker), workerFile, "AI endpoint must reject cross-origin requests");
    check(/MAX_PROMPT_LENGTH\s*=\s*1800/.test(worker), workerFile, "server-side prompt limit must match the studio");
    check(/\[["']tutor["'],\s*["']document["']\]\.includes/.test(worker) && !/["']video["']/.test(worker.match(/const task\s*=[\s\S]{0,160}/)?.[0] || ""), workerFile, "Worker must accept only Tutor and Document text tasks");
    check(/env\.AI_RATE_LIMITER\.limit\(\{\s*key:\s*clientKey\(request\)\s*\}\)/.test(worker), workerFile, "AI endpoint must apply the per-visitor rate limit");
    check(/env\.AI_IP_RATE_LIMITER\.limit\(\{\s*key:\s*edgeKey\(request\)\s*\}\)/.test(worker), workerFile, "AI endpoint must also rate-limit by the trusted Cloudflare edge address");
    check(/env\.TRANSLATION_RATE_LIMITER\.limit\(\{\s*key:\s*clientKey\(request\)\s*\}\)/.test(worker), workerFile, "translation endpoint must apply its separate per-client rate limit");
    check(/env\.TRANSLATION_IP_RATE_LIMITER\.limit\(\{\s*key:\s*edgeKey\(request\)\s*\}\)/.test(worker), workerFile, "translation endpoint must apply its separate trusted-address rate limit");
    const translateHandler = worker.match(/async function handleTranslate[\s\S]*?\n\}/)?.[0] || "";
    check(/applyTranslationRateLimits\(request,\s*env\)/.test(translateHandler) && !/applyAIRateLimits\(/.test(translateHandler), workerFile, "translation must not consume AI Studio's lower rate-limit budget");
    check(/env\.AI\.run\(model\.id,/.test(worker), workerFile, "selected models must run through the Workers AI binding");
    check(/return env\.ASSETS\.fetch\(request\)/.test(worker), workerFile, "non-API requests must fall back to static assets");
  }

  const wranglerFile = path.join(ROOT, "wrangler.jsonc");
  check(fs.existsSync(wranglerFile), wranglerFile, "missing Cloudflare Worker configuration");
  if (fs.existsSync(wranglerFile)) {
    const wrangler = fs.readFileSync(wranglerFile, "utf8");
    check(/["']main["']\s*:\s*["']worker\/index\.mjs["']/.test(wrangler), wranglerFile, "Wrangler main must point to the AI Worker");
    check(/["']binding["']\s*:\s*["']ASSETS["'][\s\S]{0,180}["']run_worker_first["']\s*:\s*\[["']\/api\/\*["']\]/.test(wrangler), wranglerFile, "static assets must route /api/* through the Worker first");
    check(/["']ai["']\s*:\s*\{[\s\S]{0,100}["']binding["']\s*:\s*["']AI["']/.test(wrangler), wranglerFile, "Wrangler must bind Workers AI as AI");
    check(/["']name["']\s*:\s*["']VISITOR_COUNTER["'][\s\S]{0,100}["']class_name["']\s*:\s*["']MonthlyVisitorCounter["']/.test(wrangler), wranglerFile, "Wrangler must bind the monthly visitor Durable Object");
    check(/["']MonthlyVisitorCounter["']\s*:\s*\{[\s\S]{0,100}["']type["']\s*:\s*["']durable-object["'][\s\S]{0,100}["']storage["']\s*:\s*["']sqlite["']/.test(wrangler), wranglerFile, "visitor Durable Object must use declarative SQLite storage");
    check(/["']name["']\s*:\s*["']AI_RATE_LIMITER["'][\s\S]{0,220}["']limit["']\s*:\s*8[\s\S]{0,100}["']period["']\s*:\s*60/.test(wrangler), wranglerFile, "Wrangler must configure the short per-client AI rate limit");
    check(/["']name["']\s*:\s*["']AI_IP_RATE_LIMITER["'][\s\S]{0,220}["']limit["']\s*:\s*24[\s\S]{0,100}["']period["']\s*:\s*60/.test(wrangler), wranglerFile, "Wrangler must configure the trusted edge-address AI rate limit");
    check(/["']name["']\s*:\s*["']TRANSLATION_RATE_LIMITER["'][\s\S]{0,220}["']namespace_id["']\s*:\s*["']2026080601["'][\s\S]{0,120}["']limit["']\s*:\s*32[\s\S]{0,100}["']period["']\s*:\s*60/.test(wrangler), wranglerFile, "Wrangler must configure the separate per-client translation rate limit");
    check(/["']name["']\s*:\s*["']TRANSLATION_IP_RATE_LIMITER["'][\s\S]{0,220}["']namespace_id["']\s*:\s*["']2026080602["'][\s\S]{0,120}["']limit["']\s*:\s*96[\s\S]{0,100}["']period["']\s*:\s*60/.test(wrangler), wranglerFile, "Wrangler must configure the separate translation network rate limit");
    const limiterNamespaces = [...wrangler.matchAll(/["']namespace_id["']\s*:\s*["']([^"']+)["']/g)].map((match) => match[1]);
    check(new Set(limiterNamespaces).size === limiterNamespaces.length, wranglerFile, "every rate-limit binding must use a unique namespace ID");
    check(/["']name["']\s*:\s*["']VISITOR_RATE_LIMITER["'][\s\S]{0,220}["']limit["']\s*:\s*60[\s\S]{0,100}["']period["']\s*:\s*60/.test(wrangler), wranglerFile, "Wrangler must configure the visitor counter abuse limit");
  }
}

function checkYouTubeContract() {
  const file = path.join(ROOT, "js", "player.js");
  check(fs.existsSync(file), file, "missing shared YouTube player");
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, "utf8");
  const required = [
    [/youtube-nocookie\.com\/embed\//, "player must use YouTube's privacy-enhanced embed host"],
    [/url\.searchParams\.set\(["']controls["'],\s*["']1["']\)/, "player must keep YouTube navigation controls enabled"],
    [/url\.searchParams\.set\(["']listType["'],\s*["']playlist["']\)/, "playlist embeds must identify the complete playlist type"],
    [/iframe\.referrerPolicy\s*=\s*["']strict-origin-when-cross-origin["']/, "iframe must preserve a strict-origin referrer for error 153"],
    [/url\.searchParams\.set\(["']widget_referrer["']/, "embed URL must include widget_referrer"],
    [/url\.searchParams\.set\(["']origin["']/, "embed URL must identify its origin"],
    [/\b153\s*:/, "player must provide a useful error-153 fallback message"],
    [/sourceLink\.href\s*=\s*media\.original/, "fallback must retain the original YouTube URL"],
    [/document\.createElement\(["']iframe["']\)/, "player must create its iframe only after interaction"],
    [/Complete playlist/, "player must expose a visible companion playlist queue"],
    [/\.getPlaylist\(\)/, "player must read the complete playable queue from the IFrame API"],
    [/\.getPlaylistIndex\(\)/, "player must track the active playlist item"],
    [/\.playVideoAt\(index\)/, "playlist queue items must navigate the inbuilt player"]
  ];
  for (const [pattern, message] of required) check(pattern.test(source), file, message);
  check(!/iframe\.referrerPolicy\s*=\s*["']no-referrer["']/.test(source), file, "player must not suppress the referrer required by YouTube");
  const cssFile = path.join(ROOT, "css", "site.css");
  const css = fs.readFileSync(cssFile, "utf8");
  check(/\.player-stage\.has-playlist\s*\{[^}]*display:\s*grid/i.test(css), cssFile, "desktop playlist player must show a companion queue");
  check(/@media\s*\(max-width:\s*52rem\)[\s\S]*?\.player-stage\.has-playlist\s*\{[^}]*display:\s*block/i.test(css), cssFile, "mobile playlist player must stack its queue below the video");
  check(/\.player-frame\s*\{[^}]*min-height:\s*200px/i.test(css), cssFile, "mobile YouTube player must meet the documented 200px minimum height");
}

const htmlFiles = walk(ROOT, (file) => path.basename(file).toLowerCase() === "index.html");
const discoveredRoutes = new Set(htmlFiles.map(routeFor));
for (const route of REQUIRED_ROUTES) {
  const routeFile = route === "/" ? path.join(ROOT, "index.html") : path.join(ROOT, route.slice(1), "index.html");
  check(discoveredRoutes.has(route), routeFile, `missing required route ${route}`);
}
for (const file of htmlFiles) checkHtml(file);
checkSeoContracts(htmlFiles);
checkSeoInfrastructure();
checkNotFoundPage();

// The per-stage pages under /learn/ are generated from js/data/school.js and committed,
// because Cloudflare deploys the repo as-is. Editing the catalog without regenerating
// them would quietly publish stale content, so fail the build instead.
// A service worker whose CACHE name has not changed is never discarded, so a stale version
// silently keeps serving the previous stylesheet to every returning visitor. That happened.
{
  const swFile = path.join(ROOT, "sw.js");
  check(fs.readFileSync(swFile, "utf8") === stampServiceWorker(), swFile,
    'service worker cache version is stale, so returning visitors would keep the previous shell — run "npm run build:sw"');
}

for (const staleRoute of buildTopics({ check: true }).stale) {
  fail(path.join(ROOT, staleRoute.slice(1), "index.html"), `topic page is out of date with js/data/school.js — run "npm run build:topics"`);
}

const javascriptFiles = walk(ROOT, (file) => file.endsWith(".js"));
parseJavaScript(javascriptFiles);
const dataCounts = validateData();

const contentFiles = walk(ROOT, (file) => /\.(?:html|js|mjs|json|md)$/i.test(file));
checkBannedContent(contentFiles);
checkCssContract();
checkBrandContracts();
checkPerformanceContracts();
checkExperienceContracts();
checkYouTubeContract();

if (errors.length) {
  console.error(`\nPigsfield validation failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:\n`);
  errors.forEach((error) => console.error(`  - ${error}`));
  console.error(`\nChecked ${assertionCount} conditions across ${htmlFiles.length} pages.`);
  process.exitCode = 1;
} else {
  console.log(`✓ HTML: ${htmlFiles.length} indexable routes, a noindex 404 document and ${localReferenceCount} valid local references`);
  console.log(`✓ SEO: ${htmlFiles.length} unique route titles/descriptions, complete social metadata, valid JSON-LD, robots.txt and canonical sitemap coverage`);
  console.log(`✓ JavaScript: ${javascriptFiles.length} script files parse cleanly`);
  console.log(`✓ Catalog data: ${dataCounts.school} Nursery-to-PhD and Teacher Training, ${dataCounts.teach} Vocational & Business, ${dataCounts.tools} Digital Tools, ${dataCounts.govt} accountability, ${dataCounts.pigbang} PigBang entries`);
  console.log("✓ Content safety: no blocked legacy claims or media domains");
  console.log("✓ Experience: persistent AI, native source links, deterministic symbols, browser translation and sticky single-open accordions");
  console.log("✓ Brand: original logo PNGs are hash-preserved; optimized icons and WebP UI logos are used in the interface");
  console.log("✓ Performance: service worker precaches only the navigation shell and leaves AI, catalogs and media on demand");
  console.log("✓ CSS: dimensional layer parses cleanly and respects reduced motion");
  console.log("✓ YouTube: lazy privacy-enhanced player, complete playlist queue, original-link fallback and error-153 contract");
  console.log(`\nPigsfield validation passed (${assertionCount} checks).`);
}

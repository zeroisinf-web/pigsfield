#!/usr/bin/env node
// IndexNow ping for the pages a deploy actually changed
//
// Bing, Yandex, Naver and Seznam accept IndexNow, and Bing's index is what Copilot and
// ChatGPT search read. Google does not take part; it relies on sitemap.xml.
//
// lastmod in tools/routes.mjs is pinned and only moves when a page's content really
// changes, so comparing sitemap.xml with the previous commit gives exactly the URLs worth
// announcing. Nothing is sent when nothing changed, and a failure never fails the deploy
// check: it only means the engines find the change on their next crawl instead.
//
//   node tools/indexnow.mjs [base-ref]     default base-ref: HEAD~1
//   node tools/indexnow.mjs --dry-run      print what would be sent

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "pigsfield.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** The key is public by design: it is served at the site root to prove ownership. */
export function indexNowKey(root = ROOT) {
  const file = fs.readdirSync(root).find((name) => /^[a-f0-9]{32}\.txt$/.test(name));
  if (!file) throw new Error("No IndexNow key file (32 hex characters + .txt) at the repository root");
  const key = fs.readFileSync(path.join(root, file), "utf8").trim();
  if (`${key}.txt` !== file) throw new Error(`${file} must contain exactly its own key`);
  return key;
}

/** loc -> lastmod for each <url>. A page with hreflang alternates carries <xhtml:link>
 *  lines between the two, so each entry is read as a block rather than as adjacent tags. */
function entries(xml) {
  return new Map([...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map((match) => [match[1].match(/<loc>([^<]+)<\/loc>/)?.[1], match[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]])
    .filter(([loc]) => loc));
}

export function changedUrls(previousXml, currentXml) {
  const before = entries(previousXml);
  return [...entries(currentXml)].filter(([url, lastmod]) => before.get(url) !== lastmod).map(([url]) => url);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const base = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || "HEAD~1";
  let previous = "";
  try {
    previous = execFileSync("git", ["show", `${base}:sitemap.xml`], { cwd: ROOT, encoding: "utf8" });
  } catch {
    console.log(`IndexNow: no sitemap.xml at ${base}; nothing to compare, nothing sent.`);
    return;
  }
  const urls = changedUrls(previous, fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8"));
  if (!urls.length) {
    console.log("IndexNow: no page changed its lastmod; nothing sent.");
    return;
  }
  const key = indexNowKey();
  const body = { host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList: urls };
  if (dryRun) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    });
    console.log(`IndexNow: announced ${urls.length} changed URL(s); HTTP ${response.status}.`);
  } catch (error) {
    console.log(`IndexNow: request failed (${error.message}); the engines will pick the change up on their next crawl.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

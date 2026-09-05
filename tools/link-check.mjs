#!/usr/bin/env node
// Broken Link Sentinel
//
// The whole value of this catalog is that its ~1,500 outbound links still work.
// Indian government and university portals (.gov.in, .nic.in, .ac.in) reorganize
// URLs often and rarely leave redirects behind, so link rot is the main way this
// catalog decays. This script reads every URL out of js/data/*.js, checks it, and
// writes a report that .github/workflows/link-check.yml turns into a GitHub Issue.
//
// It is deliberately cautious about calling something dead. Bot protection, rate
// limiting and transient 5xx are reported separately from real 404s, so the weekly
// issue stays worth reading instead of becoming noise that people learn to ignore.
//
//   node tools/link-check.mjs                     check everything
//   node tools/link-check.mjs --limit 50          quick sample while developing
//   node tools/link-check.mjs --only gov.in       only URLs whose host matches
//   node tools/link-check.mjs --json report.json --markdown report.md
//   node tools/link-check.mjs --fail-on-dead      exit 1 when dead links exist

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_MODULES = ["school", "teach", "tools", "exams", "pigbang", "govt"];

export const USER_AGENT =
  "PigsfieldLinkSentinel/1.0 (+https://pigsfield.com/; weekly catalog link check; zeroisinf@gmail.com)";

// Verdicts. Only "dead" is reported as actionable rot; the rest need a human or a retry.
export const OK = "ok";
export const DEAD = "dead";
export const BLOCKED = "blocked";
export const UNSTABLE = "unstable";

/** Walk any catalog shape and collect every http(s) URL with the item it belongs to. */
export function collectLinks(data) {
  const found = new Map();

  const record = (raw, source) => {
    let href;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
      href = parsed.href;
    } catch {
      return;
    }
    if (!found.has(href)) found.set(href, { url: href, sources: [] });
    const entry = found.get(href);
    if (source && !entry.sources.includes(source)) entry.sources.push(source);
  };

  const walk = (node, source) => {
    if (typeof node === "string") {
      const value = node.trim();
      if (/^https?:\/\//i.test(value)) record(value, source);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, source));
      return;
    }
    if (!node || typeof node !== "object") return;
    // A node carrying a human title names everything beneath it.
    const nextSource = typeof node.title === "string" && node.title.trim() ? node.title.trim() : source;
    for (const value of Object.values(node)) walk(value, nextSource);
  };

  for (const [moduleName, moduleData] of Object.entries(data)) walk(moduleData, `PF_DATA.${moduleName}`);
  return [...found.values()].sort((a, b) => a.url.localeCompare(b.url));
}

export function loadCatalog(root = ROOT) {
  const context = vm.createContext({ window: {} });
  for (const name of DATA_MODULES) {
    const file = path.join(root, "js", "data", `${name}.js`);
    new vm.Script(fs.readFileSync(file, "utf8"), { filename: `js/data/${name}.js` }).runInContext(context);
  }
  return context.window.PF_DATA || {};
}

/** A HEAD that fails this way tells us nothing — ask again with GET before judging. */
export function shouldRetryWithGet(status) {
  return status === 400 || status === 403 || status === 405 || status === 429 || status === 501;
}

export function classifyStatus(status) {
  if (status >= 200 && status < 300) return OK;
  if (status === 404 || status === 410) return DEAD;
  // 401/403/429 are usually Cloudflare or Akamai bot walls, not rot: a person can still open these.
  if (status === 401 || status === 403 || status === 429) return BLOCKED;
  return UNSTABLE;
}

/** Network-level failures. DNS and certificate errors are real rot; timeouts are not. */
export function classifyNetworkError(error) {
  const code = String((error && ((error.cause && error.cause.code) || error.code)) || "");
  const message = String((error && error.message) || "").toLowerCase();
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || message.includes("getaddrinfo")) return DEAD;
  if (code === "ECONNREFUSED" || code === "ERR_TLS_CERT_ALTNAME_INVALID") return DEAD;
  if (code.startsWith("CERT_") || code.startsWith("DEPTH_ZERO") || code.startsWith("UNABLE_TO_VERIFY")) return DEAD;
  return UNSTABLE;
}

/** YouTube answers 200 for removed videos, so ask oEmbed, which 404s on unavailable ones. */
export function youtubeOembedFor(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const isWatch = (host === "youtube.com" || host === "m.youtube.com") && url.pathname === "/watch" && url.searchParams.get("v");
  const isShort = host === "youtu.be" && url.pathname.length > 1;
  if (!isWatch && !isShort) return null;
  return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(rawUrl)}`;
}

async function fetchOnce(url, method, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      "User-Agent": USER_AGENT,
      Accept: "*/*",
      "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8"
    };
    // Ask for only the first bytes so a GET probe never downloads a whole page.
    if (method === "GET") headers.Range = "bytes=0-2048";
    return await fetch(url, { method, redirect: "follow", signal: controller.signal, headers });
  } finally {
    clearTimeout(timer);
  }
}

// A widely-used desktop string, sent only to double-check an apparent 404.
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function confirmAsBrowser(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
        Range: "bytes=0-2048"
      }
    });
    return classifyStatus(response.status) === OK ? { status: response.status } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkUrl(url, { timeoutMs = 20000 } = {}) {
  const oembed = youtubeOembedFor(url);
  const target = oembed || url;
  const methods = oembed ? ["GET"] : ["HEAD", "GET"];
  let lastError = null;

  for (const method of methods) {
    try {
      const response = await fetchOnce(target, method, timeoutMs);
      let verdict = classifyStatus(response.status);
      // A HEAD rejection is often just method policy; confirm with GET before judging.
      if (method === "HEAD" && verdict !== OK && shouldRetryWithGet(response.status)) continue;
      if (oembed && response.status === 404) verdict = DEAD;

      // Several Indian government portals (cybercrime.gov.in, bharatskills.gov.in,
      // jansoochna.rajasthan.gov.in) answer 404 to a self-identifying crawler while
      // serving the page normally to a browser. Calling those dead would send a
      // volunteer to "fix" a working link, so confirm once as a browser before
      // accusing a host of rot. Only ever used to downgrade a verdict, never to
      // reach content a site withholds from us.
      if (verdict === DEAD && !oembed) {
        const confirmed = await confirmAsBrowser(url, timeoutMs);
        if (confirmed) {
          return { url, status: confirmed.status, verdict: BLOCKED, finalUrl: null, method: "GET", note: `serves ${confirmed.status} to a browser but ${response.status} to a crawler` };
        }
      }

      return {
        url,
        status: response.status,
        verdict,
        finalUrl: response.url && response.url !== url ? response.url : null,
        method,
        note: oembed ? "checked via YouTube oEmbed" : ""
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    url,
    status: 0,
    verdict: classifyNetworkError(lastError),
    finalUrl: null,
    method: "GET",
    note: String((lastError && lastError.message) || "request failed")
  };
}

/** Bounded concurrency that never sends two simultaneous requests to the same host. */
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length).fill(undefined);
  const busyHosts = new Set();
  let claimed = 0;

  const claim = () => {
    for (let i = 0; i < items.length; i += 1) {
      if (results[i] !== undefined) continue;
      if (busyHosts.has(items[i].host)) continue;
      results[i] = null; // reserve the slot
      claimed += 1;
      return i;
    }
    return -1;
  };

  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      const index = claim();
      if (index === -1) {
        if (claimed >= items.length) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
      const item = items[index];
      busyHosts.add(item.host);
      try {
        results[index] = await worker(item, index);
      } catch (error) {
        results[index] = { url: item.url, status: 0, verdict: UNSTABLE, note: String(error && error.message), sources: item.sources };
      } finally {
        busyHosts.delete(item.host);
      }
    }
  });

  await Promise.all(runners);
  return results;
}

export function renderReport({ results, checked, elapsedMs }) {
  const of = (verdict) => results.filter((result) => result && result.verdict === verdict);
  const dead = of(DEAD);
  const minutes = (elapsedMs / 60000).toFixed(1);

  const lines = [];
  lines.push(`Checked **${checked}** unique catalog links in ${minutes} min.`);
  lines.push("");
  lines.push("| Result | Count |");
  lines.push("| --- | --- |");
  lines.push(`| Working | ${of(OK).length} |`);
  lines.push(`| **Dead** | ${dead.length} |`);
  lines.push(`| Blocked by bot protection | ${of(BLOCKED).length} |`);
  lines.push(`| Unstable or timed out | ${of(UNSTABLE).length} |`);
  lines.push("");

  const section = (title, rows, explanation) => {
    if (!rows.length) return;
    lines.push(`## ${title}`);
    lines.push("");
    lines.push(explanation);
    lines.push("");
    for (const row of rows.slice(0, 200)) {
      const where = row.sources && row.sources.length ? ` — ${row.sources.slice(0, 2).join("; ")}` : "";
      const code = row.status ? `HTTP ${row.status}` : row.note || "no response";
      const why = row.status && row.note ? ` (${row.note})` : "";
      lines.push(`- [ ] ${code} · <${row.url}>${where}${why}`);
    }
    if (rows.length > 200) lines.push(`- ...and ${rows.length - 200} more (see the JSON artifact)`);
    lines.push("");
  };

  section("Dead links", dead, "These returned 404/410, or their host no longer resolves. Replace the URL or remove the entry.");
  section("Blocked by bot protection", of(BLOCKED), "A person can probably still open these. Listed so a human can spot-check; not counted as rot.");
  section("Unstable", of(UNSTABLE), "Timed out or returned 5xx. Often transient, so check whether the same link fails again next week.");

  if (!dead.length) lines.push("No dead links found.");
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = { limit: 0, only: "", json: "", markdown: "", concurrency: 8, failOnDead: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--limit") options.limit = Number(argv[i += 1]) || 0;
    else if (flag === "--only") options.only = argv[i += 1] || "";
    else if (flag === "--json") options.json = argv[i += 1] || "";
    else if (flag === "--markdown") options.markdown = argv[i += 1] || "";
    else if (flag === "--concurrency") options.concurrency = Number(argv[i += 1]) || 8;
    else if (flag === "--fail-on-dead") options.failOnDead = true;
  }
  return options;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "?";
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let queue = collectLinks(loadCatalog()).map((link) => ({ ...link, host: hostOf(link.url) }));
  if (options.only) queue = queue.filter((item) => item.host.includes(options.only));
  if (options.limit) queue = queue.slice(0, options.limit);

  process.stderr.write(`Checking ${queue.length} unique links...\n`);
  const started = Date.now();
  let done = 0;
  const results = await runPool(
    queue,
    async (item) => {
      const result = await checkUrl(item.url);
      done += 1;
      if (done % 50 === 0) process.stderr.write(`  ${done}/${queue.length}\n`);
      return { ...result, sources: item.sources };
    },
    options.concurrency
  );
  const elapsedMs = Date.now() - started;

  const report = renderReport({ results, checked: queue.length, elapsedMs });
  const dead = results.filter((result) => result && result.verdict === DEAD);

  if (options.json) {
    fs.writeFileSync(options.json, JSON.stringify({ checkedAt: new Date().toISOString(), checked: queue.length, results }, null, 2));
  }
  if (options.markdown) fs.writeFileSync(options.markdown, report);
  process.stdout.write(`${report}\n`);
  if (options.failOnDead && dead.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

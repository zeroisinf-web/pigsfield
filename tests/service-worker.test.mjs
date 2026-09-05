// Service worker behaviour, exercised by running sw.js in a fake worker global.
//
// This exists because of a real production failure: sw.js carried a hand-maintained
// CACHE = "pigsfield-v19" that nobody bumped. A cache whose name has not changed is never
// deleted on activate, and stylesheets were served cache-first, so after a redesign shipped
// every returning visitor kept rendering the previous stylesheet. The server was serving the
// new file the whole time; the site simply looked unchanged.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { shellDigest, stamp } from "../tools/build-sw.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

/** Run sw.js in a stub global and capture its registered handlers. */
function loadWorker({ networkOk = true, cached = null } = {}) {
  const handlers = {};
  const calls = { put: [], deleted: [], fetched: [], addAll: [] };
  const cacheStub = {
    addAll: async (list) => calls.addAll.push(...list),
    put: async (request, response) => calls.put.push(String(request.url || request))
  };
  const context = {
    self: {
      location: { origin: "https://pigsfield.com" },
      addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      registration: { navigationPreload: { enable: async () => {} } }
    },
    caches: {
      open: async () => cacheStub,
      keys: async () => ["pigsfield-old", `pigsfield-${shellDigest()}`],
      delete: async (key) => { calls.deleted.push(key); return true; },
      match: async () => cached
    },
    fetch: async (request) => {
      calls.fetched.push(String(request.url || request));
      if (!networkOk) throw new Error("offline");
      return { ok: true, clone: () => ({}), url: String(request.url || request) };
    },
    URL,
    Promise,
    Response
  };
  context.globalThis = context;
  vm.createContext(context);
  new vm.Script(source, { filename: "sw.js" }).runInContext(context);
  return { handlers, calls, context };
}

/** Minimal Request-alike; the worker only reads method, headers, mode and url. */
const req = (url, { mode = "no-cors", method = "GET" } = {}) => ({
  url, method, mode, headers: { has: () => false }
});

function respondWith(handler, request) {
  let captured;
  handler({ request, waitUntil: (p) => p, respondWith: (p) => { captured = p; }, preloadResponse: undefined });
  return captured;
}

test("the cache version is a digest of the shell, not a number someone must remember", () => {
  assert.match(source, /const CACHE = "pigsfield-[0-9a-f]{12}";/, "CACHE must carry a content digest");
  assert.doesNotMatch(source, /const CACHE = "pigsfield-v\d+";/, "the hand-bumped version must not return");
  // Stamping is idempotent, so a clean tree never churns.
  assert.equal(stamp(), source, 'sw.js is out of date — run "npm run build:sw"');
});

test("activate deletes every cache that is not the current one", async () => {
  const { handlers, calls } = loadWorker();
  const waits = [];
  handlers.activate({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.deepEqual(calls.deleted, ["pigsfield-old"], "stale caches must be purged, and only those");
});

test("stylesheets and scripts are served network-first, so a redesign is never withheld", async () => {
  // The exact failure: a cached stylesheet exists, but the network copy must win.
  const { handlers, calls } = loadWorker({ cached: { ok: true, stale: true } });
  const response = await respondWith(handlers.fetch, req("https://pigsfield.com/css/site.css"));
  assert.ok(calls.fetched.includes("https://pigsfield.com/css/site.css"), "css must hit the network");
  assert.ok(!response.stale, "the cached copy must not be returned while online");

  const js = loadWorker({ cached: { ok: true, stale: true } });
  await respondWith(js.handlers.fetch, req("https://pigsfield.com/js/site.js"));
  assert.ok(js.calls.fetched.length === 1, "js must hit the network too");
});

test("a stylesheet still works offline, from cache", async () => {
  const offline = { ok: true, offlineCopy: true };
  const { handlers } = loadWorker({ networkOk: false, cached: offline });
  const response = await respondWith(handlers.fetch, req("https://pigsfield.com/css/site.css"));
  assert.equal(response.offlineCopy, true, "the cache is the offline fallback, not the default source");
});

test("images and fonts stay cache-first, because they are not what goes stale", async () => {
  const hit = { ok: true, fromCache: true };
  const { handlers, calls } = loadWorker({ cached: hit });
  const response = await respondWith(handlers.fetch, req("https://pigsfield.com/assets/pigsfield-logo-ui.webp"));
  assert.equal(response.fromCache, true, "a cached image should be served immediately");
  assert.equal(calls.fetched.length, 1, "and refreshed in the background");
});

test("navigations remain network-first with the preload response", async () => {
  const { handlers } = loadWorker();
  let captured;
  handlers.fetch({
    request: req("https://pigsfield.com/learn/", { mode: "navigate" }),
    preloadResponse: Promise.resolve({ ok: true, preloaded: true, clone: () => ({}) }),
    respondWith: (p) => { captured = p; }
  });
  const response = await captured;
  assert.equal(response.preloaded, true, "navigation preload must be used when present");
});

test("cross-origin, API and non-GET requests are left alone", () => {
  const { handlers, calls } = loadWorker();
  assert.equal(respondWith(handlers.fetch, req("https://fonts.example/inter.woff2")), undefined);
  assert.equal(respondWith(handlers.fetch, req("https://pigsfield.com/api/ai", { method: "POST" })), undefined);
  // Same-origin and GET, so this would otherwise land in the cache-first branch and be
  // refetched in the background on every hit — doubling the upstream reads /api/poster
  // exists to avoid. Its own Cache-Control is what caches it.
  assert.equal(respondWith(handlers.fetch, req("https://pigsfield.com/api/poster?u=https%3A%2F%2Fexample.org%2Fa")), undefined);
  assert.equal(respondWith(handlers.fetch, req("https://pigsfield.com/api/visitors")), undefined);
  assert.equal(calls.fetched.length, 0, "the worker must not touch any of them");
});

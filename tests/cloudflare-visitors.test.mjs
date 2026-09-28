import test from "node:test";
import assert from "node:assert/strict";
import {
  CF_GRAPHQL,
  configured,
  loadCloudflareVisitors,
  monthsBetween,
  queryMonth,
  resetCloudflareVisitors,
  cloudflareVisitors
} from "../worker/cloudflare-visitors.mjs";
import { MonthlyVisitorCounter, handleVisitors } from "../worker/index.mjs";

const ZONE = "0123456789abcdef0123456789abcdef";
const TOKEN = "test-analytics-token";
const env = { CF_ANALYTICS_TOKEN: TOKEN, CF_ZONE_ID: ZONE };

/** Cloudflare's GraphQL answer for a list of [date, uniques] days. */
function answer(days) {
  return new Response(JSON.stringify({
    data: { viewer: { zones: [{ httpRequests1dGroups: days.map(([date, uniques]) => ({ dimensions: { date }, uniq: { uniques } })) }] } },
    errors: null
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** A fake Cloudflare that serves per-day uniques from a table and records every query. */
function fakeCloudflare(table, { refuse = new Set() } = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization, variables: body.variables });
    const { since, until } = body.variables;
    if (refuse.has(since.slice(0, 7))) {
      return new Response(JSON.stringify({ data: null, errors: [{ message: "cannot request data older than the retention window" }] }), { status: 200 });
    }
    return answer(Object.entries(table).filter(([date]) => date >= since && date <= until));
  };
  return { fetcher, calls };
}

/** A real MonthlyVisitorCounter over an in-memory store, as the snapshot store. */
function snapshotStore() {
  const values = new Map();
  const object = new MonthlyVisitorCounter({
    storage: {
      async get(key) { return values.get(key); },
      async put(entries) { for (const [key, value] of Object.entries(entries)) values.set(key, value); }
    }
  });
  return { store: { fetch: (request) => object.fetch(request) }, values };
}

test("configuration needs both a token and a real zone id", () => {
  assert.equal(configured(env), true);
  assert.equal(configured({ CF_ANALYTICS_TOKEN: TOKEN }), false);
  assert.equal(configured({ CF_ANALYTICS_TOKEN: TOKEN, CF_ZONE_ID: "pigsfield.com" }), false, "a domain name is not a zone id");
  assert.equal(configured({ CF_ZONE_ID: ZONE }), false);
});

test("months run from the start date to now, across a year boundary", () => {
  assert.deepEqual(monthsBetween("2026-02-01", "2026-04-15"), ["2026-02", "2026-03", "2026-04"]);
  assert.deepEqual(monthsBetween("2026-11-20", "2027-01-02"), ["2026-11", "2026-12", "2027-01"]);
});

test("a month is one authorised query over that month's days, summed", async () => {
  const { fetcher, calls } = fakeCloudflare({ "2026-02-23": 0, "2026-02-24": 40, "2026-02-28": 60, "2026-03-01": 999 });
  const result = await queryMonth(env, "2026-02", { today: "2026-09-28", since: "2026-02-01", fetcher });
  assert.deepEqual(result, { month: "2026-02", uniques: 100, firstDay: "2026-02-24" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, CF_GRAPHQL);
  assert.equal(calls[0].auth, `Bearer ${TOKEN}`);
  assert.deepEqual(calls[0].variables, { zoneTag: ZONE, since: "2026-02-01", until: "2026-02-28" });
});

test("the current month stops at today, not at the end of the month", async () => {
  const { fetcher, calls } = fakeCloudflare({ "2026-09-27": 5 });
  await queryMonth(env, "2026-09", { today: "2026-09-28", since: "2026-02-01", fetcher });
  assert.equal(calls[0].variables.until, "2026-09-28");
});

test("totals add every month since the first day with traffic, and name that day", async () => {
  const table = { "2026-02-24": 40, "2026-02-28": 60, "2026-03-10": 300, "2026-09-01": 7, "2026-09-28": 3 };
  const { fetcher } = fakeCloudflare(table);
  const data = await loadCloudflareVisitors(env, { now: new Date("2026-09-28T12:00:00Z"), fetcher });
  assert.equal(data.source, "cloudflare");
  assert.equal(data.month, "2026-09");
  assert.equal(data.monthUniques, 10);
  assert.equal(data.total, 410);
  assert.equal(data.firstDay, "2026-02-24");
  assert.deepEqual(data.months.map((entry) => entry.month), ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.match(data.definition, /counted again/);
  assert.ok(!JSON.stringify(data).includes(TOKEN), "the token must never reach the response");
});

test("a completed month is read from Cloudflare once, then from the snapshot", async () => {
  const { store, values } = snapshotStore();
  const first = fakeCloudflare({ "2026-08-15": 50, "2026-09-02": 4 });
  await loadCloudflareVisitors({ ...env, VISITORS_SINCE: "2026-08-01" }, { now: new Date("2026-09-28T12:00:00Z"), fetcher: first.fetcher, store });
  assert.equal(first.calls.length, 2);
  assert.deepEqual(values.get("cfMonths"), { "2026-08": { uniques: 50, firstDay: "2026-08-15" } }, "only the closed month is kept");

  // Cloudflare has since aged August out; the total must not shrink because of it.
  const later = fakeCloudflare({ "2026-09-02": 4, "2026-09-20": 6 }, { refuse: new Set(["2026-08"]) });
  const data = await loadCloudflareVisitors({ ...env, VISITORS_SINCE: "2026-08-01" }, { now: new Date("2026-09-28T12:00:00Z"), fetcher: later.fetcher, store });
  assert.equal(later.calls.length, 1, "only the current month is asked for again");
  assert.equal(data.total, 60);
  assert.deepEqual(data.missingMonths, []);
});

test("an empty completed month is not frozen, so a silently aged-out month can still be recovered", async () => {
  const { store, values } = snapshotStore();
  const { fetcher } = fakeCloudflare({ "2026-09-10": 5 });
  await loadCloudflareVisitors({ ...env, VISITORS_SINCE: "2026-08-01" }, { now: new Date("2026-09-28T12:00:00Z"), fetcher, store });
  assert.equal(values.get("cfMonths"), undefined, "August answered with no rows and must not be kept as zero");
});

test("a month Cloudflare no longer has is reported as missing, not counted as zero", async () => {
  const { fetcher } = fakeCloudflare({ "2026-03-05": 20, "2026-09-10": 5 }, { refuse: new Set(["2026-02"]) });
  const data = await loadCloudflareVisitors(env, { now: new Date("2026-09-28T12:00:00Z"), fetcher });
  assert.deepEqual(data.missingMonths, ["2026-02"]);
  assert.equal(data.total, 25);
});

test("the snapshot store keeps only month keys and whole numbers", async () => {
  const { store, values } = snapshotStore();
  await store.fetch(new Request("https://counter.internal/cf-months", {
    method: "POST",
    body: JSON.stringify({ months: { "2026-02": { uniques: 12, firstDay: "2026-02-24" }, "bad": { uniques: 5 }, "2026-03": { uniques: -1 }, "2026-04": { uniques: 1.5 } } })
  }));
  assert.deepEqual(values.get("cfMonths"), { "2026-02": { uniques: 12, firstDay: "2026-02-24" } });
});

test("answers are cached for an hour and served stale when Cloudflare fails", async () => {
  resetCloudflareVisitors();
  const stored = new Map();
  const cache = {
    async match(request) { const body = stored.get(request.url); return body ? new Response(body) : undefined; },
    async put(request, response) { stored.set(request.url, await response.text()); }
  };
  const request = new Request("https://pigsfield.com/api/visitors");
  const good = fakeCloudflare({ "2026-09-10": 5 });
  const now = new Date("2026-09-28T12:00:00Z");
  const first = await cloudflareVisitors(request, { ...env, VISITORS_SINCE: "2026-09-01" }, { cache, fetcher: good.fetcher, now });
  assert.equal(first.monthUniques, 5);
  assert.equal(first.stale, false);

  const within = await cloudflareVisitors(request, { ...env, VISITORS_SINCE: "2026-09-01" }, { cache, fetcher: () => { throw new Error("must not refetch"); }, now: new Date(now.getTime() + 60000) });
  assert.equal(within.monthUniques, 5);

  const failing = async () => new Response("down", { status: 503 });
  const stale = await cloudflareVisitors(request, { ...env, VISITORS_SINCE: "2026-09-01" }, { cache, fetcher: failing, now: new Date(now.getTime() + 2 * 3600000) });
  assert.equal(stale.stale, true, "the last good answer is served, marked stale");
  assert.equal(stale.monthUniques, 5);
  resetCloudflareVisitors();
});

test("without configuration the visitor route keeps the check-in counter", async () => {
  resetCloudflareVisitors();
  const { store } = snapshotStore();
  const counterEnv = { VISITOR_COUNTER: { getByName: () => store } };
  const response = await handleVisitors(new Request("https://pigsfield.com/api/visitors"), counterEnv);
  const body = await response.json();
  assert.equal(body.source, undefined);
  assert.equal(typeof body.rolling, "number");
});

test("with configuration the visitor route answers with Cloudflare's count", async () => {
  resetCloudflareVisitors();
  const stores = new Map();
  const counterEnv = {
    ...env,
    VISITORS_SINCE: "2026-09-01",
    VISITOR_COUNTER: {
      getByName(name) {
        if (!stores.has(name)) stores.set(name, snapshotStore().store);
        return stores.get(name);
      }
    }
  };
  const { fetcher } = fakeCloudflare({ "2026-09-10": 5, "2026-09-11": 8 });
  const cache = { async match() { return undefined; }, async put() {} };
  const response = await handleVisitors(new Request("https://pigsfield.com/api/visitors"), counterEnv, { fetcher, cache, now: new Date("2026-09-28T12:00:00Z") });
  const body = await response.json();
  assert.equal(body.source, "cloudflare");
  assert.equal(body.monthUniques, 13);
  assert.equal(body.total, 13);
  resetCloudflareVisitors();
});

// Unique visitors, as Cloudflare itself counts them.
//
// The homepage used to show the site's own browser check-ins: one per browser per India
// day, kept in a Durable Object that only started counting in June 2026. That is a real
// number, but it is not the number in the Cloudflare dashboard, and it cannot reach back to
// the months the site ran before the counter existed. Cloudflare has been counting since the
// zone went live, so the figures here come from its GraphQL Analytics API instead.
//
// What the number is: Cloudflare's daily unique visitors (distinct visitor addresses on a
// UTC day), added up across the month and across every month since the first day it
// recorded traffic. That is the same figure the Cloudflare dashboard shows for a multi-day
// range. Someone who visits on five days counts five times, and it includes whatever
// automated traffic Cloudflare did not filter — the endpoint says so rather than implying a
// de-duplicated head count it does not have.
//
// Completed months are copied into Durable Object storage the first time they are read.
// Cloudflare keeps daily analytics for a limited period, so without the copy the "since
// launch" total would start shrinking once the earliest months aged out of its retention.
export const CF_GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
// The UTC day the site went live — the same moment as SITE_LAUNCH_DATE in worker/index.mjs
// (first commit, 2026-02-28 13:45 UTC; a test keeps the two in step). Anything Cloudflare saw
// on the zone before that, such as crawlers on a parked domain, is not the site's audience.
export const DEFAULT_SINCE = "2026-02-28";
export const SNAPSHOT_OBJECT = "pigsfield-cloudflare-months";
export const FRESH_FOR_MS = 3600000;

const QUERY = `query VisitorDays($zoneTag: string, $since: Date, $until: Date) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(limit: 40, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_ASC]) {
        dimensions { date }
        uniq { uniques }
      }
    }
  }
}`;

const MONTH = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function configured(env) {
  return Boolean(env && env.CF_ANALYTICS_TOKEN && /^[a-f0-9]{32}$/i.test(String(env.CF_ZONE_ID || "")));
}

/** Every calendar month (UTC) from `since` to `until`, inclusive, as YYYY-MM. */
export function monthsBetween(since, until) {
  const [startYear, startMonth] = since.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = until.slice(0, 7).split("-").map(Number);
  const months = [];
  for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth);) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    if (months.length > 240) break; // twenty years: a loop bound, not an expectation
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return months;
}

function lastDayOf(month) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
}

/** One month of daily uniques from Cloudflare, or a thrown error naming nothing secret. */
export async function queryMonth(env, month, { today, since, fetcher = fetch } = {}) {
  const first = `${month}-01` < since ? since : `${month}-01`;
  const last = lastDayOf(month) > today ? today : lastDayOf(month);
  const response = await fetcher(CF_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.CF_ANALYTICS_TOKEN}` },
    body: JSON.stringify({ query: QUERY, variables: { zoneTag: env.CF_ZONE_ID, since: first, until: last } }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Cloudflare analytics answered ${response.status}`);
  const payload = await response.json();
  if (payload && Array.isArray(payload.errors) && payload.errors.length) throw new Error("Cloudflare analytics refused the query");
  const zones = payload && payload.data && payload.data.viewer && payload.data.viewer.zones;
  if (!Array.isArray(zones) || !zones.length) throw new Error("Cloudflare analytics returned no zone");
  const rows = Array.isArray(zones[0].httpRequests1dGroups) ? zones[0].httpRequests1dGroups : [];
  let uniques = 0;
  let firstDay = null;
  for (const row of rows) {
    const date = row && row.dimensions && row.dimensions.date;
    const count = Number(row && row.uniq && row.uniq.uniques);
    if (!DAY.test(String(date || "")) || !Number.isSafeInteger(count) || count < 0) continue;
    uniques += count;
    if (count > 0 && (!firstDay || date < firstDay)) firstDay = date;
  }
  return { month, uniques, firstDay };
}

async function readSnapshots(store) {
  if (!store) return {};
  try {
    const response = await store.fetch(new Request("https://counter.internal/cf-months"));
    if (!response.ok) return {};
    const data = await response.json();
    return data && typeof data.months === "object" && data.months ? data.months : {};
  } catch (_) {
    return {};
  }
}

async function saveSnapshots(store, months) {
  if (!store || !Object.keys(months).length) return;
  try {
    await store.fetch(new Request("https://counter.internal/cf-months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months })
    }));
  } catch (_) {
    // A lost snapshot is re-read from Cloudflare next time, while it is still retained.
  }
}

/**
 * Month-by-month unique visitors since `since`. A completed month is read from Cloudflare
 * once and then from the snapshot; the current month is always read live.
 */
export async function loadCloudflareVisitors(env, { now = new Date(), fetcher = fetch, store = null } = {}) {
  const today = now.toISOString().slice(0, 10);
  const since = DAY.test(String(env.VISITORS_SINCE || "")) ? env.VISITORS_SINCE : DEFAULT_SINCE;
  const current = today.slice(0, 7);
  const saved = await readSnapshots(store);
  const fresh = {};
  const months = [];
  const missing = [];

  for (const month of monthsBetween(since, today)) {
    const closed = month < current;
    const snapshot = saved[month];
    if (closed && snapshot && Number.isSafeInteger(snapshot.uniques)) {
      months.push({ month, uniques: snapshot.uniques, firstDay: snapshot.firstDay || null });
      continue;
    }
    try {
      const result = await queryMonth(env, month, { today, since, fetcher });
      months.push(result);
      // An empty month is never frozen: if Cloudflare answers an aged-out month with no rows
      // rather than an error, keeping that zero would lock the loss in for good. Re-asking
      // costs one small query, and a month with no visitors adds nothing to the total anyway.
      if (closed && result.uniques > 0) fresh[month] = { uniques: result.uniques, firstDay: result.firstDay };
    } catch (_) {
      // Most often a month older than Cloudflare's retention. It is reported, not zeroed.
      missing.push(month);
    }
  }
  await saveSnapshots(store, fresh);

  // Without the current month there is no "this month" figure to show, and a total that is
  // missing its newest part would quietly understate itself.
  const thisMonth = months.find((entry) => entry.month === current);
  if (!thisMonth) throw new Error("Current month unavailable");
  const firstDay = months.map((entry) => entry.firstDay).filter(Boolean).sort()[0] || null;
  return {
    source: "cloudflare",
    month: current,
    monthUniques: thisMonth.uniques,
    monthPartial: true,
    total: months.reduce((sum, entry) => sum + entry.uniques, 0),
    firstDay,
    months: months.map(({ month, uniques }) => ({ month, uniques })),
    missingMonths: missing,
    updatedAt: now.toISOString(),
    definition: "Unique visitors as counted by Cloudflare: distinct visitor addresses on each day, added up over the month and since the first day Cloudflare recorded traffic. A person who comes back on another day is counted again, and automated traffic Cloudflare did not filter is included."
  };
}

let pending = null;
let retryAfter = 0;

/** Test seam: the coalescing and the cooldown are isolate-wide state. */
export function resetCloudflareVisitors() {
  pending = null;
  retryAfter = 0;
}

/**
 * Cached for an hour at the edge: the homepage asks on every visit, and Cloudflare's
 * analytics API is rate limited per account. A failed refresh serves the last good answer,
 * marked stale, for up to a week.
 */
export async function cloudflareVisitors(request, env, { cache = globalThis.caches?.default, fetcher = fetch, store = null, now = new Date() } = {}) {
  if (!configured(env)) return null;
  const key = new Request(new URL("/api/visitors?source=cloudflare-v1", request.url));
  let previous = null;
  try { previous = await (await cache?.match(key))?.json(); } catch (_) { previous = null; }
  if (previous && now - Date.parse(previous.updatedAt) < FRESH_FOR_MS) return { ...previous, stale: false };
  try {
    if (Date.now() < retryAfter) throw new Error("Cloudflare retry cooldown");
    if (!pending) {
      pending = (async () => {
        const data = await loadCloudflareVisitors(env, { now, fetcher, store });
        try {
          await cache?.put(key, new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=604800" }
          }));
        } catch (_) { /* the answer is still usable */ }
        return data;
      })().finally(() => { pending = null; });
    }
    return { ...(await pending), stale: false };
  } catch (_) {
    retryAfter = Date.now() + 60000;
    return previous ? { ...previous, stale: true } : null;
  }
}

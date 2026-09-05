import test from "node:test";
import assert from "node:assert/strict";
import {
  MonthlyVisitorCounter,
  ROLLING_WINDOW_DAYS,
  handleVisitors,
  indiaDay,
  indiaMonth,
  monthsSinceEpoch,
  recentIndiaDays
} from "../worker/index.mjs";

/**
 * One Durable Object per name, so the legacy month objects and the current one are separate
 * stores — which is the whole point of the import path being tested below.
 */
function counterEnvironment(seed = {}) {
  const stores = new Map();
  const objectFor = (name) => {
    if (!stores.has(name)) {
      const values = new Map(Object.entries(seed[name] || {}));
      const state = {
        storage: {
          async get(key) {
            return values.get(key);
          },
          async put(entries) {
            for (const [key, value] of Object.entries(entries)) values.set(key, value);
          }
        }
      };
      stores.set(name, { values, object: new MonthlyVisitorCounter(state) });
    }
    return stores.get(name);
  };
  return {
    env: {
      VISITOR_COUNTER: {
        getByName(name) {
          const { object } = objectFor(name);
          return { fetch: (request) => object.fetch(request) };
        }
      },
      VISITOR_RATE_LIMITER: {
        async limit() {
          return { success: true };
        }
      }
    },
    valuesFor: (name) => objectFor(name).values
  };
}

function visitorRequest({ method = "POST", cookie = "", origin = "https://pigsfield.com", userAgent = "Mozilla/5.0" } = {}) {
  const headers = new Headers({ "User-Agent": userAgent });
  if (origin) headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  return new Request("https://pigsfield.com/api/visitors", { method, headers });
}

test("uses the India calendar day and month", () => {
  assert.equal(indiaMonth(new Date("2026-07-31T18:20:00.000Z")), "2026-07");
  assert.equal(indiaMonth(new Date("2026-07-31T18:40:00.000Z")), "2026-08");
  // 18:30 UTC is midnight in Kolkata, so the day turns there and not at UTC midnight.
  assert.equal(indiaDay(new Date("2026-07-31T18:20:00.000Z")), "2026-07-31");
  assert.equal(indiaDay(new Date("2026-07-31T18:40:00.000Z")), "2026-08-01");
});

test("the rolling window is the last 30 days ending today, not a calendar month", () => {
  const days = recentIndiaDays(ROLLING_WINDOW_DAYS, new Date("2026-03-02T12:00:00.000Z"));
  assert.equal(ROLLING_WINDOW_DAYS, 30);
  assert.equal(days.length, 30);
  assert.equal(days[0], "2026-03-02", "the window ends on the ongoing day");
  // A calendar month would have started on the 1st and covered two days. The window reaches
  // back across the month boundary instead, which is what "last 30 days" means.
  assert.equal(days[29], "2026-02-01");
  assert.equal(new Set(days).size, 30, "no day may repeat");
});

test("counts a browser once a day and sets only a day cookie", async () => {
  const { env } = counterEnvironment();
  const first = await handleVisitors(visitorRequest(), env);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.rolling, 1);
  assert.equal(firstBody.total, 1);
  assert.equal(firstBody.windowDays, 30);
  assert.equal(firstBody.counted, true);
  assert.match(firstBody.startedAt, /^\d{4}-\d{2}-\d{2}T/);

  const cookie = first.headers.get("set-cookie");
  assert.match(cookie, /^pf_visitor_day=\d{4}-\d{2}-\d{2};/);
  assert.match(cookie, /HttpOnly/);
  // Two days, so a timezone boundary cannot double-count and tomorrow still counts.
  assert.match(cookie, /Max-Age=172800/);
  assert.doesNotMatch(cookie, /[a-f0-9]{24,}/i, "the cookie must not carry a visitor identifier");

  const second = await handleVisitors(visitorRequest({ cookie: cookie.split(";")[0] }), env);
  const secondBody = await second.json();
  assert.equal(secondBody.rolling, 1);
  assert.equal(secondBody.total, 1);
  assert.equal(secondBody.counted, false);
  assert.equal(second.headers.get("set-cookie"), null);
});

test("the total keeps history the rolling window has already dropped", async () => {
  const { env } = counterEnvironment();
  const stub = env.VISITOR_COUNTER.getByName("pigsfield-visitors-all");
  const today = indiaDay();
  const old = "2020-01-01";

  // A day far outside the window, then one inside it. Pruning is driven by the keep list.
  await stub.fetch(new Request(`https://counter.internal/increment?day=${old}&keep=${old}`, { method: "POST" }));
  await stub.fetch(new Request(`https://counter.internal/increment?day=${today}&keep=${today}`, { method: "POST" }));

  const body = await (await stub.fetch(new Request("https://counter.internal/count"))).json();
  assert.equal(body.total, 2, "the all-time total counts both");
  assert.deepEqual(Object.keys(body.days), [today], "the dropped day leaves no bucket behind");
});

test("a day outside the retention window is pruned rather than accumulating forever", async () => {
  const { env, valuesFor } = counterEnvironment();
  const stub = env.VISITOR_COUNTER.getByName("pigsfield-visitors-all");
  const keep = recentIndiaDays(45).join(",");
  for (const day of ["2019-05-05", "2019-05-06", indiaDay()]) {
    await stub.fetch(new Request(`https://counter.internal/increment?day=${day}&keep=${keep}`, { method: "POST" }));
  }
  const stored = valuesFor("pigsfield-visitors-all").get("days");
  assert.deepEqual(Object.keys(stored), [indiaDay()]);
  assert.equal(valuesFor("pigsfield-visitors-all").get("total"), 3);
});

test("an increment without a valid day is refused rather than guessed", async () => {
  const { env } = counterEnvironment();
  const stub = env.VISITOR_COUNTER.getByName("pigsfield-visitors-all");
  const response = await stub.fetch(new Request("https://counter.internal/increment?day=yesterday", { method: "POST" }));
  assert.equal(response.status, 400);
});

test("the per-month totals from the previous scheme are carried into the all-time figure", async () => {
  // "Total since the site launched" would otherwise have started at zero on the day the
  // rolling counter shipped, which is neither a total nor since launch.
  const months = monthsSinceEpoch();
  assert.ok(months.length >= 1);
  assert.equal(months[0], "2026-06");
  assert.equal(months[months.length - 1], indiaMonth());

  const seed = {};
  seed[`pigsfield-visitors-${months[0]}`] = { count: 900, startedAt: "2026-06-13T00:00:00.000Z" };
  seed[`pigsfield-visitors-${months[1] || months[0]}`] = { count: 350 };
  const { env } = counterEnvironment(seed);

  const body = await (await handleVisitors(visitorRequest(), env)).json();
  const carried = months.length > 1 ? 1250 : 900;
  assert.equal(body.total, carried + 1, "the visit that triggered the import counts too");
  assert.equal(body.rolling, 1, "only today's check-in is inside the window");
  assert.equal(body.startedAt, "2026-06-13T00:00:00.000Z", "the first check-in date survives the move");

  // Importing twice would double the total. A second visit carries no cookie, so it counts
  // as a new browser and legitimately adds one — but only one.
  const again = await (await handleVisitors(visitorRequest(), env)).json();
  assert.equal(again.total, carried + 2, "a repeat visit must add a visit, not another import");
});

test("read-only requests and recognizable bots do not increment", async () => {
  const { env } = counterEnvironment();
  const read = await handleVisitors(visitorRequest({ method: "GET", origin: "" }), env);
  const body = await read.json();
  assert.equal(body.total, 0);
  assert.equal(body.rolling, 0);
  assert.equal(body.counted, false);
  assert.match(body.definition, /last 30 days ending today/);

  const bot = await handleVisitors(visitorRequest({ userAgent: "ExampleBot/1.0" }), env);
  const botBody = await bot.json();
  assert.equal(botBody.total, 0);
  assert.equal(botBody.counted, false);
});

test("rejects foreign increments and fails closed without storage", async () => {
  const foreign = await handleVisitors(visitorRequest({ origin: "https://example.com" }), counterEnvironment().env);
  assert.equal(foreign.status, 403);

  const missing = await handleVisitors(visitorRequest(), {});
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { error: "Visitor count is not configured." });
});

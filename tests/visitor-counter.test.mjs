import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PRE_COUNTER_BASELINE,
  MonthlyVisitorCounter,
  PEOPLE_SINCE,
  ROLLING_WINDOW_DAYS,
  SITE_LAUNCH_DATE,
  VISITOR_EPOCH_MONTH,
  automatedRequest,
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
function counterEnvironment(seed = {}, { baseline = 0 } = {}) {
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
      VISITOR_BASELINE_TOTAL: baseline,
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

test("counts a browser once a day and once as a person, with cookies that identify no one", async () => {
  const { env } = counterEnvironment();
  const first = await handleVisitors(visitorRequest(), env);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.rolling, 1);
  assert.equal(firstBody.total, 1);
  assert.equal(firstBody.windowDays, 30);
  assert.equal(firstBody.counted, true);
  assert.match(firstBody.startedAt, /^\d{4}-\d{2}-\d{2}T/);

  assert.equal(firstBody.people, 1);
  assert.equal(firstBody.peopleSince, "2026-03-14");

  const [cookie, person] = first.headers.getSetCookie();
  assert.match(cookie, /^pf_visitor_day=\d{4}-\d{2}-\d{2};/);
  assert.match(cookie, /HttpOnly/);
  // Two days, so a timezone boundary cannot double-count and tomorrow still counts.
  assert.match(cookie, /Max-Age=172800/);
  assert.doesNotMatch(cookie, /[a-f0-9]{24,}/i, "the cookie must not carry a visitor identifier");
  // The person cookie says only "counted before", for as long as a browser keeps a cookie.
  assert.match(person, /^pf_person=1;/);
  assert.match(person, /HttpOnly/);
  assert.match(person, /Max-Age=34560000/);

  const second = await handleVisitors(visitorRequest({ cookie: cookie.split(";")[0] + "; " + person.split(";")[0] }), env);
  const secondBody = await second.json();
  assert.equal(secondBody.rolling, 1);
  assert.equal(secondBody.total, 1);
  assert.equal(secondBody.people, 1);
  assert.equal(secondBody.counted, false);
  assert.equal(second.headers.get("set-cookie"), null);
});

test("a returning browser is a new visit each day but the same person", async () => {
  const seed = { "pigsfield-visitors-all": { total: 500, imported: true } };
  const { env } = counterEnvironment(seed);
  // The person cookie from an earlier day, and yesterday's day cookie.
  const body = await (await handleVisitors(visitorRequest({ cookie: "pf_visitor_day=2000-01-01; pf_person=1" }), env)).json();
  assert.equal(body.counted, true);
  assert.equal(body.total, 501, "a new day is a new visit");
  assert.equal(body.people, 500, "but not a new person");
});

test("the people figure starts from every check-in so far, once, and then counts new browsers", async () => {
  // An existing counter from before per-browser counting: 326 check-ins plus the estimate.
  const seed = { "pigsfield-visitors-all": { total: 326, imported: true, baseline: 700 } };
  const { env, valuesFor } = counterEnvironment(seed, { baseline: 1000 });

  // Raising the estimate to 1,000 adds the 300 difference once, and the people figure is
  // seeded from that total: visits, so a generous estimate of the people behind them.
  const read = await (await handleVisitors(visitorRequest({ method: "GET", origin: "" }), env)).json();
  assert.equal(read.total, 626);
  assert.equal(read.people, 626);
  assert.equal(valuesFor("pigsfield-visitors-all").get("peopleSeeded"), true);

  // A browser seen in the last two days, before the person cookie existed, is already in the
  // seed: it gets the cookie but is not added again.
  const known = await handleVisitors(visitorRequest({ cookie: "pf_visitor_day=2000-01-01" }), env);
  const knownBody = await known.json();
  assert.equal(knownBody.total, 627);
  assert.equal(knownBody.people, 626);
  assert.ok(known.headers.getSetCookie().some((value) => value.startsWith("pf_person=1;")));

  // A browser never seen before is a new person.
  const fresh = await (await handleVisitors(visitorRequest(), env)).json();
  assert.equal(fresh.total, 628);
  assert.equal(fresh.people, 627);

  // Seeding happens once: later reads do not reset the figure to the visit total.
  const again = await (await handleVisitors(visitorRequest({ method: "GET", origin: "" }), env)).json();
  assert.equal(again.people, 627);
  assert.equal(PEOPLE_SINCE, "2026-03-14");
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
  assert.equal(months[0], "2026-02");
  assert.equal(months[months.length - 1], indiaMonth());

  const seed = {};
  seed[`pigsfield-visitors-${months[0]}`] = { count: 900, startedAt: "2026-02-28T13:45:02.000Z" };
  seed[`pigsfield-visitors-${months[1] || months[0]}`] = { count: 350 };
  const { env } = counterEnvironment(seed);

  const body = await (await handleVisitors(visitorRequest(), env)).json();
  const carried = months.length > 1 ? 1250 : 900;
  assert.equal(body.total, carried + 1, "the visit that triggered the import counts too");
  assert.equal(body.rolling, 1, "only today's check-in is inside the window");
  assert.equal(body.startedAt, "2026-02-28T13:45:02.000Z", "the first check-in date survives the move");

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

test("only real people are counted: crawlers, scripts, headless browsers and cloud servers are not", () => {
  const request = (userAgent, cf) => ({ cf, headers: new Headers(userAgent === null ? {} : { "User-Agent": userAgent }) });
  const chrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
  const people = [
    chrome,
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 DuckDuckGo/5",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0"
  ];
  for (const agent of people) assert.equal(automatedRequest(request(agent, { asn: 55836 })), false, agent);

  const machines = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
    "curl/8.5.0",
    "python-requests/2.32.3",
    "Go-http-client/2.0",
    "",
    null
  ];
  for (const agent of machines) assert.equal(automatedRequest(request(agent, { asn: 55836 })), true, String(agent));

  // An ordinary browser string from a cloud network is a crawler wearing a disguise.
  assert.equal(automatedRequest(request(chrome, { asn: 16509 })), true, "AWS");
  assert.equal(automatedRequest(request(chrome, { asn: 396982 })), true, "Google Cloud");
  assert.equal(automatedRequest(request(chrome, { asn: 14061 })), true, "DigitalOcean");
  // Cloudflare's own verdicts, where the plan provides them.
  assert.equal(automatedRequest(request(chrome, { botManagement: { verifiedBot: true } })), true);
  assert.equal(automatedRequest(request(chrome, { botManagement: { score: 2 } })), true);
  assert.equal(automatedRequest(request(chrome, { botManagement: { score: 90 } })), false);
});

test("rejects foreign increments and fails closed without storage", async () => {
  const foreign = await handleVisitors(visitorRequest({ origin: "https://example.com" }), counterEnvironment().env);
  assert.equal(foreign.status, 403);

  const missing = await handleVisitors(visitorRequest(), {});
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { error: "Visitor count is not configured." });
});

test("counts from site launch date (28 Feb 2026) and normalizes late counter start dates", async () => {
  assert.equal(VISITOR_EPOCH_MONTH, "2026-02");
  assert.equal(SITE_LAUNCH_DATE, "2026-02-28T13:45:02.000Z");
  assert.equal(DEFAULT_PRE_COUNTER_BASELINE, 1000);

  // Simulate an existing counter that was stamped on July 25, 2026
  const seed = {
    "pigsfield-visitors-all": {
      total: 326,
      imported: true,
      startedAt: "2026-07-25T12:09:16.773Z"
    }
  };
  const { env } = counterEnvironment(seed, { baseline: 0 });
  const res = await handleVisitors(visitorRequest({ method: "GET", origin: "" }), env);
  const body = await res.json();
  assert.equal(body.startedAt, SITE_LAUNCH_DATE);
  assert.equal(body.total, 326);
});

test("incorporates pre-counter baseline monotonically without double counting", async () => {
  const seed = {
    "pigsfield-visitors-all": {
      total: 326,
      imported: true,
      startedAt: "2026-07-25T12:09:16.773Z"
    }
  };
  // Apply baseline of 700
  const { env } = counterEnvironment(seed, { baseline: 700 });
  const first = await handleVisitors(visitorRequest({ method: "GET", origin: "" }), env);
  const firstBody = await first.json();
  assert.equal(firstBody.total, 1026);
  assert.equal(firstBody.startedAt, SITE_LAUNCH_DATE);

  // Subsequent visit should not re-add the baseline
  const second = await handleVisitors(visitorRequest({ method: "GET", origin: "" }), env);
  const secondBody = await second.json();
  assert.equal(secondBody.total, 1026);

  // An increment adds 1
  const third = await handleVisitors(visitorRequest(), env);
  const thirdBody = await third.json();
  assert.equal(thirdBody.total, 1027);
  assert.equal(thirdBody.counted, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { MonthlyVisitorCounter, handleVisitors, indiaMonth } from "../worker/index.mjs";

function counterEnvironment() {
  const values = new Map();
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
  const object = new MonthlyVisitorCounter(state);
  return {
    env: {
      VISITOR_COUNTER: {
        getByName() {
          return { fetch: (request) => object.fetch(request) };
        }
      },
      VISITOR_RATE_LIMITER: {
        async limit() {
          return { success: true };
        }
      }
    },
    values
  };
}

function visitorRequest({ method = "POST", cookie = "", origin = "https://pigsfield.com", userAgent = "Mozilla/5.0" } = {}) {
  const headers = new Headers({ "User-Agent": userAgent });
  if (origin) headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  return new Request("https://pigsfield.com/api/visitors", { method, headers });
}

test("uses the India calendar month", () => {
  assert.equal(indiaMonth(new Date("2026-07-31T18:20:00.000Z")), "2026-07");
  assert.equal(indiaMonth(new Date("2026-07-31T18:40:00.000Z")), "2026-08");
});

test("counts a browser once and sets only a month cookie", async () => {
  const { env } = counterEnvironment();
  const first = await handleVisitors(visitorRequest(), env);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.count, 1);
  assert.equal(firstBody.counted, true);
  assert.match(firstBody.startedAt, /^\d{4}-\d{2}-\d{2}T/);

  const cookie = first.headers.get("set-cookie");
  assert.match(cookie, /^pf_visitor_month=\d{4}-\d{2};/);
  assert.match(cookie, /HttpOnly/);
  assert.doesNotMatch(cookie, /[a-f0-9]{24,}/i);

  const second = await handleVisitors(visitorRequest({ cookie: cookie.split(";")[0] }), env);
  const secondBody = await second.json();
  assert.equal(secondBody.count, 1);
  assert.equal(secondBody.counted, false);
  assert.equal(second.headers.get("set-cookie"), null);
});

test("read-only requests and recognizable bots do not increment", async () => {
  const { env } = counterEnvironment();
  const read = await handleVisitors(visitorRequest({ method: "GET", origin: "" }), env);
  assert.deepEqual(await read.json(), {
    count: 0,
    month: indiaMonth(),
    startedAt: null,
    counted: false,
    definition: "Best-effort browser check-ins; usually one per browser each India calendar month."
  });

  const bot = await handleVisitors(visitorRequest({ userAgent: "ExampleBot/1.0" }), env);
  const botBody = await bot.json();
  assert.equal(botBody.count, 0);
  assert.equal(botBody.counted, false);
});

test("rejects foreign increments and fails closed without storage", async () => {
  const foreign = await handleVisitors(visitorRequest({ origin: "https://example.com" }), counterEnvironment().env);
  assert.equal(foreign.status, 403);

  const missing = await handleVisitors(visitorRequest(), {});
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { error: "Visitor count is not configured." });
});

test("the Durable Object persists totals and its honest start time", async () => {
  const { env, values } = counterEnvironment();
  const stub = env.VISITOR_COUNTER.getByName("test");
  await stub.fetch(new Request("https://counter.internal/increment", { method: "POST" }));
  const second = await stub.fetch(new Request("https://counter.internal/increment", { method: "POST" }));
  const body = await second.json();
  assert.equal(body.count, 2);
  assert.equal(values.get("count"), 2);
  assert.match(values.get("startedAt"), /^\d{4}-\d{2}-\d{2}T/);
});

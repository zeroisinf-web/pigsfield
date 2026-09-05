// Spending controls for the hosted AI endpoint.
//
// /api/ai calls Workers AI, which bills per token. The endpoint is reachable by anything
// that can set an Origin header — a browser cannot forge one, but curl can, and that was
// verified against production. The rate limiters are per-address, so N addresses cost N
// times as much with no ceiling at all. DailyAIBudget is that ceiling.
//
// Two separate defects are covered here, because both were real:
//   1. the per-visitor limiter was keyed on a header the caller supplies, so it could be
//      rotated for endless fresh buckets while honest browsers shared one bucket;
//   2. nothing bounded total daily spend.

import assert from "node:assert/strict";
import test from "node:test";

import { DailyAIBudget, indiaDay, indiaMonth } from "../worker/index.mjs";

/** Minimal stand-in for Durable Object storage. */
function makeState(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    storage: {
      async get(key) {
        return map.get(key);
      },
      async put(entries) {
        for (const [key, value] of Object.entries(entries)) map.set(key, value);
      }
    }
  };
}

const spend = (budget, limit) =>
  budget.fetch(new Request(`https://budget/spend?limit=${limit}`, { method: "POST" })).then((response) => response.json());

test("the daily budget stops spending once the ceiling is reached", async () => {
  const state = makeState();
  const budget = new DailyAIBudget(state);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await spend(budget, 3);
    assert.equal(result.allowed, true, `call ${attempt} should be inside the budget`);
    assert.equal(result.used, attempt);
  }

  // Everything past the ceiling is refused, and refusals must not keep incrementing.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await spend(budget, 3);
    assert.equal(result.allowed, false, "calls past the ceiling must be refused");
    assert.equal(result.used, 3, "a refused call must not consume more budget");
  }
});

test("the budget resets on the India calendar day, not on UTC", async () => {
  const state = makeState({ day: "2000-01-01", used: 999 });
  const budget = new DailyAIBudget(state);
  const result = await spend(budget, 10);
  assert.equal(result.allowed, true, "a new day starts fresh");
  assert.equal(result.used, 1);
  assert.equal(result.day, indiaDay(), "the stored day must be the India calendar day");
});

test("the budget stores a count and a date, and nothing about visitors", async () => {
  const state = makeState();
  const budget = new DailyAIBudget(state);
  await spend(budget, 5);
  assert.deepEqual([...state.map.keys()].sort(), ["day", "used"]);
});

test("indiaDay is a real IST calendar date and agrees with indiaMonth", () => {
  const day = indiaDay();
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(day.slice(0, 7), indiaMonth(), "day and month must come from the same timezone");
  // A moment that is already tomorrow in Kolkata but still today in UTC.
  assert.equal(indiaDay(new Date("2026-03-01T19:00:00Z")), "2026-03-02");
  assert.equal(indiaDay(new Date("2026-03-01T18:29:00Z")), "2026-03-01");
});

test("the per-visitor rate limit cannot be escaped by rotating the client header", () => {
  const source = fsReadWorker();
  // The bucket must be scoped to the Cloudflare-provided address, which a caller cannot set.
  assert.match(
    source,
    /function clientKey\(request\)[\s\S]{0,320}\$\{edgeKey\(request\)\}\|\$\{identity\}/,
    "clientKey must combine the trusted edge address with the supplied identity"
  );
  // The old shape returned the caller's header verbatim, which is what made it rotatable.
  assert.doesNotMatch(
    source,
    /return \/\^\[a-z0-9-\]\{12,80\}\$\/i\.test\(supplied\) \? supplied : "anonymous";/,
    "the header must never be the whole rate-limit key"
  );
});

test("every model call reserves budget before it is made", () => {
  const source = fsReadWorker();
  const handler = source.match(/async function handleAI\([\s\S]*?\n\}/)?.[0] || "";
  assert.ok(handler, "handleAI not found");
  const reserveAt = handler.indexOf("reserveAIBudget");
  const runAt = handler.indexOf("env.AI.run");
  assert.notEqual(reserveAt, -1, "handleAI must reserve budget");
  assert.notEqual(runAt, -1, "handleAI must call the model");
  assert.ok(reserveAt < runAt, "budget must be reserved before the billable call, not after");
});

function fsReadWorker() {
  // Imported lazily so the module-level assertions above stay about behaviour, not text.
  const fs = require$("node:fs");
  const path = require$("node:path");
  const { fileURLToPath } = require$("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  return fs.readFileSync(path.join(root, "worker", "index.mjs"), "utf8").replace(/\r\n/g, "\n");
}

// node:test runs ESM here, so pull in the few sync helpers through createRequire.
import { createRequire } from "node:module";
const require$ = createRequire(import.meta.url);

// Tests for the optional sign-in endpoints, against an in-memory stand-in for D1.
//
// The properties that matter most here are not "does it log in" but the ones that are easy
// to get wrong and expensive to get wrong: a deployment without accounts must behave as
// before, a magic link must work exactly once, and the request endpoint must not become a
// way to test which email addresses have an account.

import assert from "node:assert/strict";
import test from "node:test";

import { SESSION_COOKIE, hashEmail, hashToken, randomToken } from "../worker/account-core.mjs";
import { accountsEnabled, handleAccountRoute } from "../worker/account-routes.mjs";

const PEPPER = "test-pepper";
const NOW = 1_800_000_000_000;

/** Enough of D1's prepare/bind/first/run/all/batch surface for these routes. */
function fakeDb() {
  const tables = { accounts: [], login_tokens: [], sessions: [], saved_items: [] };
  let nextAccountId = 1;

  function exec(sql, args) {
    const q = sql.replace(/\s+/g, " ").trim();

    if (q.startsWith("INSERT INTO login_tokens")) {
      tables.login_tokens.push({ token_hash: args[0], email_hash: args[1], expires_at: args[2], used_at: null });
      return {};
    }
    if (q.startsWith("SELECT email_hash, expires_at, used_at FROM login_tokens")) {
      return tables.login_tokens.find((row) => row.token_hash === args[0]) || null;
    }
    if (q.startsWith("UPDATE login_tokens SET used_at")) {
      const row = tables.login_tokens.find((entry) => entry.token_hash === args[1]);
      if (row) row.used_at = args[0];
      return {};
    }
    if (q.startsWith("INSERT INTO accounts")) {
      const existing = tables.accounts.find((row) => row.email_hash === args[0]);
      if (existing) existing.last_seen_at = args[2];
      else tables.accounts.push({ id: nextAccountId++, email_hash: args[0], created_at: args[1], last_seen_at: args[2] });
      return {};
    }
    if (q.startsWith("SELECT id FROM accounts")) {
      return tables.accounts.find((row) => row.email_hash === args[0]) || null;
    }
    if (q.startsWith("INSERT INTO sessions")) {
      tables.sessions.push({ token_hash: args[0], account_id: args[1], created_at: args[2], expires_at: args[3] });
      return {};
    }
    if (q.startsWith("SELECT account_id, expires_at FROM sessions")) {
      return tables.sessions.find((row) => row.token_hash === args[0]) || null;
    }
    if (q.startsWith("DELETE FROM sessions")) {
      tables.sessions = tables.sessions.filter((row) => row.token_hash !== args[0]);
      return {};
    }
    if (q.startsWith("SELECT item_id AS id")) {
      return { results: tables.saved_items.filter((row) => row.account_id === args[0]) };
    }
    if (q.startsWith("DELETE FROM saved_items")) {
      tables.saved_items = tables.saved_items.filter((row) => row.account_id !== args[0]);
      return {};
    }
    if (q.startsWith("INSERT INTO saved_items")) {
      tables.saved_items.push({
        account_id: args[0], id: args[1], title: args[2], description: args[3], url: args[4], section: args[5]
      });
      return {};
    }
    throw new Error(`fakeDb has no handler for: ${q.slice(0, 70)}`);
  }

  const db = {
    tables,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() { return exec(sql, args); },
            async run() { return exec(sql, args); },
            async all() { return exec(sql, args); }
          };
        }
      };
    },
    async batch(statements) {
      for (const statement of statements) await statement.run();
    }
  };
  return db;
}

function makeEnv(overrides = {}) {
  return { DB: fakeDb(), ACCOUNT_PEPPER: PEPPER, RESEND_API_KEY: "key", ACCOUNT_FROM_EMAIL: "hello@pigsfield.com", ...overrides };
}

const call = (env, path, init = {}, opts = {}) => {
  const url = new URL(`https://pigsfield.com${path}`);
  return handleAccountRoute(new Request(url, init), env, url, { now: NOW, secure: true, ...opts });
};

// Every test stubs fetch so no email ever leaves the machine.
function stubMail(ok = true) {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    sent.push({ url: String(input), body: JSON.parse(init.body) });
    return new Response("{}", { status: ok ? 200 : 500 });
  };
  return { sent, restore: () => { globalThis.fetch = original; } };
}

test("a deployment without accounts keeps working and says so plainly", async () => {
  assert.equal(accountsEnabled({}), false);
  assert.equal(accountsEnabled({ DB: { prepare() {} } }), false, "a database without a pepper is not enough");
  assert.equal(accountsEnabled(makeEnv()), true);

  const env = {};
  const session = await call(env, "/api/auth/session");
  assert.equal(session.status, 200, "the site must not error just because accounts are off");
  assert.deepEqual(await session.json(), { signedIn: false, available: false });

  const request = await call(env, "/api/auth/request", { method: "POST", body: JSON.stringify({ email: "a@b.com" }) });
  assert.equal(request.status, 503);
  assert.match((await request.json()).error, /works without one/i);
});

test("the sign-in request answers identically whether or not the account exists", async () => {
  const env = makeEnv();
  const mail = stubMail();
  try {
    const first = await call(env, "/api/auth/request", { method: "POST", body: JSON.stringify({ email: "new@example.com" }) });
    const firstBody = await first.json();

    // Create the account, then ask again for the same address.
    env.DB.tables.accounts.push({ id: 99, email_hash: await hashEmail("new@example.com", PEPPER), created_at: 1, last_seen_at: 1 });
    const second = await call(env, "/api/auth/request", { method: "POST", body: JSON.stringify({ email: "new@example.com" }) });

    assert.equal(first.status, second.status);
    assert.deepEqual(firstBody, await second.json(), "the response must not reveal that an account exists");
  } finally {
    mail.restore();
  }
});

test("no email address is written to the database, only a hash", async () => {
  const env = makeEnv();
  const mail = stubMail();
  try {
    await call(env, "/api/auth/request", { method: "POST", body: JSON.stringify({ email: "learner@example.com" }) });
    const stored = JSON.stringify(env.DB.tables);
    assert.ok(!stored.includes("learner@example.com"), "the address must never be persisted");
    assert.ok(!stored.includes("example.com"), "not even the domain");
    assert.equal(env.DB.tables.login_tokens.length, 1);
    assert.match(env.DB.tables.login_tokens[0].email_hash, /^[0-9a-f]{64}$/);
    // It is sent to the person, just not kept.
    assert.equal(mail.sent[0].body.to[0], "learner@example.com");
    assert.match(mail.sent[0].body.text, /\/api\/auth\/verify\?token=/);
  } finally {
    mail.restore();
  }
});

test("a bad address never reaches the mail provider", async () => {
  const env = makeEnv();
  const mail = stubMail();
  try {
    const response = await call(env, "/api/auth/request", { method: "POST", body: JSON.stringify({ email: "not-an-email" }) });
    assert.equal(response.status, 400);
    assert.equal(mail.sent.length, 0);
    assert.equal(env.DB.tables.login_tokens.length, 0, "no token is minted for an invalid address");
  } finally {
    mail.restore();
  }
});

test("a failed send is reported rather than silently swallowed", async () => {
  const env = makeEnv();
  const mail = stubMail(false);
  try {
    const response = await call(env, "/api/auth/request", { method: "POST", body: JSON.stringify({ email: "a@example.com" }) });
    assert.equal(response.status, 503, "a visitor must not be left waiting for an email that never sent");
  } finally {
    mail.restore();
  }
});

test("a magic link signs you in exactly once", async () => {
  const env = makeEnv();
  const token = randomToken();
  env.DB.tables.login_tokens.push({
    token_hash: await hashToken(token), email_hash: await hashEmail("a@example.com", PEPPER), expires_at: NOW + 60_000, used_at: null
  });

  const first = await call(env, `/api/auth/verify?token=${token}`);
  assert.equal(first.status, 302);
  assert.equal(first.headers.get("Location"), "/?signed-in=1");
  const cookie = first.headers.get("Set-Cookie");
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(env.DB.tables.accounts.length, 1, "the account is created on first verify");

  // Replaying the same link must fail — this is the whole point of single use.
  const replay = await call(env, `/api/auth/verify?token=${token}`);
  assert.equal(replay.status, 400);
  assert.match((await replay.json()).error, /already been used|expired/i);
});

test("expired, unknown and missing links are all refused", async () => {
  const env = makeEnv();
  const expired = randomToken();
  env.DB.tables.login_tokens.push({
    token_hash: await hashToken(expired), email_hash: "x".repeat(64), expires_at: NOW - 1, used_at: null
  });

  assert.equal((await call(env, `/api/auth/verify?token=${expired}`)).status, 400);
  assert.equal((await call(env, `/api/auth/verify?token=${randomToken()}`)).status, 400);
  assert.equal((await call(env, "/api/auth/verify")).status, 400);
  assert.equal(env.DB.tables.accounts.length, 0, "no account is created by a bad link");
});

test("the saved list needs a session, and syncing never loses an item", async () => {
  const env = makeEnv();
  const session = randomToken();
  env.DB.tables.accounts.push({ id: 7, email_hash: "h".repeat(64), created_at: NOW, last_seen_at: NOW });
  env.DB.tables.sessions.push({ token_hash: await hashToken(session), account_id: 7, created_at: NOW, expires_at: NOW + 60_000 });
  const cookie = { Cookie: `${SESSION_COOKIE}=${session}` };

  assert.equal((await call(env, "/api/saved")).status, 401, "guests get a clear 401, not a silent empty list");

  // Already on the server, e.g. saved earlier from a shared PC.
  env.DB.tables.saved_items.push({ account_id: 7, id: "from-pc", title: "PC", description: "", url: "", section: "Learn" });

  const put = await call(env, "/api/saved", {
    method: "PUT",
    headers: cookie,
    body: JSON.stringify({ items: [{ id: "from-phone", title: "Phone", url: "https://ncert.nic.in/" }] })
  });
  assert.equal(put.status, 200);
  const ids = (await put.json()).items.map((item) => item.id).sort();
  assert.deepEqual(ids, ["from-pc", "from-phone"], "signing in on a new device must not shorten the list");

  const get = await call(env, "/api/saved", { headers: cookie });
  assert.deepEqual((await get.json()).items.map((item) => item.id).sort(), ["from-pc", "from-phone"]);
});

test("an expired session is treated as signed out", async () => {
  const env = makeEnv();
  const session = randomToken();
  env.DB.tables.sessions.push({ token_hash: await hashToken(session), account_id: 7, created_at: 0, expires_at: NOW - 1 });
  const response = await call(env, "/api/auth/session", { headers: { Cookie: `${SESSION_COOKIE}=${session}` } });
  assert.deepEqual(await response.json(), { signedIn: false, available: true });
});

test("signing out deletes the session server-side, not just the cookie", async () => {
  const env = makeEnv();
  const session = randomToken();
  env.DB.tables.sessions.push({ token_hash: await hashToken(session), account_id: 7, created_at: NOW, expires_at: NOW + 60_000 });

  const response = await call(env, "/api/auth/logout", { method: "POST", headers: { Cookie: `${SESSION_COOKIE}=${session}` } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Set-Cookie"), /Max-Age=0/);
  assert.equal(env.DB.tables.sessions.length, 0, "a stolen cookie must not outlive sign-out");
});

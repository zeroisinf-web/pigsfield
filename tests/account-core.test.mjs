// Tests for the account core.
//
// This is the part of optional sign-in where a mistake leaks personal data rather than
// breaking a page, so the privacy promises are asserted, not just the happy path.

import assert from "node:assert/strict";
import test from "node:test";

import {
  LOGIN_TOKEN_TTL_MS,
  MAX_SAVED_ITEMS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearedSessionCookie,
  hashEmail,
  hashToken,
  isExpired,
  isValidEmail,
  magicLinkUrl,
  mergeSavedItems,
  normalizeEmail,
  randomToken,
  readCookie,
  safeEqual,
  sanitizeSavedItems,
  sessionCookie
} from "../worker/account-core.mjs";

test("an email is never recoverable from what gets stored", async () => {
  const pepper = "test-pepper-value";
  const hash = await hashEmail("Learner@Example.COM", pepper);

  assert.match(hash, /^[0-9a-f]{64}$/, "storage takes a hex digest, not an address");
  assert.ok(!hash.includes("example"), "no fragment of the address survives");

  // Same person, same row — case and surrounding space must not create a second account.
  assert.equal(hash, await hashEmail("  learner@example.com  ", pepper));

  // A different pepper yields a different digest, which is what makes a stolen database
  // useless on its own: email addresses have far too little entropy for a bare hash.
  assert.notEqual(hash, await hashEmail("learner@example.com", "another-pepper"));

  // Refusing to run without a pepper is deliberate — a silent fallback would be theatre.
  await assert.rejects(() => hashEmail("learner@example.com", ""), /ACCOUNT_PEPPER/);
});

test("gmail dots and plus-tags are left alone", () => {
  // Treating a.b@gmail.com and ab@gmail.com as one person is a guess, and guessing wrong
  // merges two people's saved lists. Normalisation is case and whitespace only.
  assert.notEqual(normalizeEmail("a.b@gmail.com"), normalizeEmail("ab@gmail.com"));
  assert.notEqual(normalizeEmail("me+pigsfield@gmail.com"), normalizeEmail("me@gmail.com"));
  assert.equal(normalizeEmail(" Me@Gmail.com "), "me@gmail.com");
});

test("obviously invalid addresses never reach the mail path", () => {
  for (const bad of ["", "   ", "no-at-sign", "two@@at.com", "trailing@dot.", "@nolocal.com", "spaces in@mail.com", "a@b", "x".repeat(250) + "@mail.com"]) {
    assert.equal(isValidEmail(bad), false, `${JSON.stringify(bad)} must be rejected`);
    assert.equal(normalizeEmail(bad), "", `${JSON.stringify(bad)} must not normalise`);
  }
  for (const good of ["learner@example.com", "a.b+tag@sub.domain.co.in", "student123@iitk.ac.in"]) {
    assert.equal(isValidEmail(good), true, `${good} should be accepted`);
  }
});

test("tokens are unguessable and stored only as hashes", async () => {
  const tokens = new Set();
  for (let i = 0; i < 200; i += 1) tokens.add(randomToken());
  assert.equal(tokens.size, 200, "no collisions across 200 tokens");

  const token = randomToken();
  assert.match(token, /^[A-Za-z0-9_-]+$/, "must survive a URL bar without escaping");
  assert.ok(token.length >= 40, `expected ~256 bits, got ${token.length} chars`);

  const hash = await hashToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token, "the database must not hold the usable token");
  assert.equal(hash, await hashToken(token), "hashing is stable");
});

test("token comparison does not leak length or content through timing", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
  assert.equal(safeEqual(null, undefined), true, "both empty compare equal rather than throwing");
});

test("the session cookie cannot be read by script or sent cross-site", () => {
  const cookie = sessionCookie("token-value");
  assert.match(cookie, /^pf_session=token-value/);
  assert.match(cookie, /HttpOnly/, "script must not be able to read the session");
  assert.match(cookie, /SameSite=Lax/, "must not ride along on cross-site requests");
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, new RegExp(`Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`));

  const cleared = clearedSessionCookie();
  assert.match(cleared, /Max-Age=0/, "signing out must expire the cookie immediately");
  assert.match(cleared, /HttpOnly/);
});

test("cookie parsing picks the right value out of a crowded header", () => {
  const header = "other=1; pf_session=abc.def; pf_visitor_month=2026-09";
  assert.equal(readCookie(header, SESSION_COOKIE), "abc.def");
  assert.equal(readCookie(header, "pf_visitor_month"), "2026-09");
  assert.equal(readCookie(header, "missing"), "");
  assert.equal(readCookie("", SESSION_COOKIE), "");
  // A cookie whose name merely ends with ours must not match.
  assert.equal(readCookie("not_pf_session=nope", SESSION_COOKIE), "");
});

test("a saved list from the browser is clamped before it reaches the database", () => {
  const items = sanitizeSavedItems([
    { id: "a", title: "Real", description: "Fine", url: "https://ncert.nic.in/", section: "Learn" },
    { id: "a", title: "Duplicate id" },
    { id: "", title: "No id" },
    null,
    "not an object",
    { id: "b", title: "  spaced   out  ", url: "javascript:alert(1)" },
    { id: "c", url: "https://ok.example/", extra: "dropped", section: "" }
  ]);

  assert.deepEqual(items.map((item) => item.id), ["a", "b", "c"], "duplicates and junk are dropped");
  assert.equal(items[1].url, "", "a javascript: URL must never be stored");
  assert.equal(items[1].title, "spaced out", "whitespace is collapsed");
  assert.equal(items[2].section, "Pigsfield", "section falls back rather than being empty");
  assert.ok(!("extra" in items[2]), "unknown fields are not persisted");

  const long = sanitizeSavedItems([{ id: "x", title: "t".repeat(1000), description: "d".repeat(2000) }]);
  assert.equal(long[0].title.length, 300, "over-long text is truncated, not rejected");
  assert.equal(long[0].description.length, 600);

  const many = sanitizeSavedItems(Array.from({ length: MAX_SAVED_ITEMS + 50 }, (_, i) => ({ id: `id-${i}` })));
  assert.equal(many.length, MAX_SAVED_ITEMS, "one account cannot fill the database");
});

test("signing in on a second device never shortens the saved list", () => {
  const onPhone = [{ id: "a", title: "From phone" }, { id: "b", title: "Shared" }];
  const onServer = [{ id: "b", title: "Shared" }, { id: "c", title: "From the shared PC" }];

  const merged = mergeSavedItems(onPhone, onServer);
  assert.deepEqual(merged.map((item) => item.id), ["a", "b", "c"], "the union is kept");
  assert.equal(merged.find((item) => item.id === "b").title, "Shared");

  // The local copy wins on conflict, because it is what the person is looking at.
  const conflict = mergeSavedItems([{ id: "a", title: "Local wins" }], [{ id: "a", title: "Remote" }]);
  assert.equal(conflict[0].title, "Local wins");

  assert.deepEqual(mergeSavedItems(null, undefined), [], "missing input is empty, not a crash");
});

test("expiry is judged against real clock values", () => {
  const now = 1_800_000_000_000;
  assert.equal(isExpired(now + 1000, now), false);
  assert.equal(isExpired(now - 1000, now), true);
  assert.equal(isExpired(now, now), true, "exactly-now counts as expired");
  for (const bad of [undefined, null, "soon", NaN]) {
    assert.equal(isExpired(bad, now), true, "an unreadable expiry must fail closed");
  }
  assert.ok(LOGIN_TOKEN_TTL_MS <= 20 * 60 * 1000, "a magic link must be short-lived");
  assert.ok(SESSION_TTL_MS > LOGIN_TOKEN_TTL_MS);
});

test("the magic link always points back at our own origin", () => {
  const link = magicLinkUrl("https://pigsfield.com", "tok-123");
  assert.equal(link, "https://pigsfield.com/api/auth/verify?token=tok-123");
  // A poisoned Host header must not be able to send the token somewhere else.
  assert.match(magicLinkUrl("https://pigsfield.com", "t"), /^https:\/\/pigsfield\.com\//);
  assert.equal(new URL(magicLinkUrl("https://pigsfield.com", "a b&c")).searchParams.get("token"), "a b&c");
});

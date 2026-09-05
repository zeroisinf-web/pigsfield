// Account core — the pure, testable half of optional sign-in.
//
// Pigsfield's whole pitch is "no Pigsfield account", and guest mode stays the default. An
// account exists for exactly one reason: a saved list that survives moving between a shared
// PC and a phone. Nothing else is gated behind it, ever.
//
// The design goal is that a full copy of this database is close to worthless.
//
//   * The email address is NEVER stored. A magic link is sent to the address the visitor
//     just typed, and that address exists only for the lifetime of that one request. What
//     persists is a peppered SHA-256 of it, which is enough to recognise the same person
//     signing in again and useless for contacting, profiling or selling to anyone.
//   * Tokens and session ids are stored hashed, so a database leak cannot be replayed to
//     log in as somebody.
//   * Nothing records what a visitor browsed. Only the list they explicitly saved.
//
// India's DPDP Act 2023 applies to a service handling personal data of people in India, and
// the cheapest way to honour it is to not hold the data in the first place.

const TOKEN_BYTES = 32;
export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000; // a magic link is single-use and short-lived
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000; // ~6 months, so a learner is not re-verifying constantly
export const SESSION_COOKIE = "pf_session";
export const MAX_SAVED_ITEMS = 500;

const encoder = new TextEncoder();

/** URL-safe base64 with no padding, so a token survives being pasted into an address bar. */
export function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalise then hash an email with a server-side pepper.
 *
 * The pepper matters: email addresses have far too little entropy to resist a dictionary
 * attack on a bare hash, so without it "hashed" would be theatre. It lives in a secret, not
 * in this repository, which means a stolen database alone cannot be reversed.
 */
export async function hashEmail(email, pepper) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("email is required");
  if (!pepper) throw new Error("ACCOUNT_PEPPER is not configured");
  return sha256Hex(`${pepper}:${normalized}`);
}

/** Hash a token for storage. No pepper needed: tokens are already 256 bits of randomness. */
export async function hashToken(token) {
  return sha256Hex(token);
}

/**
 * Lowercase and trim. Deliberately does NOT strip Gmail dots or +tags: treating
 * a.b@gmail.com and ab@gmail.com as one person is a guess, and guessing wrong merges two
 * people's saved lists.
 */
export function normalizeEmail(email) {
  const value = String(email == null ? "" : email).trim().toLowerCase();
  return isValidEmail(value) ? value : "";
}

export function isValidEmail(email) {
  const value = String(email == null ? "" : email).trim();
  if (value.length < 6 || value.length > 254) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  if (domain.length < 3 || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;
  if (domain.includes("..")) return false;
  return /^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
}

/** Constant-time compare, so a caller cannot learn a token by timing the failures. */
export function safeEqual(a, b) {
  const left = String(a == null ? "" : a);
  const right = String(b == null ? "" : b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export function sessionCookie(token, { maxAgeMs = SESSION_TTL_MS, secure = true } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearedSessionCookie({ secure = true } = {}) {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(header, name) {
  for (const pair of String(header == null ? "" : header).split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() === name) return pair.slice(index + 1).trim();
  }
  return "";
}

/**
 * Clamp an incoming saved list to what the schema promises.
 *
 * This runs on data a signed-in visitor POSTs, so it is the boundary between "their
 * browser" and "our database": unknown fields are dropped rather than stored, strings are
 * truncated rather than rejected (losing a long description is friendlier than losing the
 * save), and the list is capped so one account cannot fill the database.
 */
export function sanitizeSavedItems(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const items = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const id = clampText(raw.id, 200);
    if (!id || seen.has(id)) continue;
    const url = safeExternalUrl(raw.url);
    seen.add(id);
    items.push({
      id,
      title: clampText(raw.title, 300),
      description: clampText(raw.description, 600),
      url,
      section: clampText(raw.section, 120) || "Pigsfield"
    });
    if (items.length >= MAX_SAVED_ITEMS) break;
  }
  return items;
}

function clampText(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

/** Only http(s) survives. A stored javascript: URL would become stored XSS on re-render. */
function safeExternalUrl(value) {
  const text = clampText(value, 2000);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

/**
 * Merge the browser's list with the server's.
 *
 * Union rather than last-writer-wins: signing in on a new device must never be the reason
 * somebody's saved list gets shorter. Removals are a deliberate action and are synced by the
 * explicit write path, not inferred from an absence here.
 */
export function mergeSavedItems(local, remote) {
  const merged = [];
  const seen = new Set();
  for (const item of [...sanitizeSavedItems(local), ...sanitizeSavedItems(remote)]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
    if (merged.length >= MAX_SAVED_ITEMS) break;
  }
  return merged;
}

export function isExpired(expiresAtMs, nowMs) {
  return !Number.isFinite(Number(expiresAtMs)) || Number(expiresAtMs) <= nowMs;
}

/** The link that goes in the email. Same-origin only, so a poisoned Host cannot redirect it. */
export function magicLinkUrl(origin, token) {
  const url = new URL("/api/auth/verify", origin);
  url.searchParams.set("token", token);
  return url.href;
}

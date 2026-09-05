// Optional sign-in routes.
//
// Guest mode is the default and stays fully featured; these endpoints exist only so a saved
// list can follow someone between a shared PC and a phone. Every route degrades to a clear
// message when accounts are not configured, so the site works exactly as before on a
// deployment with no D1 database attached.
//
// Routes:
//   POST /api/auth/request   { email }  -> emails a magic link, always answers the same way
//   GET  /api/auth/verify    ?token=    -> sets the session cookie, redirects to /?signed-in
//   GET  /api/auth/session              -> { signedIn }
//   POST /api/auth/logout               -> clears the session
//   GET  /api/saved                     -> the saved list
//   PUT  /api/saved          { items }  -> replaces it, returning the merged union

import {
  LOGIN_TOKEN_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearedSessionCookie,
  hashEmail,
  hashToken,
  isExpired,
  isValidEmail,
  magicLinkUrl,
  mergeSavedItems,
  randomToken,
  readCookie,
  sanitizeSavedItems,
  sessionCookie
} from "./account-core.mjs";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

export function accountsEnabled(env) {
  return Boolean(env && env.DB && typeof env.DB.prepare === "function" && env.ACCOUNT_PEPPER);
}

/**
 * Send the magic link.
 *
 * Delivery is pluggable and refuses loudly when unset, because silently "succeeding" while
 * sending nothing is the worst failure mode here: the visitor waits for an email forever.
 */
async function sendMagicLink(env, email, link) {
  if (!env.RESEND_API_KEY || !env.ACCOUNT_FROM_EMAIL) {
    throw new Error("email delivery is not configured");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.ACCOUNT_FROM_EMAIL,
      to: [email],
      subject: "Your Pigsfield sign-in link",
      text: [
        "Open this link to sign in to Pigsfield:",
        "",
        link,
        "",
        "The link works once and expires in 15 minutes.",
        "If you did not ask to sign in, you can ignore this email — nothing was created.",
        "",
        "Pigsfield never stores your email address. https://pigsfield.com/privacy/"
      ].join("\n")
    })
  });
  if (!response.ok) throw new Error(`mail provider returned ${response.status}`);
}

async function currentAccountId(request, env, now) {
  const token = readCookie(request.headers.get("Cookie"), SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare("SELECT account_id, expires_at FROM sessions WHERE token_hash = ?")
    .bind(await hashToken(token))
    .first();
  if (!row || isExpired(row.expires_at, now)) return null;
  return row.account_id;
}

export async function handleAccountRoute(request, env, url, { now = Date.now(), secure = true } = {}) {
  const path = url.pathname;

  if (!accountsEnabled(env)) {
    // Not an error state: this is simply a deployment without accounts turned on.
    if (path === "/api/auth/session") return json({ signedIn: false, available: false });
    return json({ error: "Accounts are not enabled on this deployment. Everything works without one." }, 503);
  }

  if (path === "/api/auth/request") {
    if (request.method !== "POST") return json({ error: "Use POST." }, 405);
    let body = null;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Send JSON." }, 400);
    }
    const email = String((body && body.email) || "").trim();
    if (!isValidEmail(email)) return json({ error: "Enter a valid email address." }, 400);

    const token = randomToken();
    await env.DB.prepare("INSERT INTO login_tokens (token_hash, email_hash, expires_at) VALUES (?, ?, ?)")
      .bind(await hashToken(token), await hashEmail(email, env.ACCOUNT_PEPPER), now + LOGIN_TOKEN_TTL_MS)
      .run();

    try {
      await sendMagicLink(env, email, magicLinkUrl(url.origin, token));
    } catch (error) {
      return json({ error: "Sign-in email could not be sent right now. Please try again later." }, 503);
    }
    // Deliberately identical whether or not an account already exists, so this endpoint
    // cannot be used to test which addresses are registered.
    return json({ sent: true, message: "Check your email for a sign-in link. It expires in 15 minutes." });
  }

  if (path === "/api/auth/verify") {
    if (request.method !== "GET") return json({ error: "Use GET." }, 405);
    const token = url.searchParams.get("token") || "";
    if (!token) return json({ error: "This sign-in link is incomplete." }, 400);

    const tokenHash = await hashToken(token);
    const row = await env.DB.prepare("SELECT email_hash, expires_at, used_at FROM login_tokens WHERE token_hash = ?")
      .bind(tokenHash)
      .first();
    if (!row || row.used_at || isExpired(row.expires_at, now)) {
      return json({ error: "This sign-in link has already been used or has expired. Request a new one." }, 400);
    }
    await env.DB.prepare("UPDATE login_tokens SET used_at = ? WHERE token_hash = ?").bind(now, tokenHash).run();

    await env.DB.prepare(
      "INSERT INTO accounts (email_hash, created_at, last_seen_at) VALUES (?, ?, ?) " +
        "ON CONFLICT (email_hash) DO UPDATE SET last_seen_at = excluded.last_seen_at"
    )
      .bind(row.email_hash, now, now)
      .run();
    const account = await env.DB.prepare("SELECT id FROM accounts WHERE email_hash = ?").bind(row.email_hash).first();

    const session = randomToken();
    await env.DB.prepare("INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await hashToken(session), account.id, now, now + SESSION_TTL_MS)
      .run();

    return new Response(null, {
      status: 302,
      headers: { Location: "/?signed-in=1", "Set-Cookie": sessionCookie(session, { secure }), "Cache-Control": "no-store" }
    });
  }

  if (path === "/api/auth/session") {
    const accountId = await currentAccountId(request, env, now);
    return json({ signedIn: Boolean(accountId), available: true });
  }

  if (path === "/api/auth/logout") {
    if (request.method !== "POST") return json({ error: "Use POST." }, 405);
    const token = readCookie(request.headers.get("Cookie"), SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
    return json({ signedOut: true }, 200, { "Set-Cookie": clearedSessionCookie({ secure }) });
  }

  if (path === "/api/saved") {
    const accountId = await currentAccountId(request, env, now);
    if (!accountId) return json({ error: "Sign in to sync your saved list." }, 401);

    const read = async () => {
      const result = await env.DB.prepare(
        "SELECT item_id AS id, title, description, url, section FROM saved_items WHERE account_id = ? ORDER BY updated_at DESC"
      )
        .bind(accountId)
        .all();
      return sanitizeSavedItems((result && result.results) || []);
    };

    if (request.method === "GET") return json({ items: await read() });

    if (request.method === "PUT") {
      let body = null;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Send JSON." }, 400);
      }
      // Union with what is already stored: signing in on a second device must never be the
      // reason somebody's saved list gets shorter.
      const merged = mergeSavedItems((body && body.items) || [], await read());
      const statements = [env.DB.prepare("DELETE FROM saved_items WHERE account_id = ?").bind(accountId)];
      for (const item of merged) {
        statements.push(
          env.DB.prepare(
            "INSERT INTO saved_items (account_id, item_id, title, description, url, section, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(accountId, item.id, item.title, item.description, item.url, item.section, now)
        );
      }
      await env.DB.batch(statements);
      return json({ items: merged });
    }

    return json({ error: "Use GET or PUT." }, 405);
  }

  return json({ error: "API route not found." }, 404);
}

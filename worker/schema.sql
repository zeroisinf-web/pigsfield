-- Pigsfield optional accounts (Cloudflare D1)
--
--   npx wrangler d1 create pigsfield
--   npx wrangler d1 execute pigsfield --remote --file=worker/schema.sql
--
-- Deliberately small. An account exists so a saved list can follow someone from a shared PC
-- to a phone, and nothing else is gated behind it. There is no profile table, no activity
-- log, and no column anywhere holding an email address: see worker/account-core.mjs for why
-- only a peppered hash is kept.

CREATE TABLE IF NOT EXISTS accounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Peppered SHA-256 of the address. Enough to recognise a returning person, useless for
  -- contacting or profiling them, and not reversible without the ACCOUNT_PEPPER secret.
  email_hash   TEXT    NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- Magic links. Single-use and short-lived; the row is kept after use only long enough for
-- the cleanup sweep, so a replayed link is recognised as spent rather than simply missing.
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT    PRIMARY KEY,
  email_hash TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS login_tokens_expiry ON login_tokens (expires_at);

-- Sessions are stored hashed too, so a leaked database cannot be replayed as a login.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions (account_id);
CREATE INDEX IF NOT EXISTS sessions_expiry  ON sessions (expires_at);

-- The one thing an account is for. Mirrors the shape already held in localStorage under
-- pf-saved-v2, so guest mode and signed-in mode store exactly the same fields.
CREATE TABLE IF NOT EXISTS saved_items (
  account_id  INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  item_id     TEXT    NOT NULL,
  title       TEXT    NOT NULL DEFAULT '',
  description TEXT    NOT NULL DEFAULT '',
  url         TEXT    NOT NULL DEFAULT '',
  section     TEXT    NOT NULL DEFAULT 'Pigsfield',
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (account_id, item_id)
);

#!/usr/bin/env node
// Service worker cache-version stamper.
//
// sw.js precaches a small navigation shell and, on activate, deletes every cache whose name
// is not the current CACHE. That mechanism only works if CACHE actually changes when the
// shell changes. It was a hand-maintained "pigsfield-v19" and nobody bumped it, so after a
// stylesheet redesign shipped, returning visitors kept being served the old CSS out of a
// cache that was never discarded — the site looked unchanged in production while the server
// was serving the new file.
//
// The version is now a digest of the shell's actual bytes. Change any shell file and the
// cache name changes with it; change nothing and it stays stable, so this does not churn.
//
//   node tools/build-sw.mjs           stamp the digest
//   node tools/build-sw.mjs --check   exit 1 if sw.js is stale (used by the validator)

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SW = path.join(ROOT, "sw.js");
const PLACEHOLDER = "__SHELL_DIGEST__";

/** The files sw.js precaches, read out of the file itself so the two cannot drift. */
export function shellFiles(source) {
  const core = source.match(/const\s+CORE\s*=\s*\[([\s\S]*?)\];/)?.[1] || "";
  return [...core.matchAll(/["']([^"']+)["']/g)]
    .map((match) => match[1])
    .map((entry) => (entry === "./" ? "index.html" : entry.replace(/^\.\//, "")));
}

/**
 * Digest of the shell's contents plus the worker's own logic.
 *
 * sw.js is included deliberately: a change to the caching strategy has to invalidate old
 * caches too, or visitors keep running the previous worker's behaviour against them.
 */
export function shellDigest(root = ROOT) {
  const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const hash = crypto.createHash("sha256");
  for (const file of shellFiles(source)) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(root, file)));
  }
  // Hash the worker with any existing digest blanked, so stamping is idempotent.
  hash.update(source.replace(/const CACHE = "pigsfield-[^"]*";/, `const CACHE = "pigsfield-${PLACEHOLDER}";`));
  return hash.digest("hex").slice(0, 12);
}

export function stamp(root = ROOT) {
  const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  return source.replace(/const CACHE = "pigsfield-[^"]*";/, `const CACHE = "pigsfield-${shellDigest(root)}";`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const next = stamp();
  const current = fs.readFileSync(SW, "utf8");
  if (process.argv.includes("--check")) {
    if (current !== next) {
      console.error('sw.js cache version is stale — returning visitors would keep the previous shell.\nRun: npm run build:sw');
      process.exitCode = 1;
    } else {
      console.log(`sw.js cache version matches the shell (${shellDigest()}).`);
    }
  } else {
    fs.writeFileSync(SW, next, "utf8");
    console.log(`Stamped sw.js with cache version pigsfield-${shellDigest()}.`);
  }
}

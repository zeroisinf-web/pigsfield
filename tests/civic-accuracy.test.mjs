// Accuracy checks for the civic catalogue.
//
// Wrong information on /rights/ costs a reader money or a legal deadline, so the facts
// that are cheap to verify are pinned here rather than left to the next manual review.
// These are deliberately narrow: each one encodes something a primary source states.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function catalog() {
  const context = vm.createContext({ window: {} });
  for (const name of ["school", "teach", "tools", "exams", "pigbang", "govt"]) {
    new vm.Script(fs.readFileSync(path.join(ROOT, "js", "data", `${name}.js`), "utf8")).runInContext(context);
  }
  return context.window.PF_DATA;
}

function everyNode(data) {
  const out = [];
  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    out.push(node);
    Object.values(node).forEach(walk);
  })(data);
  return out;
}

function everyUrl(data) {
  const out = [];
  (function walk(node) {
    if (typeof node === "string") {
      if (/^https?:\/\//i.test(node.trim())) out.push(node.trim());
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") Object.values(node).forEach(walk);
  })(data);
  return out;
}

test("no placeholder YouTube video ids reach the catalogue", () => {
  // js/data/govt.js shipped "watch?v=how_to_file_rti_hindi" — a description where an id
  // belongs, so the link could never have worked. Real ids are exactly 11 characters of
  // [A-Za-z0-9_-], which is cheap to assert and catches the whole class of mistake.
  const bad = [];
  for (const url of everyUrl(catalog())) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const host = parsed.hostname.replace(/^www\./, "");
    let id = null;
    if ((host === "youtube.com" || host === "m.youtube.com") && parsed.pathname === "/watch") id = parsed.searchParams.get("v");
    else if (host === "youtu.be") id = parsed.pathname.slice(1);
    if (id && !/^[A-Za-z0-9_-]{11}$/.test(id)) bad.push(url);
  }
  assert.deepEqual(bad, [], `these are not real YouTube video ids:\n${bad.join("\n")}`);
});

test("RTI Online carries the central-government-only warning, where the money is at risk", () => {
  // rtionline.gov.in states: "Please do not file RTI applications through this portal for
  // the public authorities under the State Governments, including Government of NCT Delhi.
  // If filed, the application would be returned, without refund of amount."
  const rti = everyNode(catalog().govt).find((node) => typeof node.title === "string" && /RTI\s*—\s*सूचना का अधिकार/.test(node.title));
  assert.ok(rti, "the RTI entry is missing from js/data/govt.js");
  assert.ok(rti.warning, "the RTI entry must carry a visible warning about the portal's scope");
  assert.match(rti.warning, /rtionline\.gov\.in/, "the warning must name the portal it applies to");
  assert.match(rti.warning, /केंद्र सरकार|Central Government/, "the warning must say the portal is central-government only");
  assert.match(rti.warning, /वापस|refund/, "the warning must say a state application is returned without a refund");
});

test("the CIC contact matches the Commission's own published facilitation desk", () => {
  // cic.gov.in/contact: "Facilitation Desk : Tel.: 011-26183053/26767500".
  // The catalogue previously listed 011-23404900, which the Commission does not publish.
  const source = fs.readFileSync(path.join(ROOT, "js", "data", "govt.js"), "utf8");
  assert.match(source, /011-26183053/, "the current CIC facilitation desk number must be present");
  assert.doesNotMatch(source, /011-23404900/, "the superseded CIC number must not return");
});

test("catalogue warnings render above the fold of a card, not inside the collapsed guide", () => {
  const source = fs.readFileSync(path.join(ROOT, "tools", "build-topics.mjs"), "utf8");
  // A warning a reader has to open a <details> to find is not a warning.
  assert.match(source, /item\.warning \? `<p class="resource-warning" role="note">\$\{esc\(item\.warning\)\}<\/p>`/, "warnings must render as their own element on the card");
  const card = source.match(/return `<article class="topic-item"[\s\S]*?<\/article>`;/)?.[0] || "";
  assert.ok(card, "the generated card markup was not found");
  const warningAt = card.indexOf("resource-warning");
  const guideAt = card.indexOf("renderExtra");
  assert.ok(warningAt !== -1 && guideAt !== -1, "card must contain both the warning slot and the practical guide");
  assert.ok(warningAt < guideAt, "the warning must come before the collapsible practical guide");

  // And it has to survive into the page a reader actually gets.
  const page = fs.readFileSync(path.join(ROOT, "rights", "information-and-records", "index.html"), "utf8");
  const article = page.match(/<article class="topic-item"[^>]*>[\s\S]*?resource-warning[\s\S]*?<\/article>/)?.[0] || "";
  assert.ok(article, "no generated card carries a warning any more");
  assert.ok(article.indexOf("resource-warning") < article.indexOf("Practical guide"), "a served warning must precede the practical guide");
});

test("every catalogue warning is styled to be seen in both themes", () => {
  const css = fs.readFileSync(path.join(ROOT, "css", "site.css"), "utf8");
  assert.match(css, /\.resource-warning\s*\{/, "missing .resource-warning styling");
  assert.match(css, /\[data-theme="dark"\]\s*\.resource-warning\s*\{/, "warnings need a dark-theme treatment too");
});

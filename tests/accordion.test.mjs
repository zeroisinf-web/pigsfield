import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Normalize CRLF so the source-slice markers below match on Windows checkouts too.
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8").replace(/\r\n/g, "\n");

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  contains(value) { return this.values.has(value); }
}

class FakeStyle {
  removeProperty() {}
}

class FakeElement {
  constructor(tagName, classes = []) {
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList(classes);
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.style = new FakeStyle();
    this.open = false;
    this.scrollHeight = 240;
    this.offsetHeight = 240;
    this.clientHeight = 238;
  }
  append(...children) {
    children.forEach((child) => { child.parentElement = this; this.children.push(child); });
    return this;
  }
  setAttribute(name, value = "") { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  closest(selector) {
    if (selector !== "[data-accordion-scope]") return null;
    let current = this;
    while (current) {
      if (current.hasAttribute("data-accordion-scope")) return current;
      current = current.parentElement;
    }
    return null;
  }
  querySelectorAll(selector) {
    if (selector !== "details") return [];
    const output = [];
    const visit = (node) => node.children.forEach((child) => {
      if (child.tagName === "DETAILS") output.push(child);
      visit(child);
    });
    visit(this);
    return output;
  }
  getBoundingClientRect() { return { height: this.tagName === "SUMMARY" ? 72 : this.offsetHeight, top: 120 }; }
}

class FakeDetailsElement extends FakeElement {
  constructor(classes = []) {
    super("details", classes);
    this.append(new FakeElement("summary"), new FakeElement("div"));
  }
}

function loadAccordionRuntime() {
  const source = read("js/site.js");
  const start = source.indexOf("  const detailsMotion = new WeakMap()");
  const end = source.indexOf("\n\n  function bindUi", start);
  assert.notEqual(start, -1, "shared accordion runtime start marker is missing");
  assert.notEqual(end, -1, "shared accordion runtime end marker is missing");

  const document = new FakeElement("document");
  document.addEventListener = () => {};
  const context = vm.createContext({
    HTMLDetailsElement: FakeDetailsElement,
    Node: { ELEMENT_NODE: 1 },
    document,
    setTimeout: () => 1,
    clearTimeout: () => {},
    window: {
      CSS: { supports: () => true },
      matchMedia: () => ({ matches: false }),
      getComputedStyle: () => ({ borderTopWidth: "1", borderBottomWidth: "1" }),
      requestAnimationFrame: (callback) => { callback(); return 1; },
      cancelAnimationFrame: () => {},
      scrollBy: () => {}
    }
  });
  new vm.Script(
    `const PF = {}; const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));\n${source.slice(start, end)}\nglobalThis.PF = PF;`,
    { filename: "js/site.js#accordions" }
  ).runInContext(context);
  return context.PF;
}

test("one peer opens at a time while nested accordion scopes remain independent", () => {
  const PF = loadAccordionRuntime();
  const sections = new FakeElement("div");
  sections.setAttribute("data-accordion-scope", "");
  const first = new FakeDetailsElement(["exam-panel"]);
  const second = new FakeDetailsElement(["exam-panel"]);
  sections.append(first, second);

  PF.initializeAccordions(sections);
  assert.equal(first.open, false);
  assert.equal(second.open, false);

  PF.setDetailsOpen(first, true);
  assert.equal(first.open, true);
  assert.equal(second.open, false);
  PF.setDetailsOpen(second, true);
  assert.equal(first.open, false);
  assert.equal(second.open, true);

  const groups = new FakeElement("div");
  groups.setAttribute("data-accordion-scope", "");
  const groupOne = new FakeDetailsElement(["faq-item"]);
  const groupTwo = new FakeDetailsElement(["faq-item"]);
  groups.append(groupOne, groupTwo);
  second.children[1].append(groups);
  PF.initializeAccordions(groups);
  PF.setDetailsOpen(groupOne, true);
  PF.setDetailsOpen(groupTwo, true);
  assert.equal(second.open, true, "nested categories must not close their parent section");
  assert.equal(groupOne.open, false);
  assert.equal(groupTwo.open, true);
});

test("every authored accordion is closed and expand-all controls cannot return", () => {
  const runtimeFiles = [
    "index.html", "learn/index.html", "skills/index.html", "tools/index.html", "rights/index.html", "exams/index.html",
    "js/exams-page.js"
  ];
  for (const file of runtimeFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /<details\b[^>]*\sopen(?:\s|=|>)/i, `${file} must author details closed`);
    assert.doesNotMatch(source, /\b(?:Expand all|Collapse all|catalog-expand|data-expand-groups|data-expand-exams)\b/i, `${file} must not bypass one-open accordion behavior`);
  }
});

test("exams and the FAQ declare separate accordion scopes", () => {
  assert.match(read("index.html"), /class="faq-list"\s+data-accordion-scope/);
  assert.match(read("js/exams-page.js"), /class="exam-stack"[^>]*data-accordion-scope/);
});

test("a practical guide on a generated page stays an independent disclosure", () => {
  // The hubs used to hold the only copy of these notes, inside a catalogue card. They are
  // authored into the topic pages now, and they must still open without closing a sibling.
  const page = read("rights/information-and-records/index.html");
  assert.match(page, /<details class="resource-links resource-notes"><summary>Practical guide<\/summary>/);
  assert.doesNotMatch(page, /<details\b[^>]*\sopen(?:\s|=|>)/i);
});

test("sticky summaries and motion keep accessibility fallbacks", () => {
  const css = read("css/site.css");
  const site = read("js/site.js");
  assert.match(css, /\.exam-panel\[open\]\s*>\s*summary[\s\S]{0,500}position:\s*sticky/);
  assert.match(css, /\.faq-item\[open\]\s*>\s*summary/);
  assert.doesNotMatch(css, /\.resource-links\[open\]\s*>\s*summary\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /@supports\s+selector\(details::details-content\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(site, /document\.addEventListener\("click",\s*handleSummaryActivation\)/);
  assert.match(site, /new MutationObserver\(/);
  assert.match(site, /details\.animate\(/);
  assert.match(site, /prefers-reduced-motion:\s*reduce/);
  assert.match(site, /classList\.contains\("resource-notes"\)/);
});

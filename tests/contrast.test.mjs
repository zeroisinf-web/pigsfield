// Colour-contrast checks for solid accent fills.
//
// These regressed silently once already. The accent tokens get *lighter* in dark mode —
// correct for text on a dark page — but the solid buttons hardcoded `color: #fff`, so the
// label ended up light-on-light: .button.brand measured 2.64:1 and .button.secondary
// 2.14:1, both far below the 4.5:1 WCAG AA needs for normal text. Nothing caught it,
// because contrast is the one visual property a screenshot review reliably misses.
//
// So the ratios are computed here from the tokens in css/site.css. A palette change that
// breaks a label now fails the build instead of shipping.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(ROOT, "css", "site.css"), "utf8").replace(/\r\n/g, "\n");

const AA_NORMAL = 4.5;

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function rgb(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** srgb color-mix, which is a straight linear blend — matches how the browser resolves it. */
function mix(a, b, weightA) {
  return a.map((channelValue, index) => Math.round(channelValue * weightA + b[index] * (1 - weightA)));
}

/** Read a custom property out of a specific rule block in css/site.css. */
function token(selector, name) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `no "${selector}" block in css/site.css`);
  const block = css.slice(start, css.indexOf("\n}", start));
  const found = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(found, `${selector} does not define --${name}`);
  return found[1].trim();
}

// The three palettes the site actually paints with.
const THEMES = {
  light: ":root",
  dark: '[data-theme="dark"]',
  watch: 'body[data-page="watch"]'
};

function palette(theme) {
  const selector = THEMES[theme];
  const brand = theme === "light" ? token(":root", "brand") : token(selector, "brand");
  const brandDeep = theme === "light" ? token(":root", "brand-deep") : token(selector, "brand-deep");
  const green = theme === "light" ? token(":root", "green") : token(selector, "green");
  // --fill-ink is defined once on :root and deliberately not theme-swapped.
  const fillInk = token(":root", "fill-ink");
  const onBrandRaw = theme === "light" ? token(":root", "on-brand") : token(selector, "on-brand");
  const onGreenRaw = theme === "light" ? token(":root", "on-green") : token(selector, "on-green");
  const resolve = (value) => (value.includes("--fill-ink") ? fillInk : value);
  return {
    brand: rgb(brand),
    brandDeep: rgb(brandDeep),
    green: rgb(green),
    onBrand: rgb(resolve(onBrandRaw) === "#fff" ? "#ffffff" : resolve(onBrandRaw)),
    onGreen: rgb(resolve(onGreenRaw) === "#fff" ? "#ffffff" : resolve(onGreenRaw))
  };
}

test("--fill-ink is legible on every bright accent in every theme", () => {
  for (const theme of Object.keys(THEMES)) {
    const p = palette(theme);
    // Only assert where the fill is actually bright; a dark fill correctly keeps white.
    for (const [name, fill, label] of [
      ["brand", p.brand, p.onBrand],
      ["green", p.green, p.onGreen]
    ]) {
      const ratio = contrast(label, fill);
      assert.ok(
        ratio >= AA_NORMAL,
        `${theme} .button on --${name} is ${ratio.toFixed(2)}:1; WCAG AA needs ${AA_NORMAL}:1`
      );
    }
  }
});

test("the featured path card stays legible across its whole gradient", () => {
  // background: linear-gradient(145deg, color-mix(brand 88%, #ffb26b), color-mix(brand 70%, brand-deep))
  const rule = css.slice(css.indexOf(".path-card.featured {"));
  assert.match(rule, /color-mix\(in srgb, var\(--brand\) 88%, #ffb26b\)/, "bright stop changed — recheck contrast");
  assert.match(rule, /color-mix\(in srgb, var\(--brand\) 70%, var\(--brand-deep\)\)/, "deep stop changed — recheck contrast");

  for (const theme of Object.keys(THEMES)) {
    const p = palette(theme);
    const stops = { bright: mix(p.brand, rgb("#ffb26b"), 0.88), deep: mix(p.brand, p.brandDeep, 0.7) };
    for (const [where, stop] of Object.entries(stops)) {
      const ratio = contrast(p.onBrand, stop);
      assert.ok(
        ratio >= AA_NORMAL,
        `${theme} featured card label over the ${where} gradient stop is ${ratio.toFixed(2)}:1; needs ${AA_NORMAL}:1`
      );
    }
  }
});

test("no solid accent fill hardcodes a white label again", () => {
  // This is the exact shape of the original defect.
  const offenders = [...css.matchAll(/^([^\n{]*\{[^}]*background:\s*var\(--(?:brand|green)(?:-deep)?\)[^}]*\})/gm)]
    .map((match) => match[1])
    .filter((rule) => /color:\s*#fff\b/i.test(rule));
  assert.deepEqual(offenders, [], `these fills still hardcode white:\n${offenders.join("\n")}`);
});

test("the contrast helper matches known WCAG values", () => {
  // Guards the maths itself, so a broken helper cannot make the checks above pass.
  assert.equal(contrast(rgb("#ffffff"), rgb("#000000")).toFixed(0), "21");
  assert.equal(contrast(rgb("#ffffff"), rgb("#ffffff")).toFixed(0), "1");
  // The two ratios that started this: white on the old brand fills.
  assert.ok(Math.abs(contrast(rgb("#ffffff"), rgb("#ef5d44")) - 3.32) < 0.02);
  assert.ok(Math.abs(contrast(rgb("#ffffff"), rgb("#ff755e")) - 2.64) < 0.02);
});

test("no later rule outranks an inverted card and strands its light text", () => {
  // The second shape this defect takes: not a wrong colour, a lost background.
  //
  // A redesign pass added `.section.band .path-card { background: var(--paper) }`. Two
  // classes and an element outrank `.path-card.featured` and
  // `.path-card[data-pigbang-link]` however the file is ordered, so those cards kept their
  // near-white text and lost the dark fill under it: the PigBang and Competitive Exams
  // headings shipped as white-on-cream, unreadable, and no token check could see it because
  // every token involved was correct.
  //
  // Any default for these cards belongs on `.path-card` at one class, where the inverted
  // variants can still win.
  const variants = [".featured", "[data-pigbang-link]"];
  /** Class + attribute + pseudo-class count — the middle column of CSS specificity. */
  const rank = (selector) => (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[a-z-]+(?:\([^)]*\))?/g) || []).length;

  // Scan declaration blocks rather than pattern-matching them: a rule preceded by a comment
  // or sitting inside a media query still has to be seen.
  const offenders = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of source.split("}")) {
    const brace = block.indexOf("{");
    if (brace < 0) continue;
    const selectorList = block.slice(0, brace).split(/[{@]/).pop();
    const body = block.slice(brace + 1);
    if (!/(?:^|[\s;])background(?:-color|-image)?\s*:/.test(body)) continue;
    for (const selector of selectorList.split(",").map((part) => part.trim())) {
      if (!selector.includes(".path-card")) continue;
      // Only rules whose subject is the card itself can replace the card's own background.
      const subject = selector.split(/\s*[>+~]\s*|\s+/).pop() || "";
      if (!subject.includes(".path-card")) continue;
      if (variants.some((variant) => subject.includes(variant))) continue;
      if (rank(selector) > 1) offenders.push(selector);
    }
  }
  assert.deepEqual(offenders, [], `these rules outrank an inverted path card's background:\n${offenders.join("\n")}`);
});

#!/usr/bin/env node
// AI Studio prerender
//
// /ai/ shipped an empty mount that js/ai-studio.js filled in the browser, so its tool
// directory — ChatGPT, Claude, Gemini, NotebookLM, Sarvam's Indus and the rest, each with a
// "Use" and a "Learn" link — was invisible to every crawler that runs no JavaScript. This
// evaluates the same js/ai-studio.js and writes its studio markup into the page; the script
// finds it there and binds it instead of drawing it again. The live model rankings still
// arrive at runtime.
//
//   node tools/build-ai.mjs           rewrite ai/index.html
//   node tools/build-ai.mjs --check   exit 1 if ai/index.html is stale

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "ai", "index.html");
const START = "<!--pf:ai:start-->";
const END = "<!--pf:ai:end-->";

export function renderStudio(root = ROOT) {
  const document = {
    documentElement: { getAttribute: () => "../" },
    querySelector: () => ({}),
    head: { append() {} },
    readyState: "loading",
    addEventListener() {}
  };
  const window = { PF: {}, addEventListener() {} };
  const context = vm.createContext({ window, document, location: { origin: "https://pigsfield.com" } });
  vm.runInContext(fs.readFileSync(path.join(root, "js", "ai-studio.js"), "utf8"), context);
  if (typeof window.PF.aiStudioMarkup !== "string") throw new Error("js/ai-studio.js no longer exposes PF.aiStudioMarkup");
  return window.PF.aiStudioMarkup.trim();
}

const comparable = (html) => html.replace(/\?v=[a-f0-9]{12}(?=["'])/g, "");

export function build({ root = ROOT, check = false } = {}) {
  const page = fs.readFileSync(PAGE, "utf8");
  const start = page.indexOf(START);
  const end = page.indexOf(END);
  if (start < 0 || end < start) throw new Error(`ai/index.html has no ${START} … ${END} markers`);
  const next = `${page.slice(0, start)}${START}${renderStudio(root)}${page.slice(end)}`;
  if (comparable(next) === comparable(page)) return { stale: false };
  if (!check) fs.writeFileSync(PAGE, next, "utf8");
  return { stale: check };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const { stale } = build({ check });
  if (stale) {
    console.error("ai/index.html is stale. Run: npm run build:ai");
    process.exitCode = 1;
  } else {
    console.log(check ? "AI Studio markup is current." : "Wrote the AI Studio markup into ai/index.html.");
  }
}

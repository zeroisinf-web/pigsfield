import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Normalize CRLF so the source-slice markers below match on Windows checkouts too.
const readSource = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8").replace(/\r\n/g, "\n");
const siteSource = readSource("js", "site.js");

function loadResourceResolver() {
  const start = siteSource.indexOf("  const RESOURCE_ORGANIZATIONS");
  const end = siteSource.indexOf("\n\n  function readJson", start);
  assert.notEqual(start, -1, "resource resolver start marker is missing");
  assert.notEqual(end, -1, "resource resolver end marker is missing");

  const context = vm.createContext({
    URL,
    location: { href: "https://pigsfield.com/learn/" }
  });
  new vm.Script(
    `const PF = {};\n${siteSource.slice(start, end)}\nglobalThis.PF = PF;`,
    { filename: "js/site.js#resource-symbol-resolver" }
  ).runInContext(context);
  return context.PF;
}

const PF = loadResourceResolver();

test("same organization and resource stay stable across URL order and prose changes", () => {
  const first = PF.resourceIdentityFor({
    title: "NCERT Textbooks, Videos & Apps",
    description: "Select a class and subject.",
    context: "Primary school science",
    urls: [
      "https://ncert.nic.in/textbook.php",
      "https://www.youtube.com/@ncertofficial/playlists"
    ],
    type: "book"
  });
  const second = PF.resourceIdentityFor({
    title: "NCERT Textbooks, Videos & Apps",
    description: "Also compare presentation styles from Netflix and Coursera.",
    context: "A differently worded editorial note",
    urls: [
      "https://youtube.com/@ncertofficial/playlists",
      "https://www.ncert.nic.in/textbook.php"
    ],
    type: "book"
  });

  assert.equal(first.key, "ncert");
  assert.equal(first.symbol, "📚");
  assert.equal(second.key, first.key);
  assert.equal(second.symbol, first.symbol);

  const independent = PF.resourceIdentityFor({
    title: "Algebra Atlas",
    description: "A Netflix mention in prose must not rebrand this resource.",
    context: "Coursera may be mentioned by an editor later.",
    urls: ["https://lessons.algebra-atlas.org/start"],
    type: "website"
  });
  assert.equal(independent.key, "algebra-atlas.org");
  assert.equal(independent.symbol, "➗");
});

test("generic YouTube hosting does not replace logical content topics", () => {
  const mathematics = PF.resourceIdentityFor({
    title: "Geometry lessons",
    description: "A visual course.",
    urls: ["https://youtube.com/@geometrylessons"],
    type: "video"
  });
  const science = PF.resourceIdentityFor({
    title: "Chemistry experiments",
    description: "A laboratory series.",
    urls: ["https://youtu.be/dQw4w9WgXcQ"],
    type: "video"
  });

  assert.equal(mathematics.key, "geometry-lessons");
  assert.equal(mathematics.symbol, "➗");
  assert.equal(science.key, "chemistry-experiments");
  assert.equal(science.symbol, "🔬");
  assert.notEqual(mathematics.symbol, science.symbol);
});

test("card indexes and legacy seeds cannot affect resource identity", () => {
  const canonical = {
    title: "StoryBots",
    urls: ["https://www.netflix.com/title/80108159"],
    type: "video"
  };
  const first = PF.resourceIdentityFor({ ...canonical, id: "storybots-movies-1", itemIndex: 0 });
  const second = PF.resourceIdentityFor({ ...canonical, id: "storybots-movies-999", itemIndex: 998 });

  assert.equal(first.key, second.key);
  assert.equal(first.symbol, second.symbol);
  assert.equal(PF.resourceEmoji("Mathematics practice", "resource-1", "video"), PF.resourceEmoji("Mathematics practice", "resource-999", "video"));
});

test("catalog and PigBang share one resolver and emit one main content symbol", () => {
  const renderers = [
    ["catalog.js", "resourceSymbol"],
    ["watch.js", "watchSymbol"]
  ];

  for (const [fileName, functionName] of renderers) {
    const source = readSource("js", fileName);
    const body = source.match(new RegExp(`function\\s+${functionName}\\(entry\\)\\s*\\{([\\s\\S]*?)\\n  \\}`))?.[1] || "";
    assert.match(body, /PF\.resourceSymbolFor\s*\(/, `${fileName} must use the shared resolver`);
    assert.match(body, /\btitle\s*:/, `${fileName} must provide a canonical title`);
    assert.match(body, /\burls\s*:/, `${fileName} must provide original URLs`);
    assert.doesNotMatch(body, /entry\.id|itemIndex|sectionIndex|groupIndex/, `${fileName} must not seed symbols with card position`);
    assert.equal((source.match(/resource-emoji-card/g) || []).length, 1, `${fileName} must emit one main content symbol`);
    assert.doesNotMatch(source, /installResourceEmojiPicker|function\s+resourceEmoji/, `${fileName} must not duplicate the shared mapping`);
  }
});

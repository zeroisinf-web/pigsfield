import assert from "node:assert/strict";
import test from "node:test";

import { derivedPosterCandidates, extractPosterUrl, handlePoster, posterTarget } from "../worker/poster.mjs";

const PNG = new Uint8Array(1024).fill(7).buffer;

/** A fetch stand-in that answers from a table and records what was asked for. */
function stubFetch(table) {
  const asked = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    asked.push(url);
    const answer = typeof table === "function" ? table(url, init) : table[url];
    if (!answer) return new Response(null, { status: 404 });
    if (answer instanceof Response) return answer;
    return new Response(answer.body ?? null, {
      status: answer.status ?? 200,
      headers: answer.headers || {}
    });
  };
  return asked;
}

function posterRequest(target, init = {}) {
  const url = new URL(`https://pigsfield.com/api/poster?u=${encodeURIComponent(target)}`);
  return [new Request(url, { method: "GET", ...init }), {}, url];
}

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

test("only public https pages are accepted as poster targets", () => {
  assert.ok(posterTarget("https://www.netflix.com/in/title/80108159"));
  assert.ok(posterTarget("https://archive.org/details/Leapfrogripcollection"));

  for (const rejected of [
    "http://www.netflix.com/in/title/1",     // plaintext
    "https://localhost/secret",              // single label
    "https://metadata.internal/creds",       // internal suffix
    "https://127.0.0.1/",                    // loopback literal
    "https://169.254.169.254/latest/meta-data/", // cloud metadata literal
    "https://[::1]/",                        // IPv6 literal
    "https://user:pass@example.com/",        // credentials
    "https://example.com:8080/",             // non-default port
    "file:///etc/passwd",
    "data:text/html,<script>alert(1)</script>",
    "https://pigsfield.com/api/poster?u=https%3A%2F%2Fexample.com", // no recursion
    ""
  ]) {
    assert.equal(posterTarget(rejected), null, `${rejected || "(empty)"} must be rejected`);
  }
});

test("cover art addressable from the link alone skips reading a page", () => {
  assert.deepEqual(
    derivedPosterCandidates(new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ")),
    ["https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg", "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg"]
  );
  assert.deepEqual(
    derivedPosterCandidates(new URL("https://archive.org/details/Leapfrogripcollection")),
    ["https://archive.org/services/img/Leapfrogripcollection"]
  );
  assert.deepEqual(
    derivedPosterCandidates(new URL("https://store.steampowered.com/app/413150/Stardew_Valley/")),
    ["https://cdn.cloudflare.steamstatic.com/steam/apps/413150/header.jpg"]
  );
  // A channel has no derivable thumbnail; it has to come from the page's own metadata.
  assert.deepEqual(derivedPosterCandidates(new URL("https://www.youtube.com/@DiscoverAgriculture")), []);
});

test("link-preview metadata is read in the order providers actually publish it", () => {
  const page = "https://www.hotstar.com/in/movies/the-jungle-book/1260018310";
  assert.equal(
    extractPosterUrl('<meta property="og:image" content="https://img.hotstar.com/jungle.jpg">', page),
    "https://img.hotstar.com/jungle.jpg"
  );
  // Attribute order is not guaranteed, and entities are escaped in real markup.
  assert.equal(
    extractPosterUrl('<meta content="https://img.hotstar.com/a.jpg?w=1&amp;h=2" property="og:image">', page),
    "https://img.hotstar.com/a.jpg?w=1&h=2"
  );
  assert.equal(
    extractPosterUrl('<meta name="twitter:image" content="/relative/cover.png">', page),
    "https://www.hotstar.com/relative/cover.png"
  );
  // A poster URL is attacker-influenced too, so it goes through the same gate.
  assert.equal(extractPosterUrl('<meta property="og:image" content="http://127.0.0.1/x.png">', page), "");
  assert.equal(extractPosterUrl("<p>no metadata here</p>", page), "");
});

test("a YouTube entry is answered from the thumbnail service, not by reading YouTube", async () => {
  const asked = stubFetch({
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg": { body: PNG, headers: { "Content-Type": "image/jpeg" } }
  });
  const response = await handlePoster(...posterRequest("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.match(response.headers.get("Cache-Control"), /max-age=2592000/);
  assert.equal(response.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
  assert.deepEqual(asked, ["https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"]);
});

test("an old upload with no maxres falls back to the size YouTube guarantees", async () => {
  const asked = stubFetch({
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg": { body: PNG, headers: { "Content-Type": "image/jpeg" } }
  });
  const response = await handlePoster(...posterRequest("https://youtu.be/dQw4w9WgXcQ"));
  assert.equal(response.status, 200);
  assert.equal(asked.length, 2, "maxres is tried first, then the guaranteed size");
});

test("a streaming title is answered from the page's own link-preview image", async () => {
  const asked = stubFetch({
    "https://www.netflix.com/in/title/80108159": {
      body: '<html><head><meta property="og:image" content="https://occ.nflximg.net/storybots.jpg"></head>',
      headers: { "Content-Type": "text/html; charset=utf-8" }
    },
    "https://occ.nflximg.net/storybots.jpg": { body: PNG, headers: { "Content-Type": "image/jpeg" } }
  });
  const response = await handlePoster(...posterRequest("https://www.netflix.com/in/title/80108159"));
  assert.equal(response.status, 200);
  assert.deepEqual(asked, ["https://www.netflix.com/in/title/80108159", "https://occ.nflximg.net/storybots.jpg"]);
});

test("a provider that publishes nothing usable answers 404, so the card keeps its symbol", async () => {
  stubFetch({});
  const response = await handlePoster(...posterRequest("https://www.example.org/title/1"));
  assert.equal(response.status, 404);
  // Short, so a provider outage is not remembered for the poster lifetime.
  assert.match(response.headers.get("Cache-Control"), /max-age=21600/);
});

test("a non-image answer is never passed through as one", async () => {
  stubFetch({
    "https://www.example.org/title/1": {
      body: '<html><head><meta property="og:image" content="https://www.example.org/tracker">',
      headers: { "Content-Type": "text/html" }
    },
    // An HTML page dressed as a poster, and an SVG, which is a document with a script surface.
    "https://www.example.org/tracker": { body: "<html>gotcha</html>", headers: { "Content-Type": "text/html" } }
  });
  assert.equal((await handlePoster(...posterRequest("https://www.example.org/title/1"))).status, 404);

  stubFetch({
    "https://www.example.org/title/2": {
      body: '<html><head><meta property="og:image" content="https://www.example.org/x.svg">',
      headers: { "Content-Type": "text/html" }
    },
    "https://www.example.org/x.svg": { body: "<svg onload='x()'/>", headers: { "Content-Type": "image/svg+xml" } }
  });
  assert.equal((await handlePoster(...posterRequest("https://www.example.org/title/2"))).status, 404);
});

test("an oversized image is refused rather than streamed through the Worker", async () => {
  stubFetch({
    "https://www.example.org/title/1": {
      body: '<meta property="og:image" content="https://www.example.org/huge.jpg">',
      headers: { "Content-Type": "text/html" }
    },
    "https://www.example.org/huge.jpg": {
      body: PNG,
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(8 * 1024 * 1024) }
    }
  });
  assert.equal((await handlePoster(...posterRequest("https://www.example.org/title/1"))).status, 404);
});

test("a rejected target never reaches the network", async () => {
  const asked = stubFetch({});
  const url = new URL("https://pigsfield.com/api/poster?u=http%3A%2F%2F169.254.169.254%2F");
  const response = await handlePoster(new Request(url), {}, url);
  assert.equal(response.status, 400);
  assert.deepEqual(asked, [], "no fetch may be made for a target that failed the gate");
});

test("only GET and HEAD are answered", async () => {
  const url = new URL("https://pigsfield.com/api/poster?u=https%3A%2F%2Fexample.org%2Fa");
  const response = await handlePoster(new Request(url, { method: "POST" }), {}, url);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET, HEAD");
});

test("the per-address limit bounds how much upstream fetching one caller can cause", async () => {
  const asked = stubFetch({});
  const [request, , url] = posterRequest("https://www.example.org/title/1");
  const env = { POSTER_IP_RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const response = await handlePoster(request, env, url);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(asked, []);
});

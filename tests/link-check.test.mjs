import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCKED,
  DEAD,
  OK,
  UNSTABLE,
  classifyNetworkError,
  classifyStatus,
  collectLinks,
  loadCatalog,
  renderReport,
  shouldRetryWithGet,
  youtubeOembedFor
} from "../tools/link-check.mjs";

test("every catalog shape yields its links with the item that owns them", () => {
  const data = {
    school: {
      sections: [
        {
          title: "Section",
          groups: [
            {
              title: "Group",
              items: [
                { title: "NCERT Textbooks", links: [{ label: "Official", urls: ["https://ncert.nic.in/textbook.php"] }] },
                { title: "Duplicate holder", links: [{ label: "Same", urls: ["https://ncert.nic.in/textbook.php"] }] }
              ]
            }
          ]
        }
      ]
    },
    // The exams module uses a completely different shape, so the walk must not assume one.
    exams: { tests: { urls: ["https://example.org/mock"] }, roadmap: { note: { text: "x", urls: ["https://example.org/plan"] } } }
  };

  const links = collectLinks(data);
  const urls = links.map((link) => link.url);
  assert.deepEqual(urls, ["https://example.org/mock", "https://example.org/plan", "https://ncert.nic.in/textbook.php"]);

  const ncert = links.find((link) => link.url.includes("ncert"));
  assert.deepEqual(ncert.sources, ["NCERT Textbooks", "Duplicate holder"], "a repeated URL keeps every place it appears");
});

test("non-http values and malformed URLs are never queued", () => {
  const links = collectLinks({
    govt: {
      title: "Rights",
      items: [
        { title: "Mail", links: [{ urls: ["mailto:zeroisinf@gmail.com"] }] },
        { title: "Phone", links: [{ urls: ["tel:+911234567890"] }] },
        { title: "Pay", links: [{ urls: ["upi://pay?pa=zeroisinf@ibl"] }] },
        { title: "Broken", links: [{ urls: ["https://"] }] },
        { title: "Relative", links: [{ urls: ["/rights/"] }] },
        { title: "Real", links: [{ urls: ["https://rti.gov.in/"] }] }
      ]
    }
  });
  assert.deepEqual(links.map((link) => link.url), ["https://rti.gov.in/"]);
});

test("bot walls and rate limits are never reported as rot", () => {
  assert.equal(classifyStatus(200), OK);
  assert.equal(classifyStatus(206), OK, "a ranged GET probe answers 206");
  assert.equal(classifyStatus(404), DEAD);
  assert.equal(classifyStatus(410), DEAD);
  assert.equal(classifyStatus(401), BLOCKED);
  assert.equal(classifyStatus(403), BLOCKED, "Cloudflare and Akamai answer 403 to crawlers on pages people can open");
  assert.equal(classifyStatus(429), BLOCKED);
  assert.equal(classifyStatus(500), UNSTABLE);
  assert.equal(classifyStatus(503), UNSTABLE);
});

test("a HEAD rejection is retried with GET instead of being believed", () => {
  [400, 403, 405, 429, 501].forEach((status) => assert.equal(shouldRetryWithGet(status), true, `${status} should be retried`));
  [200, 404, 410, 500].forEach((status) => assert.equal(shouldRetryWithGet(status), false, `${status} is a real answer`));
});

test("a link is never convicted on a network failure, only on a server's answer", () => {
  // Checked from an Indian consumer connection, ncert.nic.in — plainly alive — failed to
  // connect, and the resolver returned 172.16.61.239 (private RFC1918) for a dozen
  // government hosts. An ISP sinkhole, a captive portal, NAT64 and a firewall all look
  // exactly like a vanished domain from inside one machine, so none of them may convict.
  for (const error of [
    { cause: { code: "ENOTFOUND" } },
    { cause: { code: "ECONNREFUSED" } },
    { cause: { code: "CERT_HAS_EXPIRED" } },
    { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } },
    { message: "This operation was aborted" }
  ]) {
    assert.equal(classifyNetworkError(error), UNSTABLE, `${JSON.stringify(error)} must not be reported as rot`);
  }
  // Only a real response can mark a link dead.
  assert.equal(classifyStatus(404), DEAD);
});

test("YouTube videos are checked through oEmbed, because watch pages answer 200 when removed", () => {
  const oembed = youtubeOembedFor("https://www.youtube.com/watch?v=2k7OOZZlNrg");
  assert.ok(oembed.startsWith("https://www.youtube.com/oembed?format=json&url="));
  assert.ok(oembed.includes(encodeURIComponent("https://www.youtube.com/watch?v=2k7OOZZlNrg")));
  assert.ok(youtubeOembedFor("https://youtu.be/2k7OOZZlNrg"), "short links resolve too");

  // Channels, playlists and everything else are ordinary requests.
  assert.equal(youtubeOembedFor("https://www.youtube.com/@pigsfield"), null);
  assert.equal(youtubeOembedFor("https://www.youtube.com/playlist?list=PL123"), null);
  assert.equal(youtubeOembedFor("https://ncert.nic.in/"), null);
  assert.equal(youtubeOembedFor("not a url"), null);
});

test("the report separates real rot from things a human should merely glance at", () => {
  const report = renderReport({
    checked: 4,
    elapsedMs: 60000,
    results: [
      { url: "https://a.test/gone", status: 404, verdict: DEAD, sources: ["Some course"] },
      { url: "https://b.test/walled", status: 403, verdict: BLOCKED, sources: ["Another"] },
      { url: "https://c.test/flaky", status: 503, verdict: UNSTABLE, sources: [] },
      { url: "https://d.test/fine", status: 200, verdict: OK, sources: [] }
    ]
  });

  assert.match(report, /Checked \*\*4\*\* unique catalog links/);
  assert.match(report, /## Dead links/);
  assert.match(report, /HTTP 404 · <https:\/\/a\.test\/gone> — Some course/);
  assert.match(report, /## Blocked by bot protection/);
  assert.match(report, /not counted as rot/);
  const deadSection = report.slice(report.indexOf("## Dead links"), report.indexOf("## Blocked by bot protection"));
  assert.ok(deadSection.includes("a.test/gone"), "the 404 belongs under dead links");
  assert.ok(!deadSection.includes("b.test"), "a bot-walled link must not be listed under dead links");
  assert.ok(!deadSection.includes("c.test"), "a flaky link must not be listed under dead links");
});

test("a clean run says so instead of printing an empty checklist", () => {
  const report = renderReport({ checked: 1, elapsedMs: 1000, results: [{ url: "https://a.test", status: 200, verdict: OK, sources: [] }] });
  assert.match(report, /No dead links found\./);
  assert.ok(!/## Dead links/.test(report));
});

test("the sentinel reads the real catalog and finds every module", () => {
  const links = collectLinks(loadCatalog());
  assert.ok(links.length > 1200, `expected the full catalog, collected ${links.length}`);
  const hosts = new Set(links.map((link) => new URL(link.url).hostname));
  assert.ok(hosts.size > 200, "the catalog should span many providers");
  assert.ok(links.every((link) => /^https?:\/\//.test(link.url)));
});

import { shellDigest } from "./build-sw.mjs";

const PRODUCTION_ORIGIN = "https://pigsfield.com";
const PRODUCTION_HOME = `${PRODUCTION_ORIGIN}/`;
const HTTP_HOME = "http://pigsfield.com/";
const ROBOTS_URL = `${PRODUCTION_ORIGIN}/robots.txt`;
const SITEMAP_URL = `${PRODUCTION_ORIGIN}/sitemap.xml`;
const TOOLS_URL = `${PRODUCTION_ORIGIN}/tools/`;
const SERVICE_WORKER_URL = `${PRODUCTION_ORIGIN}/sw.js`;
// A real PigBang entry (Hanuman, in the films tab). A YouTube video id is the one poster
// source that resolves without reading a provider's page at all, so if this cannot be
// served the endpoint itself is broken rather than a provider having blocked us.
const POSTER_PROBE_TARGET = "https://www.youtube.com/watch?v=B_enxfU7a_o";
const POSTER_URL = `${PRODUCTION_ORIGIN}/api/poster?u=${encodeURIComponent(POSTER_PROBE_TARGET)}`;

// Cloudflare Workers Builds starts building after the push that triggers this job, so the
// first look at production legitimately races the deploy. Wait it out rather than failing
// on a deploy that is simply still in flight.
const DEPLOY_WAIT_MS = 6 * 60 * 1000;
const DEPLOY_POLL_MS = 15_000;

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 1_500;
const FETCH_CONCURRENCY = 6;
const MAX_TEXT_BYTES = 10 * 1024 * 1024;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function statusDescription(statuses) {
  return [...statuses].sort((a, b) => a - b).join(" or ");
}

async function fetchWithRetry(
  url,
  { expectedStatuses = new Set([200]), redirect = "manual" } = {},
) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "text/html,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8",
          "user-agent": "PigsfieldProductionSmoke/1.0 (+https://pigsfield.com/)",
        },
        redirect,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (expectedStatuses.has(response.status)) {
        return response;
      }

      lastError = new Error(
        `${url} returned HTTP ${response.status}; expected ${statusDescription(expectedStatuses)}`,
      );
      await response.body?.cancel();
    } catch (error) {
      lastError = new Error(`${url} request failed: ${error.message}`, { cause: error });
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error(
    `${lastError.message} after ${MAX_ATTEMPTS} attempts (each limited to ${REQUEST_TIMEOUT_MS} ms)`,
    { cause: lastError },
  );
}

async function readTextLimited(response, maxBytes = MAX_TEXT_BYTES) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error(
      `${response.url} declares ${declaredLength} bytes, above the ${maxBytes}-byte smoke-check limit`,
    );
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new Error(
        `${response.url} exceeded the ${maxBytes}-byte smoke-check limit while downloading`,
      );
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

function decodeXmlText(value) {
  const withoutCdata = value
    .trim()
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1");

  return withoutCdata.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,
    (entity, token) => {
      const named = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };
      const normalized = token.toLowerCase();
      if (normalized in named) return named[normalized];
      const radix = normalized.startsWith("#x") ? 16 : 10;
      const digits = normalized.replace(/^#x?/, "");
      const codePoint = Number.parseInt(digits, radix);
      return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : entity;
    },
  );
}

function parseSitemapLocations(xml) {
  const locations = [...xml.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi)].map(
    (match) => decodeXmlText(match[1]),
  );

  if (!locations.length) {
    throw new Error(`${SITEMAP_URL} contains no <loc> entries`);
  }

  return locations;
}

function validateCanonicalLocation(rawLocation) {
  if (!rawLocation.startsWith(`${PRODUCTION_ORIGIN}/`)) {
    throw new Error(
      `Sitemap <loc> must begin with the exact canonical ${PRODUCTION_ORIGIN}/ origin: ${rawLocation}`,
    );
  }

  let location;
  try {
    location = new URL(rawLocation);
  } catch {
    throw new Error(`Sitemap <loc> is not an absolute URL: ${rawLocation}`);
  }

  if (location.origin !== PRODUCTION_ORIGIN) {
    throw new Error(
      `Sitemap <loc> must use the canonical ${PRODUCTION_ORIGIN} origin: ${rawLocation}`,
    );
  }
  if (location.username || location.password || location.port) {
    throw new Error(`Sitemap <loc> contains credentials or a non-canonical port: ${rawLocation}`);
  }
  if (location.search || location.hash) {
    throw new Error(`Sitemap <loc> must not contain a query or fragment: ${rawLocation}`);
  }
  if (rawLocation !== location.href) {
    throw new Error(
      `Sitemap <loc> is not normalized as a canonical URL: ${rawLocation} (normalized: ${location.href})`,
    );
  }

  return location.href;
}

function assertRobotsNamesCanonicalSitemap(robotsText) {
  const sitemapDirectives = robotsText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, "").trim())
    .map((line) => line.match(/^sitemap\s*:\s*(\S+)\s*$/i)?.[1])
    .filter(Boolean);

  const hasCanonicalSitemap = sitemapDirectives.includes(SITEMAP_URL);

  if (!hasCanonicalSitemap) {
    const found = sitemapDirectives.length ? sitemapDirectives.join(", ") : "none";
    throw new Error(
      `${ROBOTS_URL} must contain "Sitemap: ${SITEMAP_URL}" (found: ${found})`,
    );
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const failures = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        await worker(items[index], index);
      } catch (error) {
        failures.push(error);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );
  return failures;
}

async function checkCrawlSurface() {
  const coreResults = await Promise.allSettled([
    fetchWithRetry(PRODUCTION_HOME),
    fetchWithRetry(ROBOTS_URL),
    fetchWithRetry(SITEMAP_URL),
  ]);
  const coreFailures = coreResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);

  if (coreFailures.length) {
    await Promise.all(
      coreResults
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value.body?.cancel()),
    );
    throw new AggregateError(
      coreFailures,
      `${coreFailures.length} production crawl-surface endpoints failed direct HTTP 200 checks`,
    );
  }

  const [homeResponse, robotsResponse, sitemapResponse] = coreResults.map(
    (result) => result.value,
  );

  await homeResponse.body?.cancel();
  const [robotsText, sitemapXml] = await Promise.all([
    readTextLimited(robotsResponse, 512 * 1024),
    readTextLimited(sitemapResponse),
  ]);

  assertRobotsNamesCanonicalSitemap(robotsText);

  const rawLocations = parseSitemapLocations(sitemapXml);
  const canonicalLocations = rawLocations.map(validateCanonicalLocation);
  const duplicates = canonicalLocations.filter(
    (location, index) => canonicalLocations.indexOf(location) !== index,
  );
  if (duplicates.length) {
    throw new Error(`Sitemap contains duplicate <loc> entries: ${[...new Set(duplicates)].join(", ")}`);
  }

  const pageFailures = await mapWithConcurrency(
    canonicalLocations,
    FETCH_CONCURRENCY,
    async (location) => {
      const response = await fetchWithRetry(location);
      await response.body?.cancel();
    },
  );

  if (pageFailures.length) {
    throw new AggregateError(
      pageFailures,
      `${pageFailures.length} of ${canonicalLocations.length} sitemap URLs failed direct HTTP 200 checks`,
    );
  }

  console.log(
    `[pass] HTTPS home, robots.txt, sitemap.xml, and ${canonicalLocations.length} canonical sitemap URLs returned HTTP 200`,
  );
  console.log(`[pass] robots.txt names ${SITEMAP_URL}`);
}

async function checkPermanentHttpsRedirect() {
  const response = await fetchWithRetry(HTTP_HOME, {
    expectedStatuses: new Set([301, 308]),
    redirect: "manual",
  });
  const locationHeader = response.headers.get("location");
  await response.body?.cancel();

  let redirectTarget;
  try {
    redirectTarget = new URL(locationHeader ?? "", HTTP_HOME).href;
  } catch {
    redirectTarget = "";
  }

  if (redirectTarget !== PRODUCTION_HOME) {
    throw new Error(
      `${HTTP_HOME} must permanently redirect directly to ${PRODUCTION_HOME}; received Location: ${locationHeader ?? "(missing)"}`,
    );
  }

  console.log(`[pass] ${HTTP_HOME} permanently redirects to ${PRODUCTION_HOME}`);
}

async function checkToolsRoute() {
  const response = await fetchWithRetry(TOOLS_URL);
  const contentType = response.headers.get("content-type") || "";
  const body = await readTextLimited(response, 2 * 1024 * 1024);
  if (!/text\/html/i.test(contentType)) {
    throw new Error(`${TOOLS_URL} must return HTML; received Content-Type: ${contentType || "(missing)"}`);
  }
  if (!/<main\b[^>]*\bid=["']main-content["']/i.test(body)) {
    throw new Error(`${TOOLS_URL} returned HTTP 200 but not the Pigsfield Tools page`);
  }
  console.log(`[pass] ${TOOLS_URL} returned the Pigsfield Tools page with HTTP 200`);
}

/**
 * Is the site actually serving the commit this workflow just validated?
 *
 * Nothing used to answer that. A change could pass every check here, be merged, and simply
 * not be live — because the repository is green and the deployment is a separate system —
 * and the only way to find out was for someone to look at the site and notice.
 *
 * sw.js already carries a digest of the shell it precaches, stamped by tools/build-sw.mjs.
 * That makes it a build fingerprint that costs nothing extra: if the digest production
 * serves matches the digest this tree computes, the deployed shell is this shell. A commit
 * that does not touch the shell leaves the digest unchanged and passes immediately, which is
 * correct — there is nothing new to deploy.
 */
async function checkDeployedBuild() {
  const expected = shellDigest();
  const deadline = Date.now() + DEPLOY_WAIT_MS;
  let seen = "(not read)";

  while (true) {
    const response = await fetchWithRetry(SERVICE_WORKER_URL);
    const source = await readTextLimited(response, 256 * 1024);
    seen = source.match(/const\s+CACHE\s*=\s*"pigsfield-([0-9a-f]+)"/)?.[1] || "(no digest found)";
    if (seen === expected) {
      console.log(`[pass] production is serving this commit's shell (digest ${expected})`);
      return;
    }
    if (Date.now() >= deadline) break;
    console.log(`[wait] production still serving digest ${seen}, expected ${expected}; retrying`);
    await sleep(DEPLOY_POLL_MS);
  }

  throw new Error(
    `${SERVICE_WORKER_URL} still reports shell digest ${seen} after ${Math.round(DEPLOY_WAIT_MS / 1000)}s, ` +
    `but this commit builds ${expected}. Production is not serving this commit: check the Cloudflare ` +
    "Workers Builds deployment for this repository. (If another commit landed while this ran, rerun the job.)"
  );
}

/**
 * Does PigBang's cover art actually work in production?
 *
 * It cannot be tested anywhere else. /api/poster needs the deployed Worker — a static
 * preview has no /api at all — so before this, the first person to find out that every card
 * had lost its artwork would have been a visitor.
 *
 * The probe is a YouTube video id on purpose. That is the one source resolved without
 * reading a provider's page, so a failure here means the endpoint is broken, not that
 * Netflix declined to answer a crawler. A provider blocking us is a cached 404 and a card
 * that keeps its generated symbol, which is working as designed and not something to fail a
 * build over.
 */
async function checkPosterEndpoint() {
  const response = await fetchWithRetry(POSTER_URL);
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const cacheControl = response.headers.get("cache-control") || "";
  const length = Number(response.headers.get("content-length") || 0);
  await response.body?.cancel();

  if (!/^image\/(?:jpeg|png|webp|gif|avif)$/.test(contentType)) {
    throw new Error(
      `${POSTER_URL} must return a raster image; received Content-Type: ${contentType || "(missing)"}. ` +
      "PigBang cards fall back to their generated symbol when this fails, so the grid will look intentional but carry no cover art."
    );
  }
  if (length > 0 && length < 512) {
    throw new Error(`${POSTER_URL} returned ${length} bytes, which is a placeholder rather than cover art`);
  }
  // Without a long lifetime every card costs an upstream read on every visit.
  if (!/max-age=\d{5,}/.test(cacheControl)) {
    throw new Error(`${POSTER_URL} must be cacheable for the long term; received Cache-Control: ${cacheControl || "(missing)"}`);
  }

  console.log(`[pass] ${PRODUCTION_ORIGIN}/api/poster served ${contentType} cover art for a PigBang entry`);
}

async function main() {
  console.log(`Checking the deployed Pigsfield build and crawl surface at ${PRODUCTION_HOME}`);

  const results = await Promise.allSettled([
    checkCrawlSurface(),
    checkPermanentHttpsRedirect(),
    checkToolsRoute(),
    checkDeployedBuild(),
    checkPosterEndpoint(),
  ]);
  const failures = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);

  if (failures.length) {
    console.error("\nProduction SEO smoke check failed:");
    for (const failure of failures) {
      console.error(`- ${failure.message}`);
      if (failure instanceof AggregateError) {
        for (const nested of failure.errors) console.error(`  - ${nested.message}`);
      }
    }
    console.error(
      "\nIf the HTTP redirect check failed, enable Cloudflare 'Always Use HTTPS' or add an equivalent 301/308 apex redirect, then rerun npm run check:production. That one is a dashboard setting, not a code change: run_worker_first is scoped to /api/*, so the Worker's own http->https redirect never runs for a page request.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("Production SEO smoke check passed.");
}

await main();

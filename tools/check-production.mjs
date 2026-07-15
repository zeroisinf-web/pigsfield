const PRODUCTION_ORIGIN = "https://pigsfield.com";
const PRODUCTION_HOME = `${PRODUCTION_ORIGIN}/`;
const HTTP_HOME = "http://pigsfield.com/";
const ROBOTS_URL = `${PRODUCTION_ORIGIN}/robots.txt`;
const SITEMAP_URL = `${PRODUCTION_ORIGIN}/sitemap.xml`;

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

async function main() {
  console.log(`Checking the deployed Pigsfield crawl surface at ${PRODUCTION_HOME}`);

  const results = await Promise.allSettled([
    checkCrawlSurface(),
    checkPermanentHttpsRedirect(),
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
      "\nIf the HTTP redirect check failed, enable Cloudflare 'Always Use HTTPS' or add an equivalent 301/308 apex redirect, then rerun npm run check:production.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("Production SEO smoke check passed.");
}

await main();

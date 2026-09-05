// Real cover art for every catalog entry, without an API key, a stored image map or a
// third-party request from the visitor's browser.
//
// PigBang used to derive artwork from the link itself, which only two providers allow: a
// YouTube video id maps to a thumbnail and a Steam app id to a store header. Everything
// else — Netflix, Hotstar, Prime, the Play Store, YouTube channels and playlists, Internet
// Archive, the App Store — fell back to a generated tile with an emoji on it, which is what
// most of the grid actually showed.
//
// Those providers do publish cover art; they publish it as Open Graph metadata for link
// previews. This endpoint reads that the way a link preview does, at the edge, once per
// entry per cache lifetime, and streams the image back same-origin. That means:
//   - the visitor's browser never talks to Netflix or Google to render a card,
//   - the page needs no img-src exception beyond 'self',
//   - a provider that blocks us costs one cached 404, not a broken tile on every visit.
//
// The catalog is a fixed list of public https URLs, but this endpoint takes the URL from the
// query string, so it is treated as attacker-controlled: https only, public DNS names only,
// no IP literals, no ports, no /api/ paths, bounded reads and a hard timeout.

const POSTER_TTL = 2592000; // 30 days. Cover art changes about never.
const POSTER_MISS_TTL = 21600; // 6 hours, so a provider outage is not remembered for a month.
const MAX_HTML_BYTES = 192 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 6000;
// Sent to the providers we read metadata from. A link-preview crawler is exactly what this
// is, and every one of these sites serves og:image to a normal browser UA.
const PAGE_AGENT = "Mozilla/5.0 (compatible; PigsfieldPreview/1.0; +https://pigsfield.com/) Chrome/126.0.0.0 Safari/537.36";
// image/svg+xml is deliberately absent: an SVG is a document, and there is no reason for a
// poster to be one.
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

const YOUTUBE_VIDEO = /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/|youtube\.com\/(?:shorts|live|embed)\/)([A-Za-z0-9_-]{11})/;
const YOUTUBE_PLAYLIST = /[?&]list=([A-Za-z0-9_-]{12,64})/;
const STEAM_APP = /store\.steampowered\.com\/app\/(\d+)/;
const ARCHIVE_ITEM = /archive\.org\/(?:details|download)\/([A-Za-z0-9._-]{2,120})/;
const APPLE_APP = /apps\.apple\.com\/[^\s]*\/id(\d{5,12})/;

function posterResponse(status, headers = {}) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": `public, max-age=${POSTER_MISS_TTL}`,
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

/**
 * Accept only a public https page URL. Anything that could address the platform's own
 * network, another Pigsfield API route, or a non-http scheme is rejected before any fetch.
 */
export function posterTarget(raw) {
  let url;
  try {
    url = new URL(String(raw || ""));
  } catch (_) {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port) return null;
  const host = url.hostname.toLowerCase();
  // Rejects IPv6 literals (which carry brackets and colons) and anything without a dot,
  // which covers "localhost" and single-label intranet names.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
  // No IPv4 literals: a public-looking one can still resolve inside a private range.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  if (/(?:^|\.)(?:localhost|local|internal|intranet|home|lan|corp|test|invalid|example|onion)$/.test(host)) return null;
  // Never let the endpoint call another API route, including itself.
  if (/^\/api\//.test(url.pathname)) return null;
  url.hash = "";
  return url;
}

async function boundedFetch(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { redirect: "follow", signal: controller.signal, ...init });
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Read at most `limit` bytes of a body, so a huge or endless response cannot be absorbed. */
async function readBounded(response, limit) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let read = 0;
  let source = "";
  try {
    while (read < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      source += decoder.decode(value, { stream: true });
      // The metadata lives in the head; there is no reason to read the body of a
      // single-page app that ships half a megabyte of inlined state.
      if (source.includes("</head>")) break;
    }
    source += decoder.decode();
  } catch (_) {
    /* A truncated read still leaves whatever arrived, which is usually enough. */
  } finally {
    try { await reader.cancel(); } catch (_) {}
  }
  return source;
}

const META_PATTERNS = [
  /<meta[^>]+(?:property|name)=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::url)?["']/i,
  /<meta[^>]+(?:property|name)=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']twitter:image(?::src)?["']/i,
  /<meta[^>]+itemprop=["']image["'][^>]*content=["']([^"']+)["']/i,
  /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i
];

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&#x0*26;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'");
}

/** Pull the link-preview image out of a page, resolved against the page it came from. */
export function extractPosterUrl(html, pageUrl) {
  for (const pattern of META_PATTERNS) {
    const match = pattern.exec(html || "");
    if (!match) continue;
    const candidate = posterTarget(new URL(decodeEntities(match[1]), pageUrl).href);
    if (candidate) return candidate.href;
  }
  return "";
}

/**
 * Providers whose cover art is addressable from the link alone. Answering these without
 * reading a page saves a subrequest and works even where the provider blocks crawlers.
 */
export function derivedPosterCandidates(url) {
  const href = url.href;
  const video = YOUTUBE_VIDEO.exec(href);
  if (video) {
    // maxres exists for most modern uploads and is the only 16:9 size above 480px; mq is
    // the smallest one YouTube guarantees for every video, including 2009 uploads.
    return [
      `https://i.ytimg.com/vi/${video[1]}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${video[1]}/mqdefault.jpg`
    ];
  }
  const steam = STEAM_APP.exec(href);
  if (steam) return [`https://cdn.cloudflare.steamstatic.com/steam/apps/${steam[1]}/header.jpg`];
  const archive = ARCHIVE_ITEM.exec(href);
  if (archive) return [`https://archive.org/services/img/${archive[1]}`];
  return [];
}

/** A playlist has no derivable thumbnail, but oEmbed answers for one without a key. */
async function playlistPoster(url) {
  if (!/(?:^|\.)youtube\.com$/.test(url.hostname)) return "";
  const playlist = YOUTUBE_PLAYLIST.exec(url.href);
  if (!playlist) return "";
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/playlist?list=${playlist[1]}`)}`;
  const response = await boundedFetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response || !response.ok) return "";
  try {
    const body = JSON.parse(await readBounded(response, 16 * 1024));
    const candidate = posterTarget(String(body && body.thumbnail_url || ""));
    return candidate ? candidate.href : "";
  } catch (_) {
    return "";
  }
}

/** The App Store publishes artwork through the keyless iTunes lookup service. */
async function appleStorePoster(url) {
  const app = APPLE_APP.exec(url.href);
  if (!app) return "";
  const response = await boundedFetch(`https://itunes.apple.com/lookup?id=${app[1]}`, { headers: { Accept: "application/json" } });
  if (!response || !response.ok) return "";
  try {
    const body = JSON.parse(await readBounded(response, 64 * 1024));
    const result = body && Array.isArray(body.results) ? body.results[0] : null;
    const artwork = result && (result.artworkUrl512 || result.artworkUrl100 || result.artworkUrl60);
    const candidate = posterTarget(String(artwork || ""));
    return candidate ? candidate.href : "";
  } catch (_) {
    return "";
  }
}

/** Read the page the way a link-preview crawler does and take its og:image. */
async function metadataPoster(url) {
  const response = await boundedFetch(url.href, {
    headers: {
      "User-Agent": PAGE_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-IN,en;q=0.9"
    }
  });
  if (!response || !response.ok) return "";
  const type = String(response.headers.get("Content-Type") || "");
  if (!/text\/html|application\/xhtml/i.test(type)) return "";
  return extractPosterUrl(await readBounded(response, MAX_HTML_BYTES), response.url || url.href);
}

async function fetchImage(candidate) {
  const response = await boundedFetch(candidate, { headers: { Accept: "image/*", "User-Agent": PAGE_AGENT } });
  if (!response || !response.ok || !response.body) return null;
  const type = String(response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) return null;
  const declared = Number(response.headers.get("Content-Length") || 0);
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null;
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  // A 120-byte answer is a tracking pixel or a placeholder, not cover art.
  if (bytes.byteLength < 512) return null;
  return { bytes, type };
}

async function resolvePoster(url) {
  for (const candidate of derivedPosterCandidates(url)) {
    const image = await fetchImage(candidate);
    if (image) return image;
  }
  for (const resolve of [playlistPoster, appleStorePoster, metadataPoster]) {
    const candidate = await resolve(url);
    if (!candidate) continue;
    const image = await fetchImage(candidate);
    if (image) return image;
  }
  return null;
}

/**
 * GET /api/poster?u=<https page url>
 *
 * Answers image bytes, or 404 when the provider publishes nothing usable — PigBang keeps a
 * generated tile behind every poster, so a 404 renders as a deliberate card, not a hole.
 */
export async function handlePoster(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return posterResponse(405, { Allow: "GET, HEAD" });
  }
  const target = posterTarget(url.searchParams.get("u"));
  if (!target) return posterResponse(400);

  // One cache entry per target, independent of how the query string was ordered or which
  // page asked, so every visitor and every PoP shares one upstream read.
  const cacheKey = new Request(`${url.origin}/api/poster?u=${encodeURIComponent(target.href)}`, { method: "GET" });
  const cache = typeof caches !== "undefined" && caches.default;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  if (env.POSTER_IP_RATE_LIMITER && typeof env.POSTER_IP_RATE_LIMITER.limit === "function") {
    const address = request.headers.get("CF-Connecting-IP") || "unknown";
    const limit = await env.POSTER_IP_RATE_LIMITER.limit({ key: address });
    if (!limit.success) return posterResponse(429, { "Cache-Control": "no-store" });
  }

  const image = await resolvePoster(target);
  const response = image
    ? new Response(image.bytes, {
      headers: {
        "Content-Type": image.type,
        "Content-Length": String(image.bytes.byteLength),
        "Cache-Control": `public, max-age=${POSTER_TTL}, stale-while-revalidate=${POSTER_TTL}`,
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin"
      }
    })
    : posterResponse(404);

  if (cache) {
    try { await cache.put(cacheKey, response.clone()); } catch (_) {}
  }
  return response;
}

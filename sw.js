// Pigsfield service worker.
//
// CACHE carries a digest of the shell files it precaches, stamped by tools/build-sw.mjs and
// verified by tools/validate-site.mjs. It used to be a hand-bumped "pigsfield-v19", which
// nobody remembered to bump: the site shipped a redesign and every returning visitor kept
// being served the previous stylesheet out of this cache, because a cache whose name has not
// changed is never discarded. A digest cannot be forgotten.
const CACHE = "pigsfield-897c691daefc";
const CORE = [
  "./",
  "./404.html",
  "./css/site.css",
  "./js/site.js",
  "./assets/pigsfield-logo-ui.webp",
  "./assets/pigsfield-icon-192.png",
  "./manifest.json"
];

// Files that are replaced in place on every deploy. These are served network-first so a
// visitor never renders a stale stylesheet: the HTTP cache in _headers already gives them a
// short max-age, so this costs a conditional request at most. Images and fonts are not
// listed — they are immutable or long-lived and stay cache-first.
const REVALIDATE = /\.(?:css|js|mjs|json)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
    self.registration.navigationPreload ? self.registration.navigationPreload.enable() : Promise.resolve()
  ]).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(Promise.resolve(event.preloadResponse).then((preloaded) => preloaded || fetch(request)).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match("./"))));
    return;
  }

  // Stylesheets and scripts: network first, cache only as the offline fallback.
  if (REVALIDATE.test(url.pathname)) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request)));
    return;
  }

  // Everything else (images, fonts): cache first, refreshed in the background.
  event.respondWith(caches.match(request).then((cached) => {
    const update = fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(() => cached);
    return cached || update;
  }));
});

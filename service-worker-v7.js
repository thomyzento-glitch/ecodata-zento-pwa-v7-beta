/* EcoData Zento PWA - Service Worker v7 para GitHub Pages */
const CACHE_NAME = "ecodata-zento-v7-github-pages";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=7",
  "./app.js?v=7",
  "./manifest.json",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/logo-zento-header.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: "APP_UPDATED", version: "v7" });
        });
      })
  );
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isCoreFile(request) {
  const pathname = new URL(request.url).pathname;
  return /\/(index\.html|style\.css|app\.js|manifest\.json|service-worker-v7\.js)$/.test(pathname);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (request.mode === "navigate") {
      return caches.match("./index.html");
    }

    throw _;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (!isSameOrigin(event.request)) return;

  if (event.request.mode === "navigate" || isCoreFile(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

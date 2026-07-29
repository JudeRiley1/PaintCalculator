const CACHE_NAME = "paper-paint-v3";
const CORE_ASSETS = [
  "./manifest.webmanifest",
  "./white-paper.webp",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(CORE_ASSETS);

  const pageResponse = await fetch("./");
  if (!pageResponse.ok) throw new Error("Unable to cache the app shell.");
  await cache.put("./", pageResponse.clone());
  const html = await pageResponse.text();
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], self.registration.scope))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.href);

  await Promise.all(
    [...new Set(assetUrls)].map(async (url) => {
      try {
        await cache.add(url);
      } catch {
        // Optional metadata or cross-generated assets should not block install.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return caches.match("./");
        }
        return Response.error();
      })
  );
});

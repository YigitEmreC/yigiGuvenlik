const CACHE = "gate-checker-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-128.png",
  "./whitelist.csv"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : null)))
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Only cache GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache cross-origin (your Cloudflare API is cross-origin)
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(req));
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((fresh) => {
      const copy = fresh.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return fresh;
    }).catch(() => caches.match("./index.html")))
  );
});

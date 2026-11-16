/*
 * Service Worker für Schlaumobil
 * - network-first: Updates kommen sofort an, wenn Netz da ist
 * - Cache-Fallback: die App startet auch offline
 * Bei größeren Änderungen CACHE_VERSION hochzählen (räumt alte Caches auf).
 */
const CACHE_VERSION = "schlaumobil-v1";
const DATEIEN = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./pruefung.js",
  "./fragen.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
const NETZ_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(DATEIEN.map((d) => new Request(d, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function mitTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try {
      // HTTP-Cache umgehen, damit neue Versionen sofort ankommen
      let antwort = await mitTimeout(fetch(req.url, { cache: "no-cache", credentials: "same-origin" }), NETZ_TIMEOUT_MS);
      // Safari lehnt umgeleitete Antworten für Seitenaufrufe ab → saubere Kopie bauen
      if (antwort.redirected) {
        antwort = new Response(await antwort.blob(), { status: antwort.status, statusText: antwort.statusText, headers: antwort.headers });
      }
      if (antwort && antwort.ok) {
        const schluessel = url.pathname.endsWith("/") ? "./" : req.url.split("?")[0];
        cache.put(schluessel, antwort.clone());
      }
      return antwort;
    } catch (e) {
      const ohneQuery = req.url.split("?")[0];
      const treffer = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(ohneQuery));
      if (treffer) return treffer;
      if (req.mode === "navigate") {
        const start = (await cache.match("./")) || (await cache.match("./index.html"));
        if (start) return start;
      }
      return new Response("Offline und nicht im Cache.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});

/*
  Soraya Service Worker
  Strategie: NETWORK-FIRST (die App lebt von Live-Daten aus Supabase + astro-engine).
  Der Cache ist nur ein Sicherheitsnetz:
    - Navigationen: erst Netz, bei Ausfall die zuletzt gecachte Seite, sonst /offline.html
    - eigene statische Dateien (App-Schale): erst Netz, bei Ausfall aus dem Cache
    - fremde APIs (Supabase, Railway, Fonts): NICHT anfassen -> immer direkt ans Netz
  Bei jeder Aenderung die CACHE_VERSION erhoehen, dann raeumt der SW alte Caches auf.
*/

const CACHE_VERSION = "soraya-v2";
const OFFLINE_URL = "/offline.html";

// App-Schale, die vorab gecacht wird (nur robuste, immer vorhandene Dateien)
const PRECACHE = [
  "/",
  "/index.html",
  "/login.html",
  "/offline.html",
  "/soraya.css",
  "/app.js",
  "/config.js",
  "/c58-mobile-layout.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // einzeln adden, damit eine fehlende Datei nicht die ganze Installation kippt
      Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// nur eigene GET-Anfragen behandeln; alles Fremde (APIs, Fonts) durchlassen
function isSameOrigin(url) {
  return new URL(url).origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !isSameOrigin(req.url)) return;

  // Seitenaufrufe (Navigationen): network-first -> Offline-Seite als Fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // statische Dateien der App-Schale: network-first, bei Ausfall aus dem Cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// erlaubt der App, ein sofortiges Update auszuloesen
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

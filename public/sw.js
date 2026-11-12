/* Vabani Bricks service worker.
 * - Static build assets: cache-first (they are content-hashed).
 * - Billing screens: network-first, cached copy used when offline so invoices
 *   can still be prepared and saved as local drafts.
 * - Everything else (APIs, server actions, Supabase, PDFs): never cached.
 */
const VERSION = "vb-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_URL = "/offline.html";
const OFFLINE_PAGES = ["/staff/new-invoice", "/admin/invoices/new"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/icons/icon.svg", "/manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") caches.delete(PAGES);
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    const cacheable = OFFLINE_PAGES.includes(url.pathname) && !url.search;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable && res.ok && !res.redirected) caches.open(PAGES).then((c) => c.put(url.pathname, res.clone()));
          return res;
        })
        .catch(async () => (cacheable && (await caches.match(url.pathname))) || (await caches.match(OFFLINE_URL))),
    );
  }
});

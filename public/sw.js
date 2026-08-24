/*
 * Family HQ service worker.
 *
 * Deliberately cautious about caching. Every page in this app is rendered for
 * whoever is signed in, so caching HTML or React payloads could show one
 * person's screen-time balance to another. Nothing that could contain family
 * data is ever stored: only build assets, icons and a static offline page.
 *
 * What it is actually for: making the app installable, loading instantly on a
 * phone, showing something sensible with no connection, and receiving push.
 */

const VERSION = "v1";
const SHELL = `family-hq-shell-${VERSION}`;
const ASSETS = `family-hq-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/** Immutable build output is safe to keep; it is content-addressed by Next.js. */
function isBuildAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

function isPrecached(url) {
  return url.origin === self.location.origin && PRECACHE.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never touch server actions or the API

  const url = new URL(request.url);

  if (isBuildAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  if (isPrecached(url)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
    return;
  }

  // Pages always come from the network. If there is no network, show the
  // offline page rather than a browser error.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(OFFLINE_URL)) ?? Response.error();
        }
      })(),
    );
  }
});

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Family HQ", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Family HQ";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: payload.tag || "family-hq",
      renotify: true,
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open window if there is one, so tapping does not pile up tabs.
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/** Never cache admin pages, admin or internal API calls, or the API at all (job data is always live). */
const NEVER_CACHE = /^\/(admin|api)(\/|$)/;

const serwist = new Serwist({
  // Static assets and the offline page, injected by scripts/build-sw.mjs
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    // 1. admin and API: network only, so they can never be stored
    {
      matcher: ({ url }) => NEVER_CACHE.test(url.pathname),
      handler: new NetworkOnly(),
    },
    // 2. pages: network first with a short timeout, fall back to the last copy
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    // 3. hashed build assets are immutable
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
  ],
  // When a navigation fails and nothing is cached, show the offline page.
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// Drop caches from older versions of this worker (names that are not ours).
const KEEP = ["pages", "next-static"];
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => !n.startsWith("serwist-precache") && !KEEP.includes(n)).map((n) => caches.delete(n))),
    ),
  );
});

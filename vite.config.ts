import { defineConfig } from "vite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export default defineConfig({
  server: { proxy: { "/api": "http://127.0.0.1:4174", "/auth": "http://127.0.0.1:4174" } },
  plugins: [
    {
      name: "offline-app-shell",
      closeBundle() {
        const output = join(process.cwd(), "dist");
        const files = readdirSync(join(output, "assets")).map(
          (file) => `/assets/${file}`,
        );
        const version = createHash("sha256")
          .update(readFileSync(join(output, "index.html")))
          .digest("hex")
          .slice(0, 12);
        const precache = [
          "/",
          "/index.html",
          "/favicon.svg",
          "/manifest.webmanifest",
          ...files,
        ];
        writeFileSync(
          join(output, "sw.js"),
          `const CACHE = 'harvest-commit-${version}';
const FILES = ${JSON.stringify(precache)};
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('harvest-commit-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (new URL(event.request.url).pathname.startsWith('/api/') || new URL(event.request.url).pathname.startsWith('/webhooks/')) return;
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
  } else {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request, { ignoreVary: true })).then(cached => cached || fetch(event.request)));
  }
});
`,
        );
      },
    },
  ],
});

/* 오프라인 캐시 (PWA) */
var CACHE = "bulyong-v1";
var CORE = [
  "./", "./index.html", "./style.css", "./app.js", "./data.js",
  "./manifest.webmanifest", "./icon.svg",
  "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.allSettled(CORE.map(function (u) { return c.add(u); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { try { c.put(e.request, copy); } catch (x) {} });
        return res;
      }).catch(function () { return hit; });
    })
  );
});

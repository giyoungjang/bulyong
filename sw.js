/* 오프라인 캐시 (PWA)
   - 코드/페이지: 네트워크 우선(온라인이면 항상 최신) → 오프라인이면 캐시
   - data.js: 용량이 커서 캐시 우선(월 1회 갱신 시 버전만 올리면 새로 받음) */
var VERSION = "v3";
var CACHE = "bulyong-" + VERSION;
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

function isData(req) {
  return /data\.js(\?|$)/.test(req.url);
}

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;

  if (isData(e.request)) {
    // 캐시 우선
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { try { c.put(e.request, copy); } catch (x) {} });
          return res;
        });
      })
    );
    return;
  }

  // 네트워크 우선 (코드/페이지) → 실패 시 캐시
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { try { c.put(e.request, copy); } catch (x) {} });
      return res;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});

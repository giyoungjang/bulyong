/* 오프라인 캐시 (PWA)
   - 코드/페이지: 네트워크 우선(온라인이면 항상 최신) → 오프라인이면 캐시
   - data.js: 용량이 커서 캐시 우선(월 1회 갱신 시 버전만 올리면 새로 받음) */
var VERSION = "v21";
var CACHE = "bulyong-" + VERSION;
var CORE = [
  "./", "./index.html", "./style.css", "./app.js", "./data.js", "./template.js", "./blue.js",
  "./manifest.webmanifest", "./icon.svg",
  "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"
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
function putCache(req, res) {
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { try { c.put(req, copy); } catch (x) {} });
}

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  var sameOrigin = url.origin === self.location.origin;

  // data.js: 캐시 우선 (용량 큼, 월 1회 갱신)
  if (isData(e.request)) {
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (res) { putCache(e.request, res); return res; });
      })
    );
    return;
  }

  // 동일 출처 앱 셸(html/js/css): HTTP 캐시 무시하고 항상 최신 → 실패 시 캐시
  if (sameOrigin) {
    e.respondWith(
      fetch(url.href, { cache: "no-store" }).then(function (res) {
        putCache(e.request, res); return res;
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }

  // 교차 출처(CDN 라이브러리): 캐시 우선
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) { putCache(e.request, res); return res; });
    })
  );
});

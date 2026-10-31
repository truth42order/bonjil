// 콘텐츠·코드를 바꾸면 이 버전을 올리세요 (예: v2 → v3).
const CACHE_VERSION = 'bonjil-v5';
const SHELL = ['./', './index.html', './css/style.css', './js/app.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './data/questions.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isData = req.url.includes('/data/') || req.url.endsWith('.json');
  if (isData) {
    // 네트워크 우선: 문제 수정이 바로 반영되고, 오프라인이면 캐시 사용
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); return res;
    }).catch(() => caches.match(req)));
  } else {
    // 앱 셸·이미지: 캐시 우선 + 백그라운드 갱신(stale-while-revalidate)
    e.respondWith(caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || net;
    }));
  }
});

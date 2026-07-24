const CACHE_NAME = 'iptv-remote-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/remote.js',
  './icon.svg',
  'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});

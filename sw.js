/* Offline cache for Jewel Dress */
const CACHE = 'jewel-dress-v29';
const FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './fonts/fredoka-latin.woff2', './fonts/fredoka-latin-ext.woff2', './fonts/nunito-latin.woff2', './fonts/nunito-latin-ext.woff2',
  './js/starknet-config.js', './js/starknet-abi.js', './js/starknet.js', './js/vendor/get-starknet-core.js', './js/vendor/starkzap.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return; // never cache RPC / wallet traffic
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});

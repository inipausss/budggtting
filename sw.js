const C = 'budggt-v1'; // naikkan (v2, v3...) kalau mau paksa refresh semua cache
const F = ['./', './index.html', './style.css', './script.js', './gas-shim.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(F)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

// Tampilkan cache dulu (cepat & offline), lalu perbarui di latar belakang
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(C).then(c => c.match(e.request).then(hit => {
      const net = fetch(e.request).then(r => {
        if (r && (r.ok || r.type === 'opaque')) c.put(e.request, r.clone());
        return r;
      }).catch(() => hit);
      return hit || net;
    }))
  );
});

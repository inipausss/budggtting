const C = 'budggt-v12'; // naikkan (v12, v13...) kalau mau paksa refresh semua cache
const OCR = 'budggt-ocr'; // aset pembaca struk (~10 MB) disimpan terpisah supaya tidak diunduh ulang tiap versi naik
const isOcr = u => /tesseract|tessdata/i.test(u);
const F = ['./', './index.html', './style.css', './script.js', './gas-shim.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C).then(c => c.addAll(F.map(u => new Request(u, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(x => x !== C && x !== OCR).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

// Online: selalu ambil versi terbaru (lewati cache HTTP). Offline: pakai cache.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (isOcr(e.request.url)) { // cache-first: sekali terunduh, struk bisa dibaca offline
    e.respondWith(caches.open(OCR).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r && (r.ok || r.type === 'opaque')) c.put(e.request, r.clone());
      return r;
    }))));
    return;
  }
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  e.respondWith(
    fetch(e.request, sameOrigin ? { cache: 'no-cache' } : undefined)
      .then(r => {
        if (r && (r.ok || r.type === 'opaque')) {
          const copy = r.clone();
          caches.open(C).then(c => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

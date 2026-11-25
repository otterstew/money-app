// Offline shell only. Ledger data never goes in this cache: it lives in IndexedDB or on the server.
const V = 'money-v2', SHELL = ['./', 'index.html', 'app.js', 'design/money.css', 'icon.svg', 'manifest.webmanifest',
  'lib/amounts.js', 'lib/dates.js', 'lib/ofx.js', 'lib/qif.js', 'lib/csv.js', 'lib/payee.js', 'lib/rules.js', 'lib/fx.js',
  'lib/importer.js', 'lib/transfers.js', 'lib/buckets.js', 'lib/receipts.js', 'lib/summary.js', 'lib/seed.js', 'lib/store.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // Always ask the server first (no-cache): a stale app.js beside new data gave
  // nonsense figures after a publish (25 Nov 2026). The cache is only for offline.
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});

// 홈 화면 설치 + 푸시 알림 + 오프라인 셸(네트워크 우선, 끊기면 캐시)
const CACHE = 'ev-shell-v2', SHELL = ['./', 'index.html', 'app.css', 'app.js', 'engine.js', 'pricing.js', 'legal.html', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: '+EV', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '+EV', { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' }, tag: d.tag }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs.find(x => x.url.startsWith(self.registration.scope)); return c ? c.focus() : self.clients.openWindow(url); }));
});

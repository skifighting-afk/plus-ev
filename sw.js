// 홈 화면 설치 + 푸시 알림 + 오프라인 셸(네트워크 우선, 끊기면 캐시)
const CACHE = 'ev-shell-v3', SHELL = ['./', 'index.html', 'app.css', 'app.js', 'engine.js', 'pricing.js', 'legal.html', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // 네트워크 우선, 단 3초 넘게 걸리면(펍 와이파이 약할 때) 캐시로 먼저 보여줌 — 받아온 새 파일은 캐시에 넣어 다음에 씀
  const net = fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; });
  const cached = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined));
  e.respondWith(Promise.race([net.catch(() => null), new Promise(ok => setTimeout(() => ok(null), 3000))]).then(r => r || cached().then(c => c || net)).catch(() => cached().then(c => c || Response.error())));
  e.waitUntil(net.catch(() => { }));
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

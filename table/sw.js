// 설치용 서비스워커: 화면 파일만 네트워크 우선 + 오프라인 시 마지막 사본. RPC(데이터)는 절대 캐시하지 않음.
const C = 'tl-shell-v3';
const SHELL = ['/table/app', '/table/staff', '/table/owner', '/table/tv', '/table/style.css', '/table/common.js', '/table/icon.svg', '/table/icon-192.png', '/table/icon-512.png', '/table/manifest.webmanifest'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !SHELL.includes(u.pathname)) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(C).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
// 알림 탭하면 앱 열기 (푸시 서버 연결 후 사용)
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data?.url || '/table/app#/me')); });

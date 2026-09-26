// 홈 화면 설치용 최소 서비스워커 (오프라인 캐시는 다음 단계)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

export function attendanceCode(text, origin) {
  try {
    const url = new URL(text);
    const code = url.searchParams.get('att');
    return url.origin === origin && url.pathname === '/' && /^\d{6}$/.test(code || '') ? code : null;
  } catch { return null; }
}

let decoder;
function loadDecoder() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return decoder ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    script.onload = () => window.jsQR ? resolve(window.jsQR) : reject(new Error('QR 인식기를 불러오지 못했어요'));
    script.onerror = () => { decoder = null; reject(new Error('인터넷 연결을 확인하고 다시 시도해 주세요')); };
    document.head.append(script);
  });
}

export async function scanAttendance({ openSheet, closeSheet, submit, label = '출퇴근 확인' }) {
  openSheet(`<h2>매장 QR 스캔</h2><p class="sub">매장 출퇴근 화면의 QR을 카메라에 맞춰 주세요.</p><video id="att-video" autoplay muted playsinline style="width:100%;max-height:360px;border-radius:12px;background:#111"></video><p id="att-scan-status" role="status" aria-live="polite">카메라를 여는 중…</p><button class="btn pri full" id="att-confirm" type="button" hidden>${label}</button><button class="btn full" type="button" data-act="close">취소</button>`);
  const video = document.getElementById('att-video'), status = document.getElementById('att-scan-status'), confirm = document.getElementById('att-confirm');
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream, stopped = false, code = null, timer;
  const stop = () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); observer.disconnect(); document.removeEventListener('visibilitychange', hide); };
  const observer = new MutationObserver(() => { if (!video.isConnected) stop(); });
  observer.observe(document.body, { childList: true, subtree: true });
  const hide = () => { if (document.hidden) { stop(); if (video.isConnected) status.textContent = '다시 QR 스캔을 눌러 주세요.'; } };
  document.addEventListener('visibilitychange', hide);
  const cleanup = stop;
  const finish = () => { cleanup(); document.removeEventListener('visibilitychange', hide); };
  confirm.addEventListener('click', async () => {
    if (!code || confirm.disabled) return;
    confirm.disabled = true;
    try { await submit(code); finish(); closeSheet(); }
    catch (error) { status.textContent = error.message || '출퇴근 처리에 실패했어요. 새 QR로 다시 시도해 주세요.'; confirm.hidden = true; }
  });
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('기본 카메라 앱으로 매장 QR을 찍어 주세요.');
    const decode = await loadDecoder();
    if (!video.isConnected) { finish(); return; }
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    if (!video.isConnected || stopped) { finish(); return; }
    video.srcObject = stream; await video.play();
    status.textContent = '매장 QR을 비춰 주세요.';
    const tick = () => {
      if (stopped || !video.isConnected) { finish(); return; }
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = decode(pixels.data, pixels.width, pixels.height);
        if (found) {
          code = attendanceCode(found.data, location.origin);
          if (code) { finish(); status.textContent = '매장 QR을 읽었어요. 아래 버튼을 눌러 완료하세요.'; confirm.hidden = false; return; }
          status.textContent = '이 매장의 출퇴근 QR을 비춰 주세요.';
        }
      }
      timer = setTimeout(tick, 160);
    };
    tick();
  } catch (error) {
    finish();
    status.textContent = error.name === 'NotAllowedError' ? '카메라 권한을 허용한 뒤 다시 스캔하거나, 휴대폰 기본 카메라로 매장 QR을 찍어 주세요.' : error.message || '카메라를 열지 못했어요. 기본 카메라로 매장 QR을 찍어 주세요.';
  }
}

// 공통: RPC 클라이언트(멱등키·결과확인), 가상 로그인, 시간 동기화, 연결 상태, 표시 문구.
// 운영 전환 시 rpc() 내부만 supabase-js `.rpc()` 로 바꾸면 된다(인자 이름 동일).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
export const session = {
  get user() { return store.get('tl.devUser'); },
  set user(v) { store.set('tl.devUser', v); },
  get nick() { return store.get('tl.devNick'); },
  set nick(v) { store.set('tl.devNick', v); },
};

export const MSG = {
  NOT_FOUND_OR_FORBIDDEN: '찾을 수 없거나 권한이 없어요', STATE_CHANGED: '상태가 바뀌었어요. 새로고침했어요',
  CAPACITY_FULL: '정원이 가득 찼어요', REGISTRATION_CLOSED: '등록이 마감됐어요', ACTIVE_ENTRY_EXISTS: '이미 참가 중이에요',
  REENTRY_LIMIT: '재참가 가능 횟수를 넘었어요', SEAT_TAKEN: '이미 사용 중인 좌석이에요', TARGET_SEAT_HELD: '이동 예정으로 잡힌 좌석이에요',
  QR_EXPIRED: 'QR이 만료됐어요. 새로 열어주세요', CALL_EXPIRED: '호출 시간이 지났어요. 다시 대기 등록이 필요해요',
  REASON_REQUIRED: '사유를 입력해주세요', IDEMPOTENCY_CONFLICT: '같은 요청 키가 다른 내용으로 쓰였어요', VERSION_CONFLICT: '다른 기기에서 먼저 바뀌었어요. 최신 상태로 다시 확인하세요',
  VALIDATION_ERROR: '입력값을 확인해주세요', INTERNAL: '서버 오류', UNKNOWN: '결과 확인 중… 잠시 후 다시 확인해요',
};

export const STATUS = {
  pending: ['승인 대기', 'b-warn', '⏳'], confirmed: ['예약 확정', 'b-ok', '✓'], waitlisted: ['대기', 'b-warn', '⏳'], called: ['호출됨', 'b-info', '🔔'],
  admitted: ['입장 완료', 'b-ok', '✓'], cancelled: ['취소', 'b-muted', '×'], expired: ['만료', 'b-muted', '×'], no_show: ['노쇼', 'b-bad', '!'],
  rejected: ['거절', 'b-bad', '×'], active: ['참가 중', 'b-ok', '●'], eliminated: ['탈락', 'b-muted', '○'], completed: ['종료', 'b-muted', '■'], voided: ['무효', 'b-bad', '×'],
  open: ['접수 중', 'b-ok', '●'], scheduled: ['접수 예정', 'b-info', '◷'], closed: ['등록 마감', 'b-muted', '■'], running: ['진행 중', 'b-info', '▶'],
  finished: ['종료', 'b-muted', '■'], draft: ['초안', 'b-muted', '✎'], planned: ['이동 예정', 'b-hold', '→'], acknowledged: ['이동 확인', 'b-hold', '→'],
};
export const badge = (k) => { const [t, c, i] = STATUS[k] || [k, 'b-muted', '•']; return `<span class="badge ${c}" data-icon="${i}">${esc(t)}</span>`; };

const fmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
export const dt = (s) => (s ? fmt.format(new Date(s)) : '-');
export const hm = (s) => (s ? new Date(s).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : '-');
export const mmss = (ms) => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function toast(text) {
  let box = $('#toast'); if (!box) { box = document.createElement('div'); box.id = 'toast'; box.setAttribute('role', 'status'); document.body.append(box); }
  const d = document.createElement('div'); d.textContent = text; box.append(d); setTimeout(() => d.remove(), 3500);
}

// ── 연결 상태: 마지막 성공 조회 시각 기준 (변경 이벤트가 없다는 이유로 끊김 판정하지 않음) ──
export const conn = { lastOk: 0, online: navigator.onLine, listeners: new Set() };
const connNotify = () => conn.listeners.forEach((f) => f());
addEventListener('online', () => { conn.online = true; connNotify(); });
addEventListener('offline', () => { conn.online = false; connNotify(); });
export const connStale = () => !conn.online || (conn.lastOk && performance.now() - conn.lastOk > 20000);

const OPNAME = { start_clock: 'clock_start', pause_clock: 'clock_pause', resume_clock: 'clock_resume', adjust_clock: 'clock_adjust' };

export class RpcError extends Error { constructor(code, detail, status) { super(code); this.code = code; this.detail = detail; this.status = status; } }

async function post(fn, body, timeoutMs = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json' };
    let url = '/rpc/' + fn;
    if (LIVE) {   // 운영: Supabase REST(RPC) + 로그인 토큰
      url = `${CFG.supabaseUrl}/rest/v1/rpc/${fn}`;
      const tok = (await sb.auth.getSession()).data.session?.access_token;
      Object.assign(headers, { apikey: CFG.anonKey, authorization: `Bearer ${tok || CFG.anonKey}` });
    } else if (session.user) headers['x-dev-user'] = session.user;
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body || {}), signal: ctl.signal });
    const j = await r.json().catch(() => (r.ok ? null : { code: 'INTERNAL' }));
    conn.lastOk = performance.now(); connNotify();
    if (!r.ok) {
      if (LIVE) {   // 서버 오류 'TL:코드' → 같은 코드 체계로
        const c = /^TL:([A-Z_]+)/.exec(j?.message || '')?.[1] || ([401, 403, 404].includes(r.status) ? 'NOT_FOUND_OR_FORBIDDEN' : 'INTERNAL');
        throw new RpcError(c, j?.details, r.status);
      }
      throw new RpcError(j.code || 'INTERNAL', j.detail, r.status);
    }
    return j;
  } finally { clearTimeout(t); }
}

export const read = (fn, body) => post(fn, body);

const NO_KEY = new Set(['issue_member_qr', 'revoke_member_qr', 'ensure_profile', 'mark_notification_read', 'accept_staff_invite', 'delete_my_account', 'submit_feedback', 'toggle_favorite_store']);
// 변경 요청: 멱등키 자동 부여. 응답 유실 시 실패로 단정하지 않고 같은 키로 결과 확인.
export async function mutate(fn, body = {}, { key } = {}) {
  if (!navigator.onLine) throw new RpcError('UNKNOWN', 'offline');
  const k = key || crypto.randomUUID();
  const payload = NO_KEY.has(fn) ? body : { ...body, p_idempotency_key: k };
  try {
    return await post(fn, payload);
  } catch (e) {
    if (e instanceof RpcError) throw e;
    toast(MSG.UNKNOWN);                                    // 네트워크/타임아웃: 결과 불명
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      try {
        const st = await post('command_status', { p_operation: OPNAME[fn] || fn, p_idempotency_key: k });
        if (st.found) return st.result;
        return await post(fn, payload);                     // 기록 없음 = 처리 안 됨 → 같은 키로 재시도
      } catch (e2) { if (e2 instanceof RpcError) throw e2; }
    }
    throw new RpcError('UNKNOWN');
  }
}

export function errText(e) { return MSG[e?.code] || MSG.INTERNAL; }

// ── 서버 시간 보정 + 단조 시계 ──
// clock_state 응답을 받은 시점의 performance.now()를 기준점으로, 왕복 지연 절반을 보정.
export async function fetchClock(tid) {
  const t0 = performance.now();
  const c = await read('clock_state', { p_tournament_id: tid });
  const t1 = performance.now();
  c._at = t0 + (t1 - t0) / 2;
  return c;
}
export function clockView(c) {
  if (!c) return null;
  const levels = c.levels || []; let idx = c.segment_index, rem = c.remaining_ms;
  if (c.state === 'running') {
    rem -= performance.now() - c._at;
    while (rem <= 0 && idx < levels.length - 1) { idx++; rem += levels[idx].minutes * 60000; }
    if (rem < 0) rem = 0;
  }
  return { idx, rem, seg: levels[idx], next: levels[idx + 1], state: c.state };
}
export const segText = (s) => !s ? '-' : s.kind === 'break' ? `휴식 ${s.minutes}분` : `${s.segment_id} · ${Number(s.sb).toLocaleString()}/${Number(s.bb).toLocaleString()}${s.ante ? ` (앤티 ${Number(s.ante).toLocaleString()})` : ''}`;

// 포그라운드 주기 조회 + 복귀 즉시 재조회. (운영: Supabase Realtime 신호 수신 시 추가 재조회)
export function poll(fn, ms = 5000) {
  let timer;
  const run = async () => { clearTimeout(timer); try { await fn(); } catch (e) { if (e.code !== 'NOT_FOUND_OR_FORBIDDEN') console.warn(e); } finally { if (document.visibilityState === 'visible') timer = setTimeout(run, ms); } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); else clearTimeout(timer); });
  addEventListener('online', run);
  run();
  return run;
}

// ── 가상 로그인 (카카오 로그인 연동 전 대체. 운영 빌드에서 제거) ──
export async function devLogin(filter) {
  if (LIVE) {   // 카카오 화면으로 이동. 키 연결 전(config.kakao=false)에는 안내만
    if (!CFG.kakao) { toast('로그인 준비 중이에요 · 지금은 대회 보기만 돼요'); return false; }
    await sb.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: location.href } }); return false;
  }
  const users = await fetch('/dev/users').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="card" style="border:0;padding:0">
    <h2>로그인</h2>
    <button class="btn" disabled aria-describedby="kk">카카오로 시작하기</button>
    <p id="kk" class="muted">카카오 앱 키 연결 전이라 비활성. 아래는 개발용 가상 계정이에요.</p>
    <div style="display:grid;gap:6px">${users.filter(filter || (() => true)).map((u) =>
      `<button class="small" data-id="${esc(u.id)}" data-nick="${esc(u.nickname)}">${esc(u.nickname)} <span class="muted">${esc((u.roles || []).join(', '))}</span></button>`).join('')}</div>
    <button class="small" value="cancel" formmethod="dialog" data-close>닫기</button></div>`;
  document.body.append(dlg); dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.id) { session.user = b.dataset.id; session.nick = b.dataset.nick; }
      if (b.dataset.id || b.dataset.close !== undefined) { dlg.close(); dlg.remove(); resolve(!!b.dataset.id); }
    });
  });
}
export function logout() { session.user = null; session.nick = null; if (LIVE) sb.auth.signOut().catch(() => {}); }

// ── 오류 수집: 화면 오류를 서버에 남김 (분당 제한은 서버가 함). 모니터링 서비스 연결 전 최소 장치 ──
let reported = 0;
function reportError(msg) {
  if (++reported > 5) return;   // 한 화면에서 폭주 방지
  post('report_client_error', { p_page: location.pathname + location.hash.split('/').slice(0, 2).join('/'), p_message: String(msg).slice(0, 500) }).catch(() => {});
}
addEventListener('error', (e) => reportError(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => { if (!(e.reason instanceof RpcError)) reportError(e.reason?.stack || e.reason); });

// ── 앱 설치(PWA) ── 안드로이드·PC 크롬은 설치 버튼, 아이폰은 '공유 → 홈 화면에 추가' 안내
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; document.querySelectorAll('[data-install]').forEach((b) => (b.hidden = false)); document.querySelectorAll('[data-install-hint]').forEach((h) => (h.textContent = '')); });
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export function installCard() {
  if (installed()) return '';
  return `<div class="card install"><h2>📲 +EV TABLE 앱 설치</h2><div class="sub">홈 화면 아이콘으로 바로 열고 호출 알림 받기</div>
    ${isIOS() ? '<div class="sub">사파리 아래 <b>공유 ⎋</b> → <b>홈 화면에 추가</b></div>' : `<button class="primary" data-install ${installEvt ? '' : 'hidden'}>앱 설치</button>
    <div class="sub" data-install-hint>${installEvt ? '' : '크롬 메뉴 ⋮ → <b>앱 설치</b> (또는 홈 화면에 추가)'}</div>`}</div>`;
}
export function bindInstall() {
  document.querySelectorAll('[data-install]').forEach((b) => (b.onclick = async () => {
    if (!installEvt) return; installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null;
    if (r.outcome === 'accepted') { toast('설치됐어요! 홈 화면에서 열어보세요'); b.closest('.install')?.remove(); }
  }));
  document.querySelectorAll('[data-install-hint]').forEach((h) => { if (installEvt) h.textContent = ''; });
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/table/sw.js').catch(() => {});

// ── 운영 모드: config.json 에 Supabase 주소가 있으면 실서버 + 카카오 로그인. 비어 있으면 개발용 가상 로그인 ──
const CFG = await fetch('/table/config.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
export const LIVE = !!CFG.supabaseUrl;
export const LOGIN_READY = !LIVE || !!CFG.kakao;
let sb = null;
if (LIVE) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = createClient(CFG.supabaseUrl, CFG.anonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
  const sync = (s) => {
    if (!s) { session.user = null; session.nick = null; return; }
    if (session.user === s.user.id && session.nick) return;
    const m = s.user.user_metadata || {};
    session.user = s.user.id; session.nick = String(m.nickname || m.name || m.full_name || m.preferred_username || '손님').slice(0, 20);
    post('ensure_profile', { p_nickname: session.nick }).catch(() => {});   // 첫 로그인 = 프로필 생성
  };
  sync((await sb.auth.getSession()).data.session);
  sb.auth.onAuthStateChange((_e, s) => setTimeout(() => sync(s)));
}

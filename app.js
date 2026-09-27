import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import * as E from './engine.js';

const sb = createClient('https://hkcmsjwuwopxritafreg.supabase.co', 'sb_publishable_X7cb5p4Ja9y4TxrjbVQZAQ_P8n3E_W_');
const $ = s => document.querySelector(s), view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t5 = t => String(t || '').slice(0, 5);
const now = new Date(), TODAY = E.ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
const fmtDT = d => new Date(d).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const man = n => `${E.won(n / 10000)}만`;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2800); }
async function q(p) { const { data, error } = await p; if (error) { toast(error.message); throw error; } return data; }
const STORE_COLS = 'id,company_id,name,area,address,pyeong,tables,layout,night_start,night_end,need_by_wd,join_code,created_at';
const PRICE = { basic: 25000, pro: 35000 };
const CAT = { rent: '임대료', elec: '전기세', water: '수도세', net: '통신·보안', goods: '음료·소모품', card: '카드 수수료', labor: '기타 인건비', etc: '기타' };
const SLOT = { OPEN: ['', '모집 중'], MATCHED: ['y', '채용 확정'], WORKING: ['g', '근무 중'], DONE: ['y', '근무 끝 · 확인 대기'], DISPUTED: ['r', '문제 신고 · 운영사 확인'], PAID: ['g', '지급 완료'], REFUND: ['', '미채용 환불'] };

// ===== 상태 =====
const S = { user: null, prof: null, mode: null, tab: null, sub: null, company: null, stores: [], store: null, members: [], tpl: [], ov: [], reports: [], hist: [], expenses: [], expAll: [], inc: [], joins: [], rank: null, cart: {}, stock: [], orders: [],
  y: now.getFullYear(), m: now.getMonth() + 1, schedView: 'month', posts: [], board: [], tickets: 0, apps: [], slots: [], wallet: { balance: 0, available: 0 }, notis: [], inq: [], used: [], authMode: 'login', my: [] };
const night = () => [t5(S.store?.night_start || '22:00'), t5(S.store?.night_end || '06:00')];
const isOwner = () => S.myRole === 'owner';
const monthRange = (y = S.y, m = S.m) => [E.ymd(y, m, 1), E.ymd(y, m, E.daysIn(y, m))];

// ===== 시작 =====
let booted = false;
sb.auth.onAuthStateChange((_e, session) => { const u = session?.user || null; if (!booted || u?.id !== S.user?.id) { booted = true; S.user = u; setTimeout(boot); } });
async function boot() {
  try {
    if (!S.user) { Object.assign(S, { mode: 'auth', onb: null, tab: null, sub: null, company: null, stores: [], store: null }); return render(); }
    S.prof = (await q(sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle())) || { name: '' };
    const mem = await q(sb.from('members').select('*').eq('user_id', S.user.id).eq('active', true));
    const owner = mem.find(m => m.role === 'owner'), mgr = mem.find(m => m.role === 'manager'), staff = mem.filter(m => m.role === 'staff');
    if (S.prof.is_hq) { S.mode = 'hq'; S.tab = S.tab || 'dash'; await loadHQ(); }
    else if (owner || mgr) {
      S.mode = 'store'; S.myRole = owner ? 'owner' : 'manager'; S.me = owner || mgr;
      S.company = await q(sb.from('companies').select('*').eq('id', S.me.company_id).maybeSingle());
      S.stores = owner ? await q(sb.from('stores').select(STORE_COLS).eq('company_id', owner.company_id).order('created_at')) : await q(sb.from('stores').select(STORE_COLS).eq('id', mgr.store_id));
      S.store = S.stores.find(s => s.id === S.store?.id) || S.stores[0]; S.tab = S.tab || 'home'; await loadStore();
    } else if (staff.length) { S.mode = 'staff'; S.my = staff; S.tab = S.tab || 'work'; await loadStaff(); }
    else if (S.prof.kind === 'dealer') { S.mode = 'dealer'; S.tab = S.tab || 'jobs'; await loadDealer(); }
    else S.mode = 'onboard';
  } catch (e) { console.error(e); }
  render();
}
async function loadStore() {
  const st = S.store.id, [first, last] = monthRange(), h0 = new Date(S.y, S.m - 6, 1), hFirst = E.ymd(h0.getFullYear(), h0.getMonth() + 1, 1);
  S.members = await q(sb.from('members').select('*').eq('store_id', st).eq('active', true).order('created_at'));
  const ids = S.members.map(m => m.id);
  S.tpl = ids.length ? await q(sb.from('shift_templates').select('*').in('member_id', ids)) : [];
  S.ov = ids.length ? await q(sb.from('shift_overrides').select('*').in('member_id', ids).gte('work_date', hFirst).lte('work_date', last)) : [];
  S.hist = await q(sb.from('daily_reports').select('*').eq('store_id', st).gte('report_date', hFirst).lte('report_date', last).order('report_date', { ascending: false }));
  S.reports = S.hist.filter(r => r.report_date >= first);
  S.expAll = await q(sb.from('expenses').select('*').eq('store_id', st).gte('spent_on', hFirst).lte('spent_on', last));
  S.expenses = S.expAll.filter(x => x.spent_on >= first);
  S.inc = ids.length ? await q(sb.from('incentives').select('*').in('member_id', ids).eq('month', first)) : [];
  S.posts = await q(sb.from('job_posts').select('*').eq('store_id', st).order('created_at', { ascending: false }).limit(20));
  S.joins = await q(sb.rpc('join_list', { p_store: st }));
  S.rank = (await q(sb.rpc('store_rank', { p_store: st, p_from: first, p_to: last })))?.[0] || null;
  S.notis = await q(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(20));
  S.quests = await q(sb.from('store_quests').select('*').eq('store_id', st));
  S.stock = await q(sb.from('stock').select('*').eq('store_id', st).order('item_id'));
  S.orders = await q(sb.from('orders').select('*').eq('store_id', st).order('created_at', { ascending: false }).limit(30));
  await syncMetrics(); S.bench = await q(sb.rpc('bench', { p_store: st }));
}
// 이번 달·지난달 내 숫자를 익명 비교용으로 올림 (다른 매장은 평균만 받음)
async function syncMetrics() {
  const cy = now.getFullYear(), cm = now.getMonth() + 1;
  if (S.y !== cy || S.m !== cm) return;
  for (const [y, m] of [[cy, cm], cm === 1 ? [cy - 1, 12] : [cy, cm - 1]]) {
    const M = monthSummary(y, m); if (!M.n) continue;
    const [f, l] = monthRange(y, m), rs = S.hist.filter(r => r.report_date >= f && r.report_date <= l), wS = Array(7).fill(0), wN = Array(7).fill(0);
    rs.forEach(r => { const [yy, mm, dd] = r.report_date.split('-').map(Number), w = E.wdOf(yy, mm, dd); wS[w] += r.sales; wN[w]++; });
    await q(sb.rpc('put_metrics', { p_store: S.store.id, p_month: f, p: { sales: Math.round(M.proj), sales_act: M.sales, profit: Math.round(M.left), labor: Math.round(M.labor), subs: M.urgent, goods: M.exp.goods || 0, elec: M.exp.elec || 0, water: M.exp.water || 0, net: M.exp.net || 0, entries: rs.reduce((a, r) => a + (r.entries || 0), 0), days: M.n, wd: wS.map((v, i) => wN[i] ? Math.round(v / wN[i]) : 0) } }));
  }
}
async function loadStaff() {
  const mine = S.my[0]; S.store = (await q(sb.from('stores').select(STORE_COLS).eq('id', mine.store_id).maybeSingle())) || {};
  const [first, last] = monthRange();
  S.members = S.my; S.tpl = await q(sb.from('shift_templates').select('*').in('member_id', S.my.map(m => m.id)));
  S.ov = await q(sb.from('shift_overrides').select('*').in('member_id', S.my.map(m => m.id)).gte('work_date', first).lte('work_date', last));
  S.inc = await q(sb.from('incentives').select('*').in('member_id', S.my.map(m => m.id)).eq('month', first));
  S.att = await q(sb.from('attendance').select('*').order('at', { ascending: false }).limit(10));
  await loadDealer();
}
async function loadDealer() {
  S.board = await q(sb.rpc('job_board')); S.tickets = await q(sb.rpc('ticket_balance'));
  S.apps = await q(sb.rpc('my_applications')); S.slots = await q(sb.rpc('my_slots'));
  S.wallet = (await q(sb.rpc('my_wallet')))?.[0] || { balance: 0, available: 0 };
  S.notis = await q(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(30));
  S.inq = await q(sb.from('inquiries').select('*').eq('from_user', S.user.id).order('created_at', { ascending: false }));
}
async function loadHQ() {
  const [first, last] = monthRange();
  S.stats = await q(sb.rpc('hq_store_stats', { p_from: first, p_to: last }));
  S.companies = await q(sb.from('companies').select('*').order('created_at', { ascending: false }));
  S.inq = await q(sb.from('inquiries').select('*').order('created_at', { ascending: false }).limit(100));
  S.hqProfiles = await q(sb.from('profiles').select('id,name,kind'));
  S.hqOrders = await q(sb.from('orders').select('*').order('created_at', { ascending: false }).limit(50));
}
const payOf = p => E.payroll(p, S.y, S.m, S.tpl, S.ov, S.inc.filter(i => i.member_id === p.id).reduce((a, i) => a + i.amount, 0), TODAY, night());
const laborOf = (y, m) => S.members.filter(p => p.role !== 'owner').reduce((a, p) => { const r = E.payroll(p, y, m, S.tpl, S.ov, 0, TODAY, night()); return a + r.fullGross * (p.contract === '4대' ? 1.105 : 1); }, 0);

// ===== 화면 틀 =====
const TABS = {
  store: [['home', '🏠', '홈'], ['sched', '🗓', '스케줄'], ['sales', '💰', '매출'], ['staff', '👥', '직원'], ['jobs', '📣', '구인'], ['more', '☰', '더보기']],
  staff: [['work', '🗓', '내 근무'], ['attend', '📍', '출퇴근'], ['jobs', '📣', '구인'], ['wallet', '👛', '지갑'], ['me', '🙂', '내 정보']],
  dealer: [['jobs', '📣', '구인'], ['mywork', '🃏', '내 근무'], ['wallet', '👛', '지갑'], ['me', '🙂', '내 정보']],
  hq: [['dash', '📊', '대시보드'], ['stores', '🏢', '매장'], ['data', '🗂', '데이터 자산'], ['inq', '💬', '문의함']]
};
function render() {
  clearInterval(S.qrTimer);
  const tabs = TABS[S.mode], nav = $('#tabs'); nav.hidden = !tabs;
  if (tabs) nav.innerHTML = tabs.map(([k, i, l]) => `<button data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}><span>${i}</span>${l}</button>`).join('');
  $('#top-r').innerHTML = S.user ? `<button class="btn sm" data-act="logout">로그아웃</button>` : '';
  const V = { auth: vAuth, onboard: vOnboard,
    store: () => ({ improve: vImprove, home: vHome, sched: vSched, sales: vSales, staff: vStaff, jobs: vJobs, more: vMore }[S.tab] || vHome)(),
    staff: () => ({ work: vWork, attend: vAttend, jobs: vBoard, wallet: vWallet, me: vMe }[S.tab] || vWork)(),
    dealer: () => ({ jobs: vBoard, mywork: vMyWork, wallet: vWallet, me: vMe }[S.tab] || vBoard)(),
    hq: () => ({ dash: vHqDash, stores: vHqStores, data: vHqData, inq: vHqInq }[S.tab] || vHqDash)() };
  view.innerHTML = (V[S.mode] || vAuth)();
  if (S.mode === 'store' && S.tab === 'more' && S.sub === 'qr') startQR();
  if (S.mode === 'store' && S.tab === 'more' && S.sub === 'rot' && S.rot) rotTick();
  if (S.mode === 'store' && S.tab === 'sales') closeCalc();
  if (S.mode === 'store' && S.tab === 'jobs') feeBox();
}

// ===== 로그인·첫 설정 =====
function vAuth() {
  const up = S.authMode === 'signup';
  return `<div class="hero"><img src="icon-512.png" width="96" height="96" alt=""><h1>+EV</h1><p class="sub">홀덤펍 매출·스케줄·급여·구인을 한 곳에서</p></div>
  <div class="card"><div class="seg" style="margin-bottom:14px"><button data-act="authmode" data-v="login" aria-pressed="${!up}">로그인</button><button data-act="authmode" data-v="signup" aria-pressed="${up}">처음이에요 (가입)</button></div>
  <form class="f" id="auth-form">${up ? '<label class="fl">이름<input name="name" required autocomplete="name"></label>' : ''}
    <label class="fl">이메일<input name="email" type="email" required autocomplete="email"></label>
    <label class="fl">비밀번호 <input name="pw" type="password" minlength="6" required autocomplete="${up ? 'new-password' : 'current-password'}"></label>
    <button class="btn pri full" type="submit">${up ? '가입하기' : '로그인'}</button></form>${up ? '<p class="note">가입하면 바로 시작돼요.</p>' : ''}</div>`;
}
function vOnboard() {
  const k = S.onb;
  if (!k) return `<h1>반가워요${S.prof.name ? `, ${esc(S.prof.name)}님` : ''}!</h1><p class="sub">어떤 분이세요?</p>
    <div class="choice"><button data-act="onb" data-v="owner"><b>🏢 매장 대표·점주예요</b><small>매출·스케줄·급여 관리, 딜러 구인. 사업자등록번호가 필요해요.</small></button>
    <button data-act="onb" data-v="dealer"><b>🃏 딜러·스태프예요</b><small>공고를 보고 지원하거나, 매장 가입코드로 소속될 수 있어요. 가입하면 지원권 3장을 드려요.</small></button></div>
    <p class="note">점장은 대표님이 직원으로 등록한 뒤 점장 권한을 주면 돼요. 먼저 딜러·스태프로 가입해 매장 가입코드로 소속 신청하세요.</p>`;
  if (k === 'owner') return `<h1>매장 등록</h1><p class="sub">사업자등록번호가 없으면 가입할 수 없어요. 2주 무료로 시작해요.</p>
    <form class="f card" id="owner-form"><label class="fl">회사(상호)<input name="name" required placeholder="예: 로얄플러시"></label>
    <label class="fl">브랜드 (프랜차이즈면)<input name="brand" placeholder="없으면 비워두세요"></label>
    <label class="fl">사업자등록번호 (10자리)<input name="biz" required inputmode="numeric" placeholder="123-45-67890"></label>
    <label class="fl">첫 매장 이름<input name="store" required placeholder="예: 강남 1호점"></label>
    <label class="fl">지역<input name="area" placeholder="예: 서울 강남"></label>
    <label class="fl">대표님 이름<input name="nick" required value="${esc(S.prof.name)}"></label>
    <button class="btn pri full">매장 만들기</button><button class="btn full" type="button" data-act="onb" data-v="">뒤로</button></form>`;
  return `<h1>딜러·스태프로 시작</h1><p class="sub">매장이 지원자 목록에서 보는 내용이에요. 연락처는 채용된 뒤에만 매장에 보여요.</p>
    <form class="f card" id="dealer-form"><label class="fl">이름(닉네임)<input name="name" required value="${esc(S.prof.name)}"></label>
    <label class="fl">휴대폰<input name="phone" required inputmode="tel" placeholder="010-0000-0000"></label>
    <label class="fl">경력 (개월)<input name="career" type="number" min="0" value="0"></label>
    <label class="fl">자기소개<textarea name="bio" rows="3" placeholder="예: 2년차 딜러, 토너먼트 진행 가능, 야간 가능"></textarea></label>
    <button class="btn pri full">시작하기 · 지원권 3장 받기</button><button class="btn full" type="button" data-act="onb" data-v="">뒤로</button></form>`;
}

// ===== 대표·점장 =====
function storeHead(title) {
  const trial = S.company?.plan === 'trial' ? Math.max(0, Math.ceil((new Date(S.company.trial_ends) - now) / 864e5)) : null;
  return `<div class="row between"><div><h1>${title}</h1><p class="sub" style="margin:0">${esc(S.company?.name || '')} · ${esc(S.store?.name)}${S.company && !S.company.biz_verified ? ' · <span class="warn">사업자 확인 중</span>' : ''}</p></div>
  <div class="row">${trial != null ? `<span class="pill y">무료 체험 D-${trial}</span>` : ''}${S.stores.length > 1 ? `<select id="store-sel" style="width:auto">${S.stores.map(s => `<option value="${s.id}" ${s.id === S.store.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}</div></div>`;
}
function monthNav() { return `<span class="row"><button class="btn sm" data-act="mon" data-v="-1">◀</button><b class="num">${S.y}년 ${S.m}월</b><button class="btn sm" data-act="mon" data-v="1">▶</button></span>`; }
function monthSummary(y, m) {
  const [f, l] = monthRange(y, m), rs = S.hist.filter(r => r.report_date >= f && r.report_date <= l), n = rs.length, sales = rs.reduce((a, r) => a + r.sales, 0);
  const cur = y === now.getFullYear() && m === now.getMonth() + 1, proj = cur && n >= 3 ? sales / n * E.daysIn(y, m) : sales; // 보고 3일 미만이면 예상 대신 실제 합계
  const exp = {}; S.expAll.filter(x => x.spent_on >= f && x.spent_on <= l).forEach(x => exp[x.category] = (exp[x.category] || 0) + x.amount);
  const card = rs.reduce((a, r) => a + (r.card || 0), 0) * 0.016 * (cur && n ? E.daysIn(y, m) / n : 1);
  if (!exp.card && card) exp.card = card;
  const urgent = S.posts.filter(p => p.kind === 'urgent' && p.created_at.slice(0, 10) >= f && p.created_at.slice(0, 10) <= l).reduce((a, p) => a + (p.paid_amount || 0), 0);
  const labor = laborOf(y, m) + urgent, cost = labor + Object.values(exp).reduce((a, v) => a + v, 0);
  return { n, sales, proj, exp, labor, urgent, cost, left: proj - cost, bep: proj ? Math.ceil(cost / (proj / E.daysIn(y, m))) : null };
}
function vHome() {
  const M = monthSummary(S.y, S.m), [y, m, d] = TODAY.split('-').map(Number), pro = S.company?.plan !== 'basic';
  const todayList = S.members.filter(p => p.role !== 'owner').map(p => ({ p, t: E.shiftOn(p.id, y, m, d, S.tpl, S.ov) })).filter(x => x.t);
  const months = Array.from({ length: 6 }, (_, i) => { const dt = new Date(S.y, S.m - 6 + i, 1); return [dt.getFullYear(), dt.getMonth() + 1]; }).map(([yy, mm]) => ({ yy, mm, s: monthSummary(yy, mm) }));
  const mx = Math.max(1, ...months.map(x => x.s.proj)), R = S.rank;
  return `${storeHead('브리핑')}
  ${rankBar()}
  <div style="margin-top:10px">${monthNav()}</div>
  <div class="grid2"><div class="card kpi"><div class="l">${S.m}월 매출 (보고 ${M.n}일)</div><div class="v num">₩${E.won(M.sales)}</div></div><div class="card kpi"><div class="l">월말 예상</div><div class="v num up">${M.n >= 3 || M.proj !== M.sales ? '₩' + E.won(M.proj) : '<small class="mut" style="font-size:13px">보고 3일부터 보여요</small>'}</div></div></div>
  <div class="card"><h3>${S.m}월 계산서 <small>월말 예상 기준</small></h3>
    <div class="li"><b>매출</b><b class="num">₩${E.won(M.proj)}</b></div>
    <div class="li"><span class="mut">− 인건비 (스케줄·4대보험 사업주분·긴급 구인 포함)</span><span class="num">₩${E.won(M.labor)}</span></div>
    ${Object.entries(M.exp).map(([k, v]) => `<div class="li"><span class="mut">− ${CAT[k] || k}</span><span class="num">₩${E.won(v)}</span></div>`).join('')}
    <div class="li"><b>= 남는 돈</b><b class="num ${M.left >= 0 ? 'up' : 'down'}" style="font-size:20px">₩${E.won(M.left)}</b></div>
    <p class="note">${M.bep && M.bep <= E.daysIn(S.y, S.m) ? `손익분기: <b class="up">${S.m}월 ${M.bep}일</b>에 넘어요.` : '이번 달은 손익분기를 못 넘어요.'} 고지서는 매출 탭에서 넣으면 바로 반영돼요.</p></div>
  ${lightsCard(false)}
  <div class="card"><h3>월별 매출 <small>최근 6개월</small></h3><div class="bars">${months.map(x => `<div class="bar"><em class="num">${x.s.proj ? man(x.s.proj) : '-'}</em><i style="height:${Math.max(2, x.s.proj / mx * 100)}%"></i><small>${x.mm}월</small></div>`).join('')}</div></div>
  <div class="card"><h3>오늘 근무 <small>${todayList.length}명</small></h3>${todayList.map(({ p, t }) => `<div class="li"><div><b>${esc(p.nick)}</b><small>${esc(p.job_role || '')}</small></div><span class="num">${t5(t.s)}–${t5(t.e)}</span></div>`).join('') || '<div class="empty">오늘 근무자가 없어요</div>'}</div>
  ${S.members.some(p => p.role !== 'owner') ? '' : `<div class="card"><h3>처음 할 일</h3><div class="li"><div><b>① 직원 등록</b><small>시급·계약·계좌까지</small></div><button class="btn sm pri" data-tab="staff">하러 가기</button></div><div class="li"><div><b>② 스케줄 짜기</b><small>요일 기본 + 날짜별 수정</small></div><button class="btn sm" data-tab="sched">하러 가기</button></div><div class="li"><div><b>③ 매일 매출 보고</b></div><button class="btn sm" data-tab="sales">하러 가기</button></div></div>`}
  ${S.joins.length ? `<div class="card" style="border-color:rgba(245,158,11,.5)"><h3>소속 신청 ${S.joins.length}건 <button class="btn sm pri" data-tab="staff">확인</button></h3></div>` : ''}
  ${S.notis.length ? `<div class="card"><h3>알림</h3>${S.notis.slice(0, 5).map(x => `<div class="li"><span>${esc(x.body)}</span><small>${fmtDT(x.created_at)}</small></div>`).join('')}</div>` : ''}`;
}
// ===== 매장 개선 (프로) — 순위·경고등·처방·퀘스트 =====
const TIERS = [[5, '💎 다이아'], [10, '🏆 플래티넘'], [25, '🥇 골드'], [50, '🥈 실버'], [101, '🥉 브론즈']];
const tierIdx = p => TIERS.findIndex(t => p <= t[0]);
const pctOf = (a, b) => (a - b) / b * 100;
const thisMonth = () => E.ymd(now.getFullYear(), now.getMonth() + 1, 1);
function lightsOf(B) {
  const m = B.mine, a = B.avg, f = (key, n, mine, avg, unit, higherBad = true) => {
    if (mine == null || !avg) return { key, n, unit, na: true };
    const d = pctOf(mine, avg) * (higherBad ? 1 : -1); return { key, n, mine, avg, unit, lv: d > 20 ? 'r' : d > 0 ? 'y' : 'g' };
  };
  return [f('util', '테이블 가동률', m.ept == null ? null : m.ept / 8 * 100, a.ept / 8 * 100, '%', false), f('elec', '전기세 (평당)', m.epy, a.epy, '원'), f('lr', '인건비율', m.lr, a.lr, '%'),
    f('sr', '긴급 구인 비중', m.sr, a.sr, '%'), f('gr', '음료·소모품 비중', m.gr, a.gr, '%'), f('npy', '통신·보안 (평당)', m.npy, a.npy, '원')];
}
function rxOf(B) {
  const m = B.mine, a = B.avg, py = +m.pyeong || 0, R = [], C = [], wd = m.wd || [], ok = wd.filter(v => v > 0);
  if (ok.length >= 5) { const avgD = ok.reduce((x, y) => x + y, 0) / ok.length, w = wd.indexOf(Math.min(...ok)), gap = avgD - wd[w];
    if (gap > 0) R.push(['rev_wd', `${E.WD[w]}요일 살리기 — 프리롤·단골 초대`, `가장 약한 ${E.WD[w]}요일 하루 매출이 평소보다 ${Math.round(gap / avgD * 100)}% 낮아요. 비슷한 매장들은 약한 요일에 무료 토너먼트(프리롤)나 첫 방문 바이인 할인으로 테이블을 채워요.`, gap * .3 * 4.3]); }
  if (m.ept && a.ept && m.ept < a.ept && m.tables && m.ticket) R.push(['rev_util', '빈 테이블 줄이기 — 테이블 합치기·대기 연락', `테이블당 하루 엔트리가 ${m.ept.toFixed(1)}번으로 평균(${a.ept.toFixed(1)}번)보다 적어요. 한산한 시간엔 테이블을 합쳐 게임을 빨리 열고, 대기 손님에게 자리가 나면 바로 연락하세요.`, (a.ept - m.ept) * m.tables * 30 * m.ticket * .3]);
  if (m.ticket && a.ticket && m.ticket < a.ticket && m.ept && m.tables) R.push(['rev_ticket', '엔트리 단가 올리기 — 리바이·애드온 점검', `엔트리 1번에 평균 ₩${E.won(m.ticket)}을 써요 (비슷한 매장 ₩${E.won(a.ticket)}). 바이인 구성과 리바이·애드온 규칙을 비슷한 매장 수준으로 맞춰 보세요.`, (a.ticket - m.ticket) * m.ept * m.tables * 30 * .3]);
  if (m.lr > a.lr) C.push(['cost_lr', '손님 적은 시간 인원 줄이기', `인건비가 매출의 ${m.lr.toFixed(1)}%예요 (평균 ${a.lr.toFixed(1)}%). 스케줄 탭의 요일별 적정 인원에 맞춰 평일 이른 시간 배치를 줄이세요.`, (m.lr - a.lr) / 100 * m.sales * .5]);
  if (m.sr > a.sr) C.push(['cost_sr', '긴급 구인 줄이기 — 스케줄 1주 전 확정', `인건비 중 긴급 구인이 ${m.sr.toFixed(1)}%예요 (평균 ${a.sr.toFixed(1)}%). 스케줄을 1주 전에 확정하고 예비 인원을 한 명 정해 두세요.`, (m.sr - a.sr) / 100 * m.labor * .5]);
  if (m.gr > a.gr) C.push(['cost_gr', '음료·소모품 — 묶음 발주·무료 음료 기준', `매출의 ${m.gr.toFixed(1)}%를 음료·소모품에 써요 (평균 ${a.gr.toFixed(1)}%). 한 번에 묶어 주문하고 1인 무료 음료 기준을 정해 두세요.`, (m.gr - a.gr) / 100 * m.sales * .5]);
  if (m.epy && a.epy && m.epy > a.epy) C.push(['cost_elec', '전기 — 영업 전 에어컨 1대·LED 타이머', `평당 전기세가 ₩${E.won(m.epy)}이에요 (평균 ₩${E.won(a.epy)}). 아래 '전기세·수도세 아끼는 방법'을 참고하세요.`, (m.epy - a.epy) * py * .5]);
  if (m.npy && a.npy && m.npy > a.npy) C.push(['cost_net', '통신·보안 제휴 요금으로 바꾸기', `평당 통신·보안비가 ₩${E.won(m.npy)}이에요 (평균 ₩${E.won(a.npy)}). +EV 제휴 결합 상품으로 견적을 받아 보세요.`, (m.npy - a.npy) * py * .6, '통신·보안 제휴']);
  if (m.wpy && a.wpy && m.wpy > a.wpy) C.push(['cost_water', '수도 — 절수 밸브·제빙기 배수 점검', `평당 수도세가 ₩${E.won(m.wpy)}이에요 (평균 ₩${E.won(a.wpy)}). 제빙기 배수가 새면 수도세가 20% 넘게 올라요.`, (m.wpy - a.wpy) * py * .5]);
  const top = L => L.filter(x => x[3] >= 10000).sort((x, y) => y[3] - x[3]).slice(0, 3);
  return { rev: top(R), cost: top(C) };
}
function gameOf(B, rx) {
  const mon = thisMonth(), done = new Set(S.quests.filter(x => x.month === mon).map(x => x.key)), keys = [...rx.rev, ...rx.cost].map(r => r[0]);
  const xp = S.quests.length * 150 + S.hist.length * 10, lv = Math.floor(xp / 500) + 1;
  const dates = new Set(S.hist.map(r => r.report_date)); let streak = 0;
  for (let d = new Date(now); ; d.setDate(d.getDate() - 1)) { const k = E.ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); if (dates.has(k)) streak++; else if (k !== TODAY) break; }
  const ms = Array.from({ length: 6 }, (_, i) => { const dt = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1); return monthSummary(dt.getFullYear(), dt.getMonth() + 1); }).filter(x => x.n);
  let up = 0; for (let i = ms.length - 1; i > 0 && ms[i].left > ms[i - 1].left; i--) up++;
  return { done, doneN: keys.filter(k => done.has(k)).length, total: keys.length, xp, lv, streak, up };
}
function rankBar() {
  const B = S.bench; if (!B) return '';
  if (!B.ready) return `<div class="card rankbar"><div><b>우리 매장 순위</b><small class="mut" style="display:block">${B.why === 'mine' ? '매출 보고가 7일 쌓이면 비슷한 매장과 비교해 드려요' : '비교할 매장이 3곳 이상 모이면 보여요'}</small></div></div>`;
  if (B.locked) return `<div class="card rankbar"><div><b>우리 매장 순위</b><small class="mut" style="display:block">비슷한 매장 ${B.n}곳 중</small></div><div class="num mosaic" style="font-size:22px;font-weight:800">상위 18%</div>
    ${isOwner() ? `<button class="btn sm gold" data-act="goto" data-t="improve">프로(월 ${E.won(PRICE.pro)}원)로 보기</button>` : '<button class="btn sm" data-act="ask-pro">대표님께 요청</button>'}</div>`;
  return `<div class="card rankbar"><div><b>우리 매장 순위</b><small class="mut" style="display:block">비슷한 매장 ${B.n}곳 중 · ${+B.month.slice(5, 7)}월</small></div>
    <div class="rkv"><small>매출</small><b class="num">상위 ${B.s_pct}%</b></div><div class="rkv"><small>순이익</small><b class="num">상위 ${B.h_pct}%</b></div><div class="rkv"><small>등급</small><b>${TIERS[tierIdx(B.s_pct)][1]}</b></div>
    <button class="btn sm" data-tab="improve">매장 개선 →</button></div>`;
}
function lightsCard(full) {
  const B = S.bench; if (!B?.ready || B.locked) return '';
  const L = lightsOf(B), bad = L.filter(x => x.lv && x.lv !== 'g').length, rx = rxOf(B), gain = rx.rev.reduce((a, r) => a + r[3], 0) + rx.cost.reduce((a, r) => a + r[3], 0);
  const val = (v, u) => u === '원' ? '₩' + E.won(v) : v.toFixed(1) + '%';
  return `<div class="card" style="border-color:${bad ? 'rgba(239,68,68,.45)' : 'var(--line)'}"><h3>우리 매장 경고등 <small>비슷한 매장 ${B.n}곳과 비교</small></h3><div class="lights">
    ${L.map(x => `<div class="light"><div><b>${x.na ? '⚪' : { r: '🔴', y: '🟡', g: '🟢' }[x.lv]} ${x.n}</b><small>${x.na ? (x.key === 'util' ? '매출 보고에 엔트리 수를 넣으면 켜져요' : x.key === 'elec' || x.key === 'npy' ? '고지서를 넣으면 켜져요 (매출 탭)' : '데이터가 쌓이면 켜져요') : `내 매장 ${val(x.mine, x.unit)} · 평균 ${val(x.avg, x.unit)}`}</small></div>${x.na ? '' : `<span class="pill ${x.lv}">${{ r: '위험', y: '주의', g: '좋음' }[x.lv]}</span>`}</div>`).join('')}</div>
    ${!+B.mine.pyeong || !B.mine.tables ? `<p class="note">매장 평수·테이블 수를 넣으면 평당 비교가 정확해져요. <button class="btn sm" data-act="goto" data-t="more" data-s="settings">매장 설정</button></p>` : ''}
    ${!full && gain ? `<div class="promo"><span>${bad ? `경고등 <b class="down">${bad}개</b>를 고치면` : '처방대로 하면'} 매달 약 <b class="up">+₩${man(gain)}</b>이 더 남아요.</span><button class="btn sm pri" data-tab="improve">고치는 법 보기 →</button></div>` : ''}</div>`;
}
function radar(sc) {
  const K = [['s_sales', '평당 매출'], ['s_profit', '수익률'], ['s_labor', '인건비 효율'], ['s_fixed', '고정비 관리'], ['s_util', '테이블 가동']], R = 80, cx = 110, cy = 100;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [cx + Math.cos(a) * R * v / 100, cy + Math.sin(a) * R * v / 100]; };
  const poly = vals => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  const mine = K.map(([k]) => sc?.[k] ?? 50);
  return `<div class="radar"><svg viewBox="-30 -8 280 222" role="img" aria-label="5가지 점수">${[25, 50, 75, 100].map(v => `<polygon points="${poly([v, v, v, v, v])}" fill="none" stroke="var(--line)"/>`).join('')}
    <polygon points="${poly([50, 50, 50, 50, 50])}" fill="none" stroke="#F59E0B" stroke-dasharray="4 3"/><polygon points="${poly(mine)}" fill="rgba(16,185,129,.25)" stroke="#34D399" stroke-width="2"/>
    ${K.map(([, l], i) => { const [x, y] = pt(i, 122); return `<text x="${x}" y="${y}" font-size="10.5" fill="var(--muted)" text-anchor="middle" dominant-baseline="middle">${l}</text>`; }).join('')}</svg>
    <div>${K.map(([k, l], i) => `<div class="sbar"><span>${l}</span><i><b style="width:${mine[i]}%"></b><em></em></i><span class="num">${mine[i]}</span></div>`).join('')}</div></div>`;
}
function vImprove() {
  const B = S.bench, head = storeHead('✦ 매장 개선');
  if (!B?.ready) return `${head}${rankBar()}<div class="card empty">${B?.why === 'mine' ? '매출 보고가 7일 이상 쌓이면 비슷한 매장과 비교해서 처방을 드려요.' : '비교할 매장이 모이는 중이에요.'}</div>`;
  if (B.locked) return `${head}<div class="paywall"><div class="blurme" aria-hidden="true">${radar({ s_sales: 70, s_profit: 55, s_labor: 40, s_fixed: 65, s_util: 50 })}<div class="card"><h3>이번 달 처방</h3><div class="li">매출 늘리기 ··· 월 +₩···만</div><div class="li">비용 줄이기 ··· 월 −₩···만</div></div></div>
    <div class="over"><div class="card"><div class="mut" style="font-size:12px">✦ 매장 개선 · 프로 요금제(월 ${E.won(PRICE.pro)}원)</div><h2 style="margin:10px 0 4px">내 매장은 비슷한 매장 ${B.n}곳 중<br>상위 몇 %일까요?</h2><div class="num mosaic" style="font-size:30px;font-weight:800;margin:6px 0">상위 ??%</div>
      <p class="mut" style="font-size:14px">비슷한 매장들과 비교해서 <b>무엇을 해야 하는지</b> 알려드려요. 매달 새 처방과 지난달 실행 결과까지요.</p>
      ${isOwner() ? '<button class="btn pri full" data-act="goto" data-t="more" data-s="settings">프로로 올리기</button>' : '<button class="btn full" data-act="ask-pro">대표님께 요청하기</button>'}</div></div></div>`;
  const m = B.mine, a = B.avg, rx = rxOf(B), G = gameOf(B, rx), revSum = rx.rev.reduce((x, r) => x + r[3], 0), costSum = rx.cost.reduce((x, r) => x + r[3], 0);
  const ti = tierIdx(B.s_pct), nx = ti > 0 ? TIERS[ti - 1] : null, cut = nx && B.cut?.[String(nx[0])], gap = cut ? Math.max(0, cut - m.sales) : 0;
  const hist = Array.from({ length: 4 }, (_, i) => { const dt = new Date(now.getFullYear(), now.getMonth() - 3 + i, 1); return monthSummary(dt.getFullYear(), dt.getMonth() + 1); }).filter(x => x.n);
  const g = hist.length >= 2 ? Math.min(1.1, Math.max(.9, (hist.at(-1).proj / hist[0].proj) ** (1 / (hist.length - 1)))) : 1, cur = hist.at(-1) || monthSummary(S.y, S.m);
  const base = [1, 2, 3].map(i => cur.proj * g ** i), nowL = base.map(v => v - cur.cost), after = base.map((v, i) => v + revSum * (i ? 1 : .5) - (cur.cost - costSum * (i ? 1 : .6)));
  const mn = [1, 2, 3].map(i => (now.getMonth() + i) % 12 + 1), mx = Math.max(1, ...nowL, ...after);
  const quest = (r, t) => { const on = G.done.has(r[0]); return `<button class="quest ${on ? 'on' : ''}" data-act="quest" data-k="${r[0]}"><span class="qc">${on ? '✓' : ''}</span><span class="qt"><b>${esc(r[1])}</b><small>${t === 'r' ? '매출 월 +' : '비용 월 −'}₩${man(r[3])}</small></span><span class="qx">+150 XP</span></button>`; };
  const rxCard = (r, i, t) => `<div class="card rx"><div class="n ${t}">${i + 1}</div><div><b>${esc(r[1])}</b><p>${esc(r[2])}</p>${r[4] ? `<button class="btn sm" data-act="partner" data-v="${esc(r[4])}">${esc(r[4])} 견적 받기</button>` : ''}</div><span class="num ${t === 'r' ? 'up' : ''}" style="white-space:nowrap">월 ${t === 'r' ? '+' : '−'}₩${man(r[3])}</span></div>`;
  const cmpRow = (n, mine, avg, top, good) => `<tr><td>${n}</td><td class="r num ${good ? 'up' : 'down'}">${mine}</td><td class="r num mut">${avg}</td><td class="r num mut">${top}</td></tr>`;
  const wdMax = Math.max(1, ...(m.wd || []), ...(a.wd || [])), weak = (m.wd || []).indexOf(Math.min(...(m.wd || []).filter(v => v > 0)));
  const staff = S.members.filter(p => p.role !== 'owner' && p.hourly_rate && B.rates?.[p.job_role]).map(p => { const r = payOf(p), avg = B.rates[p.job_role], d = p.hourly_rate - avg; return { p, avg, d, h: r.hours, mon: d * r.hours }; }).sort((x, y) => y.mon - x.mon);
  return `${head}${rankBar()}
  <div class="card game"><div class="row between"><div><small class="mut">${esc(S.store.name)} · 이번 시즌</small><div class="glv">Lv.${G.lv} <span>${TIERS[ti][1]} 매장</span></div></div>
    <div style="text-align:right">${nx ? `<small class="mut">다음 등급 ${nx[1]} (상위 ${nx[0]}%)까지</small><b class="num" style="display:block">${gap ? `매출 +₩${man(gap)}` : '거의 다 왔어요'}</b>` : '<b>최고 등급이에요</b>'}</div></div>
    <div class="xpbar"><i style="width:${G.xp % 500 / 5}%"></i><span>${G.xp % 500} / 500 XP</span></div>
    <div class="badges">${G.up >= 2 ? `<span>🔥 ${G.up}개월 연속 순이익 상승</span>` : ''}${G.streak >= 3 ? `<span>🧾 마감 ${G.streak}일 연속</span>` : ''}${G.doneN >= 3 ? '<span class="new">💡 이번 달 퀘스트 3개 완료</span>' : '<span class="lock">🔒 퀘스트 3개 완료하면 배지</span>'}</div>
    <p class="note">경험치는 매출 보고 1일 10XP, 처방 실행 1개 150XP예요.</p></div>
  ${G.total ? `<div class="card"><h3>⚔️ 이번 달 퀘스트 <small>${G.doneN}/${G.total} 완료</small></h3><div class="quests">${rx.rev.map(r => quest(r, 'r')).join('')}${rx.cost.map(r => quest(r, 'c')).join('')}</div><p class="note">한 일을 체크하면 경험치가 쌓여요. 효과는 다음 달 실제 숫자로 확인할 수 있어요.</p></div>` : ''}
  ${revSum + costSum ? `<div class="card" style="border-color:rgba(16,185,129,.5)"><small class="mut">처방대로 하면</small><div class="num up" style="font-size:24px;font-weight:800;margin-top:4px">${mn[2]}월 남는 돈 ₩${man(after[2])}</div><p class="mut" style="margin:4px 0 10px">지금 그대로면 ₩${man(nowL[2])} → <b class="up">매달 +₩${man(after[2] - nowL[2])}</b> 더 남아요</p>
    <div class="bars">${[0, 1, 2].map(i => `<div class="bar2"><div><i style="height:${Math.max(2, nowL[i] / mx * 100)}%"></i><i class="g" style="height:${Math.max(2, after[i] / mx * 100)}%"></i></div><small>${mn[i]}월</small></div>`).join('')}</div>
    <p class="note"><span style="color:var(--s2)">■</span> 지금 그대로 · <span style="color:var(--green)">■</span> 처방 실행. 최근 흐름으로 계산했고 첫 달은 효과를 절반만 반영해요.</p></div>` : '<div class="card"><h3>👏 지금은 고칠 곳이 거의 없어요</h3><p class="mut" style="margin:0">모든 항목이 비슷한 매장 평균보다 좋아요. 지금처럼만 유지하세요.</p></div>'}
  <div class="card"><h3>5가지 점수 <small>100점 만점 · <b style="color:#34D399">초록</b> 내 매장 · <b style="color:#F59E0B">점선</b> 비슷한 매장 중간</small></h3>${radar(B.score)}</div>
  ${lightsCard(true)}
  ${rx.rev.length ? `<h2 class="band">📈 매출 늘리기 <small class="mut">월 +₩${man(revSum)}</small></h2>${rx.rev.map((r, i) => rxCard(r, i, 'r')).join('')}` : ''}
  <div class="card"><h3>비슷한 매장과 비교</h3><div class="tbl"><table style="min-width:0"><thead><tr><th>항목</th><th class="r">내 매장</th><th class="r">평균</th><th class="r">상위 25%</th></tr></thead><tbody>
    ${cmpRow('월 매출', man(m.sales), man(a.sales), man(B.top25.sales), m.sales >= a.sales)}
    ${m.spy ? cmpRow('평당 매출', man(m.spy), man(a.spy), man(B.top25.spy), m.spy >= a.spy) : ''}
    ${m.ept ? cmpRow('테이블당 하루 엔트리', m.ept.toFixed(1), a.ept.toFixed(1), (+B.top25.ept).toFixed(1), m.ept >= a.ept) : ''}
    ${cmpRow('순이익률', m.pm.toFixed(1) + '%', a.pm.toFixed(1) + '%', '-', m.pm >= a.pm)}</tbody></table></div><p class="note">다른 매장 이름이나 개별 숫자는 보여주지 않고 익명 평균만 써요.</p></div>
  ${m.wd && a.wd ? `<div class="card"><h3>요일별 하루 매출 ${weak >= 0 ? `<small>가장 약한 요일 <b class="down">${E.WD[weak]}요일</b></small>` : ''}</h3><div class="bars">${E.WD.map((w, i) => `<div class="bar2"><div><i class="g" style="height:${Math.max(2, (m.wd[i] || 0) / wdMax * 100)}%"></i><i style="height:${Math.max(2, (a.wd[i] || 0) / wdMax * 100)}%"></i></div><small>${w}</small></div>`).join('')}</div><p class="note"><span style="color:var(--green)">■</span> 내 매장 · <span style="color:var(--s2)">■</span> 평균</p></div>` : ''}
  ${rx.cost.length ? `<h2 class="band">💸 비용 줄이기 <small class="mut">월 −₩${man(costSum)}</small></h2>${rx.cost.map((r, i) => rxCard(r, i, 'c')).join('')}` : ''}
  <div class="card"><h3>+EV 제휴로 바로 줄이기</h3><div class="li"><div><b>📶 인터넷·통신</b><small>결합 요금제</small></div><button class="btn sm" data-act="partner" data-v="인터넷·통신 제휴">견적 받기</button></div><div class="li"><div><b>📹 CCTV·보안</b><small>무인경비 결합</small></div><button class="btn sm" data-act="partner" data-v="CCTV·보안 제휴">견적 받기</button></div></div>
  <div class="card"><h3>전기세·수도세 아끼는 방법</h3><div class="grid2">
    <div><small class="mut">⚡ 전기</small>${[['영업 전 2시간은 에어컨 1대만', '가장 쉽게 줄이는 방법이에요'], ['테이블 조명 LED + 타이머', '빈 테이블은 자동 소등'], ['냉장고 온도 4℃ → 5℃', '음료 품질에 영향 없어요'], ['한전 계약전력 점검', '사용량보다 크면 기본료만 새요']].map(([t, d]) => `<div class="li"><div><b>${t}</b><small>${d}</small></div></div>`).join('')}</div>
    <div><small class="mut">💧 수도</small>${[['화장실 절수 밸브', '개당 약 1만 원'], ['제빙기 배수 점검', '새면 수도세가 20% 넘게 올라요'], ['세척기는 마감 때 모아서', '하루 한 번만 돌리기']].map(([t, d]) => `<div class="li"><div><b>${t}</b><small>${d}</small></div></div>`).join('')}</div></div></div>
  ${staff.length ? `<div class="card"><h3>직원별 인건비 <small>같은 직책 평균 시급과 비교 · ${S.m}월 스케줄 기준</small></h3><div class="tbl"><table style="min-width:0;font-size:12.5px"><thead><tr><th>직원</th><th class="r">시급</th><th class="r">평균</th><th class="r">근무</th><th class="r">월 차이</th></tr></thead><tbody>
    ${staff.map(x => `<tr><td><b>${esc(x.p.nick)}</b> <small class="mut">${esc(x.p.job_role)}</small></td><td class="r num">${E.won(x.p.hourly_rate)}</td><td class="r num mut">${E.won(x.avg)}</td><td class="r num">${x.h.toFixed(0)}h</td><td class="r num ${x.mon > 0 ? 'down' : 'up'}">${x.mon > 0 ? '+' : ''}₩${E.won(x.mon)}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">빨간색은 평균보다 비싼 사람이에요. 비싸다고 나쁜 건 아니에요 — 경력·실력이 좋으면 금·토 피크 시간에 배치하세요.</p></div>` : ''}`;
}
// ===== 테이블 로테이션 =====
const MIN = 60000, mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${E.pad(s % 60)}`; };
function defaultLayout(n) { n = Math.max(1, Math.min(24, +n || 6)); const L = []; for (let i = 0; i < n; i++) L.push({ id: 'T' + (i + 1), x: (i % 4) * 2, y: Math.floor(i / 4), w: 2 }); L.push({ id: 'C', x: 6, y: Math.ceil(n / 4), w: 2, counter: true }); return L; }
const rotState = () => S.rot || (S.rot = { t: {}, brk: [], deal: 40, rest: 15 });
const nickOf = id => S.members.find(m => m.id === id)?.nick || '?';
async function loadRot() {
  const r = await q(sb.from('store_rotation').select('state').eq('store_id', S.store.id).maybeSingle());
  S.rot = { t: {}, brk: [], deal: 40, rest: 15, ...(r?.state || {}) }; S.layout = S.store.layout || defaultLayout(S.store.tables);
}
// ponytail: 마지막 저장이 이김(동시에 두 기기에서 바꾸면 늦은 쪽 기준). 여러 명이 동시에 쓰면 실시간 구독으로 바꾸기
const saveRot = () => q(sb.from('store_rotation').upsert({ store_id: S.store.id, state: S.rot, updated_at: new Date().toISOString() }));
function rotMove(mid, to) {
  const R = rotState(), nowT = Date.now();
  for (const k in R.t) if (R.t[k]?.m === mid) delete R.t[k];
  R.brk = R.brk.filter(b => b.m !== mid);
  if (to === 'BREAK') R.brk.push({ m: mid, since: nowT });
  else if (to && to !== 'OFF') { const cur = R.t[to]; if (cur) R.brk.push({ m: cur.m, since: nowT }); R.t[to] = { m: mid, since: nowT }; }
}
function rotAuto() {
  const R = rotState(), nowT = Date.now(), due = Object.entries(R.t).filter(([, v]) => nowT - v.since >= R.deal * MIN).sort((a, b) => a[1].since - b[1].since);
  let n = 0; for (const [tid] of due) { const ready = R.brk.filter(b => nowT - b.since >= R.rest * MIN).sort((a, b) => a.since - b.since)[0]; if (!ready) break; rotMove(ready.m, tid); n++; }
  return n;
}
function vRot() {
  const R = rotState(), L = S.layout, rows = Math.max(3, ...L.map(i => i.y + 1)), nowT = Date.now(), edit = S.editLayout;
  const [y, m, d] = TODAY.split('-').map(Number), dealers = S.members.filter(p => p.role !== 'owner'), busy = new Set([...Object.values(R.t).map(v => v.m), ...R.brk.map(b => b.m)]);
  const today = dealers.filter(p => E.shiftOn(p.id, y, m, d, S.tpl, S.ov)), pool = dealers.filter(p => !busy.has(p.id)).sort((a, b) => today.includes(b) - today.includes(a));
  const chip = (mid, since, lim) => `<button class="dchip ${nowT - since >= lim * MIN ? 'due' : ''} ${S.pick === mid ? 'picked' : ''}" draggable="true" data-act="pick" data-m="${mid}"><span>${esc(nickOf(mid))}</span><small data-since="${since}" data-lim="${lim}">${mmss(nowT - since)}</small></button>`;
  const occ = {}; L.forEach(it => { for (let k = 0; k < it.w; k++) occ[`${it.x + k},${it.y}`] = 1; });
  let cells = ''; for (let yy = 0; yy < rows + (edit ? 1 : 0); yy++) for (let xx = 0; xx < 8; xx++) if (!occ[`${xx},${yy}`]) cells += `<div class="fcell" ${edit ? `data-act="cell" data-v="${xx},${yy}"` : ''} style="grid-column:${xx + 1};grid-row:${yy + 1}"></div>`;
  const items = L.map(it => { const pos = `grid-column:${it.x + 1}/span ${it.w};grid-row:${it.y + 1}`, sel = S.selItem === it.id ? 'sel' : '';
    if (it.counter) return `<div class="counter ${sel}" ${edit ? `data-act="item" data-v="C"` : ''} style="${pos}">카운터</div>`;
    const v = R.t[it.id]; return `<div class="ftable ${v ? '' : 'off'} ${sel}" data-act="${edit ? 'item' : 'drop'}" data-v="${it.id}" style="${pos}"><span class="t">${it.id}</span>${v && !edit ? chip(v.m, v.since, R.deal) : ''}</div>`; }).join('');
  const dueN = Object.values(R.t).filter(v => nowT - v.since >= R.deal * MIN).length;
  return `${storeHead('테이블 로테이션')}<button class="btn sm" data-act="sub" data-v="">← 더보기</button>
  <div class="grid2"><div class="card kpi"><div class="l">딜링 중</div><div class="v num">${Object.keys(R.t).length}명</div></div><div class="card kpi"><div class="l">휴식 중</div><div class="v num">${R.brk.length}명</div></div>
    <div class="card kpi"><div class="l">교대할 사람</div><div class="v num ${dueN ? 'down' : 'up'}">${dueN}명</div></div>
    <div class="card"><div class="l mut" style="font-size:12px">교대 시간 (분)</div><div class="row" style="margin-top:6px;flex-wrap:nowrap"><label class="fl" style="flex:1">딜링<input type="number" min="5" step="5" value="${R.deal}" data-rot="deal"></label><label class="fl" style="flex:1">휴식<input type="number" min="5" step="5" value="${R.rest}" data-rot="rest"></label></div></div></div>
  <div class="card"><h3>매장 테이블 <span class="row">${edit ? '<button class="btn sm" data-act="lay-add">+ 테이블</button><button class="btn sm red" data-act="lay-del">선택 삭제</button><button class="btn sm pri" data-act="lay-save">배치 저장</button>' : `${dueN ? '<button class="btn sm gold" data-act="rot-auto">⟳ 자동 교대</button>' : ''}<button class="btn sm" data-act="lay-edit">배치 편집</button>`}</span></h3>
    <p class="note" style="margin-top:0">${edit ? '테이블이나 카운터를 누른 뒤 옮길 빈칸을 누르세요.' : `딜러를 누르고 테이블을 누르면 앉아요 (끌어다 놓아도 돼요). <b class="down">빨간 테두리</b>는 ${R.deal}분이 지나 교대할 사람이에요.`}</p>
    <div class="floor-wrap"><div class="floor" style="grid-template-rows:repeat(${rows + (edit ? 1 : 0)},64px)">${cells}${items}</div></div>
    ${edit ? '' : `<div class="zone" data-act="drop" data-v="BREAK"><b>☕ 휴식 · 대기 (${R.rest}분)</b><div>${R.brk.map(b => chip(b.m, b.since, R.rest)).join('') || '<small class="mut">여기로 옮기면 휴식 시간이 재져요</small>'}</div></div>
    <div class="zone" data-act="drop" data-v="OFF"><b>🙋 출근 전·대기 명단</b> <small class="mut">오늘 스케줄 있는 사람 먼저</small><div>${pool.map(p => `<button class="dchip ${S.pick === p.id ? 'picked' : ''} ${today.includes(p) ? '' : 'dim'}" draggable="true" data-act="pick" data-m="${p.id}"><span>${esc(p.nick)}</span><small>${esc(p.job_role || '')}</small></button>`).join('') || '<small class="mut">모두 배치됐어요</small>'}</div></div>`}</div>`;
}
function rotTick() { clearInterval(S.rotTimer); S.rotTimer = setInterval(() => { const els = document.querySelectorAll('[data-since]'); if (!els.length) return clearInterval(S.rotTimer); const nowT = Date.now(); els.forEach(el => { const ms = nowT - +el.dataset.since; el.textContent = mmss(ms); el.closest('.dchip')?.classList.toggle('due', ms >= +el.dataset.lim * MIN); }); }, 1000); }

// ===== 재고·발주 =====
const SHOP = [{ id: 1, c: 'drink', n: '캔 콜라 245ml', u: '30캔', p: 21000, sp: 18900 }, { id: 2, c: 'drink', n: '캔 사이다 245ml', u: '30캔', p: 20000, sp: 17900 }, { id: 3, c: 'drink', n: '에너지드링크 250ml', u: '24캔', p: 42000, sp: 37800 }, { id: 4, c: 'drink', n: '생수 500ml', u: '20병', p: 8900, sp: 7900 }, { id: 5, c: 'drink', n: '음료 디스펜서 시럽', u: '5L', p: 38000, sp: 33000 },
  { id: 6, c: 'alc', n: '생맥주 20L 케그', u: '1통', p: 89000, sp: 82000 }, { id: 7, c: 'alc', n: '병맥주 330ml', u: '24병', p: 36000, sp: 32400 },
  { id: 8, c: 'snack', n: '감자칩 대용량', u: '12봉', p: 28000, sp: 24500 }, { id: 9, c: 'snack', n: '믹스너트 1kg', u: '1봉', p: 21000, sp: 18500 }, { id: 10, c: 'snack', n: '팝콘 업소용', u: '10봉', p: 16000, sp: 13900 },
  { id: 11, c: 'supply', n: '플라스틱 카드 12덱', u: '1박스', p: 186000, sp: 149000 }, { id: 12, c: 'supply', n: '세라믹 칩 500pcs', u: '1세트', p: 420000, sp: 339000 }, { id: 13, c: 'supply', n: '딜러 조끼', u: '1벌', p: 39000, sp: 29000 }, { id: 14, c: 'supply', n: '맞춤 테이블 펠트', u: '1장', p: 260000, sp: 210000 }];
const SHOP_CAT = { drink: '음료', snack: '간식', supply: '소모품', alc: '주류' }, BILLS = [50000, 10000, 5000, 1000, 500, 100];
const item = id => SHOP.find(p => p.id === +id);
const restockQty = s => Math.max(1, Math.ceil(s.min * 2 - s.qty));
function stockCard() {
  const low = S.stock.filter(s => s.qty < s.min), missing = SHOP.filter(p => !S.stock.some(s => s.item_id === p.id));
  return `<div class="card"><h3>재고 <small>남은 수량만 고쳐주세요</small></h3>
    ${low.length ? `<div class="promo" style="background:rgba(239,68,68,.08)"><span>부족한 품목 <b class="down">${low.length}개</b></span><button class="btn sm gold" data-act="restock-all">한 번에 발주 담기</button></div>` : ''}
    ${S.stock.length ? `<div class="tbl"><table style="min-width:0"><thead><tr><th>품목</th><th class="r">남은 수량</th><th class="r">적정</th><th class="r">버틸 날</th><th></th></tr></thead><tbody>
    ${S.stock.map(s => { const p = item(s.item_id), days = s.use_per_day ? Math.floor(s.qty / s.use_per_day) : 99; return `<tr><td><b>${esc(p?.n)}</b><br><small class="mut">${esc(p?.u)} 단위</small></td><td class="r"><input type="number" min="0" step="0.5" data-stock="${s.item_id}" value="${+s.qty}" style="width:64px;padding:6px"></td><td class="r"><input type="number" min="0" step="0.5" data-stockmin="${s.item_id}" value="${+s.min}" style="width:56px;padding:6px"></td><td class="r num ${days <= 2 ? 'down' : ''}">${days > 30 ? '충분' : days + '일'}</td><td>${s.qty < s.min ? `<button class="btn sm" data-act="cart" data-v="${s.item_id}" data-n="${restockQty(s)}">담기</button>` : '<span class="pill g">충분</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="mut" style="margin:0 0 8px">관리할 품목을 추가하세요.</p>'}
    ${missing.length ? `<div class="row" style="margin-top:10px"><select id="stock-add" style="flex:1">${missing.map(p => `<option value="${p.id}">${esc(p.n)} (${esc(p.u)})</option>`).join('')}</select><button class="btn sm" data-act="stock-add">품목 추가</button></div>` : ''}
    <p class="note">버틸 날은 하루 평균 쓰는 양으로 계산해요. 적정 수량보다 적으면 발주에 담을 수 있어요.</p></div>`;
}
function closeCalc() {
  const f = $('#report-form'); if (!f) return; const v = n => +f.elements[n]?.value || 0, counted = BILLS.reduce((a, b) => a + b * v('b' + b), 0), cashSales = v('sales') - v('card') - v('transfer'), expected = v('start') + cashSales - v('expense'), diff = counted - expected, any = BILLS.some(b => f.elements['b' + b].value !== '');
  $('#close-out').innerHTML = `<div class="li"><span class="mut">현금 매출 (매출 − 카드 − 이체)</span><span class="num">₩${E.won(cashSales)}</span></div><div class="li"><span class="mut">금고에 있어야 할 돈</span><span class="num">₩${E.won(expected)}</span></div>
    ${any ? `<div class="li"><span class="mut">센 돈</span><span class="num">₩${E.won(counted)}</span></div><div class="li"><b>차액</b><b class="num ${Math.abs(diff) >= 10000 ? 'down' : diff ? 'warn' : 'up'}">${diff ? (diff > 0 ? '+' : '−') + '₩' + E.won(Math.abs(diff)) : '딱 맞아요'}</b></div>${Math.abs(diff) >= 10000 ? '<p class="note down" style="margin:0">1만 원 넘게 차이 나요. 저장하면 대표님께 알림이 가요.</p>' : ''}` : '<p class="note" style="margin:0">금고 현금을 세서 장수를 넣으면 차액을 계산해요.</p>'}`;
  f.dataset.diff = any ? diff : ''; f.dataset.cash = cashSales;
}
function vOrder() {
  const cart = Object.entries(S.cart).filter(([, n]) => n > 0).map(([id, n]) => ({ ...item(id), q: n })), pay = cart.filter(i => i.c !== 'alc'), alc = cart.filter(i => i.c === 'alc'), tot = pay.reduce((a, i) => a + i.sp * i.q, 0);
  const freq = {}; S.orders.forEach(o => o.items.forEach(i => freq[i.id] = (freq[i.id] || 0) + 1)); const fav = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => item(id)).filter(Boolean);
  return `${storeHead('발주')}<button class="btn sm" data-act="sub" data-v="">← 더보기</button>
  <div class="card"><h3>이렇게 주문돼요</h3><div class="li"><div><b>1. 담고 주문 요청</b><small>+EV가 파트너 도매처에 한 번에 넣어요</small></div></div><div class="li"><div><b>2. 확인 연락</b><small>운영사가 재고·배송일을 확인해 알림으로 알려드려요</small></div></div><div class="li"><div><b>3. 도착</b><small>상태가 바뀔 때마다 알림이 가요</small></div></div>
    <p class="note">앱 안 결제(토스)는 정식 오픈 때 붙어요. 지금은 주문 요청 후 운영사가 결제 방법을 안내해요. 가격은 파트너 계약 전 예시 가격이에요.</p></div>
  <div class="card"><label class="tog"><span><b>🧾 세금계산서 발행</b><small>사업자 번호로 전자세금계산서를 발행해 드려요</small></span><input type="checkbox" id="tax-inv" ${S.taxInv !== false ? 'checked' : ''}></label></div>
  ${fav.length ? `<div class="card"><h3>자주 주문한 상품</h3><div class="row">${fav.map(p => `<button class="btn sm" data-act="cart" data-v="${p.id}">↻ ${esc(p.n)}</button>`).join('')}</div></div>` : ''}
  <div class="card"><h3>상품</h3><div class="seg" style="margin-bottom:10px">${Object.entries(SHOP_CAT).map(([k, l]) => `<button data-act="scat" data-v="${k}" aria-pressed="${(S.shopCat || 'drink') === k}">${l}</button>`).join('')}</div>
    <div class="shop">${SHOP.filter(p => p.c === (S.shopCat || 'drink')).map(p => `<div class="sitem"><small class="mut">+EV 파트너</small><b>${esc(p.n)}</b><small class="mut">${esc(p.u)}</small><div><s class="mut num" style="font-size:12px">₩${E.won(p.p)}</s> <b class="num up">₩${E.won(p.sp)}</b></div><button class="btn sm" data-act="cart" data-v="${p.id}">담기${S.cart[p.id] ? ` (${S.cart[p.id]})` : ''}</button></div>`).join('')}</div>
    ${(S.shopCat || 'drink') === 'alc' ? '<p class="note">주류는 법상 면허 있는 도매업체만 팔 수 있어요. +EV는 주문만 대신 넣어주고, 결제는 도매업체로 바로 가요.</p>' : ''}</div>
  <div class="card"><h3>주문서</h3>${cart.length ? `${pay.map(i => `<div class="li"><span>${esc(i.n)} <span class="row" style="display:inline-flex;gap:4px"><button class="btn sm" data-act="cart" data-v="${i.id}" data-n="-1">−</button><b class="num">${i.q}</b><button class="btn sm" data-act="cart" data-v="${i.id}">+</button></span></span><span class="num">₩${E.won(i.sp * i.q)}</span></div>`).join('')}
    ${tot ? `<div class="li"><b>+EV 주문 합계</b><b class="num">₩${E.won(tot)}</b></div>` : ''}
    ${alc.length ? `<small class="mut">주류 · 도매업체 직접 결제</small>${alc.map(i => `<div class="li"><span>${esc(i.n)} × ${i.q} <button class="btn sm" data-act="cart" data-v="${i.id}" data-n="-1">−</button></span><span class="num">₩${E.won(i.sp * i.q)}</span></div>`).join('')}` : ''}
    <button class="btn pri full" data-act="order" style="margin-top:12px">주문 요청하기</button>` : '<p class="mut" style="margin:0">담은 상품이 없어요.</p>'}</div>
  <div class="card"><h3>주문 기록</h3>${S.orders.map(o => `<div class="li"><div><b>${o.items.map(i => `${esc(item(i.id)?.n)}×${i.q}`).join(', ')}</b><small>${fmtDT(o.created_at)} · ₩${E.won(o.total)}</small></div><span class="pill ${o.status === '도착' ? 'g' : 'y'}">${esc(o.status)}</span></div>`).join('') || '<div class="empty">아직 주문이 없어요</div>'}</div>`;
}
function vSched() {
  const need = S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2], D = E.daysIn(S.y, S.m), lead = E.wdOf(S.y, S.m, 1), staff = S.members.filter(p => p.role !== 'owner');
  if (!staff.length) return `${storeHead('스케줄')}<div class="card empty">먼저 직원을 등록해 주세요 <button class="btn sm pri" data-tab="staff">직원 등록</button></div>`;
  const head = `${storeHead('스케줄')}<div class="row between" style="margin-top:10px">${monthNav()}<div class="seg">${[['month', '월간'], ['week', '매주 기본']].map(([k, l]) => `<button data-act="sview" data-v="${k}" aria-pressed="${S.schedView === k}">${l}</button>`).join('')}</div></div>`;
  if (S.schedView === 'week') return `${head}<div class="card"><p class="note" style="margin-top:0">매주 반복되는 기본 근무예요. 칸을 눌러 고치세요. 날짜마다 다르면 '월간'에서 그날만 바꾸세요.</p><div class="tbl"><table><thead><tr><th>이름</th>${E.WD.map(w => `<th>${w}</th>`).join('')}</tr></thead><tbody>
    ${staff.map(p => `<tr><td><b>${esc(p.nick)}</b></td>${E.WD.map((_, i) => { const t = S.tpl.find(x => x.member_id === p.id && x.weekday === i); return `<td><button class="chip ${t ? '' : 'add'}" data-act="edit-w" data-m="${p.id}" data-w="${i}">${t ? `${t5(t.start_t)}–${t5(t.end_t)}` : '+'}</button></td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  let cells = '', short = 0;
  for (let d = 1; d <= D; d++) {
    const list = staff.map(p => ({ p, t: E.shiftOn(p.id, S.y, S.m, d, S.tpl, S.ov) })).filter(x => x.t), nd = need[E.wdOf(S.y, S.m, d)], k = E.ymd(S.y, S.m, d);
    if (list.length < nd) short++;
    cells += `<div class="cell ${list.length < nd ? 'short' : ''} ${k === TODAY ? 'today' : ''}"><div class="ch"><span>${d}</span><span class="pill ${list.length < nd ? 'r' : 'g'}">${list.length}/${nd}</span></div>
      ${list.map(({ p, t }) => `<button class="chip ${p.job_role === '딜러' ? '' : 'fl'} ${t.ov ? 'ov' : ''}" data-act="edit-d" data-m="${p.id}" data-d="${k}">${esc(p.nick)}<small>${t5(t.s).slice(0, 2)}-${t5(t.e).slice(0, 2)}</small></button>`).join('')}
      <button class="chip add" data-act="add-d" data-d="${k}">+</button></div>`;
  }
  return `${head}<div class="card"><div class="row between" style="margin-bottom:8px"><div class="row"><span class="mut" style="font-size:12px">요일별 적정 인원</span>${E.WD.map((w, i) => `<label class="row" style="gap:3px;font-size:12px">${w}<input type="number" min="0" max="20" value="${need[i]}" data-need="${i}" style="width:48px;padding:5px"></label>`).join('')}</div>${short ? `<span class="pill r">인원 부족 ${short}일</span>` : '<span class="pill g">모든 날 충분</span>'}</div>
    <div class="cal">${E.WD.map(w => `<div class="h">${w}</div>`).join('')}${'<div></div>'.repeat(lead)}${cells}</div>
    <p class="note">이름을 누르면 그날 근무를 고치고, + 로 추가해요. 점선은 그날만 바꾼 근무예요. ▶로 다음 달 스케줄도 미리 짤 수 있어요.</p></div>`;
}
function shiftSheet({ memberId, date, weekday, add }) {
  const p = S.members.find(x => x.id === memberId), [y, m, d] = date ? date.split('-').map(Number) : [];
  const t = memberId ? (date ? E.shiftOn(memberId, y, m, d, S.tpl, S.ov) : (w => w && { s: w.start_t, e: w.end_t, brk: w.break_min })(S.tpl.find(x => x.member_id === memberId && x.weekday === weekday))) : null;
  const off = date ? S.members.filter(q => q.role !== 'owner' && !E.shiftOn(q.id, y, m, d, S.tpl, S.ov)) : [];
  openSheet(`<h2>${add ? `${m}월 ${d}일 근무 추가` : `${esc(p.nick)} · ${date ? `${m}월 ${d}일 (${E.WD[E.wdOf(y, m, d)]})` : `매주 ${E.WD[weekday]}요일`}`}</h2>
  <form class="f" id="shift-form" data-m="${memberId || ''}" data-d="${date || ''}" data-w="${weekday ?? ''}">
    ${add ? (off.length ? `<label class="fl">누구<select name="member">${off.map(q => `<option value="${q.id}">${esc(q.nick)} (${esc(q.job_role || '')})</option>`).join('')}</select></label>` : '<p class="mut">이날은 모든 직원이 근무해요.</p>') : ''}
    <div class="grid2"><label class="fl">시작<input type="time" name="s" value="${t5(t?.s || '20:00')}" required></label><label class="fl">끝<input type="time" name="e" value="${t5(t?.e || '04:00')}" required></label></div>
    <label class="fl">휴게<select name="brk">${[['', '법대로 자동 (4h↑30분, 8h↑1시간)'], [0, '없음'], [30, '30분'], [60, '1시간'], [90, '1시간 30분']].map(([v, l]) => `<option value="${v}" ${String(t?.brk ?? '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${date ? `<label class="tog"><span>매주 ${E.WD[E.wdOf(y, m, d)]}요일에도 똑같이</span><input type="checkbox" name="rep"></label>` : ''}
    <button class="btn pri full">저장</button>${!add && t ? `<button class="btn red full" type="button" data-act="shift-off">${date ? '이날 휴무' : '이 요일 근무 없애기'}</button>` : ''}
    <button class="btn full" type="button" data-act="close">취소</button></form>`);
}
function vSales() {
  const r0 = S.reports.find(r => r.report_date === TODAY) || {};
  return `${storeHead('매출 보고')}<form class="f card" id="report-form"><h3>하루 마감 <small>같은 날짜로 다시 저장하면 고쳐져요</small></h3>
    <label class="fl">날짜<input type="date" name="date" value="${TODAY}" max="${TODAY}"></label>
    <div class="grid2"><label class="fl">총매출 (원)<input name="sales" type="number" inputmode="numeric" required value="${r0.sales ?? ''}"></label><label class="fl">엔트리 수<input name="entries" type="number" value="${r0.entries ?? ''}"></label>
    <label class="fl">카드<input name="card" type="number" value="${r0.card ?? ''}"></label><label class="fl">계좌이체<input name="transfer" type="number" value="${r0.transfer ?? ''}"></label>
    <label class="fl">현금으로 쓴 돈 (소모품 등)<input name="expense" type="number" value="${r0.expense ?? ''}"></label><label class="fl">시작 시재 (영업 전 금고)<input name="start" type="number" step="10000" value="${S.lastStart ?? 300000}"></label></div>
    <small class="mut">금고 현금 세기 · 장수만 넣으세요</small><div class="bills">${BILLS.map(b => `<label class="fl">${E.won(b)}원<input name="b${b}" type="number" min="0" inputmode="numeric"></label>`).join('')}</div>
    <div id="close-out"></div>
    <label class="fl">메모<input name="memo" value="${esc(r0.memo || '')}" placeholder="차액이 있으면 이유를 적어주세요"></label><button class="btn pri full">보고하고 마감하기</button></form>
  ${stockCard()}
  <form class="f card" id="expense-form"><h3>고지서·기타 비용 <small>계산서·월간 손익에 들어가요</small></h3>
    <div class="grid2"><label class="fl">항목<select name="cat">${Object.entries(CAT).filter(([k]) => k !== 'card').map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label class="fl">금액 (원)<input name="amount" type="number" required></label></div>
    <label class="fl">날짜<input type="date" name="date" value="${TODAY}"></label><button class="btn full">비용 추가</button></form>
  <div class="card"><h3>${S.m}월 보고 기록 <small>${S.reports.length}일</small></h3>${S.reports.map(r => `<div class="li"><div><b>${r.report_date.slice(5).replace('-', '/')}</b><small>엔트리 ${r.entries ?? '-'} · 카드 ${E.won(r.card)} · 현금 ${E.won(r.cash)}${r.cash_diff ? ` · <span class="${Math.abs(r.cash_diff) >= 10000 ? 'down' : 'warn'}">금고 ${r.cash_diff > 0 ? '+' : '−'}${E.won(Math.abs(r.cash_diff))}</span>` : r.cash_diff === 0 ? ' · 금고 딱 맞음' : ''}${r.memo ? ' · ' + esc(r.memo) : ''}</small></div><b class="num">₩${E.won(r.sales)}</b></div>`).join('') || '<div class="empty">아직 기록이 없어요</div>'}</div>
  <div class="card"><h3>${S.m}월 비용 <small>${S.expenses.length}건</small></h3>${S.expenses.map(x => `<div class="li"><div><b>${CAT[x.category] || x.category}</b><small>${x.spent_on} · ${x.source === 'close' ? '마감 지출' : '직접 입력'}</small></div><span class="row"><span class="num">₩${E.won(x.amount)}</span><button class="btn sm" data-act="exp-del" data-id="${x.id}">삭제</button></span></div>`).join('') || '<div class="empty">비용 기록이 없어요</div>'}</div>`;
}
function vStaff() {
  const staff = S.members.filter(p => p.role !== 'owner'), rows = staff.map(p => ({ p, r: payOf(p) })), sum = k => rows.reduce((a, x) => a + x.r[k], 0);
  return `${storeHead('직원·급여')}
  <div class="card"><h3>매장 가입코드 <small>직원·딜러가 앱에서 이 코드로 소속 신청해요</small></h3><div class="row between"><b class="num" style="font-size:24px;letter-spacing:.12em">${esc(S.store.join_code)}</b><button class="btn sm" data-act="copy" data-v="${esc(S.store.join_code)}">복사</button></div></div>
  ${S.joins.length ? `<div class="card" style="border-color:rgba(245,158,11,.5)"><h3>소속 신청 <small>${S.joins.length}건</small></h3>${S.joins.map(j => `<div class="li"><div><b>${esc(j.name)}</b><small>경력 ${j.career_months}개월 · ${esc(j.bio || '')}</small></div><button class="btn sm pri" data-act="join-open" data-r="${j.req_id}">승인</button></div>`).join('')}</div>` : ''}
  <div class="row" style="margin-top:12px"><button class="btn pri" data-act="staff-new">+ 직원 등록</button></div>
  <div class="card"><h3>직원 <small>${staff.length}명</small></h3>${staff.map(p => `<div class="li"><div><b>${esc(p.nick)}</b> <span class="pill">${esc(p.job_role || '-')}</span>${p.role === 'manager' ? ' <span class="pill y">점장</span>' : ''}${p.user_id ? ' <span class="pill g">앱 연결</span>' : ''}<small>${p.contract === '4대' ? '4대보험' : '3.3%'} · 시급 ${E.won(p.hourly_rate)}원${p.bank_name ? ` · ${esc(p.bank_name)} ${esc(p.bank_acct || '')}` : ''}</small></div>
    <span class="row">${isOwner() && p.user_id ? `<button class="btn sm" data-act="mgr" data-m="${p.id}" data-v="${p.role !== 'manager'}">${p.role === 'manager' ? '점장 해제' : '점장 권한'}</button>` : ''}${isOwner() || p.role === 'staff' ? `<button class="btn sm" data-act="staff-edit" data-m="${p.id}">수정</button>` : ''}</span></div>`).join('') || '<div class="empty">아직 직원이 없어요</div>'}
    <p class="note">점장 권한은 앱에 가입해 소속된 직원에게만 줄 수 있어요. 점장은 자기 매장의 스케줄·매출·구인을 관리해요.</p></div>
  ${rows.length ? `<div class="card"><h3><span>${S.m}월 급여 대장</span><button class="btn sm pri" data-act="csv">📥 엑셀 파일</button></h3><div class="row" style="margin-bottom:8px">${monthNav()}</div>
  <div class="tbl"><table><thead><tr><th>이름</th><th class="r">근무</th><th class="r">기본급</th><th class="r">야간</th><th class="r">연장</th><th class="r">주휴</th><th class="r">인센티브</th><th class="r">지급총액</th><th class="r">공제</th><th class="r">실지급</th><th class="r">월말 예상</th></tr></thead><tbody>
  ${rows.map(({ p, r }) => `<tr><td><b>${esc(p.nick)}</b></td><td class="r num">${r.days}일 ${r.hours.toFixed(0)}h</td><td class="r num">${E.won(r.base)}</td><td class="r num">${E.won(r.np)}</td><td class="r num">${E.won(r.otp)}</td><td class="r num">${E.won(r.juhu)}</td>
    <td class="r"><input type="number" step="1000" value="${r.inc}" data-inc="${p.id}" style="width:96px;padding:5px;font-size:13px"></td><td class="r num">${E.won(r.gross)}</td><td class="r num down">−${E.won(r.ded)}</td><td class="r num up"><b>${E.won(r.net)}</b></td><td class="r num mut">${E.won(r.fullGross)}</td></tr>`).join('')}
  <tr><td><b>합계</b></td><td></td><td class="r num">${E.won(sum('base'))}</td><td class="r num">${E.won(sum('np'))}</td><td class="r num">${E.won(sum('otp'))}</td><td class="r num">${E.won(sum('juhu'))}</td><td class="r num">${E.won(sum('inc'))}</td><td class="r num"><b>${E.won(sum('gross'))}</b></td><td class="r num down">−${E.won(sum('ded'))}</td><td class="r num up"><b>${E.won(sum('net'))}</b></td><td class="r num mut">${E.won(sum('fullGross'))}</td></tr></tbody></table></div>
  <p class="note">어제까지 근무 기준 · 근무시간 = 스케줄 − 휴게 · 야간 = 22~06시 × 시급 × 0.5 · 연장 = 하루 8시간 초과 × 0.5 · 주휴 = 주 15시간 이상인 주. 연장·주휴는 '연장·주휴 적용' 직원만. 4대보험은 근로자 부담분, 소득세 간이세액 미반영.</p></div>` : ''}`;
}
const BANKS = ['KB국민', '신한', '우리', '하나', 'NH농협', 'IBK기업', '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일', '새마을금고', '우체국', '부산', '대구'];
function staffSheet(id) {
  const p = S.members.find(x => x.id === id) || { contract: '3.3', night_pay: true, job_role: '딜러', hourly_rate: 13000 };
  openSheet(`<h2>${id ? `${esc(p.nick)} 수정` : '직원 등록'}</h2><form class="f" id="staff-form" data-m="${id || ''}">
    <div class="grid2"><label class="fl">닉네임<input name="nick" required value="${esc(p.nick || '')}"></label><label class="fl">실명<input name="real_name" value="${esc(p.real_name || '')}"></label>
    <label class="fl">직책<select name="job_role">${['딜러', '플로어', '매니저'].map(r => `<option ${p.job_role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <label class="fl">계약<select name="contract"><option value="3.3" ${p.contract === '3.3' ? 'selected' : ''}>3.3% (프리랜서)</option><option value="4대" ${p.contract === '4대' ? 'selected' : ''}>4대보험</option></select></label>
    <label class="fl">시급 (원)<input name="rate" type="number" step="100" required value="${p.hourly_rate || ''}"></label><label class="fl">입사일<input name="joined" type="date" value="${p.joined_on || TODAY}"></label></div>
    <label class="tog"><span><b>야간수당</b><small>22~06시 근무는 시급의 1.5배</small></span><input type="checkbox" name="night" ${p.night_pay ? 'checked' : ''}></label>
    <label class="tog"><span><b>연장·주휴수당</b><small>4대보험은 기본으로 켜져요. 3.3%도 실제로는 근로자로 볼 수 있어 켜두는 게 안전해요.</small></span><input type="checkbox" name="law" ${(p.labor_law ?? p.contract === '4대') ? 'checked' : ''}></label>
    <div class="grid2"><label class="fl">은행<select name="bank"><option value="">선택</option>${BANKS.map(b => `<option ${p.bank_name === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label><label class="fl">계좌번호<input name="acct" inputmode="numeric" value="${esc(p.bank_acct || '')}"></label></div>
    <label class="fl">예금주<input name="holder" value="${esc(p.bank_holder || p.real_name || '')}"></label>
    <button class="btn pri full">저장</button>${id ? '<button class="btn red full" type="button" data-act="staff-del">퇴사 처리</button>' : ''}<button class="btn full" type="button" data-act="close">취소</button></form>`);
}
function joinSheet(reqId) {
  const j = S.joins.find(x => x.req_id === reqId), free = S.members.filter(p => p.role === 'staff' && !p.user_id);
  openSheet(`<h2>${esc(j.name)} 님 소속 승인</h2><p class="sub">경력 ${j.career_months}개월 · ${esc(j.phone || '')}</p><form class="f" id="join-form" data-r="${reqId}">
    <label class="fl">어떻게 등록할까요?<select name="member"><option value="">새 직원으로 등록</option>${free.map(p => `<option value="${p.id}">이미 등록된 '${esc(p.nick)}'와 연결</option>`).join('')}</select></label>
    <div class="grid2"><label class="fl">직책 (새 직원)<select name="role"><option>딜러</option><option>플로어</option><option>매니저</option></select></label><label class="fl">계약<select name="contract"><option value="3.3">3.3%</option><option value="4대">4대보험</option></select></label></div>
    <label class="fl">시급 (새 직원)<input name="rate" type="number" step="100" value="13000"></label>
    <button class="btn pri full">승인하기</button><button class="btn full" type="button" data-act="close">취소</button></form>`);
}
function vJobs() {
  const k = S.postKind || 'urgent';
  return `${storeHead('구인')}<div class="card"><div class="seg" style="margin-bottom:12px"><button data-act="pkind" data-v="urgent" aria-pressed="${k === 'urgent'}">🚨 긴급 (24시간)</button><button data-act="pkind" data-v="hire" aria-pressed="${k === 'hire'}">상시 아르바이트</button></div>
  <form class="f" id="post-form"><div class="grid2"><label class="fl">직책<select name="role">${['딜러', '플로어', '매니저'].map(r => `<option>${r}</option>`).join('')}</select></label><label class="fl">택시비 지원 (원)<input name="taxi" type="number" step="5000" value="0"></label></div>
    <label class="fl">제목<input name="title" required value="${k === 'urgent' ? '오늘 밤 딜러 급구' : '주말 고정 딜러 모집'}"></label>
    <label class="fl">내용<textarea name="body" rows="3" placeholder="게임 종류, 복장, 우대 조건"></textarea></label>
    ${k === 'urgent' ? `<div class="grid2"><label class="fl">시작<input type="time" name="s" value="20:00"></label><label class="fl">끝<input type="time" name="e" value="04:00"></label><label class="fl">일당 (원)<input name="pay" type="number" step="5000" value="130000"></label><label class="fl">몇 명<input name="heads" type="number" min="1" max="10" value="1"></label></div>`
    : `<div class="grid2"><label class="fl">근무 조건<input name="work" value="금·토 20:00–04:00"></label><label class="fl">급여<input name="paytext" value="시급 15,000원"></label><label class="fl">몇 명<input name="heads" type="number" min="1" value="1"></label><label class="fl">광고 기간<select name="days">${[3, 5, 7, 15, 30].map(d => `<option value="${d}" ${d === 7 ? 'selected' : ''}>${d}일${E.FEES.DISC[d] ? ` · ${E.FEES.DISC[d] * 100}% 할인` : ''}</option>`).join('')}</select></label>
      <label class="fl">자동 끌올<select name="jump">${Object.entries(E.FEES.JUMP).map(([n, p]) => `<option value="${n}" ${n == 5 ? 'selected' : ''}>${n == 0 ? '안 함' : `하루 ${n}회 · 하루 ₩${E.won(p)}`}</option>`).join('')}</select></label></div>`}
    <label class="tog"><span><b>✨ 반짝이</b><small>하루 9,900원 · 공고 옆 표시가 깜빡여요</small></span><input type="checkbox" name="flash"></label>${k === 'hire' ? '<label class="tog"><span><b>📌 상단 고정</b><small>하루 33,000원</small></span><input type="checkbox" name="top"></label>' : ''}
    <div id="fee-box"></div>
    <p class="note">🎉 베타 기간에는 공고 등록이 무료예요. 정식 오픈 후 결제(토스페이먼츠)가 붙어요. 긴급 공고는 급여를 미리 결제하고 근무가 끝나면 딜러에게 지급돼요. 성별·나이 조건은 법상 넣을 수 없어요.</p>
    <button class="btn gold full">공고 올리기</button></form></div>
  <div class="card"><h3>우리 매장 공고 <small>${S.posts.length}건</small></h3>${S.posts.map(p => `<div class="job ${p.kind === 'urgent' ? 'urgent' : ''}"><div class="row between"><div><span class="pill ${p.status === 'open' ? 'g' : ''}">${p.status === 'open' ? '모집 중' : '마감'}</span> <small class="mut">${p.kind === 'urgent' ? '긴급' : '상시'} · ${esc(p.job_role)} · ${fmtDT(p.created_at)}</small><h4>${esc(p.title)}</h4></div>
    <button class="btn sm pri" data-act="manage" data-p="${p.id}" data-k="${p.kind}">관리</button></div><div id="mg-${p.id}"></div></div>`).join('') || '<div class="empty">올린 공고가 없어요</div>'}</div>`;
}
function feeBox() {
  const f = $('#post-form'), box = $('#fee-box'); if (!f || !box) return; const v = Object.fromEntries(new FormData(f)), heads = +v.heads || 1, urg = (S.postKind || 'urgent') === 'urgent';
  const fee = urg ? E.urgentFee({ flash: !!v.flash, heads, pay: (+v.pay || 0) * heads }) : E.hireFee({ days: +v.days, jump: +v.jump, flash: !!v.flash, top: !!v.top, heads });
  box.innerHTML = `<div class="li"><span class="mut">정식 가격${urg ? ' (급여 + 수수료 6% 포함)' : ''}</span><span class="num"><s class="mut">₩${E.won(fee)}</s> <b class="up">베타 무료</b></span></div>`;
}
async function manage(postId, kind) {
  const box = $('#mg-' + postId); if (!box) return; const apps = await q(sb.rpc('post_applicants', { p_post: postId })), slots = kind === 'urgent' ? await q(sb.rpc('post_slots', { p_post: postId })) : [];
  const btn = s => ({ MATCHED: `<button class="btn sm" data-act="slot" data-s="${s.slot_id}" data-v="start">출근 확인</button><button class="btn sm red" data-act="slot" data-s="${s.slot_id}" data-v="noshow">안 왔어요</button>`,
    WORKING: `<button class="btn sm" data-act="slot" data-s="${s.slot_id}" data-v="extra">+1시간 연장</button>`,
    DONE: `<button class="btn sm pri" data-act="slot" data-s="${s.slot_id}" data-v="ok">근무 완료 확인·지급</button><button class="btn sm red" data-act="slot" data-s="${s.slot_id}" data-v="dispute">문제 신고</button>` }[s.status] || '');
  box.innerHTML = `${slots.map(s => `<div class="slot"><span><b class="num">${t5(s.start_t)}–${t5(s.end_t)}</b> · ₩${E.won(s.pay)}${s.extra ? ` <span class="up">+₩${E.won(s.extra)}</span>` : ''}<br><small class="mut">${s.dealer_name ? esc(s.dealer_name) : '아직 채용 전'}</small></span><span class="row"><span class="pill ${SLOT[s.status][0]}">${SLOT[s.status][1]}</span>${btn(s)}</span></div>`).join('')}
  <div style="margin-top:8px;font-size:12px;color:var(--muted)">지원자 ${apps.length}명</div>
  ${apps.map(x => `<div class="slot"><div><b>${esc(x.name)}</b> <small class="mut">경력 ${x.career_months}개월</small><div style="font-size:13px">${esc(x.bio)}</div></div>
    ${x.status === 'applied' ? `<button class="btn sm pri" data-act="hire" data-a="${x.app_id}" data-p="${postId}" data-k="${kind}">채용하기</button>` : x.status === 'hired' ? `<span class="row"><button class="btn sm" data-act="contact" data-a="${x.app_id}">📞 연락처</button><button class="btn sm red" data-act="cancel-hire" data-a="${x.app_id}" data-p="${postId}" data-k="${kind}">채용 취소</button></span>` : `<span class="pill">${{ rejected: '불채용', cancelled: '취소', expired: '마감' }[x.status] || x.status}</span>`}</div>`).join('') || '<p class="note">아직 지원자가 없어요. 연락처는 채용하기를 누른 뒤에만 보여요.</p>'}`;
}
function vMore() {
  const sub = S.sub;
  if (!sub) return `${storeHead('더보기')}<div class="card menu">${[['improve', '✦', '매장 개선', '우리 매장 순위 · 경고등 · 매달 처방 · 퀘스트'], ['rot', '🔄', '테이블 로테이션', '딜러 교대·휴식 타이머'], ['order', '📦', '발주', '음료·간식·홀덤 소모품 주문'], ['pnl', '📈', '월간 손익', '매달 매출·인건비·비용·남는 돈'], ['qr', '📍', '출퇴근 코드', '카운터 화면에 띄워두세요'], ['settings', '⚙️', '매장 설정', '요금제 · 매장 정보 · 매장 추가'], ['inq', '💬', '운영사 문의', '궁금한 점을 보내면 답해드려요'], ['used', '🔁', '중고 장터', '홀덤펍끼리 사고팔기'], ...(isOwner() ? [['transfer', '🤝', '점포 양도양수', '대표님만 보여요']] : [])].map(([k, i, t, d]) => `<button class="mi" ${k === 'improve' ? 'data-tab="improve"' : `data-act="sub" data-v="${k}"`}><span>${i}</span><span><b>${t}</b><small>${d}</small></span><span>›</span></button>`).join('')}</div>`;
  const back = `<button class="btn sm" data-act="sub" data-v="">← 더보기</button>`;
  if (sub === 'pnl') {
    const months = Array.from({ length: 6 }, (_, i) => { const dt = new Date(S.y, S.m - 6 + i, 1); return [dt.getFullYear(), dt.getMonth() + 1]; }).map(([yy, mm]) => ({ yy, mm, s: monthSummary(yy, mm) }));
    const keys = [...new Set(months.flatMap(x => Object.keys(x.s.exp)))];
    return `${storeHead('월간 손익')}${back}<div class="card"><div class="tbl"><table><thead><tr><th>항목</th>${months.map(x => `<th class="r">${x.mm}월</th>`).join('')}</tr></thead><tbody>
      <tr><td><b>매출</b></td>${months.map(x => `<td class="r num"><b>${man(x.s.proj)}</b></td>`).join('')}</tr>
      <tr><td class="mut">인건비</td>${months.map(x => `<td class="r num">${man(x.s.labor)}</td>`).join('')}</tr>
      ${keys.map(k => `<tr><td class="mut">${CAT[k] || k}</td>${months.map(x => `<td class="r num">${x.s.exp[k] ? man(x.s.exp[k]) : '-'}</td>`).join('')}</tr>`).join('')}
      <tr><td><b>남는 돈</b></td>${months.map(x => `<td class="r num ${x.s.left >= 0 ? 'up' : 'down'}"><b>${man(x.s.left)}</b></td>`).join('')}</tr>
      <tr><td class="mut">손익분기 날</td>${months.map(x => `<td class="r num mut">${x.s.proj ? (x.s.bep <= E.daysIn(x.yy, x.mm) ? x.s.bep + '일' : '못 넘음') : '-'}</td>`).join('')}</tr></tbody></table></div>
      <p class="note">이번 달은 지금 속도로 계산한 월말 예상이에요. 매출은 매출 보고, 인건비는 스케줄·급여, 나머지는 입력한 비용에서 자동으로 계산돼요. 카드 수수료는 입력이 없으면 카드 매출의 1.6%로 잡아요.</p></div>`;
  }
  if (sub === 'qr') return `${storeHead('출퇴근 코드')}${back}<div class="card" style="text-align:center"><p class="sub">직원은 앱의 <b>출퇴근</b> 탭에서 이 번호를 넣으면 기록돼요. 30초마다 바뀌어서 사진으로 찍어 보내도 못 써요.</p>
    <div id="qr-code" class="num" style="font-size:56px;font-weight:800;letter-spacing:.18em;color:#6EE7B7">······</div><div class="mut" id="qr-left">불러오는 중</div></div>`;
  if (sub === 'settings') {
    const c = S.company || {}, trial = c.plan === 'trial' ? Math.max(0, Math.ceil((new Date(c.trial_ends) - now) / 864e5)) : null;
    return `${storeHead('매장 설정')}${back}
    <div class="card"><h3>요금제 ${trial != null ? `<small class="warn">무료 체험 D-${trial} · 끝나면 베이직으로 시작돼요</small>` : ''}</h3><div class="plans">
      <div class="plan ${c.plan === 'basic' ? 'cur' : ''}"><b>베이직</b><b class="num">월 ₩${E.won(PRICE.basic)}</b><small>매장 관리 전부 — 매출 기록 · 직원 스케줄 · 급여 계산 · 출퇴근 · 구인</small></div>
      <div class="plan ${c.plan !== 'basic' ? 'cur' : ''}"><span class="pill y">추천</span><b>프로</b><b class="num">월 ₩${E.won(PRICE.pro)}</b><small>베이직 전부 + ✦ 매장 개선 (우리 매장 순위 · 경고등 · 매달 처방 · 퀘스트 · 레벨)</small></div></div>
      <p class="note">결제(토스페이먼츠)는 정식 오픈 때 붙어요. 해지·변경은 언제든 한 번에 할 수 있어요.</p></div>
    <form class="f card" id="store-form"><h3>매장 정보</h3><label class="fl">매장 이름<input name="name" value="${esc(S.store.name)}" ${isOwner() ? '' : 'disabled'}></label><label class="fl">지역<input name="area" value="${esc(S.store.area || '')}" ${isOwner() ? '' : 'disabled'}></label>
      <div class="grid2"><label class="fl">평수<input type="number" name="py" min="1" step="0.1" value="${S.store.pyeong ?? ''}" placeholder="예: 32" ${isOwner() ? '' : 'disabled'}></label><label class="fl">테이블 수<input type="number" name="tables" min="1" value="${S.store.tables ?? ''}" placeholder="예: 7" ${isOwner() ? '' : 'disabled'}></label></div>
      <div class="grid2"><label class="fl">야간 시작<input type="time" name="ns" value="${t5(S.store.night_start)}" ${isOwner() ? '' : 'disabled'}></label><label class="fl">야간 끝<input type="time" name="ne" value="${t5(S.store.night_end)}" ${isOwner() ? '' : 'disabled'}></label></div>
      ${isOwner() ? '<button class="btn pri full">저장</button>' : '<p class="note">매장 정보는 대표님만 바꿀 수 있어요.</p>'}</form>
    ${isOwner() ? `<form class="f card" id="addstore-form"><h3>매장 추가</h3><div class="grid2"><label class="fl">매장 이름<input name="name" required placeholder="예: 홍대 2호점"></label><label class="fl">지역<input name="area"></label></div><button class="btn full">매장 추가</button></form>
    <div class="card"><h3>사업자 정보</h3><div class="li"><span>사업자등록번호</span><span class="num">${esc((c.biz_no || '').replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3'))}</span></div><div class="li"><span>확인 상태</span><span class="pill ${c.biz_verified ? 'g' : 'y'}">${c.biz_verified ? '확인 완료' : '운영사 확인 중'}</span></div></div>` : ''}`;
  }
  if (sub === 'inq') return `${storeHead('운영사 문의')}${back}${inqBlock()}`;
  if (sub === 'rot') return S.rot ? vRot() : `${storeHead('테이블 로테이션')}<div class="boot">불러오는 중…</div>`;
  if (sub === 'order') return vOrder();
  if (sub === 'used') return `${storeHead('중고 장터')}${back}${usedBlock()}`;
  if (sub === 'transfer') return `${storeHead('점포 양도양수')}${back}${transferBlock()}`;
  return '';
}
async function startQR() {
  const tick = async () => { try { const r = (await q(sb.rpc('attend_code', { p_store: S.store.id })))[0], el = $('#qr-code'); if (!el) return clearInterval(S.qrTimer); el.textContent = r.code; S.qrLeft = r.secs_left; $('#qr-left').textContent = `${r.secs_left}초 뒤 바뀌어요`; } catch (e) { } };
  await tick(); S.qrTimer = setInterval(() => { S.qrLeft--; const el = $('#qr-left'); if (!el) return clearInterval(S.qrTimer); if (S.qrLeft <= 0) tick(); else el.textContent = `${S.qrLeft}초 뒤 바뀌어요`; }, 1000);
}
function inqBlock() {
  return `<form class="f card" id="inq-form"><h3>운영사에 문의하기</h3><textarea name="body" rows="3" required placeholder="궁금한 점이나 불편한 점을 적어주세요"></textarea><button class="btn pri full">보내기</button></form>
  <div class="card"><h3>내 문의</h3>${(S.inq || []).map(x => `<div class="li" style="display:block"><b>${esc(x.body)}</b><small>${fmtDT(x.created_at)}</small>${x.reply ? `<div class="up" style="margin-top:4px">↳ ${esc(x.reply)}</div>` : '<small class="mut">답변 기다리는 중</small>'}</div>`).join('') || '<div class="empty">아직 문의가 없어요</div>'}</div>`;
}
function usedBlock() {
  return `<form class="f card" id="used-form"><h3>글 올리기</h3><div class="seg"><button type="button" data-act="uside" data-v="sell" aria-pressed="${(S.uside || 'sell') === 'sell'}">팝니다</button><button type="button" data-act="uside" data-v="buy" aria-pressed="${S.uside === 'buy'}">삽니다</button></div>
    <label class="fl">제목<input name="title" required placeholder="예: 10인 홀덤 테이블"></label><div class="grid2"><label class="fl">${S.uside === 'buy' ? '희망 가격' : '가격'} (원)<input name="price" type="number" required step="10000"></label><label class="fl">지역<input name="area" value="${esc(S.store?.area || '')}"></label></div>
    <label class="fl">설명<textarea name="body" rows="2" placeholder="상태, 사용 기간, 거래 방법"></textarea></label><button class="btn full">올리기</button></form>
  <div class="card"><h3>올라온 물건 <small>${S.used.length}개</small></h3>${S.used.map(u => `<div class="li"><div><span class="pill ${u.side === 'sell' ? 'g' : 'y'}">${u.side === 'sell' ? '팝니다' : '삽니다'}</span> <b>${esc(u.title)}</b><small>${esc(u.area || '')} · ${fmtDT(u.created_at)}${u.body ? ' · ' + esc(u.body) : ''}</small></div><b class="num">₩${E.won(u.price)}</b></div>`).join('') || '<div class="empty">아직 올라온 물건이 없어요</div>'}
  <p class="note">🔒 안전결제(구매자 수수료 2%)와 거래 시세는 정식 오픈 때 붙어요.</p></div>`;
}
const SELL_Q = ['어느 지역 매장인가요?', '희망 권리금은 어느 정도예요?', '언제까지 넘기고 싶으세요?', '+EV 매출 데이터로 "매출 검증" 배지를 붙일까요?'];
function transferBlock() {
  const a = S.sellA || [], M = monthSummary(S.y, S.m), mp = Math.max(0, M.left);
  return `<div class="card"><h3>요금</h3><div class="li"><span>일반 등록 <small>90일 게시 · 매출 검증 배지</small></span><b class="num">₩1,000,000</b></div><div class="li"><span>프리미엄 <small>상단 고정 · 관심 매수자 먼저 알림</small></span><b class="num">₩2,000,000</b></div><div class="li"><span>성사 수수료 <small>먼저 낸 등록비는 빼드려요</small></span><b class="num">권리금의 10%</b></div></div>
  <div class="card chat"><h3>💬 매장 내놓기 상담 <small>상호는 끝까지 비공개</small></h3>
    ${a.map((x, i) => `<div class="bub a">${SELL_Q[i]}</div><div class="bub me">${esc(x)}</div>`).join('')}
    ${a.length < SELL_Q.length ? `<div class="bub a">${SELL_Q[a.length]}</div><form class="row" id="sell-form" style="margin-top:8px"><input name="a" required placeholder="편하게 적어주세요" style="flex:1"><button class="btn sm pri">보내기</button></form>`
    : `<div class="bub a">감사해요! 지금 이 매장은 월 순이익이 약 ₩${man(mp)}이에요. 권리금은 보통 <b>순이익 10~12개월치</b>라서 <b>약 ₩${man(mp * 10)} ~ ₩${man(mp * 12)}</b>로 보여요. 운영사 담당자가 곧 연락드려요.</div>${S.sellSaved ? '<span class="pill g">상담 접수 완료</span>' : '<button class="btn gold full" data-act="sell-save">상담 신청하기</button>'}`}</div>`;
}

// ===== 직원 (소속) =====
function vWork() {
  const me = S.my[0], r = payOf(me), [y, m, d] = TODAY.split('-').map(Number), wk0 = d - E.wdOf(y, m, d), D = E.daysIn(S.y, S.m);
  let cal = ''; for (let i = 1; i <= D; i++) { const t = E.shiftOn(me.id, S.y, S.m, i, S.tpl, S.ov), k = E.ymd(S.y, S.m, i); cal += `<div class="dc ${t ? 'on' : ''} ${k === TODAY ? 'today' : ''}"><b>${i}</b><small>${t ? `${t5(t.s).slice(0, 2)}–${t5(t.e).slice(0, 2)}` : ''}</small></div>`; }
  return `<h1>내 근무</h1><p class="sub">${esc(S.store.name || '')} · ${esc(me.nick)}</p>
  <div class="card dsum"><div><small>${S.m}월 예상 실수령</small><b class="num up">₩${E.won(r.fullNet)}</b></div><div><small>근무</small><b class="num">${r.shifts.length}일</b></div><div><small>휴게 뺀 시간</small><b class="num">${r.shifts.reduce((a, x) => a + x.hours, 0).toFixed(0)}h</b></div><div><small>지금까지 번 돈</small><b class="num">₩${E.won(r.gross)}</b></div></div>
  ${S.slots.length ? `<div class="card"><h3>긴급 근무</h3>${S.slots.map(s => `<div class="slot"><span><b>${esc(s.title)}</b><br><small class="mut">${esc(s.store_name)} · ${t5(s.start_t)}–${t5(s.end_t)}</small></span><span class="row"><span class="pill ${SLOT[s.status][0]}">${SLOT[s.status][1]}</span>${s.status === 'WORKING' ? `<button class="btn sm pri" data-act="dslot" data-s="${s.slot_id}">근무 완료</button>` : ''}</span></div>`).join('')}</div>` : ''}
  <div class="card"><h3>이번 주</h3>${E.WD.map((w, i) => { const dd = wk0 + i, ok = dd >= 1 && dd <= E.daysIn(y, m), t = ok ? E.shiftOn(me.id, y, m, dd, S.tpl, S.ov) : null; return `<div class="li ${dd === d ? 'today' : ''}"><div><b>${w}</b><small>${ok ? `${m}/${dd}` : ''}</small></div>${t ? `<span class="num"><b>${t5(t.s)} – ${t5(t.e)}</b></span>` : '<span class="mut">휴무</span>'}</div>`; }).join('')}</div>
  <div class="card"><h3>${S.m}월 달력 ${monthNav()}</h3><div class="cal">${E.WD.map(w => `<div class="h">${w}</div>`).join('')}${'<div></div>'.repeat(E.wdOf(S.y, S.m, 1))}${cal}</div></div>
  <div class="card"><h3>${S.m}월 급여 예상 <small>세전 ₩${E.won(r.fullGross)}</small></h3><div class="li"><span class="mut">기본급·야간·연장·주휴 (어제까지)</span><span class="num">₩${E.won(r.base)} · ${E.won(r.np)} · ${E.won(r.otp)} · ${E.won(r.juhu)}</span></div><div class="li"><span class="mut">인센티브</span><span class="num">₩${E.won(r.inc)}</span></div><div class="li"><span class="mut">공제 (${me.contract === '4대' ? '4대보험' : '3.3%'})</span><span class="num down">−₩${E.won(r.ded)}</span></div></div>`;
}
function vAttend() {
  const last = S.att?.[0];
  return `<h1>출퇴근</h1><p class="sub">매장 화면에 뜬 6자리 번호를 넣어주세요.</p>
  <form class="f card" id="attend-form"><input name="code" inputmode="numeric" maxlength="6" required placeholder="000000" style="font-size:32px;text-align:center;letter-spacing:.3em"><button class="btn pri full">${last?.kind === 'in' ? '퇴근하기' : '출근하기'}</button></form>
  <div class="card"><h3>최근 기록</h3>${(S.att || []).map(a => `<div class="li"><span>${a.kind === 'in' ? '🟢 출근' : '⚪ 퇴근'}</span><span class="num">${fmtDT(a.at)}</span></div>`).join('') || '<div class="empty">아직 기록이 없어요</div>'}</div>`;
}

// ===== 딜러 =====
function jobCard(j) {
  const applied = S.apps.some(a => a.post_id === j.id), slots = j.slots || [], pays = slots.map(s => s.pay);
  return `<div class="job ${j.kind === 'urgent' ? 'urgent' : ''}"><div class="row between"><div class="row">${j.kind === 'urgent' ? `<span class="pill r">🚨 긴급 · ${Math.max(0, Math.ceil((new Date(j.expires_at) - Date.now()) / 36e5))}시간 남음</span>` : ''}${j.flash ? '<span class="spark">✨ 반짝</span>' : ''}${j.top ? '<span class="pill y">📌</span>' : ''}<small class="mut">${esc(j.job_role)}</small></div>
    <span class="pay">${pays.length ? `일당 ₩${E.won(Math.min(...pays))}${pays.length > 1 && Math.max(...pays) !== Math.min(...pays) ? '~' + E.won(Math.max(...pays)) : ''}` : esc(j.pay_text || '')}</span></div>
  <h4>${esc(j.title)}</h4>${j.body ? `<div style="font-size:14px">${esc(j.body)}</div>` : ''}
  <div class="meta"><span>${esc(j.store_name)} · ${esc(j.area || '')}</span><span>${slots.length ? slots.map(s => `${t5(s.start)}–${t5(s.end)}`).join(' / ') : esc(j.work_time || '')}</span>${j.taxi_amt ? `<span class="up">🚕 택시비 ₩${E.won(j.taxi_amt)}</span>` : ''}</div>
  ${applied ? '<span class="pill g">지원 완료 · 매장 확인 중</span>' : `<button class="btn ${j.kind === 'urgent' ? 'gold' : 'pri'}" data-act="apply" data-p="${j.id}">🎟 지원권 1장으로 지원</button>`}</div>`;
}
function vBoard() {
  return `<div class="row between"><h1>구인</h1><span class="pill y">🎟 지원권 ${S.tickets}장</span></div><p class="sub">지원하면 지원권 1장이 잠기고, 채용돼 연락처가 열리면 사용돼요. 안 뽑히거나 매장이 취소하면 돌아와요.</p>
  ${S.board.map(jobCard).join('') || '<div class="card empty">지금 올라온 공고가 없어요</div>'}`;
}
function vMyWork() {
  const L = { applied: ['', '매장 확인 중'], hired: ['g', '채용됐어요'], rejected: ['', '아쉽게 안 됐어요'], cancelled: ['y', '매장 취소 · 지원권 반환'], expired: ['', '마감 · 지원권 반환'] };
  return `<h1>내 근무</h1><div class="card"><h3>긴급 근무</h3>${S.slots.map(s => `<div class="slot"><span><b>${esc(s.title)}</b><br><small class="mut">${esc(s.store_name)} · ${t5(s.start_t)}–${t5(s.end_t)} · ₩${E.won(s.pay + s.extra)}</small>${s.result ? `<br><small class="up">받는 돈 ₩${E.won(s.result.net)} (3.3% 원천세 −${E.won(s.result.tax)})</small>` : ''}</span>
    <span class="row"><span class="pill ${SLOT[s.status][0]}">${SLOT[s.status][1]}</span>${s.status === 'WORKING' ? `<button class="btn sm pri" data-act="dslot" data-s="${s.slot_id}">퇴근했어요 · 근무 완료</button>` : ''}</span></div>`).join('') || '<div class="empty">채용된 긴급 근무가 없어요</div>'}
    <p class="note">근무 완료를 누르면 매장이 확인하거나 3시간이 지나면 자동으로 지갑에 들어와요.</p></div>
  <div class="card"><h3>내 지원</h3>${S.apps.map(a => `<div class="li"><div><b>${esc(a.title)}</b><small>${esc(a.store_name)} · ${new Date(a.created_at).toLocaleDateString('ko-KR')}</small></div><span class="pill ${L[a.status][0]}">${L[a.status][1]}</span></div>`).join('') || '<div class="empty">아직 지원한 공고가 없어요</div>'}</div>`;
}
function vWallet() {
  const w = S.wallet;
  return `<h1>지갑</h1><div class="card dsum" style="grid-template-columns:1fr 1fr"><div><small>지갑 잔액</small><b class="num up">₩${E.won(w.balance)}</b></div><div><small>지금 출금 가능</small><b class="num">₩${E.won(w.available)}</b></div></div>
  <p class="note">긴급 근무 급여는 확인 후 5시간 뒤 출금할 수 있어요. ⚡ 번개 출금(1,500원, PRO 0원)과 계좌 출금은 정식 오픈 때 열려요.</p>
  <div class="card"><h3>🎟 지원권 <small>${S.tickets}장</small></h3><div class="plans">${[[1, 5500], [5, 24900], [10, 44000]].map(([n, p], i) => `<div class="plan ${i === 1 ? 'cur' : ''}"><b>${n}장</b><b class="num">₩${E.won(p)}</b><small>장당 ₩${E.won(p / n)}</small></div>`).join('')}</div><p class="note">지원권 구매는 정식 오픈 때 열려요. 지금은 가입 선물 3장으로 써보세요.</p></div>`;
}
function vMe() {
  const p = S.prof;
  return `<h1>내 정보</h1><form class="f card" id="dealer-form"><label class="fl">이름(닉네임)<input name="name" value="${esc(p.name)}"></label><label class="fl">휴대폰<input name="phone" value="${esc(p.phone || '')}"></label>
  <label class="fl">경력 (개월)<input name="career" type="number" value="${p.career_months || 0}"></label><label class="fl">자기소개<textarea name="bio" rows="3">${esc(p.bio || '')}</textarea></label><button class="btn pri full">저장</button></form>
  <form class="f card" id="join-code-form"><h3>매장 소속 신청 <small>점장님께 받은 가입코드</small></h3><input name="code" required placeholder="D-XXXXXX" style="text-transform:uppercase;letter-spacing:.15em"><button class="btn full">소속 신청</button></form>
  ${inqBlock()}
  <div class="card"><h3>알림</h3>${S.notis.map(x => `<div class="li"><span>${esc(x.body)}</span><small>${fmtDT(x.created_at)}</small></div>`).join('') || '<div class="empty">알림이 없어요</div>'}</div>`;
}

// ===== 운영사 =====
function vHqDash() {
  const st = S.stats || [], sales = st.reduce((a, x) => a + +x.sales, 0), open = (S.inq || []).filter(x => !x.reply).length;
  return `<h1>운영사</h1><p class="sub">${S.y}년 ${S.m}월</p><div class="grid2"><div class="card kpi"><div class="l">입점 매장</div><div class="v num">${st.length}곳</div></div><div class="card kpi"><div class="l">사업자 확인 대기</div><div class="v num warn">${(S.companies || []).filter(c => !c.biz_verified).length}곳</div></div>
  <div class="card kpi"><div class="l">이번 달 매장 매출 합계</div><div class="v num">₩${man(sales)}</div></div><div class="card kpi"><div class="l">답변 대기 문의</div><div class="v num ${open ? 'down' : ''}">${open}건</div></div></div>
  <div class="card"><h3>요금제 현황</h3>${['trial', 'basic', 'pro'].map(k => `<div class="li"><span>${{ trial: '무료 체험', basic: '베이직', pro: '프로' }[k]}</span><b class="num">${(S.companies || []).filter(c => c.plan === k).length}곳</b></div>`).join('')}<p class="note">예상 월 구독 매출 ₩${E.won((S.companies || []).reduce((a, c) => a + (PRICE[c.plan] || 0), 0))}</p></div>
  <div class="card"><h3>발주 요청 <small>${(S.hqOrders || []).filter(o => o.status !== '도착').length}건 진행 중</small></h3>${(S.hqOrders || []).map(o => { const st = (S.stats || []).find(x => x.store_id === o.store_id); return `<div class="li"><div><b>${esc(st?.store || '매장')}</b> <small>${o.items.map(i => `${esc(item(i.id)?.n)}×${i.q}${i.alc ? '(주류)' : ''}`).join(', ')} · ₩${E.won(o.total)} · ${o.tax_invoice ? '세금계산서' : '계산서 없음'} · ${fmtDT(o.created_at)}</small></div><span class="row">${['접수', '준비 중', '배송 중', '도착'].map(s => `<button class="btn sm ${o.status === s ? 'pri' : ''}" data-act="ostat" data-o="${o.id}" data-v="${s}">${s}</button>`).join('')}</span></div>`; }).join('') || '<div class="empty">발주 요청이 없어요</div>'}</div>`;
}
function vHqStores() {
  return `<h1>입점 매장</h1><div class="card">${(S.companies || []).map(c => `<div class="li"><div><b>${esc(c.name)}</b>${c.brand ? ` <small class="mut">${esc(c.brand)}</small>` : ''}<small>사업자 ${esc(c.biz_no || '')} · ${{ trial: '무료 체험', basic: '베이직', pro: '프로' }[c.plan]} · ${new Date(c.created_at).toLocaleDateString('ko-KR')}</small></div>${c.biz_verified ? '<span class="pill g">확인 완료</span>' : `<button class="btn sm pri" data-act="verify" data-c="${c.id}">사업자 확인</button>`}</div>`).join('') || '<div class="empty">아직 매장이 없어요</div>'}</div>`;
}
function vHqData() {
  const st = S.stats || [];
  return `<h1>데이터 자산</h1><p class="sub">매장별 ${S.m}월 매출·지출 (엑시트용 데이터 모음)</p><div class="row">${monthNav()}<button class="btn sm pri" data-act="hq-csv">📥 엑셀</button></div>
  <div class="card"><div class="tbl"><table><thead><tr><th>회사</th><th>매장</th><th>지역</th><th class="r">매출</th><th class="r">보고일</th><th class="r">지출</th><th class="r">직원</th></tr></thead><tbody>${st.map(x => `<tr><td>${esc(x.company)}</td><td>${esc(x.store)}</td><td>${esc(x.area || '')}</td><td class="r num">${E.won(x.sales)}</td><td class="r num">${x.days}</td><td class="r num">${E.won(x.expenses)}</td><td class="r num">${x.staff}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function vHqInq() {
  const nm = id => (S.hqProfiles || []).find(p => p.id === id)?.name || '회원';
  return `<h1>문의함</h1>${(S.inq || []).map(x => `<div class="card"><div class="row between"><b>${esc(nm(x.from_user))}</b><small class="mut">${fmtDT(x.created_at)}</small></div><p style="margin:6px 0">${esc(x.body)}</p>
    ${x.reply ? `<div class="up">↳ ${esc(x.reply)}</div>` : `<form class="row" data-inq="${x.id}"><input name="reply" required placeholder="답변 쓰기" style="flex:1"><button class="btn sm pri">보내기</button></form>`}</div>`).join('') || '<div class="card empty">문의가 없어요</div>'}`;
}

// ===== 시트 =====
function openSheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="in">${html}</div>`; s.hidden = false; }
function closeSheet() { $('#sheet').hidden = true; }
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

// ===== 동작 =====
let working = false;
const busy = async fn => { if (working) return; working = true; document.body.classList.add('busy'); try { await fn(); } catch (e) { console.error(e); } finally { working = false; document.body.classList.remove('busy'); } };
const reload = async () => { if (S.mode === 'store') await loadStore(); else if (S.mode === 'staff') await loadStaff(); else if (S.mode === 'dealer') await loadDealer(); else if (S.mode === 'hq') await loadHQ(); render(); };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tab],[data-act]'); if (!b) return; const d = b.dataset;
  if (d.tab) { S.tab = d.tab; S.sub = null; closeSheet(); render(); scrollTo(0, 0); return; }
  const a = d.act;
  if (a === 'authmode') { S.authMode = d.v; render(); }
  if (a === 'logout') busy(async () => { await sb.auth.signOut(); });
  if (a === 'onb') { S.onb = d.v || null; render(); }
  if (a === 'close') closeSheet();
  if (a === 'goto') { S.tab = d.t; S.sub = d.s || null; render(); scrollTo(0, 0); }
  if (a === 'sub') { S.sub = d.v || null; render(); scrollTo(0, 0); if (d.v === 'used') busy(async () => { S.used = await q(sb.from('used_items').select('*').order('created_at', { ascending: false }).limit(50)); render(); }); if (d.v === 'rot') busy(async () => { await loadRot(); render(); }); if (d.v === 'inq') busy(async () => { S.inq = await q(sb.from('inquiries').select('*').eq('from_user', S.user.id).order('created_at', { ascending: false })); render(); }); }
  if (a === 'mon') busy(async () => { S.m += +d.v; if (S.m > 12) { S.m = 1; S.y++; } if (S.m < 1) { S.m = 12; S.y--; } await reload(); });
  if (a === 'sview') { S.schedView = d.v; render(); }
  if (a === 'edit-d') { S.edit = { memberId: d.m, date: d.d }; shiftSheet(S.edit); }
  if (a === 'add-d') { S.edit = { date: d.d, add: true }; shiftSheet(S.edit); }
  if (a === 'edit-w') { S.edit = { memberId: d.m, weekday: +d.w }; shiftSheet(S.edit); }
  if (a === 'shift-off') busy(async () => {
    const { memberId, date, weekday } = S.edit;
    if (date) await q(sb.from('shift_overrides').upsert({ member_id: memberId, work_date: date, off: true, start_t: null, end_t: null, break_min: null }));
    else await q(sb.from('shift_templates').delete().eq('member_id', memberId).eq('weekday', weekday));
    closeSheet(); await reload(); toast('휴무로 바꿨어요');
  });
  if (a === 'staff-new') staffSheet(null);
  if (a === 'staff-edit') staffSheet(d.m);
  if (a === 'staff-del') busy(async () => { if (!confirm('퇴사 처리할까요? 급여 기록은 남아요.')) return; await q(sb.from('members').update({ active: false }).eq('id', $('#staff-form').dataset.m)); closeSheet(); await reload(); toast('퇴사 처리했어요'); });
  if (a === 'join-open') joinSheet(d.r);
  if (a === 'mgr') busy(async () => { await q(sb.rpc('set_manager', { p_member: d.m, p_on: d.v === 'true' })); await reload(); toast(d.v === 'true' ? '점장 권한을 줬어요' : '점장 권한을 회수했어요'); });
  if (a === 'copy') { navigator.clipboard?.writeText(d.v).then(() => toast('복사했어요'), () => toast(d.v)); }
  if (a === 'exp-del') busy(async () => { await q(sb.from('expenses').delete().eq('id', d.id)); await reload(); toast('삭제했어요'); });
  if (a === 'csv') {
    const rows = [['이름', '실명', '직책', '계약', '시급', '근무일', '근무시간', '기본급', '야간수당', '연장수당', '주휴수당', '인센티브', '지급총액', '공제', '실지급', '은행', '계좌번호', '예금주']];
    S.members.filter(p => p.role !== 'owner').forEach(p => { const r = payOf(p); rows.push([p.nick, p.real_name, p.job_role, p.contract, p.hourly_rate, r.days, r.hours.toFixed(1), r.base, r.np, r.otp, r.juhu, r.inc, r.gross, r.ded, r.net, p.bank_name, p.bank_acct, p.bank_holder]); });
    download(`급여대장_${S.store.name}_${S.y}-${E.pad(S.m)}.csv`, rows);
  }
  if (a === 'hq-csv') download(`데이터자산_${S.y}-${E.pad(S.m)}.csv`, [['회사', '브랜드', '매장', '지역', '사업자확인', '요금제', '매출', '보고일', '지출', '직원'], ...(S.stats || []).map(x => [x.company, x.brand, x.store, x.area, x.verified ? 'O' : 'X', x.plan, x.sales, x.days, x.expenses, x.staff])]);
  if (a === 'pkind') { S.postKind = d.v; render(); }
  if (a === 'manage') busy(() => manage(d.p, d.k));
  if (a === 'hire') busy(async () => { await q(sb.rpc('hire', { p_app: d.a })); toast('채용했어요! 연락처가 열렸어요'); await manage(d.p, d.k); });
  if (a === 'cancel-hire') busy(async () => { if (!confirm('채용을 취소할까요? 딜러에게 지원권을 돌려드려요.')) return; await q(sb.rpc('cancel_hire', { p_app: d.a })); toast('채용을 취소했어요'); await manage(d.p, d.k); });
  if (a === 'contact') busy(async () => { const ph = await q(sb.rpc('get_contact', { p_app: d.a })); b.outerHTML = `<a class="btn sm pri" href="tel:${esc(ph)}">${esc(ph || '번호 없음')}</a>`; });
  if (a === 'slot') busy(async () => { if (d.v === 'dispute' && !confirm('문제를 신고할까요? 자동 지급이 멈추고 운영사가 확인해요.')) return; await q(sb.rpc('slot_act', { p_slot: d.s, p_act: d.v })); toast({ start: '출근을 확인했어요', noshow: '다시 모집해요', extra: '1시간 연장했어요', ok: '확인했어요. 딜러에게 지급돼요', dispute: '운영사에 신고했어요' }[d.v]); const mb = b.closest('.job')?.querySelector('[data-act=manage]'); if (mb) await manage(mb.dataset.p, mb.dataset.k); });
  if (a === 'dslot') busy(async () => { await q(sb.rpc('slot_act', { p_slot: d.s, p_act: 'done' })); toast('근무 완료를 알렸어요. 수고하셨어요!'); await reload(); });
  if (a === 'apply') busy(async () => { if (S.tickets < 1) return toast('지원권이 없어요'); await q(sb.rpc('apply_job', { p_post: d.p })); toast('지원했어요! 매장이 채용하면 알림이 와요'); await reload(); });
  if (a === 'uside') { S.uside = d.v; render(); }
  if (a === 'sell-save') busy(async () => { await q(sb.from('transfer_leads').insert({ company_id: S.company.id, store_id: S.store.id, answers: S.sellA })); S.sellSaved = true; render(); toast('상담을 신청했어요. 담당자가 연락드려요'); });
  if (a === 'pick') { S.pick = S.pick === d.m ? null : d.m; render(); }
  if (a === 'drop' && S.pick) { const mid = S.pick; S.pick = null; rotMove(mid, d.v); render(); busy(saveRot); }
  if (a === 'rot-auto') { const n = rotAuto(); render(); busy(saveRot); toast(n ? `${n}명 교대했어요` : '휴식을 마친 사람이 없어요'); }
  if (a === 'lay-edit') { S.editLayout = true; S.selItem = null; render(); }
  if (a === 'item') { S.selItem = S.selItem === d.v ? null : d.v; render(); }
  if (a === 'cell' && S.selItem) { const [x, y] = d.v.split(',').map(Number), it = S.layout.find(i => i.id === S.selItem); if (it.x !== undefined && S.layout.every(o => o === it || o.y !== y || o.x + o.w <= x || x + it.w <= o.x) && x + it.w <= 8) { it.x = x; it.y = y; S.selItem = null; } else toast('들어갈 자리가 없어요'); render(); }
  if (a === 'lay-add') { const ids = S.layout.filter(i => !i.counter).map(i => +i.id.slice(1)), id = 'T' + ((ids.length ? Math.max(...ids) : 0) + 1), rows = Math.max(...S.layout.map(i => i.y)) + 2; let spot = null;
    for (let y = 0; y < rows && !spot; y++) for (let x = 0; x <= 6 && !spot; x += 1) if (S.layout.every(o => o.y !== y || o.x + o.w <= x || x + 2 <= o.x)) spot = { x, y };
    S.layout.push({ id, w: 2, ...spot }); render(); }
  if (a === 'lay-del') { if (!S.selItem || S.selItem === 'C') return toast('지울 테이블을 먼저 누르세요'); const R = rotState(); if (R.t[S.selItem]) rotMove(R.t[S.selItem].m, 'BREAK'); S.layout = S.layout.filter(i => i.id !== S.selItem); S.selItem = null; render(); }
  if (a === 'lay-save') busy(async () => { await q(sb.rpc('set_layout', { p_store: S.store.id, p_layout: S.layout })); S.store.layout = S.layout; S.editLayout = false; S.selItem = null; await saveRot(); render(); toast('배치를 저장했어요'); });
  if (a === 'stock-add') busy(async () => { await q(sb.from('stock').insert({ store_id: S.store.id, item_id: +$('#stock-add').value, qty: 0, min: 2, use_per_day: .3 })); await reload(); });
  if (a === 'cart') { const n = +(d.n || 1); S.cart[d.v] = Math.max(0, (S.cart[d.v] || 0) + n); if (!S.cart[d.v]) delete S.cart[d.v]; if (S.tab === 'more' && S.sub === 'order') render(); else toast(`${item(d.v).n} ${n}개 담았어요 · 더보기 → 발주`); }
  if (a === 'restock-all') { S.stock.filter(s => s.qty < s.min).forEach(s => S.cart[s.item_id] = (S.cart[s.item_id] || 0) + restockQty(s)); S.tab = 'more'; S.sub = 'order'; render(); scrollTo(0, 0); }
  if (a === 'scat') { S.shopCat = d.v; render(); }
  if (a === 'order') busy(async () => { const items = Object.entries(S.cart).map(([id, n]) => ({ id: +id, q: n, price: item(id).sp, alc: item(id).c === 'alc' })), total = items.filter(i => !i.alc).reduce((x, i) => x + i.price * i.q, 0);
    await q(sb.from('orders').insert({ store_id: S.store.id, items, total, tax_invoice: $('#tax-inv')?.checked !== false })); S.cart = {}; await reload(); toast('주문을 요청했어요. 운영사가 확인하고 알려드려요'); });
  if (a === 'ostat') busy(async () => { await q(sb.from('orders').update({ status: d.v }).eq('id', d.o)); await reload(); toast(`${d.v}(으)로 바꿨어요`); });
  if (a === 'quest') busy(async () => { const k = d.k, mon = thisMonth(), on = S.quests.some(x => x.month === mon && x.key === k);
    if (on) await q(sb.from('store_quests').delete().eq('store_id', S.store.id).eq('month', mon).eq('key', k)); else await q(sb.from('store_quests').insert({ store_id: S.store.id, month: mon, key: k }));
    S.quests = await q(sb.from('store_quests').select('*').eq('store_id', S.store.id)); render(); toast(on ? '체크를 풀었어요' : '+150 XP! 다음 달 숫자로 효과를 확인해 드려요'); });
  if (a === 'partner') busy(async () => { await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store.id, body: `[${d.v}] 견적 요청 — ${S.store.name} (${S.store.pyeong || '?'}평). 연락 부탁드려요.` })); toast(`${d.v} 견적을 요청했어요. 운영사가 연락드려요`); });
  if (a === 'ask-pro') toast('요금제는 대표님 앱의 매장 설정에서 바꿀 수 있어요');
  if (a === 'verify') busy(async () => { await q(sb.from('companies').update({ biz_verified: true }).eq('id', d.c)); await reload(); toast('사업자 확인을 완료했어요'); });
});
document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-act=pick]'); if (c) S.pick = c.dataset.m; });
document.addEventListener('dragover', e => { if (e.target.closest?.('[data-act=drop]')) e.preventDefault(); });
document.addEventListener('drop', e => { const z = e.target.closest?.('[data-act=drop]'); if (z && S.pick) { e.preventDefault(); const mid = S.pick; S.pick = null; rotMove(mid, z.dataset.v); render(); busy(saveRot); } });
function download(name, rows) {
  const blob = new Blob(['﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')], { type: 'text/csv' });
  const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = name; l.click();
}
document.addEventListener('input', e => { if (e.target.closest('#post-form')) feeBox(); if (e.target.closest('#report-form')) closeCalc(); });
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (t.closest('#post-form')) feeBox();
  if (t.id === 'store-sel') busy(async () => { S.store = S.stores.find(s => s.id === t.value); await loadStore(); render(); });
  if (d.rot) { const R = rotState(); R[d.rot] = Math.max(5, +t.value || 5); render(); busy(saveRot); }
  if (d.stock || d.stockmin) busy(async () => { const id = +(d.stock || d.stockmin), row = S.stock.find(s => s.item_id === id), patch = d.stock ? { qty: +t.value || 0 } : { min: +t.value || 0 }; Object.assign(row, patch); await q(sb.from('stock').update(patch).eq('store_id', S.store.id).eq('item_id', id)); render(); });
  if (t.id === 'tax-inv') S.taxInv = t.checked;
  if (d.need !== undefined) busy(async () => { const need = [...(S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2])]; need[+d.need] = +t.value || 0; await q(sb.rpc('set_need', { p_store: S.store.id, p_need: need })); S.store.need_by_wd = need; render(); });
  if (d.inc) busy(async () => { const month = E.ymd(S.y, S.m, 1); await q(sb.from('incentives').delete().eq('member_id', d.inc).eq('month', month)); if (+t.value) await q(sb.from('incentives').insert({ member_id: d.inc, month, amount: +t.value, reason: '' })); await reload(); toast('인센티브를 반영했어요'); });
});
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target, v = Object.fromEntries(new FormData(f)), id = f.id;
  busy(async () => {
    if (id === 'auth-form') {
      if (S.authMode === 'signup') { const { data, error } = await sb.auth.signUp({ email: v.email, password: v.pw, options: { data: { name: v.name }, emailRedirectTo: location.origin + location.pathname } }); if (error) return toast(error.message.includes('registered') ? '이미 가입된 이메일이에요. 로그인해 주세요' : error.message); if (!data.session) toast('확인 메일을 보냈어요. 메일의 버튼을 눌러주세요'); }
      else { const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.pw }); if (error) toast(error.message.includes('Invalid') ? '이메일이나 비밀번호가 달라요' : error.message); }
    }
    if (id === 'owner-form') { await q(sb.rpc('create_company', { p_name: v.name, p_brand: v.brand || null, p_biz_no: v.biz, p_store: v.store, p_area: v.area || null, p_nick: v.nick })); await q(sb.from('profiles').update({ name: v.nick }).eq('id', S.user.id)); toast('매장을 만들었어요! 2주 무료로 시작해요'); await boot(); }
    if (id === 'dealer-form') { await q(sb.rpc('start_dealer', { p_name: v.name, p_phone: v.phone, p_career: +v.career || 0, p_bio: v.bio || '' })); toast(S.mode === 'onboard' ? '환영해요! 지원권 3장을 드렸어요' : '저장했어요'); await boot(); }
    if (id === 'join-code-form') { const name = await q(sb.rpc('request_join', { p_code: v.code })); toast(`${name}에 소속 신청했어요. 승인되면 알림이 와요`); f.reset(); }
    if (id === 'join-form') { await q(sb.rpc('approve_join', { p_req: f.dataset.r, p_member: v.member || null, p_rate: +v.rate || 0, p_role: v.role, p_contract: v.contract })); closeSheet(); await reload(); toast('승인했어요. 이제 직원 앱에서 스케줄·급여가 보여요'); }
    if (id === 'shift-form') {
      const m = f.dataset.m || v.member, brk = v.brk === '' ? null : +v.brk, row = { start_t: v.s, end_t: v.e, break_min: brk };
      if (!m) return toast('추가할 직원이 없어요');
      if (f.dataset.d) { await q(sb.from('shift_overrides').upsert({ member_id: m, work_date: f.dataset.d, off: false, ...row })); if (v.rep) { const [y, mo, dd] = f.dataset.d.split('-').map(Number); await q(sb.from('shift_templates').upsert({ member_id: m, weekday: E.wdOf(y, mo, dd), ...row })); } }
      else await q(sb.from('shift_templates').upsert({ member_id: m, weekday: +f.dataset.w, ...row }));
      closeSheet(); await reload(); toast('스케줄을 저장했어요. 급여에 바로 반영돼요');
    }
    if (id === 'report-form') {
      await q(sb.from('daily_reports').upsert({ store_id: S.store.id, report_date: v.date, sales: +v.sales || 0, entries: +v.entries || null, card: +v.card || 0, cash: +f.dataset.cash || 0, transfer: +v.transfer || 0, expense: +v.expense || 0, cash_diff: f.dataset.diff === '' || f.dataset.diff == null ? null : +f.dataset.diff, memo: v.memo || null, reported_by: S.user.id }));
      await q(sb.from('expenses').delete().eq('store_id', S.store.id).eq('spent_on', v.date).eq('source', 'close'));
      if (+v.expense) await q(sb.from('expenses').insert({ store_id: S.store.id, spent_on: v.date, category: 'goods', amount: +v.expense, source: 'close' }));
      S.lastStart = +v.start || S.lastStart; await reload(); toast(Math.abs(+f.dataset.diff || 0) >= 10000 ? '마감했어요. 금고 차액을 대표님께 알렸어요' : '마감을 저장했어요. 수고하셨어요');
    }
    if (id === 'expense-form') { await q(sb.from('expenses').insert({ store_id: S.store.id, category: v.cat, amount: +v.amount, spent_on: v.date || TODAY, source: 'bill' })); await reload(); toast('비용을 추가했어요'); }
    if (id === 'staff-form') {
      const row = { nick: v.nick, real_name: v.real_name || null, job_role: v.job_role, contract: v.contract, hourly_rate: +v.rate || 0, joined_on: v.joined || null, night_pay: !!v.night, labor_law: !!v.law, bank_name: v.bank || null, bank_acct: (v.acct || '').replace(/[^0-9-]/g, '') || null, bank_holder: v.holder || null };
      if (f.dataset.m) await q(sb.from('members').update(row).eq('id', f.dataset.m));
      else await q(sb.from('members').insert({ ...row, company_id: S.store.company_id, store_id: S.store.id, role: 'staff' }));
      closeSheet(); await reload(); toast('저장했어요. 스케줄·급여에 바로 반영돼요');
    }
    if (id === 'post-form') {
      const k = S.postKind || 'urgent', heads = +v.heads || 1;
      await q(sb.rpc('create_post', { p_store: S.store.id, p_kind: k, p_role: v.role, p_title: v.title, p_body: v.body || null, p_pay_text: k === 'hire' ? v.paytext : null, p_work_time: k === 'hire' ? v.work : null, p_heads: heads, p_taxi: +v.taxi || 0, p_flash: !!v.flash, p_top: !!v.top, p_days: +v.days || 1, p_slots: k === 'urgent' ? Array.from({ length: heads }, () => ({ start: v.s, end: v.e, pay: +v.pay || 0 })) : [] }));
      await reload(); toast('공고를 올렸어요! 딜러들에게 보여요');
    }
    if (id === 'attend-form') { const k = await q(sb.rpc('attend', { p_code: v.code.trim() })); toast(k === 'in' ? '출근했어요. 오늘도 화이팅!' : '퇴근했어요. 수고하셨어요'); await reload(); }
    if (id === 'inq-form') { await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store?.id || null, body: v.body })); S.inq = await q(sb.from('inquiries').select('*').eq('from_user', S.user.id).order('created_at', { ascending: false })); render(); toast('운영사에 보냈어요. 답변이 오면 알림이 와요'); }
    if (id === 'used-form') { await q(sb.from('used_items').insert({ seller: S.user.id, store_id: S.store?.id || null, side: S.uside || 'sell', title: v.title, price: +v.price || 0, area: v.area || null, body: v.body || null })); S.used = await q(sb.from('used_items').select('*').order('created_at', { ascending: false }).limit(50)); render(); toast('올렸어요'); }
    if (id === 'sell-form') { S.sellA = [...(S.sellA || []), v.a]; render(); }
    if (id === 'store-form') { await q(sb.from('stores').update({ name: v.name, area: v.area || null, pyeong: +v.py || null, tables: +v.tables || null, night_start: v.ns, night_end: v.ne }).eq('id', S.store.id)); await boot(); toast('저장했어요'); }
    if (id === 'addstore-form') { await q(sb.from('stores').insert({ company_id: S.company.id, name: v.name, area: v.area || null })); await boot(); toast('매장을 추가했어요. 위에서 매장을 골라 전환하세요'); }
    if (f.dataset.inq) { await q(sb.from('inquiries').update({ reply: v.reply, replied_at: new Date().toISOString() }).eq('id', f.dataset.inq)); await reload(); toast('답변을 보냈어요'); }
  });
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

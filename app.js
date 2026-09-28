import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import * as E from './engine.js';
import { PRICING, applyPricing } from './pricing.js';

const sb = createClient('https://hkcmsjwuwopxritafreg.supabase.co', 'sb_publishable_X7cb5p4Ja9y4TxrjbVQZAQ_P8n3E_W_');
const $ = s => document.querySelector(s), view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t5 = t => String(t || '').slice(0, 5);
const now = new Date(), TODAY = E.ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
const fmtDT = d => new Date(d).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const man = n => Math.abs(n) >= 1e8 ? `${(n / 1e8).toFixed(Math.round(n / 1e7) % 10 ? 1 : 0)}억` : `${E.won(n / 10000)}만`;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2800); }
async function q(p) { const { data, error } = await p; if (error) { toast(error.message); throw error; } return data; }
const STORE_COLS = 'id,company_id,name,area,address,pyeong,tables,layout,night_start,night_end,need_by_wd,join_code,created_at,goal,fixed,holidays';
const PRICE = { basic: 0, get pro() { return PRICING.proMonthly } }; // 값은 pricing.js
// 무료 체험 중이거나 프로 결제 중이면 쓸 수 있어요. 끝나면 보기만 (데이터는 그대로). 서버 트리거(guard_active)와 같은 기준
const compActive = c => !!c && ((c.plan === 'pro' && c.paid_until && new Date(c.paid_until) > now) || (c.trial_ends && c.trial_ends >= TODAY) || (c.diag_until && new Date(c.diag_until) > now));
const trialLeft = c => c?.trial_ends ? Math.ceil((new Date(c.trial_ends) - new Date(TODAY)) / 864e5) : 0;
// 사용 이벤트 (Activation·리텐션 계산용). 실패해도 화면엔 영향 없음
const track = (name, props = {}) => { try { sb.from('events').insert({ name, props, company_id: S.company?.id || null, store_id: S.store?.id || null }).then(() => { }, () => { }); } catch { } };
const CAT = { rent: '임대료', mgmt: '관리비', elec: '전기세', water: '수도세', net: '통신·보안', goods: '음료·소모품', card: '카드 수수료', labor: '기타 인건비', etc: '기타' };
const SLOT = { OPEN: ['', '모집 중'], MATCHED: ['y', '채용 확정'], WORKING: ['g', '근무 중'], DONE: ['y', '근무 끝 · 확인 대기'], DISPUTED: ['r', '문제 신고 · 운영사 확인'], PAID: ['g', '지급 완료'], REFUND: ['', '미채용 환불'] };

// ===== 결제 (토스페이먼츠) =====
// 테스트 키(토스 문서 공개용) — 실제 운영 땐 토스 가맹 후 받은 라이브 클라이언트 키로 바꾸고, 서버 쪽 TOSS_SECRET_KEY도 같이 바꿔요
const TOSS_CLIENT_KEY = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq', PAY_TEST = TOSS_CLIENT_KEY.startsWith('test_');
const loadToss = () => window.TossPayments ? Promise.resolve() : new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://js.tosspayments.com/v2/standard'; sc.onload = ok; sc.onerror = () => no(new Error('결제창을 불러오지 못했어요')); document.head.append(sc); });
// 결제수단 — 카드 / 카카오페이 / 네이버페이 / 토스페이 / 계좌이체 (토스페이먼츠 한 곳으로)
const PAYM = [['CARD', '', '신용·체크카드', null], ['KAKAOPAY', '🟡', '카카오페이', 'KAKAOPAY'], ['NAVERPAY', '🟢', '네이버페이', 'NAVERPAY'], ['TOSSPAY', '', '토스페이', 'TOSSPAY'], ['TRANSFER', '', '계좌이체', null]];
async function pay(kind, arg = {}) {
  const o = (await q(sb.rpc('pay_start', { p_kind: kind, p_arg: arg })))[0];
  if (window.__autoPayMethod) return payGo(o, window.__autoPayMethod);
  S.payOrder = o; const last = (() => { try { return localStorage.getItem('ev-paym') } catch { return null } })() || 'CARD', co = S.mode === 'store' && isOwner();
  openSheet(`<h2 style="margin:0 0 4px">결제하기</h2><p class="mut" style="margin:0 0 12px">${esc(o.order_name)}</p><div class="num" style="font-size:28px;font-weight:800;margin-bottom:12px">₩${E.won(o.amount)}</div>
    <div class="paym">${PAYM.map(([k, ic, t]) => `<button class="${k === last ? 'on' : ''}" data-act="pay-go" data-v="${k}"><span>${ic}</span><b>${t}</b></button>`).join('')}</div>
    ${co ? `<label class="tog" style="margin-top:12px"><span><b>세금계산서 자동 발행</b><small>결제할 때마다 사업자번호로 전자세금계산서를 보내드려요</small></span><input type="checkbox" id="tax-auto" ${S.company?.tax_auto ? 'checked' : ''}></label>` : ''}${payNote()}`);
}
async function payGo(o, m) {
  try { localStorage.setItem('ev-paym', m) } catch { }
  const tax = $('#tax-auto'); if (tax && !!tax.checked !== !!S.company?.tax_auto) { await q(sb.rpc('pay_tax', { p_order: o.order_id, p_on: tax.checked })); S.company.tax_auto = tax.checked; }
  const pm = PAYM.find(x => x[0] === m) || PAYM[0], easy = pm[3];
  await loadToss(); const back = location.origin + location.pathname;
  await window.TossPayments(TOSS_CLIENT_KEY).payment({ customerKey: S.user.id }).requestPayment({ method: easy ? 'CARD' : m, ...(easy ? { card: { flowMode: 'DIRECT', easyPay: easy } } : {}), amount: { currency: 'KRW', value: o.amount }, orderId: o.order_id, orderName: o.order_name, successUrl: back + '?pay=ok', failUrl: back + '?pay=fail', customerEmail: S.user.email });
}
// 결제창에서 돌아왔을 때 (successUrl에 paymentKey·orderId·amount가 붙어 와요)
async function payReturn(pr) {
  if (pr.get('pay') === 'fail') { toast(pr.get('message') || '결제를 취소했어요'); return; }
  const { data, error } = await sb.functions.invoke('pay-confirm', { body: { paymentKey: pr.get('paymentKey'), orderId: pr.get('orderId'), amount: +pr.get('amount') } });
  if (error || !data?.ok) { toast((data && data.message) || '결제 확인에 실패했어요. 운영사에 문의해 주세요'); return; }
  track('paid', { kind: data.kind, amount: data.amount });
  toast({ tickets: '결제 완료! 지원권을 넣어드렸어요', pro: '결제 완료! PRO가 시작됐어요', academy: '결제 완료! 딜러 교육이 열렸어요', plan: '결제 완료! 프로 요금제가 시작됐어요', store: '결제 완료! 새 매장이 추가됐어요', post: '결제 완료! 공고가 올라갔어요', post_extra: '결제 완료! 공고 기간·노출을 늘렸어요', franchise: '결제 완료! 가맹 공고가 30일 동안 게시돼요', franchise_leads: '결제 완료! 리드 비용을 정산했어요', used_boost: '결제 완료! 중고 글이 맨 위로 올라갔어요' }[data.kind] || '결제가 완료됐어요');
}
window.__evPayReturn = async p => { await payReturn(new URLSearchParams(p)); await boot(); };
const payNote = () => PAY_TEST ? '<p class="note warn">지금은 테스트 결제예요. 결제창이 떠도 실제 돈은 나가지 않아요.</p>' : '';

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
    if (!S.pricingLoaded) { applyPricing(await q(sb.from('pricing').select('key,amount'))); S.pricingLoaded = true; pushState(); } // 가격은 서버 한 곳
    const pr = new URLSearchParams(location.search); if (S.user && pr.get('pay')) { history.replaceState(null, '', location.pathname); await payReturn(pr); }
    if (!S.user) { Object.assign(S, { mode: 'auth', onb: null, tab: null, sub: null, company: null, stores: [], store: null }); return render(); }
    S.prof = (await q(sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle())) || { name: '' };
    const mem = await q(sb.from('members').select('*').eq('user_id', S.user.id).eq('active', true));
    const owner = mem.find(m => m.role === 'owner'), mgr = mem.find(m => m.role === 'manager'), staff = mem.filter(m => m.role === 'staff');
    if (S.prof.is_hq) { S.mode = 'hq'; S.tab = S.tab || 'dash'; await loadHQ(); }
    else if (owner || mgr) {
      S.mode = 'store'; S.myRole = owner ? 'owner' : 'manager'; S.me = owner || mgr;
      S.company = await q(sb.from('companies').select('*').eq('id', S.me.company_id).maybeSingle()); S.active = compActive(S.company);
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
  S.members = (await q(sb.from('members').select('*').eq('store_id', st).eq('active', true).order('created_at'))).sort((a, b) => rankOf(a) - rankOf(b));
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
  S.noticeTop = (await q(sb.from('notices').select('id,title,created_at').order('created_at', { ascending: false }).limit(1)))[0] || null;
  S.quests = await q(sb.from('store_quests').select('*').eq('store_id', st));
  S.stock = await q(sb.from('stock').select('*').eq('store_id', st).order('item_id'));
  S.orders = await q(sb.from('orders').select('*').eq('store_id', st).order('created_at', { ascending: false }).limit(30));
  S.goals = Object.fromEntries((await q(sb.from('store_goals').select('month,goal').eq('store_id', st))).map(g => [g.month, +g.goal]));
  S.fixedM = await q(sb.from('store_fixed').select('month,fixed').eq('store_id', st).order('month'));
  S.open = (await q(sb.from('day_opens').select('*').eq('store_id', st).eq('day', TODAY)))[0] || null;
  if (!S.prodLoaded) { await loadProducts(); S.prodLoaded = true; }
  S.posAsk = (await q(sb.from('inquiries').select('body').eq('store_id', st).like('body', '[포스 연동]%').limit(1)))[0]?.body.slice(8).split(' — ')[0] || null;
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
async function loadEdu() {
  S.company = S.company || {}; S.acBoard = S.company.academy_at ? await q(sb.rpc('academy_board', { p_store: S.store.id })) : [];
  S.interest = (await q(sb.from('course_interest').select('course'))).map(x => x.course);
  S.cquiz = S.company.id ? (await q(sb.from('company_quiz').select('items').eq('company_id', S.company.id)))[0]?.items || null : null; render();
}
async function loadStaff() {
  const mine = S.my[0]; S.store = (await q(sb.from('stores').select(STORE_COLS).eq('id', mine.store_id).maybeSingle())) || {};
  const [first, last] = monthRange();
  S.members = S.my; S.tpl = await q(sb.from('shift_templates').select('*').in('member_id', S.my.map(m => m.id)));
  S.ov = await q(sb.from('shift_overrides').select('*').in('member_id', S.my.map(m => m.id)).gte('work_date', first).lte('work_date', last));
  S.inc = await q(sb.from('incentives').select('*').in('member_id', S.my.map(m => m.id)).eq('month', first));
  S.att = await q(sb.from('attendance').select('*').order('at', { ascending: false }).limit(10));
  S.academy = await q(sb.rpc('my_academy')); S.lessons = await q(sb.from('lesson_progress').select('lesson'));
  S.quizRes = (await q(sb.from('quiz_results').select('score,passed,total').order('created_at', { ascending: false }).limit(1)))[0] || null;
  S.myQuiz = S.academy ? await q(sb.rpc('my_quiz')) : null;
  await loadDealer();
}
async function loadDealer() {
  S.board = await q(sb.rpc('job_board')); S.tickets = await q(sb.rpc('ticket_balance'));
  S.apps = await q(sb.rpc('my_applications')); S.slots = await q(sb.rpc('my_slots'));
  S.wallet = (await q(sb.rpc('my_wallet')))?.[0] || { balance: 0, available: 0 }; S.rep = await q(sb.rpc('dealer_rep', { u: S.user.id })).catch(() => null);
  S.notis = await q(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(30));
  S.inq = await q(sb.from('inquiries').select('*').eq('from_user', S.user.id).order('created_at', { ascending: false }));
  S.wds = await q(sb.from('withdrawals').select('*').eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(10));
}
async function loadHQ() {
  const [first, last] = monthRange();
  S.stats = await q(sb.rpc('hq_store_stats', { p_from: first, p_to: last }));
  [S.hqToday, S.hqRev] = await Promise.all([q(sb.rpc('hq_today')), q(sb.rpc('hq_revenue'))]);
  S.companies = await q(sb.from('companies').select('*').order('created_at', { ascending: false }));
  S.inq = await q(sb.from('inquiries').select('*').order('created_at', { ascending: false }).limit(100));
  S.hqProfiles = await q(sb.from('profiles').select('id,name,kind,can_post_franchise'));
  S.hqOrders = await q(sb.from('orders').select('*').order('created_at', { ascending: false }).limit(50));
  S.hqWds = await q(sb.from('withdrawals').select('*').order('created_at', { ascending: false }).limit(50));
  await loadProducts();
  S.notices = await q(sb.from('notices').select('*').order('created_at', { ascending: false }).limit(30));
  S.hqFr = await q(sb.from('franchise_postings').select('*').order('created_at', { ascending: false })); S.hqLeads = await q(sb.from('franchise_leads').select('*').order('connected_at', { ascending: false }).limit(200));
  S.hqPays = await q(sb.from('payments').select('*').order('created_at', { ascending: false }).limit(100));
}
const payOf = p => E.payroll(p, S.y, S.m, S.tpl, S.ov, S.inc.filter(i => i.member_id === p.id).reduce((a, i) => a + i.amount, 0), TODAY, night());
const laborOf = (y, m) => S.members.filter(p => p.role !== 'owner').reduce((a, p) => { const r = E.payroll(p, y, m, S.tpl, S.ov, 0, TODAY, night()); return a + r.fullGross * (p.contract === '4대' ? 1.105 : 1); }, 0);

// ===== 화면 틀 =====
const TABS = {
  store: [['home', '', '홈'], ['sched', '', '스케줄'], ['sales', '', '매출'], ['staff', '', '직원'], ['jobs', '', '구인'], ['market', '', '장터']],
  staff: [['work', '', '내 근무'], ['attend', '', '출퇴근'], ['jobs', '', '구인'], ['wallet', '', '지갑'], ['me', '', '내 정보']],
  dealer: [['jobs', '', '구인'], ['mywork', '', '내 근무'], ['wallet', '', '지갑'], ['me', '', '내 정보']],
  hq: [['dash', '', '대시보드'], ['stores', '', '매장'], ['goods', '', '상품'], ['data', '', '데이터'], ['inq', '', '문의함'], ['notice', '', '공지'], ['fr', '', '가맹']]
};
// 탭·상단 아이콘: 이모지 대신 단색 선 아이콘 (기기마다 같은 모양)
const ICON = { home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', sched: '<path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4"/>', sales: '<circle cx="12" cy="12" r="9"/><path d="M8 9l1.5 6 2.5-5 2.5 5L16 9M8 12h8"/>',
  staff: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-5-6.3"/>', jobs: '<path d="M3 10v4h3l8 5V5L6 10H3zM18 9a4 4 0 0 1 0 6"/>', market: '<path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2"/>',
  work: '<path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4"/>', attend: '<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.5"/>', wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7a2 2 0 0 1 2-2h12M16 13h5v4h-5a2 2 0 0 1 0-4z"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', mywork: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 8l2.5 3.5L12 15l-2.5-3.5z"/>', dash: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
  stores: '<path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6M4 21h16"/>', goods: '<path d="M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8"/>', data: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  inq: '<path d="M4 5h16v11H9l-5 4V5z"/>', notice: '<path d="M3 10v4h3l8 5V5L6 10H3zM18 9a4 4 0 0 1 0 6"/>', fr: '<path d="M3 21h18M5 21V9h5v12M14 21V4h5v17"/>', settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h13"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><circle cx="19" cy="12" r="2"/>' };
const svg = k => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
function render() {
  clearInterval(S.qrTimer);
  const tabs = TABS[S.mode], nav = $('#tabs'); nav.hidden = !tabs;
  const g = S.mode === 'store' ? groupOf() : S.tab;
  if (tabs) nav.innerHTML = tabs.map(([k, i, l]) => `<button ${k === 'market' ? 'data-act="sub" data-v="used"' : `data-tab="${k}"`} ${g === k ? 'aria-current="page"' : ''}><span>${ICON[k] ? svg(k) : i}</span>${l}</button>`).join('');
  $('#top-r').innerHTML = S.user ? `${S.mode === 'store' ? `<button class="btn sm icon ${S.sub === 'notice' ? 'on' : ''}" data-act="sub" data-v="notice" title="운영사 공지" aria-label="운영사 공지">${svg('notice')}</button><button class="btn sm icon ${S.sub === 'inq' ? 'on' : ''}" data-act="sub" data-v="inq" title="운영사 문의" aria-label="운영사 문의">${svg('inq')}</button><button class="btn sm icon ${S.sub === 'settings' ? 'on' : ''}" data-act="sub" data-v="settings" title="매장 설정" aria-label="매장 설정">${svg('settings')}</button>` : ''}<button class="btn sm" data-act="logout">로그아웃</button>` : '';
  const V = { auth: vAuth, onboard: vOnboard,
    store: () => ((S.tab === 'more' && S.sub === 'daily' ? vDaily : 0) || ({ improve: vImprove, home: vHome, sched: vSched, sales: vSales, staff: vStaff, jobs: vJobs, more: vMore }[S.tab] || vHome))(),
    staff: () => ({ learn: vLearn, work: vWork, attend: vAttend, jobs: vBoard, wallet: vWallet, me: vMe }[S.tab] || vWork)(),
    dealer: () => ({ jobs: vBoard, mywork: vMyWork, wallet: vWallet, me: vMe }[S.tab] || vBoard)(),
    hq: () => ({ dash: vHqDash, goods: vHqGoods, stores: vHqStores, data: vHqData, inq: vHqInq, notice: vHqNotice, fr: vHqFr }[S.tab] || vHqDash)() };
  const lock = S.mode === 'store' && S.company && !S.active ? `<div class="lockbar"><div><b>무료 체험이 끝났어요.</b> 지금은 보기만 돼요 — 입력한 데이터는 그대로 있어요.</div>${isOwner() ? `<button class="btn sm gold" data-act="plan" data-v="pro">프로로 계속 쓰기 · 월 ₩${E.won(PRICE.pro)}</button>` : '<button class="btn sm" data-act="ask-owner" data-v="프로 요금제">대표님께 요청</button>'}</div>` : '';
  view.innerHTML = lock + (V[S.mode] || vAuth)(); enhanceInputs(view);
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
    <div class="choice"><button data-act="onb" data-v="owner"><b>대표·점장 및 매장이에요</b><small>매장 PC에 켜 두고 매출·스케줄·급여·구인을 관리해요. 처음 등록은 사업자등록번호가 필요해요.</small></button>
    <button data-act="onb" data-v="dealer"><b>딜러·스태프예요</b><small>공고를 보고 지원하거나, 매장 가입코드로 소속될 수 있어요. 가입하면 지원권 3장을 드려요.</small></button></div>
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
// 하단 탭 하나에 세부 메뉴를 묶음 (더보기 없음)
const SUBNAV = { home: [['home', null, '브리핑'], ['improve', null, '매장 개선'], ['more', 'pnl', '월간 손익'], ['more', 'daily', '일 매출']], sched: [['sched', null, '근무표'], ['more', 'rot', '테이블 로테이션'], ['more', 'qr', '출퇴근 코드']],
  sales: [['sales', null, '오픈·마감'], ['more', 'order', '재고·발주']], staff: [['staff', null, '직원·급여'], ['more', 'edu', '교육']], jobs: [['jobs', null, '우리 공고 올리기'], ['more', 'board', '전체 구인 공고']], market: [['more', 'used', '중고 장터'], ['more', 'transfer', '점포 양도양수'], ['more', 'franchise', '가맹 모집']] };
const SUB_GROUP = { franchise: 'market', board: 'jobs', notice: 'home', daily: 'home', pnl: 'home', rot: 'sched', qr: 'sched', order: 'sales', edu: 'staff', used: 'market', transfer: 'market' };
const groupOf = () => S.tab === 'more' ? SUB_GROUP[S.sub] || null : S.tab === 'improve' ? 'home' : S.tab;
function subnav() {
  const items = (SUBNAV[groupOf()] || []).filter(([, s]) => s !== 'transfer' || isOwner()); if (items.length < 2) return '';
  return `<nav class="subnav">${items.map(([t, s, l]) => { const on = t === 'more' ? S.tab === 'more' && S.sub === s : S.tab === t; return `<button ${t === 'more' ? `data-act="sub" data-v="${s}"` : `data-tab="${t}"`} ${on ? 'aria-current="page"' : ''}>${l}</button>`; }).join('')}</nav>`;
}
function storeHead(title) {
  return `<div class="row between"><div><h1>${title}</h1><p class="sub" style="margin:0">${esc(S.company?.name || '')} · ${esc(S.store?.name)}${S.company && !S.company.biz_verified ? ' · <button class="tlink warn" data-act="goto" data-t="more" data-s="settings">사업자번호 확인 필요</button>' : ''}</p></div>
  <div class="row">${S.stores.length > 1 ? `<select id="store-sel" style="width:auto">${S.stores.map(s => `<option value="${s.id}" ${s.id === S.store.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}</div></div>` + subnav();
}
function monthNav() { return `<span class="row"><button class="btn sm" data-act="mon" data-v="-1">◀</button><b class="num">${S.y}년 ${S.m}월</b><button class="btn sm" data-act="mon" data-v="1">▶</button></span>`; }
function monthSummary(y, m) {
  const [f, l] = monthRange(y, m), rs = S.hist.filter(r => r.report_date >= f && r.report_date <= l), n = rs.length, sales = rs.reduce((a, r) => a + r.sales, 0);
  const cur = y === now.getFullYear() && m === now.getMonth() + 1, proj = cur && n >= 3 ? sales / n * E.daysIn(y, m) : sales; // 보고 3일 미만이면 예상 대신 실제 합계
  const exp = {}; S.expAll.filter(x => x.spent_on >= f && x.spent_on <= l).forEach(x => exp[x.category] = (exp[x.category] || 0) + x.amount);
  const card = rs.reduce((a, r) => a + (r.card || 0), 0) * (+S.store.equip?.card_rate || 1.6) / 100 * (cur && n ? E.daysIn(y, m) / n : 1);
  if (!exp.card && card) exp.card = card;
  if (n) Object.entries(fixedFor(y, m).fx).forEach(([k, v]) => { if (+v && !exp[k]) exp[k] = +v; });
  const urgent = S.posts.filter(p => p.kind === 'urgent' && p.created_at.slice(0, 10) >= f && p.created_at.slice(0, 10) <= l).reduce((a, p) => a + (p.paid_amount || 0), 0);
  const labor = laborOf(y, m) + urgent, cost = labor + Object.values(exp).reduce((a, v) => a + v, 0);
  const D = E.daysIn(y, m), el = cur ? Math.max(1, now.getDate() - 1) : D;
  return { n, sales, proj, exp, labor, urgent, cost, left: proj - cost, el, earned: sales - cost * el / D, bep: proj ? Math.ceil(cost / (proj / D)) : null };
}
// 그 달 고정비: 그 달에 넣은 값, 없으면 가장 최근 달 값을 이어서 씀
const fixedFor = (y, m) => { const f = E.ymd(y, m, 1), rows = (S.fixedM || []).filter(r => r.month <= f); const r = rows[rows.length - 1]; return { fx: r?.fixed || {}, from: r?.month || null, own: r?.month === f }; };
const FIXED = [['rent', '임대료'], ['mgmt', '관리비'], ['elec', '전기세'], ['water', '수도세'], ['net', '통신·보안']];
const monKey = (y, m) => E.ymd(y, m, 1), goalOf = (y, m) => (S.goals || {})[monKey(y, m)] || 0, nextMon = () => { const t = new Date(now.getFullYear(), now.getMonth() + 1, 1); return [t.getFullYear(), t.getMonth() + 1]; };
const goalSuggest = () => { const p = new Date(S.y, S.m - 2, 1), L = monthSummary(p.getFullYear(), p.getMonth() + 1), M = monthSummary(S.y, S.m), base = Math.max(L.sales, M.proj); return base ? { v: Math.ceil(base * 1.08 / 1e6) * 1e6, base: L.sales ? L.sales : M.proj, from: L.sales ? '지난달 매출' : '이번 달 예상' } : null; };
// 오늘 해야 할 일 — 목표·마감·재고·처방에서 매일 새로 뽑음
function todayTodo(M, goal) {
  const T = [], [y, m, d] = TODAY.split('-').map(Number), w = E.wdOf(y, m, d), D = E.daysIn(y, m), left = D - d + 1;
  const yd = new Date(y, m - 1, d - 1), ydk = E.ymd(yd.getFullYear(), yd.getMonth() + 1, yd.getDate());
  if (!S.hist.some(r => r.report_date === ydk)) T.push(['', '어제 마감 입력하기', '입력해야 목표 달성률이 맞아요', 'sales']);
  const same = S.hist.filter(r => { const [a, b, c] = r.report_date.split('-').map(Number); return E.wdOf(a, b, c) === w; }).slice(0, 6), avgW = same.length ? same.reduce((a, r) => a + r.sales, 0) / same.length : 0;
  if (goal && S.y === y && S.m === m) {
    const need = Math.max(0, goal - M.sales) / left;
    if (!need) T.push(['', '이번 달 목표를 이미 넘었어요', `지금부터 버는 건 전부 목표 초과분이에요`]);
    else if (avgW && need > avgW * 1.05) { const r = S.bench?.ready && !S.bench.locked ? rxOf(S.bench).rev[0] : null;
      T.push(['', `오늘 매출 ₩${man(need)} 만들기`, `평소 ${E.WD[w]}요일보다 ₩${man(need - avgW)} 더 필요해요 · ${r ? esc(r[1]) : '단골 손님께 오늘 게임 안내 문자 보내기'}`, r ? 'improve' : null]); }
    else T.push(['', `오늘 매출 ₩${man(need)}이면 목표 페이스예요`, avgW ? `평소 ${E.WD[w]}요일 ₩${man(avgW)} — 지금처럼만 하면 돼요` : '매일 마감을 넣으면 요일별로 알려드려요']);
  }
  const low = S.stock.filter(s => s.qty < s.min).length; if (low) T.push(['', `재고 부족 ${low}개 발주하기`, S.stock.filter(s => s.qty < s.min).map(s => item(s.item_id)?.n).slice(0, 2).join(', '), 'order']);
  const B = S.bench; if (B?.ready && !B.locked) { const rx = rxOf(B), mon = thisMonth(), undone = [...rx.rev, ...rx.cost].filter(r => !S.quests.some(q => q.month === mon && q.key === r[0]));
    if (undone.length) T.push(['', `이번 달 꼭 할 일 ${undone.length}개 남음`, `${esc(undone[0][1])} · 월 ₩${man(undone[0][3])}`, 'improve']); }
  return T;
}
function goalCard(M) {
  const goal = goalOf(S.y, S.m), sg = goalSuggest(), cur = S.y === now.getFullYear() && S.m === now.getMonth() + 1, D = E.daysIn(S.y, S.m), [ny, nm] = nextMon();
  const nextAsk = cur && isOwner() && now.getDate() >= D - 7 && !goalOf(ny, nm) ? `<div class="promo" style="margin-top:10px"><span>${nm}월 목표를 미리 정해 두세요. 1일부터 바로 달성률이 보여요.</span><button class="btn sm pri" data-act="goal" data-y="${ny}" data-m="${nm}">${nm}월 목표 정하기</button></div>` : '';
  if (!goal) return `<div class="card goal"><h3>${S.m}월 목표 매출</h3>${sg ? `<p style="margin:0 0 10px">${sg.from} ₩${man(sg.base)}보다 8% 높은 <b class="num" style="font-size:22px">₩${man(sg.v)}</b>을 추천해요.</p>` : '<p class="mut">마감이 쌓이면 목표를 추천해 드려요.</p>'}
    ${isOwner() ? `<div class="row">${sg ? `<button class="btn pri" data-act="goal-set" data-v="${sg.v}">이걸로 정하기</button>` : ''}<button class="btn" data-act="goal">직접 정하기</button></div>` : '<p class="note">목표는 대표님이 정해요.</p>'}${nextAsk}</div>`;
  const pct = M.sales / goal * 100, pp = M.proj / goal * 100, pace = cur ? M.el / D * 100 : 100, gapP = M.proj - goal, T = cur ? todayTodo(M, goal) : [];
  return `<div class="card goal"><div class="row between"><h3 style="margin:0">${S.m}월 목표 <b class="num">₩${man(goal)}</b></h3>${isOwner() ? '<button class="btn sm" data-act="goal">바꾸기</button>' : ''}</div>
    <div class="gnum"><b class="num">${Math.floor(pct)}%</b><span>달성 · ₩${man(M.sales)}</span></div>
    <div class="gbar"><i style="width:${Math.min(100, pct)}%"></i>${cur ? `<em style="left:${pace}%" title="오늘 기준 있어야 할 위치"></em>` : ''}</div>
    <div class="row between gsub"><small>${cur ? `오늘까지 있어야 할 곳 ${Math.round(pace)}%` : ''}</small><small>월말 예상 <b class="num ${gapP >= 0 ? 'up' : 'warn'}">${Math.round(pp)}%</b> ${gapP >= 0 ? `(+₩${man(gapP)} 초과)` : `(₩${man(-gapP)} 부족)`}</small></div>
    ${nextAsk}${T.length ? `<div class="todo"><small class="mut">오늘 할 일 · ${now.getMonth() + 1}월 ${now.getDate()}일</small>${T.map(t => `<div class="td" ${t[3] ? `data-act="goto" data-t="${t[3] === 'order' ? 'more' : t[3]}" ${t[3] === 'order' ? 'data-s="order"' : ''} role="button"` : ''}><div><b>${t[1]}</b><small>${t[2]}</small></div>${t[3] ? '<span class="mut">›</span>' : ''}</div>`).join('')}</div>` : ''}</div>`;
}
function selfCard() {
  const ms = [0, 1, 2].map(i => { const t = new Date(S.y, S.m - 1 - i, 1); return { m: t.getMonth() + 1, s: monthSummary(t.getFullYear(), t.getMonth() + 1) }; });
  if (!ms[1].s.n) return '';
  const row = (n, f, good, fmt) => { const v = ms.map(x => f(x.s)), d = v[0] - v[1]; return `<tr><td>${n}</td>${v.map((x, i) => `<td class="r num ${i ? 'mut' : ''}">${x == null || isNaN(x) ? '-' : fmt(x)}</td>`).join('')}<td class="r num ${d === 0 || isNaN(d) ? '' : (d > 0) === good ? 'up' : 'down'}">${isNaN(d) || !d ? '-' : (d > 0 ? '▲' : '▼') + fmt(Math.abs(d))}</td></tr>`; };
  const pct = x => x.toFixed(1) + '%', mw = x => man(x);
  return `<div class="card"><h3>내 매장 지난달과 비교 <small>${ms[2].m}월 · ${ms[1].m}월 · ${ms[0].m}월${S.y === now.getFullYear() && S.m === now.getMonth() + 1 ? ' (예상)' : ''}</small></h3><div class="tbl"><table style="min-width:0;font-size:13px"><thead><tr><th></th>${[...ms].reverse().map(x => `<th class="r">${x.m}월</th>`).join('')}<th class="r">변화</th></tr></thead><tbody>
    ${[['매출', s => s.proj, true, mw], ['인건비 비율', s => s.proj ? s.labor / s.proj * 100 : NaN, false, pct], ['비용 합계', s => s.cost, false, mw], ['남는 돈', s => s.left, true, mw]].map(([n, f, g, fm]) => { const v = [...ms].reverse().map(x => f(x.s)), d = v[2] - v[1]; return `<tr><td>${n}</td>${v.map((x, i) => `<td class="r num ${i < 2 ? 'mut' : ''}">${isNaN(x) ? '-' : fm(x)}</td>`).join('')}<td class="r num ${!d || isNaN(d) ? '' : (d > 0) === g ? 'up' : 'down'}">${!d || isNaN(d) ? '-' : (d > 0 ? '▲' : '▼') + fm(Math.abs(d))}</td></tr>`; }).join('')}</tbody></table></div>
    ${S.bench?.locked ? `<div class="promo"><span>비슷한 매장들과 비교한 순위·경고등·처방은 <b>프로</b>에서 보여요.</span><button class="btn sm gold" data-act="goto" data-t="improve">둘러보기</button></div>` : ''}</div>`;
}
function fixedCard() {
  const F = fixedFor(S.y, S.m), fx = F.fx, sum = FIXED.reduce((a, [k]) => a + (+fx[k] || 0), 0);
  return `<div class="card"><div class="row between"><h3 style="margin:0">${S.m}월 고정비 <small>₩${E.won(sum)} · 하루 ₩${E.won(sum / E.daysIn(S.y, S.m))}</small></h3><span class="row">${isOwner() ? `<button class="btn sm" data-act="fixed">${S.m}월 수정</button>` : ''}<button class="btn sm" data-act="fixed-year">연간 보기</button></span></div>
    ${!F.own && F.from ? `<p class="note" style="margin:6px 0 0">${+F.from.slice(5, 7)}월 금액을 그대로 쓰고 있어요. 이 달만 다르면 수정하세요.</p>` : ''}
    <div class="fxg">${FIXED.map(([k, n]) => `<div><small>${n}</small><b class="num">${+fx[k] ? '₩' + man(+fx[k]) : '-'}</b></div>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn sm" data-act="exp-new">+ ${S.m}월 고지서·기타 비용</button><button class="btn sm" data-act="exp-list">${S.m}월 비용 내역 ${S.expenses.length}건</button></div></div>`;
}
function fixedYearSheet(y) {
  const months = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, F: fixedFor(y, i + 1) }));
  openSheet(`<div class="row between"><h2 style="margin:0">${y}년 고정비</h2><span class="row"><button class="btn sm" data-act="fixed-year" data-v="${y - 1}">◀</button><button class="btn sm" data-act="fixed-year" data-v="${y + 1}">▶</button></span></div>
    <div class="tbl" style="margin-top:10px"><table style="font-size:12.5px"><thead><tr><th>월</th>${FIXED.map(([, n]) => `<th class="r">${n}</th>`).join('')}<th class="r">합계</th><th></th></tr></thead><tbody>
    ${months.map(({ m, F }) => { const s = FIXED.reduce((a, [k]) => a + (+F.fx[k] || 0), 0); return `<tr class="${F.own ? '' : 'mut'}"><td><b>${m}월</b></td>${FIXED.map(([k]) => `<td class="r num">${+F.fx[k] ? man(+F.fx[k]) : '-'}</td>`).join('')}<td class="r num"><b>${s ? man(s) : '-'}</b></td><td>${isOwner() ? `<button class="btn sm" data-act="fixed" data-y="${y}" data-m="${m}">수정</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="note">흐린 줄은 앞 달 금액을 그대로 이어 쓰는 달이에요. 다음 달 월세가 바뀌면 미리 수정해 두세요.</p>`);
}
// 홈 맨 위 3칸: 오늘 현황 / 이번 달 예상 순이익 / 지금 가장 큰 문제
function topStrip(M) {
  const [y, m, d] = TODAY.split('-').map(Number), r0 = S.reports.find(r => r.report_date === TODAY), staffN = S.members.filter(p => p.role !== 'owner' && E.shiftOn(p.id, y, m, d, S.tpl, S.ov)).length, need = needOn(TODAY, S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2]);
  const today = r0 ? [`₩${man(r0.sales)}`, `마감 완료 · 엔트리 ${r0.entries || 0}`, 'up'] : S.open ? [`${staffN}명 근무`, `${fmtDT(S.open.opened_at).split(' ').slice(-2).join(' ')} 오픈 · 적정 ${need}명`, staffN < need ? 'down' : ''] : [`${staffN}명 근무 예정`, `아직 오픈 전 · 적정 ${need}명`, staffN < need ? 'down' : ''];
  const B = S.bench, L = B?.ready && !B.locked ? lightsOf(B).filter(x => x.lv === 'r' || x.lv === 'y').sort((a, b) => (a.lv === 'r' ? 0 : 1) - (b.lv === 'r' ? 0 : 1)) : [], rx = L.length ? [...rxOf(B).rev, ...rxOf(B).cost].find(r => r[0] === LIGHT_RX[L[0].key]) : null;
  const goal = goalOf(S.y, S.m), gap = goal ? M.proj - goal : 0, D = E.daysIn(y, m), short = Array.from({ length: D - d + 1 }, (_, i) => E.ymd(y, m, d + i)).filter(k => S.members.filter(p => p.role !== 'owner' && E.shiftOn(p.id, y, m, +k.slice(8), S.tpl, S.ov)).length < needOn(k, S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2])).length;
  const prob = L.length ? [L[0].n, rx ? `고치면 월 ${rx[0].startsWith('rev') ? '+' : '−'}₩${man(rx[3])}` : '평균보다 나빠요', 'down', 'improve'] : goal && gap < 0 ? [`목표 ₩${man(-gap)} 부족`, '월말 예상 기준', 'down', 'home'] : short ? [`인원 부족 ${short}일`, '이번 달 남은 날 중', 'down', 'sched'] : M.left < 0 ? ['이번 달 적자', '비용이 매출보다 커요', 'down', 'home'] : ['없어요', '지금처럼만 하세요', 'up', null];
  return `<div class="top3"><div class="card kpi"><div class="l">오늘 현황</div><div class="v num ${today[2]}">${today[0]}</div><small class="mut">${today[1]}</small></div>
    <div class="card kpi"><div class="l">이번 달 예상 순이익</div><div class="v num ${M.left >= 0 ? 'up' : 'down'}">${M.n >= 3 ? `${M.left < 0 ? '−' : ''}₩${man(Math.abs(M.left))}` : '<small class="mut" style="font-size:13px">마감 3일부터</small>'}</div><small class="mut">매출 ₩${man(M.proj)} − 비용 ₩${man(M.cost)}</small></div>
    <button class="card kpi ${prob[3] ? 'go' : ''}" ${prob[3] ? `data-tab="${prob[3]}"` : ''}><div class="l">지금 가장 큰 문제</div><div class="v ${prob[2]}" style="font-size:16px">${esc(prob[0])}</div><small class="mut">${esc(prob[1])}${prob[3] ? ' ›' : ''}</small></button></div>`;
}
function vHome() {
  const M = monthSummary(S.y, S.m), [y, m, d] = TODAY.split('-').map(Number), cur = S.y === y && S.m === m, hasStaff = S.members.some(p => p.role !== 'owner');
  const months = Array.from({ length: 6 }, (_, i) => { const dt = new Date(S.y, S.m - 6 + i, 1); return [dt.getFullYear(), dt.getMonth() + 1]; }).map(([yy, mm]) => ({ yy, mm, s: monthSummary(yy, mm) })).filter(x => x.s.n);
  const mx = Math.max(1, ...months.map(x => Math.abs(x.s.left)));
  const nt = S.noticeTop, seen = (() => { try { return localStorage.getItem('ev-notice') } catch { return null } })(), newN = nt && nt.id !== seen && Date.now() - new Date(nt.created_at) < 14 * 864e5;
  // 주 컬럼: 오늘·이번 달 판단에 필요한 것 / 보조 컬럼: 참고 정보 (모바일에선 같은 순서로 세로)
  return `<div class="home"><div class="hhead">${storeHead('브리핑')}${newN ? `<button class="card nbanner" data-act="sub" data-v="notice"><span class="ntag">공지</span><div><small>운영사에서 새 소식이 왔어요</small><b>${esc(nt.title)}</b></div><span class="mut">›</span></button>` : ''}</div>
  <div class="hmain">
  ${cur ? topStrip(M) : ''}
  ${(() => { const g = goalOf(S.y, S.m), T = cur && g ? todayTodo(M, g) : []; return T.length ? `<button class="card nowline" ${T[0][3] ? `data-act="goto" data-t="${T[0][3] === 'order' ? 'more' : T[0][3]}" ${T[0][3] === 'order' ? 'data-s="order"' : ''}` : ''}><small>지금 할 일</small><b>${T[0][1]}</b><span class="mut">›</span></button>` : ''; })()}
  ${rankBar()}
  <div class="sech"><h2>${S.m}월 손익</h2>${monthNav()}</div>
  ${goalCard(M)}
  <div class="card bill"><h3>${S.m}월 계산서 <small>${cur ? '월말 예상 기준' : '확정'}</small></h3>
    ${cur ? `<div class="lead"><small>오늘까지 남은 돈 (${M.el}일)</small><b class="num ${M.earned >= 0 ? 'up' : 'down'}">${M.earned < 0 ? '−' : ''}₩${man(Math.abs(M.earned))}</b></div>` : ''}
    <div class="li"><b>매출</b><b class="num">₩${E.won(M.proj)}</b></div>
    <div class="li"><span class="mut">− 인건비 (스케줄·4대보험 사업주분·긴급 구인 포함)</span><span class="num">₩${E.won(M.labor)}</span></div>
    ${Object.entries(M.exp).map(([k, v]) => `<div class="li"><span class="mut">− ${CAT[k] || k}</span><span class="num">₩${E.won(v)}</span></div>`).join('')}
    <div class="li sum"><b>= 남는 돈</b><b class="num ${M.left >= 0 ? 'up' : 'down'}">${M.n >= 3 || !cur ? `${M.left < 0 ? '−' : ''}₩${E.won(Math.abs(M.left))}${M.left < 0 ? ' 적자' : ''}` : '<small class="mut" style="font-size:13px">마감 3일부터 보여요</small>'}</b></div>
    <p class="note">${M.bep && M.bep <= E.daysIn(S.y, S.m) ? `손익분기: <b class="up">${S.m}월 ${M.bep}일</b>에 넘어요.` : '이번 달은 손익분기를 못 넘어요.'}</p></div>
  ${lightsCard(false)}
  ${selfCard()}
  </div><div class="hside">
  ${months.length ? `<div class="card"><h3>월별 손익 <small>매출 − 비용 = 남은 돈</small></h3><div class="pnl">${months.map(x => `<div class="pr"><span class="mut">${x.mm}월</span><span class="num">₩${man(x.s.proj)}</span><span class="num mut">−₩${man(x.s.cost)}</span><span class="pb"><i class="${x.s.left >= 0 ? 'g' : 'r'}" style="width:${Math.max(3, Math.abs(x.s.left) / mx * 100)}%"></i></span><b class="num ${x.s.left >= 0 ? 'up' : 'down'}">${x.s.left < 0 ? '−' : '+'}₩${man(Math.abs(x.s.left))}</b></div>`).join('')}</div>${months.at(-1).yy === y && months.at(-1).mm === m ? '<p class="note">이번 달은 월말 예상이에요.</p>' : ''}</div>` : ''}
  ${fixedCard()}
  ${hasStaff ? `<div class="card"><div class="row between"><h3 style="margin:0">오늘 근무표 <small>${m}월 ${d}일 (${E.WD[E.wdOf(y, m, d)]})</small></h3><button class="btn sm" data-act="day-open" data-d="${TODAY}">스케줄 →</button></div>${dayTimeline(TODAY, true)}</div>` : ''}
  ${hasStaff ? '' : `<div class="card"><h3>처음 할 일</h3><div class="li"><div><b>① 직원 등록</b><small>시급·계약·계좌까지</small></div><button class="btn sm pri" data-tab="staff">하러 가기</button></div><div class="li"><div><b>② 스케줄 짜기</b><small>요일 기본 + 날짜별 수정</small></div><button class="btn sm" data-tab="sched">하러 가기</button></div><div class="li"><div><b>③ 매일 매출 보고</b></div><button class="btn sm" data-tab="sales">하러 가기</button></div></div>`}
  ${S.joins.length ? `<div class="card" style="border-color:rgba(245,158,11,.5)"><h3>소속 신청 ${S.joins.length}건 <button class="btn sm pri" data-tab="staff">확인</button></h3></div>` : ''}
  ${S.notis.length ? `<div class="card"><h3>알림</h3>${S.notis.slice(0, 5).map(x => `<div class="li"><span>${esc(x.body)}</span><small>${fmtDT(x.created_at)}</small></div>`).join('')}</div>` : ''}
  </div></div>`;
}
// ===== 매장 개선 (프로) — 순위·경고등·처방·꼭 할 일 =====
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
function rankBar() {
  const B = S.bench; if (!B) return '';
  if (!B.ready) return `<div class="card rankbar"><div><b>우리 매장 순위</b><small class="mut" style="display:block">${B.why === 'mine' ? '매출 보고가 7일 쌓이면 비슷한 매장과 비교해 드려요' : '비교할 매장이 3곳 이상 모이면 보여요'}</small></div></div>`;
  if (B.locked) return `<div class="card tease"><div class="row between"><span class="pill y">주변 매장 ${B.n}곳과 비교</span><small class="mut">${+B.month.slice(5, 7)}월 기준 · 계산 끝</small></div>
    <div class="tz"><div><small>매출 순위</small><b class="num mosaic">상위 23%</b></div><div><small>순이익 순위</small><b class="num mosaic">상위 41%</b></div><div><small>주변보다 새는 돈</small><b class="num mosaic down">월 ₩87만</b></div></div>
    <p class="tzm">우리 매장이 주변보다 <b>어디서 돈이 새는지</b> 이미 계산해 뒀어요. 열어보기만 하면 돼요.</p>
    ${isOwner() ? `<button class="btn gold full" data-act="plan" data-v="pro">프로로 업그레이드하고 바로 보기 · 매장당 월 ₩${E.won(PRICE.pro)}</button>` : '<button class="btn sm" data-act="ask-pro">대표님께 요청</button>'}</div>`;
  return `<div class="card rankbar"><div><b>우리 매장 순위</b><small class="mut" style="display:block">비슷한 매장 ${B.n}곳 중 · ${+B.month.slice(5, 7)}월</small></div>
    <div class="rkv"><small>매출</small><b class="num">상위 ${B.s_pct}%</b></div><div class="rkv"><small>순이익</small><b class="num">상위 ${B.h_pct}%</b></div>
    <button class="btn sm" data-tab="improve">매장 개선 →</button></div>`;
}
const LIGHT_RX = { util: 'rev_util', elec: 'cost_elec', lr: 'cost_lr', sr: 'cost_sr', gr: 'cost_gr', npy: 'cost_net' };
// full=false(홈): 내 숫자·얼마 아낄 수 있는지만. 평균과 고치는 법은 매장 개선(프로)에서
function lightsCard(full) {
  const B = S.bench; if (!B?.ready || B.locked) return '';
  const L = lightsOf(B), rx = rxOf(B), all = [...rx.rev, ...rx.cost], bad = L.filter(x => x.lv && x.lv !== 'g'), gain = all.reduce((a, r) => a + r[3], 0);
  const val = (v, u) => u === '원' ? '₩' + E.won(v) : v.toFixed(1) + '%', fix = x => all.find(r => r[0] === LIGHT_RX[x.key]);
  const sorted = [...L].sort((a, b) => ({ r: 0, y: 1, g: 2 }[a.lv] ?? 3) - ({ r: 0, y: 1, g: 2 }[b.lv] ?? 3));
  const row = x => { const r = fix(x); if (x.na) return `<div class="lt na"><span class="dot">⚪</span><div><b>${x.n}</b><small>${x.key === 'util' ? '마감에 엔트리 수를 넣으면 켜져요' : x.key === 'elec' || x.key === 'npy' ? '고정비에 금액을 넣으면 켜져요' : '데이터가 쌓이면 켜져요'}</small></div></div>`;
    const gap = Math.abs(pctOf(x.mine, x.avg));
    return `<div class="lt ${x.lv}"><span class="dot">${{ r: '🔴', y: '🟡', g: '🟢' }[x.lv]}</span><div><b>${x.n} <span class="num">${val(x.mine, x.unit)}</span></b>
      <small>${full ? `평균 ${val(x.avg, x.unit)} · ${x.lv === 'g' ? `평균보다 ${gap.toFixed(0)}% 좋아요` : `평균보다 ${gap.toFixed(0)}% ${x.key === 'util' ? '낮아요' : '높아요'}`}` : x.lv === 'g' ? `평균 ${val(x.avg, x.unit)} · ${gap.toFixed(0)}% 좋아요` : `평균 ${val(x.avg, x.unit)} · ${gap.toFixed(0)}% ${x.key === 'util' ? '낮아요' : '높아요'}`}</small>
      ${x.lv !== 'g' && r ? `<div class="fix">${full ? `→ <b>${esc(r[1])}</b> ·` : '→ 이걸 고치면'} <b class="up num">월 ${r[0].startsWith('rev') ? `+₩${man(r[3])} 더` : `₩${man(r[3])} 절감`}</b></div>` : ''}</div>${x.lv !== 'g' ? `<span class="pill ${x.lv}">${{ r: '위험', y: '주의' }[x.lv]}</span>` : ''}</div>`; };
  return `<div class="card lights2"><h3>우리 매장 경고등 <small>${bad.length ? `고칠 곳 <b class="down">${bad.length}개</b>` : '모두 좋아요'}</small></h3>
    ${!full && gain ? `<div class="bigwin"><small>경고등을 고치면 매달</small><b class="num">+₩${man(gain)}</b><small>더 남아요</small></div>` : ''}
    <div class="lts">${sorted.map(row).join('')}</div>
    ${!+B.mine.pyeong || !B.mine.tables ? `<p class="note">매장 평수·테이블 수를 넣으면 평당 비교가 정확해져요. <button class="btn sm" data-act="goto" data-t="more" data-s="settings">매장 설정</button></p>` : ''}
    ${!full && gain ? `<button class="btn pri full" data-tab="improve" style="margin-top:10px">무엇을 어떻게 고치는지 보기 →</button>` : ''}</div>`;
}
// 처방 효과 그래프: 지금 그대로(점선) vs 처방 실행(초록) — 벌어지는 만큼 칠함
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
  const B = S.bench, head = storeHead('매장 개선');
  if (!B?.ready) return `${head}${rankBar()}<div class="card empty">${B?.why === 'mine' ? '매출 보고가 7일 이상 쌓이면 비슷한 매장과 비교해서 처방을 드려요.' : '비교할 매장이 모이는 중이에요.'}</div>`;
  if (B.locked) return `${head}<div class="paywall"><div class="blurme" aria-hidden="true">${radar({ s_sales: 70, s_profit: 55, s_labor: 40, s_fixed: 65, s_util: 50 })}<div class="card"><h3>이번 달 처방</h3><div class="li">매출 늘리기 ··· 월 +₩···만</div><div class="li">비용 줄이기 ··· 월 −₩···만</div></div></div>
    <div class="over"><div class="card"><div class="mut" style="font-size:12px">매장 개선 · 프로 요금제(월 ${E.won(PRICE.pro)}원)</div><h2 style="margin:10px 0 4px">내 매장은 비슷한 매장 ${B.n}곳 중<br>상위 몇 %일까요?</h2><div class="num mosaic" style="font-size:30px;font-weight:800;margin:6px 0">상위 ??%</div>
      <p class="mut" style="font-size:14px">비슷한 매장들과 비교해서 <b>무엇을 해야 하는지</b> 알려드려요. 매달 새 처방과 지난달 실행 결과까지요.</p>
      ${isOwner() ? `<button class="btn gold full" data-act="plan" data-v="pro">프로로 업그레이드하고 바로 보기 · 매장당 월 ₩${E.won(PRICE.pro)}</button>` : '<button class="btn full" data-act="ask-pro">대표님께 요청하기</button>'}</div></div></div>${costCheck()}`;
  const m = B.mine, a = B.avg, rx = rxOf(B), revSum = rx.rev.reduce((x, r) => x + r[3], 0), costSum = rx.cost.reduce((x, r) => x + r[3], 0), mon = thisMonth();
  const done = new Set(S.quests.filter(x => x.month === mon).map(x => x.key)), must = [...rx.rev.map(r => [r[0], r[1], r[2], r[3], r[4], 'r']), ...rx.cost.map(r => [r[0], r[1], r[2], r[3], r[4], 'c'])].sort((x, y) => y[3] - x[3]), doneN = must.filter(r => done.has(r[0])).length, doneSum = must.filter(r => done.has(r[0])).reduce((x, r) => x + r[3], 0);
  const hist = Array.from({ length: 4 }, (_, i) => { const dt = new Date(now.getFullYear(), now.getMonth() - 3 + i, 1); return monthSummary(dt.getFullYear(), dt.getMonth() + 1); }).filter(x => x.n);
  const g = hist.length >= 2 ? Math.min(1.1, Math.max(.9, (hist.at(-1).proj / hist[0].proj) ** (1 / (hist.length - 1)))) : 1, cur = hist.at(-1) || monthSummary(S.y, S.m);
  const base = [1, 2, 3].map(i => cur.proj * g ** i), nowL = base.map(v => v - cur.cost), after = base.map((v, i) => v + revSum * (i ? 1 : .5) - (cur.cost - costSum * (i ? 1 : .6)));
  const mn = [1, 2, 3].map(i => (now.getMonth() + i) % 12 + 1);
  const mustRow = r => { const on = done.has(r[0]); return `<button class="must ${on ? 'on' : ''}" data-act="quest" data-k="${r[0]}"><span class="qc">${on ? '✓' : ''}</span><span class="qt"><b>${esc(r[1])}</b><small>${r[5] === 'r' ? '매출 늘리기' : '비용 줄이기'}${on ? ' · 했어요' : ''}</small></span><span class="amt num">월 ${r[5] === 'r' ? '+' : '−'}₩${man(r[3])}</span></button>`; };
  const rxCard = (r, i, t) => `<div class="card rx"><div class="n ${t}">${i + 1}</div><div><b>${esc(r[1])}</b><p>${esc(r[2])}</p>${r[4] ? `<button class="btn sm" data-act="partner" data-v="${esc(r[4])}">${esc(r[4])} 견적 받기</button>` : ''}</div><span class="num ${t === 'r' ? 'up' : ''}" style="white-space:nowrap">월 ${t === 'r' ? '+' : '−'}₩${man(r[3])}</span></div>`;
  const cmpRow = (n, mine, avg, top, good) => `<tr><td>${n}</td><td class="r num ${good ? 'up' : 'down'}">${mine}</td><td class="r num mut">${avg}</td><td class="r num mut">${top}</td></tr>`;
  const wdMax = Math.max(1, ...(m.wd || []), ...(a.wd || [])), weak = (m.wd || []).indexOf(Math.min(...(m.wd || []).filter(v => v > 0)));
  const staff = S.members.filter(p => p.role !== 'owner' && p.hourly_rate && B.rates?.[p.job_role]).map(p => { const r = payOf(p), avg = B.rates[p.job_role], d = p.hourly_rate - avg; return { p, avg, d, h: r.hours, mon: d * r.hours }; }).sort((x, y) => y.mon - x.mon);
  return `${head}${rankBar()}
  ${must.length ? `<div class="card mustcard"><div class="mhead"><div><small>${S.m}월 꼭 해야 할 일 · ${doneN}/${must.length} 완료</small><div class="mbig">다 하면 매달 <b class="num">+₩${man(revSum + costSum)}</b></div></div>${doneN ? `<div class="mdone"><small>지금까지</small><b class="num">+₩${man(doneSum)}</b></div>` : ''}</div>
    <div class="mprog"><i style="width:${doneN / must.length * 100}%"></i></div>
    <div class="musts">${must.map(mustRow).join('')}</div><p class="note">한 일은 눌러서 체크하세요. 효과는 다음 달 실제 숫자로 확인해 드려요. 자세한 방법은 아래에 있어요.</p></div>` : ''}
  ${revSum + costSum ? (() => { const mx = Math.max(1, ...after.map(Math.abs), ...nowL.map(Math.abs)), tot = after.reduce((x, v, k) => x + v - nowL[k], 0);
    return `<div class="card fcast"><div class="row between"><div><small class="mut">처방대로 하면 앞으로 3개월</small><div class="fbig num">+₩${man(tot)} <small>더 남아요</small></div></div><span class="pill g">${mn[0]}~${mn[2]}월 전망</span></div>
    <div class="fmons">${mn.map((x, k) => `<div class="fmon ${k === 2 ? 'hi' : ''}"><div class="fm">${x}월</div>
      <div class="fb"><i class="b0" style="width:${Math.max(4, Math.abs(nowL[k]) / mx * 100)}%"></i></div><small class="mut">그대로 ₩${man(nowL[k])}</small>
      <div class="fb"><i class="b1" style="width:${Math.max(4, Math.abs(after[k]) / mx * 100)}%"></i></div><b class="num up">₩${man(after[k])}</b>
      <span class="fd num">+₩${man(after[k] - nowL[k])}</span></div>`).join('')}</div>
    <p class="note">최근 매출 흐름으로 계산했어요. 첫 달은 효과를 절반만 넣었어요.</p></div>`; })() : '<div class="card"><h3>지금은 고칠 곳이 거의 없어요</h3><p class="mut" style="margin:0">모든 항목이 비슷한 매장 평균보다 좋아요. 지금처럼만 유지하세요.</p></div>'}
  <div class="card"><h3>5가지 점수 <small>100점 만점 · <b style="color:#34D399">초록</b> 내 매장 · <b style="color:#F59E0B">점선</b> 비슷한 매장 중간</small></h3>${radar(B.score)}</div>
  ${lightsCard(true)}
  ${rx.rev.length ? `<h2 class="band">매출 늘리기 <small class="mut">월 +₩${man(revSum)}</small></h2>${rx.rev.map((r, i) => rxCard(r, i, 'r')).join('')}` : ''}
  <div class="card"><h3>비슷한 매장과 비교</h3><div class="tbl"><table style="min-width:0"><thead><tr><th>항목</th><th class="r">내 매장</th><th class="r">평균</th><th class="r">상위 25%</th></tr></thead><tbody>
    ${cmpRow('월 매출', man(m.sales), man(a.sales), man(B.top25.sales), m.sales >= a.sales)}
    ${m.spy ? cmpRow('평당 매출', man(m.spy), man(a.spy), man(B.top25.spy), m.spy >= a.spy) : ''}
    ${m.ept ? cmpRow('테이블당 하루 엔트리', m.ept.toFixed(1), a.ept.toFixed(1), (+B.top25.ept).toFixed(1), m.ept >= a.ept) : ''}
    ${cmpRow('순이익률', m.pm.toFixed(1) + '%', a.pm.toFixed(1) + '%', '-', m.pm >= a.pm)}</tbody></table></div><p class="note">다른 매장 이름이나 개별 숫자는 보여주지 않고 익명 평균만 써요.</p></div>
  ${m.wd && a.wd ? `<div class="card"><h3>요일별 하루 매출 ${weak >= 0 ? `<small>가장 약한 요일 <b class="down">${E.WD[weak]}요일</b></small>` : ''}</h3><div class="bars">${E.WD.map((w, i) => `<div class="bar2"><div><i class="g" style="height:${Math.max(2, (m.wd[i] || 0) / wdMax * 100)}%"></i><i style="height:${Math.max(2, (a.wd[i] || 0) / wdMax * 100)}%"></i></div><small>${w}</small></div>`).join('')}</div><p class="note"><span style="color:var(--green)">■</span> 내 매장 · <span style="color:var(--s2)">■</span> 평균</p></div>` : ''}
  ${rx.cost.length ? `<h2 class="band">비용 줄이기 <small class="mut">월 −₩${man(costSum)}</small></h2>${rx.cost.map((r, i) => rxCard(r, i, 'c')).join('')}` : ''}
  ${costCheck()}
  ${staff.length ? `<div class="card"><h3>직원별 인건비 <small>같은 직책 평균 시급과 비교 · ${S.m}월 스케줄 기준</small></h3><div class="tbl"><table style="min-width:0;font-size:12.5px"><thead><tr><th>직원</th><th class="r">시급</th><th class="r">평균</th><th class="r">근무</th><th class="r">월 차이</th></tr></thead><tbody>
    ${staff.map(x => `<tr><td><b>${esc(x.p.nick)}</b> <small class="mut">${esc(x.p.job_role)}</small></td><td class="r num">${E.won(x.p.hourly_rate)}</td><td class="r num mut">${E.won(x.avg)}</td><td class="r num">${x.h.toFixed(0)}h</td><td class="r num ${x.mon > 0 ? 'down' : 'up'}">${x.mon > 0 ? '+' : ''}₩${E.won(x.mon)}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">빨간색은 평균보다 비싼 사람이에요. 비싸다고 나쁜 건 아니에요 — 경력·실력이 좋으면 금·토 피크 시간에 배치하세요.</p></div>` : ''}`;
}
// ===== 우리 매장 비용 점검 =====
// 설비·계약을 넣으면 항목별로 줄일 방법과 월 절감액을 계산 (숫자는 2025~26년 공개 자료 기준 추정)
// 카드 우대수수료율(2025.2~): 연매출 3억↓ 0.4% · 3~5억 1.0% · 5~10억 1.15% · 10~30억 1.45% (신용). 고효율기기 지원: 1등급 구매가 40%, 대당 최대 160만 원
const CARD_RATE = y => y <= 3e8 ? 0.4 : y <= 5e8 ? 1.0 : y <= 10e8 ? 1.15 : y <= 30e8 ? 1.45 : null;
const EQ = [['ac_n', '에어컨 대수', 'n'], ['ac_inv', '인버터 에어컨인가요?', ['모름', '예', '아니오']], ['ac_age', '에어컨 쓴 지 (년)', 'n'], ['led', '조명', ['모름', '전부 LED', '일부 LED', 'LED 아님']], ['fridge_n', '냉장고·쇼케이스 대수', 'n'], ['kw', '한전 계약전력 (kW) · 고지서에 있어요', 'n'],
  ['net_fee', '인터넷·TV 월 요금', 'w'], ['net_end', '인터넷 약정 끝나는 달', 'm'], ['cctv_n', 'CCTV 대수', 'n'], ['cctv_fee', 'CCTV·보안 월 요금', 'w'], ['pos_fee', '포스·카드단말기 월 요금', 'w'], ['card_rate', '카드 수수료율 (%) · 카드사 명세서', 'r'], ['rent_etc', '정수기·비데 등 렌탈 월 합계', 'w']];
function costTips() {
  const e = S.store.equip || {}, M = monthSummary(S.y, S.m), fx = fixedFor(S.y, S.m).fx, elec = +fx.elec || 0, yr = (M.proj || M.sales) * 12, card = S.hist.filter(r => r.report_date.slice(0, 7) === TODAY.slice(0, 7)).reduce((a, r) => a + (r.card || 0), 0) / Math.max(1, M.n) * 30;
  const T = [], won = v => Math.round(v / 1000) * 1000;
  const cr = CARD_RATE(yr); if (+e.card_rate && cr && +e.card_rate > cr + .05 && card) T.push(['', '카드 수수료 우대율 확인', `연매출 약 ${man(yr)}원이면 신용카드 우대수수료율은 ${cr}%예요. 지금 ${e.card_rate}%면 카드사에 가맹점 등급 재산정을 요청하세요. 여신금융협회 '가맹점 수수료 조회'에서 바로 확인돼요.`, won(card * (+e.card_rate - cr) / 100)]);
  const nc = (+e.net_fee || 0) + (+e.cctv_fee || 0); if (nc > 70000) T.push(['', '인터넷 + CCTV 결합으로 바꾸기', `지금 두 개 합쳐 월 ₩${E.won(nc)}예요. 사업장 인터넷(500M)+CCTV ${+e.cctv_n || 4}대 결합은 보통 월 5~6만 원이에요.`, won(nc - 55000), '인터넷·CCTV 결합']);
  if (e.net_end) { const [y, m] = e.net_end.split('-').map(Number), left = (y - now.getFullYear()) * 12 + m - 1 - now.getMonth(); if (left <= 2) T.push(['', left < 0 ? '인터넷 약정이 이미 끝났어요' : `인터넷 약정이 ${left + 1}개월 뒤 끝나요`, '약정이 끝난 채로 쓰면 할인 없이 비싼 요금이 나가요. 재약정하거나 다른 통신사로 옮기면 요금 할인·사은품을 받을 수 있어요.', won((+e.net_fee || 40000) * .25), '인터넷·통신']); }
  if (+e.cctv_n && +e.cctv_fee / +e.cctv_n > 9000) T.push(['', 'CCTV 대당 요금이 높아요', `대당 월 ₩${E.won(Math.round(e.cctv_fee / e.cctv_n))}이에요. 녹화만 필요하면 구매형(대당 10~20만 원 한 번)이, 경비까지 필요하면 결합 상품이 싸요.`, won(e.cctv_fee - e.cctv_n * 7000), 'CCTV·보안']);
  const acOld = e.ac_inv === '아니오' || +e.ac_age >= 10, acN = +e.ac_n || 0;
  if (acN && acOld && elec) T.push(['', '오래된 에어컨 1등급으로 바꾸기 (지원금 40%)', `인버터 1등급으로 바꾸면 냉방 전기가 30~40% 줄어요. 한전 '소상공인 고효율기기 지원'으로 구매가의 40%, 대당 최대 160만 원을 받아요 (한전 에너지마켓플레이스 신청).`, won(elec * .45 * .35)]);
  if (acN && elec) T.push(['', '에어컨 필터 2주마다 · 26℃', '필터만 청소해도 5~10%, 설정 온도 1℃ 올리면 약 7% 줄어요. 영업 전 2시간은 1대만 켜세요.', won(elec * .45 * .12)]);
  if (e.led === 'LED 아님' || e.led === '일부 LED') T.push(['', '조명 LED로 바꾸기', '형광등·할로겐을 LED로 바꾸면 조명 전기가 절반 이하로 줄어요. 빈 테이블 조명은 타이머로 끄세요.', won(elec * .2 * (e.led === '일부 LED' ? .25 : .5))]);
  if (+e.kw && elec && e.kw * 6160 > elec * .3) T.push(['', '계약전력 낮추기', `기본요금이 kW당 약 6천 원이라 계약전력 ${e.kw}kW면 기본료만 월 약 ₩${E.won(e.kw * 6160)}예요. 최대 사용량보다 크면 한전(123)에 계약전력 변경을 신청하세요.`, won(e.kw * 6160 * .2)]);
  if (+e.pos_fee >= 10000) T.push(['', '카드단말기 무상으로 바꾸기', `단말기·포스에 월 ₩${E.won(e.pos_fee)}을 내고 있어요. 밴(VAN)사를 바꾸면 단말기 무상 설치·월 관리비 0원도 많아요.`, won(+e.pos_fee * .8), '포스·단말기']);
  if (+e.rent_etc > 30000) T.push(['', '렌탈 기기 점검', '약정이 끝난 정수기·비데는 계속 렌탈료가 나가는 경우가 많아요. 끝났으면 해지하거나 구매 전환하세요.', won(+e.rent_etc * .4)]);
  return T.sort((a, b) => b[3] - a[3]);
}
function costCheck() {
  const e = S.store.equip || {}, filled = EQ.filter(([k]) => e[k] !== undefined && e[k] !== '' && e[k] !== '모름').length, T = costTips(), sum = T.reduce((a, t) => a + t[3], 0);
  return `<div class="card ccheck"><div class="row between"><h3 style="margin:0">우리 매장 비용 점검</h3><span class="pill ${filled >= 8 ? 'g' : 'y'}">${filled}/${EQ.length} 입력</span></div>
    ${T.length ? `<div class="csum"><small class="mut">찾은 절감 방법 ${T.length}개 · 다 하면</small><b class="num up">매달 −₩${man(sum)}</b></div>${T.map(([ic, t, d, v, pt]) => `<div class="ctip"><span class="ci">${ic}</span><div><b>${esc(t)}</b><p>${esc(d)}</p>${pt ? `<button class="btn sm" data-act="partner" data-v="${esc(pt)} 견적">${esc(pt)} 견적 받기</button>` : ''}</div><span class="num up">월 −₩${man(v)}</span></div>`).join('')}`
      : `<div class="promo" style="margin:10px 0"><span><b>한 번만 입력해 주세요.</b> 그러면 우리 매장에 맞게 더 자세하게 진단하고, 항목별로 얼마나 줄일 수 있는지 알려 드릴게요. 고지서 보면서 5분이면 돼요.</span></div>`}
    <details class="more" ${filled ? '' : 'open'}><summary>${filled ? '설비·계약 고치기' : '설비·계약 한 번만 입력하기'}</summary>
    <form class="f" id="equip-form"><div class="grid2">${EQ.map(([k, l, t]) => Array.isArray(t) ? `<label class="fl">${l}<select name="${k}">${t.map(o => `<option ${e[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`
      : `<label class="fl">${l}<input name="${k}" ${t === 'm' ? 'type="month"' : t === 'r' ? 'type="number" step="0.01" min="0" max="5" inputmode="decimal"' : t === 'w' ? `type="number" inputmode="numeric" data-money="1"` : 'type="number" min="0" inputmode="numeric"'} value="${esc(e[k] ?? '')}"></label>`).join('')}</div>
    ${isOwner() ? '<button class="btn pri full">저장하고 점검하기</button>' : '<p class="note">설비 정보는 대표님이 넣어요.</p>'}</form></details>
    <p class="note">카드 우대수수료율은 금융위원회 2025년 2월 기준, 지원금은 2026년 한전 고효율기기 지원사업 기준이에요. 절감액은 추정치예요.</p></div>`;
}
// ===== 테이블 로테이션 =====
const MIN = 60000, mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${E.pad(s % 60)}`; };
function defaultLayout(n) { n = Math.max(1, Math.min(24, +n || 6)); const L = []; for (let i = 0; i < n; i++) L.push({ id: 'T' + (i + 1), x: (i % 4) * 2, y: Math.floor(i / 4), w: 2 }); L.push({ id: 'C', x: 6, y: Math.ceil(n / 4), w: 2, counter: true }, { id: 'DOOR', x: 0, y: Math.ceil(n / 4), w: 1, fx: 'door' }, { id: 'WC', x: 5, y: Math.ceil(n / 4), w: 1, fx: 'wc' }); return L; }
const FX = { counter: '카운터', door: '입구', wc: '화장실', bar: '바', smoke: '흡연실', lounge: '대기석' };
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
    if (it.counter || it.fx) return `<div class="counter fx-${it.fx || 'counter'} ${sel}" ${edit ? `data-act="item" data-v="${it.id}"` : ''} style="${pos}">${(([ic, ...t]) => `<span>${ic}</span><small>${t.join(' ')}</small>`)(FX[it.fx || 'counter'].split(' '))}</div>`;
    const v = R.t[it.id]; return `<div class="ftable ${v ? '' : 'off'} ${sel}" data-act="${edit ? 'item' : 'drop'}" data-v="${it.id}" style="${pos}"><span class="t">${it.id}</span>${v && !edit ? chip(v.m, v.since, R.deal) : ''}</div>`; }).join('');
  const dueN = Object.values(R.t).filter(v => nowT - v.since >= R.deal * MIN).length;
  return `${storeHead('테이블 로테이션')}
  <div class="grid2"><div class="card kpi"><div class="l">딜링 중</div><div class="v num">${Object.keys(R.t).length}명</div></div><div class="card kpi"><div class="l">휴식 중</div><div class="v num">${R.brk.length}명</div></div>
    <div class="card kpi"><div class="l">교대할 사람</div><div class="v num ${dueN ? 'down' : 'up'}">${dueN}명</div></div>
    <div class="card"><div class="l mut" style="font-size:12px">교대 시간 (분)</div><div class="row" style="margin-top:6px;flex-wrap:nowrap"><label class="fl" style="flex:1">딜링<input type="number" min="5" step="5" value="${R.deal}" data-rot="deal"></label><label class="fl" style="flex:1">휴식<input type="number" min="0" step="5" value="${R.rest}" data-rot="rest"></label></div></div></div>
  <div class="card"><h3>매장 테이블 <span class="row">${edit ? '<button class="btn sm" data-act="lay-add">+ 테이블</button>' + Object.entries(FX).filter(([k]) => k !== 'counter').map(([k, t]) => `<button class="btn sm" data-act="lay-add" data-v="${k}">+ ${t}</button>`).join('') + '<button class="btn sm red" data-act="lay-del">선택 삭제</button><button class="btn sm pri" data-act="lay-save">배치 저장</button>' : `${dueN ? '<button class="btn sm gold" data-act="rot-auto">⟳ 자동 교대</button>' : ''}<button class="btn sm" data-act="lay-edit">배치 편집</button>`}</span></h3>
    <p class="note" style="margin-top:0">${edit ? '테이블·입구·화장실 같은 칸을 누른 뒤 옮길 빈칸을 누르세요.' : `딜러를 누르고 테이블을 누르면 앉아요 (끌어다 놓아도 돼요). <b class="down">빨간 테두리</b>는 ${R.deal}분이 지나 교대할 사람이에요.`}</p>
    <div class="floor-wrap"><div class="floor" style="grid-template-rows:repeat(${rows + (edit ? 1 : 0)},64px)">${cells}${items}</div></div>
    ${edit ? '' : `<div class="zone" data-act="drop" data-v="BREAK"><b>휴식 · 대기 (${R.rest}분)</b><div>${R.brk.map(b => chip(b.m, b.since, R.rest)).join('') || '<small class="mut">여기로 옮기면 휴식 시간이 재져요</small>'}</div></div>
    <div class="zone" data-act="drop" data-v="OFF"><b>출근 전·대기 명단</b> <small class="mut">오늘 스케줄 있는 사람 먼저</small><div>${pool.map(p => `<button class="dchip ${S.pick === p.id ? 'picked' : ''} ${today.includes(p) ? '' : 'dim'}" draggable="true" data-act="pick" data-m="${p.id}"><span>${esc(p.nick)}</span><small>${esc(p.job_role || '')}</small></button>`).join('') || '<small class="mut">모두 배치됐어요</small>'}</div></div>`}</div>`;
}
function rotTick() { clearInterval(S.rotTimer); S.rotTimer = setInterval(() => { const els = document.querySelectorAll('[data-since]'); if (!els.length) return clearInterval(S.rotTimer); const nowT = Date.now(); els.forEach(el => { const ms = nowT - +el.dataset.since; el.textContent = mmss(ms); el.closest('.dchip')?.classList.toggle('due', ms >= +el.dataset.lim * MIN); }); }, 1000); }

// ===== 재고·발주 =====
let SHOP = [{ id: 1, c: 'drink', n: '캔 콜라 245ml', u: '30캔', p: 21000, sp: 18900 }, { id: 2, c: 'drink', n: '캔 사이다 245ml', u: '30캔', p: 20000, sp: 17900 }, { id: 3, c: 'drink', n: '에너지드링크 250ml', u: '24캔', p: 42000, sp: 37800 }, { id: 4, c: 'drink', n: '생수 500ml', u: '20병', p: 8900, sp: 7900 }, { id: 5, c: 'drink', n: '음료 디스펜서 시럽', u: '5L', p: 38000, sp: 33000 },
  { id: 6, c: 'alc', n: '생맥주 20L 케그', u: '1통', p: 89000, sp: 82000 }, { id: 7, c: 'alc', n: '병맥주 330ml', u: '24병', p: 36000, sp: 32400 },
  { id: 8, c: 'snack', n: '감자칩 대용량', u: '12봉', p: 28000, sp: 24500 }, { id: 9, c: 'snack', n: '믹스너트 1kg', u: '1봉', p: 21000, sp: 18500 }, { id: 10, c: 'snack', n: '팝콘 업소용', u: '10봉', p: 16000, sp: 13900 },
  { id: 11, c: 'supply', n: '플라스틱 카드 12덱', u: '1박스', p: 186000, sp: 149000 }, { id: 12, c: 'supply', n: '세라믹 칩 500pcs', u: '1세트', p: 420000, sp: 339000 }, { id: 13, c: 'supply', n: '딜러 조끼', u: '1벌', p: 39000, sp: 29000 }, { id: 14, c: 'supply', n: '맞춤 테이블 펠트', u: '1장', p: 260000, sp: 210000 }];
const SHOP_CAT = { drink: '음료', snack: '간식', supply: '소모품', alc: '주류' }, BILLS = [50000, 10000, 5000, 1000, 500, 100];
const item = id => SHOP.find(p => p.id === +id);
async function loadProducts() { const r = await q(sb.from('products').select('*').order('sort')); if (r?.length) SHOP = r.map(x => ({ id: x.id, c: x.cat, n: x.name, u: x.unit, p: x.price, sp: x.sale_price, img: x.image_url, body: x.body, active: x.active !== false, sort: x.sort })); }
const SHOP_ICON = { drink: '', alc: '', snack: '', supply: '' }, prodImg = p => p?.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : `<span class="ph">${SHOP_ICON[p?.c] || ''}</span>`;
const restockQty = s => Math.max(1, Math.ceil(s.min * 2 - s.qty));
function stockCard() {
  const rows = SHOP.filter(p => p.active !== false).map(p => ({ p, s: S.stock.find(s => s.item_id === p.id) })), low = rows.filter(x => x.s && x.s.qty < x.s.min);
  const used = rows.filter(x => x.s), unused = rows.filter(x => !x.s);
  const line = ({ p, s }) => { const qty = +(s?.qty ?? 0), min = +(s?.min ?? 2), days = s?.use_per_day ? Math.floor(qty / s.use_per_day) : null, lo = s && qty < min;
    return `<div class="stk ${lo ? 'lo' : ''}"><div class="si">${prodImg(p)}</div><div class="sn"><b>${esc(p.n)}</b><small>${esc(p.u)} · <span class="nw">적정 <button class="lnk" data-act="stk" data-i="${p.id}" data-f="min" data-d="-1">−</button>${min}<button class="lnk" data-act="stk" data-i="${p.id}" data-f="min" data-d="1">+</button></span>${days != null && s ? ` · ${days > 30 ? '충분' : `<span class="${days <= 2 ? 'down' : ''}">${days}일 버팀</span>`}` : ''}</small></div>
      <div class="step"><button data-act="stk" data-i="${p.id}" data-f="qty" data-d="-1" aria-label="하나 빼기">−</button><b class="num">${qty}</b><button data-act="stk" data-i="${p.id}" data-f="qty" data-d="1" aria-label="하나 더하기">+</button></div></div>`; };
  return `<div class="card"><div class="row between"><h3 style="margin:0">재고 <small>− + 로 남은 수량만 맞춰주세요</small></h3>${low.length ? `<button class="btn sm gold" data-act="restock-all">부족 ${low.length}개 발주 담기</button>` : ''}</div>
    <div class="stks">${used.map(line).join('')}</div>
    ${unused.length ? `<details class="more" ${used.length ? '' : 'open'}><summary>관리 안 하는 품목 ${unused.length}개 <small class="mut">+ 누르면 재고 관리가 시작돼요</small></summary><div class="stks">${unused.map(line).join('')}</div></details>` : ''}</div>`;
}
function closeCalc() {
  const f = $('#report-form'); if (!f) return; const v = n => +digits(f.elements[n]?.value) || 0, counted = BILLS.reduce((a, b) => a + b * v('b' + b), 0), cashSales = v('sales') - v('card') - v('transfer'), expected = v('start') + cashSales - v('expense'), diff = counted - expected, any = BILLS.some(b => f.elements['b' + b].value !== '');
  $('#close-out').innerHTML = `<div class="li"><span class="mut">현금 매출 (매출 − 카드 − 이체)</span><span class="num">₩${E.won(cashSales)}</span></div><div class="li"><span class="mut">금고에 있어야 할 돈</span><span class="num">₩${E.won(expected)}</span></div>
    ${any ? `<div class="li"><span class="mut">센 돈</span><span class="num">₩${E.won(counted)}</span></div><div class="li"><b>차액</b><b class="num ${Math.abs(diff) >= 10000 ? 'down' : diff ? 'warn' : 'up'}">${diff ? (diff > 0 ? '+' : '−') + '₩' + E.won(Math.abs(diff)) : '딱 맞아요'}</b></div>${Math.abs(diff) >= 10000 ? '<p class="note down" style="margin:0">1만 원 넘게 차이 나요. 저장하면 대표님께 알림이 가요.</p>' : ''}` : '<p class="note" style="margin:0">금고 현금을 세서 장수를 넣으면 차액을 계산해요.</p>'}`;
  f.dataset.diff = any ? diff : ''; f.dataset.cash = cashSales;
}
// 발주 배송 추적: 접수 → 준비 중 → 배송 중 → 도착, 도착 예정일(오후 3시 전 주문은 다음 날)
const OSTEP = ['접수', '준비 중', '배송 중', '도착'];
function etaText(o) {
  if (o.status === '도착') return `${o.done_at ? fmtDT(o.done_at) : ''} 도착했어요`;
  if (!o.eta) return '운영사가 확인하고 있어요';
  const [y, m, d] = o.eta.split('-').map(Number), n = Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5), lab = `${m}/${d}(${E.WD[E.wdOf(y, m, d)]})`;
  return n <= 0 ? `오늘 도착 예정이에요` : n === 1 ? `내일 ${lab} 도착 예정` : `${lab} 도착 예정`;
}
function orderRow(o) {
  const k = Math.max(0, OSTEP.indexOf(o.status));
  return `<div class="ord"><div class="row between"><b>${o.items.map(i => `${esc(item(i.id)?.n)}×${i.q}`).join(', ')}</b><span class="pill ${k === 3 ? 'g' : 'y'}">${esc(o.status)}</span></div>
    <small class="mut">${fmtDT(o.created_at)} 주문 · ₩${E.won(o.total)}</small>
    <div class="osteps">${OSTEP.map((t, i) => `<div class="${i <= k ? 'on' : ''} ${i === k ? 'cur' : ''}"><i></i><small>${t}</small></div>`).join('')}</div>
    <div class="row between"><b class="eta ${k === 3 ? 'up' : ''}">${etaText(o)}</b>${o.tracking ? `<a class="btn sm" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?query=${encodeURIComponent(`${o.courier || ''} ${o.tracking}`)}">${esc(o.courier || '택배')} 배송 조회</a>` : ''}</div></div>`;
}
function vOrder() {
  const cart = Object.entries(S.cart).filter(([, n]) => n > 0).map(([id, n]) => ({ ...item(id), q: n })), pay = cart.filter(i => i.c !== 'alc'), alc = cart.filter(i => i.c === 'alc'), tot = pay.reduce((a, i) => a + i.sp * i.q, 0);
  const freq = {}; S.orders.forEach(o => o.items.forEach(i => freq[i.id] = (freq[i.id] || 0) + 1)); const fav = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => item(id)).filter(Boolean);
  return `${storeHead('발주')}
  <div class="card"><label class="tog"><span><b>세금계산서 발행</b><small>사업자 번호로 전자세금계산서를 발행해 드려요</small></span><input type="checkbox" id="tax-inv" ${S.taxInv !== false ? 'checked' : ''}></label></div>
  ${fav.length ? `<div class="card"><h3>자주 주문한 상품</h3><div class="row">${fav.map(p => `<button class="btn sm" data-act="cart" data-v="${p.id}">↻ ${esc(p.n)}</button>`).join('')}</div></div>` : ''}
  <div class="card"><h3>상품</h3><div class="seg" style="margin-bottom:10px">${Object.entries(SHOP_CAT).map(([k, l]) => `<button data-act="scat" data-v="${k}" aria-pressed="${(S.shopCat || 'drink') === k}">${l}</button>`).join('')}</div>
    <div class="shop">${SHOP.filter(p => p.active !== false && p.c === (S.shopCat || 'drink')).map(p => `<div class="sitem"><button class="simg" data-act="prod" data-v="${p.id}" aria-label="${esc(p.n)} 자세히">${prodImg(p)}</button><b>${esc(p.n)}</b><small class="mut">${esc(p.u)}</small><div><s class="mut num" style="font-size:12px">₩${E.won(p.p)}</s> <b class="num up">₩${E.won(p.sp)}</b></div><button class="btn sm" data-act="cart" data-v="${p.id}">담기${S.cart[p.id] ? ` (${S.cart[p.id]})` : ''}</button></div>`).join('')}</div>
    ${(S.shopCat || 'drink') === 'alc' ? '<p class="note">주류는 도매업체에 바로 결제해요.</p>' : ''}</div>
  <div class="card"><h3>주문서</h3>${cart.length ? `${pay.map(i => `<div class="li"><span>${esc(i.n)} <span class="row" style="display:inline-flex;gap:4px"><button class="btn sm" data-act="cart" data-v="${i.id}" data-n="-1">−</button><b class="num">${i.q}</b><button class="btn sm" data-act="cart" data-v="${i.id}">+</button></span></span><span class="num">₩${E.won(i.sp * i.q)}</span></div>`).join('')}
    ${tot ? `<div class="li"><b>+EV 주문 합계</b><b class="num">₩${E.won(tot)}</b></div>` : ''}
    ${alc.length ? `<small class="mut">주류 · 도매업체 직접 결제</small>${alc.map(i => `<div class="li"><span>${esc(i.n)} × ${i.q} <button class="btn sm" data-act="cart" data-v="${i.id}" data-n="-1">−</button></span><span class="num">₩${E.won(i.sp * i.q)}</span></div>`).join('')}` : ''}
    <button class="btn pri full" data-act="order" style="margin-top:12px">주문 요청하기</button>` : '<p class="mut" style="margin:0">담은 상품이 없어요.</p>'}</div>
  <div class="card"><h3>주문 기록</h3>${S.orders.map(orderRow).join('') || '<div class="empty">아직 주문이 없어요</div>'}</div>`;
}
// ===== 딜러 교육 · 사장님 강의 =====
const LESSONS = [
  ['그립과 피칭', '카드가 뒤집히지 않는 피칭 자세', ['덱은 왼손 엄지·검지·중지로 감싸 쥐는 "메카닉 그립"으로 잡아요. 덱 윗면이 손님 쪽에서 보이지 않게 기울여요.', '카드는 오른손 엄지로 밀어 테이블 표면 가까이 낮게 미끄러지듯 보내요. 높게 던지면 뒤집혀요.', '딜 방향은 버튼 왼쪽(스몰 블라인드)부터 시계 방향, 한 사람에 한 장씩 두 바퀴예요.', '카드가 뒤집혀 노출되면 바로 멈추고 하우스 룰대로 처리해요. 혼자 판단해서 넘어가지 않아요.', '빠르기보다 정확하게. 한 손 피칭이 익숙해지기 전엔 속도를 올리지 마세요.']],
  ['번 & 딜 순서', '플랍·턴·리버 진행과 카드 노출 방지', ['플랍 전에 맨 위 카드 1장을 버리고(번) 3장을 펼쳐요. 턴·리버 전에도 번 1장 후 1장씩이에요.', '번 카드는 엎은 채로 팟 가까이 따로 모아둬요. 손님이 볼 수 없게요.', '그 라운드 베팅이 모두 끝나기 전엔 다음 카드를 절대 놓지 않아요.', '보드 카드는 한 번에 가지런히 펼치고, 매번 같은 자리에 놓아요.', '미스딜(처음 두 장 중 노출 등) 기준은 매장 하우스 룰을 먼저 확인해 두세요.']],
  ['칩 핸들링', '스택 컷팅과 빠른 팟 계산', ['칩은 5개·10개 단위로 쌓고, 엄지로 같은 높이만큼 잘라 나누는 "스택 컷"을 연습해요.', '손님이 낸 베팅은 앞으로 살짝 펼쳐 금액을 모두가 보게 한 다음 팟에 넣어요.', '콜·레이즈 금액은 소리 내어 확인해요 ("콜 2만 원").', '체인지(칩 바꿔주기)는 받은 칩을 먼저 보여주고, 바꿔줄 칩을 펼쳐 확인시킨 뒤 건네요.', '팟은 라운드가 끝날 때마다 가운데로 모아 정리해요.']],
  ['사이드팟 & 쇼다운', '올인 상황 정리와 분쟁 해결', ['올인이 나오면 가장 적은 올인 금액 × 참가 인원이 메인 팟이에요. 넘는 돈은 사이드 팟으로 따로 놓아요.', '올인이 여러 명이면 작은 금액부터 같은 방법으로 팟을 하나씩 더 만들어요.', '쇼다운은 마지막으로 베팅·레이즈한 사람이 먼저 보여줘요. 없으면 버튼 왼쪽부터예요.', '테이블에 펼쳐 보인 카드만 인정해요 (카드가 말한다). 딜러가 족보를 읽어주되, 판정 다툼은 플로어가 해요.', '팟은 가장 나중에 만든 사이드 팟부터 지급하고, 메인 팟은 마지막에 줘요.']],
  ['테이블 매너 & 플로어 호출', '손님 응대와 문제 상황 대처', ['다툼이 생기면 딜을 멈추고 "플로어!"를 불러요. 판정은 플로어가 해요.', '손님의 카드와 칩은 허락 없이 만지지 않아요.', '"액션은 ○○님입니다"처럼 차례를 분명하게 알려줘요.', '특정 손님 편을 들거나 핸드에 대해 조언하지 않아요.', '교대할 때 다음 딜러에게 버튼 위치와 팟 상황을 짧게 넘겨줘요.']]];
const QUIZ = [['딜링 전에 맨 위 카드 한 장을 버리는 것은?', ['번(Burn)', '머크(Muck)', '킥커', '스트래들']], ['올인한 사람이 가져갈 수 없는 추가 베팅이 모이는 팟은?', ['메인 팟', '사이드 팟', '블라인드', '앤티']], ['플랍 다음에 공개되는 네 번째 공용 카드는?', ['리버', '홀카드', '턴', '번 카드']], ['폴드한 카드를 모아두는 더미는?', ['덱', '스택', '머크', '팟']], ['같은 족보일 때 승부를 가르는 나머지 카드는?', ['킥커', '버튼', '블라인드', '넛']]];
const OWNER_COURSES = [['', '다점포 운영 매뉴얼', '2호점을 낼 때 무너지지 않는 운영 구조', 49000], ['', '매출 상위 10%로 올리는 법', '상위 매장이 하는 요일·시간대 운영', 49000], ['', '인건비 25% 이하로 만들기', '시간대별 딜러 배치와 스케줄 짜는 법', 39000], ['', '단골이 계속 오는 매장', '재방문을 부르는 이벤트·응대 설계', 39000], ['', '세무·노무 기본기', '3.3%·4대보험, 근로계약서에서 자주 틀리는 것', 29000], ['', '좋은 딜러 뽑고 오래 쓰기', '면접 질문부터 이탈 막는 관리까지', 29000]];
const ACADEMY_PRICE = PRICING.academy;
// 강의 썸네일 — 그라데이션 + 큰 아이콘 + 제목 (이미지 파일 없이 그림)
const LESSON_ICON = ['', '', '', '', ''];
function cover(icon, title, hue, sub = '', wide = true) {
  const W = wide ? 320 : 120, H = wide ? 180 : 120, id = 'cv' + hue + (wide ? 'w' : 's');
  return `<svg class="cover" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 75% 18%)"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#${id})"/><circle cx="${W * .82}" cy="${H * .2}" r="${H * .55}" fill="#fff" opacity=".07"/><circle cx="${W * .1}" cy="${H * 1.05}" r="${H * .5}" fill="#000" opacity=".15"/>
    ${wide ? `<text x="20" y="72" font-size="46">${icon}</text><text x="20" y="${H - 44}" font-size="20" font-weight="800" fill="#fff">${esc(title)}</text><text x="20" y="${H - 20}" font-size="12.5" fill="#fff" opacity=".8">${esc(sub)}</text>`
    : `<text x="${W / 2}" y="${H / 2 + 18}" font-size="52" text-anchor="middle">${icon}</text>`}</svg>`;
}
function lessonList(open) {
  const done = new Set((S.lessons || []).map(l => l.lesson));
  return LESSONS.map(([t, d, body], i) => `<details class="lesson" ${S.openLesson === i ? 'open' : ''}><summary><span class="thumb">${cover(LESSON_ICON[i], t, 150 + i * 30, '', false)}<i>${done.has(i + 1) ? '✓' : i + 1}</i></span><span><b>${t}</b><small>${d}</small></span><span class="pill ${done.has(i + 1) ? 'g' : ''}">${open ? (done.has(i + 1) ? '완료' : '열림') : ''}</span></summary>
    ${open ? `<ol>${body.map(x => `<li>${x}</li>`).join('')}</ol>${S.mode === 'staff' ? `<button class="btn sm ${done.has(i + 1) ? '' : 'pri'}" data-act="lesson" data-v="${i + 1}" ${done.has(i + 1) ? 'disabled' : ''}>${done.has(i + 1) ? '들었어요' : '다 읽었어요'}</button>` : ''}` : ''}</details>`).join('');
}
const QKEY = [0, 1, 2, 2, 0], passN = n => Math.ceil(n * .8);
// 문제 형식: mc(객관식, 보기 2~6개) / sa(주관식, 정답 여러 개는 쉼표)
const quizList = () => S.myQuiz?.length ? S.myQuiz.map(x => ({ q: x.q, o: x.o || [], type: x.type || 'mc' })) : QUIZ.map(([q, o]) => ({ q, o, type: 'mc' }));
function quizBlock() {
  const last = S.quizRes, QL = quizList(); if (S.quizOn) return `<form class="card f" id="quiz-form"><h3>최종 시험 <small>${QL.length}문제 · ${passN(QL.length)}개 이상 맞히면 합격</small></h3>${QL.map((x, i) => `<fieldset class="qz"><legend>${i + 1}. ${esc(x.q)}${x.type === 'sa' ? ' <small class="mut">(주관식)</small>' : ''}</legend>${x.type === 'sa' ? `<input name="q${i}" required placeholder="답을 적어주세요" autocomplete="off">` : x.o.map((o, j) => `<label><input type="radio" name="q${i}" value="${j}" required> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}<button class="btn pri full">제출하기</button></form>`;
  return `<div class="card"><h3>최종 시험</h3>${last ? `<p>지난 결과 <b class="${last.passed ? 'up' : 'down'}">${last.score}/${last.total || 5} · ${last.passed ? '합격' : '재시험'}</b></p>` : '<p class="mut">강의 5개를 다 들으면 볼 수 있어요.</p>'}<button class="btn ${last?.passed ? '' : 'pri'} full" data-act="quiz-start" ${(S.lessons || []).length >= 5 ? '' : 'disabled'}>${last ? '다시 보기' : '시험 보기'}</button><p class="note">결과는 대표·점장에게 바로 알림으로 가요.</p></div>`;
}
function vLearn() {
  return `<h1>딜러 교육</h1><p class="sub">${esc(S.store?.name || '')}에서 열어준 강의예요 · ${(S.lessons || []).length}/5 완료</p>
    ${S.academy ? `<div class="card">${lessonList(true)}</div>${quizBlock()}` : '<div class="card empty">매장에서 딜러 교육을 아직 열지 않았어요.</div>'}`;
}
// 최종 시험: 대표·점장이 문제를 보고 우리 매장에 맞게 고칠 수 있음 (정답은 딜러에게 안 보임)
const examItems = () => (S.cquiz?.length ? S.cquiz : QUIZ.map(([q, o], i) => ({ q, o, a: QKEY[i] }))).map(x => ({ type: x.type || 'mc', ...x }));
function examCard() {
  const L = examItems(), mine = !!S.cquiz?.length, show = S.examOpen;
  return `<div class="card"><div class="row between"><h3 style="margin:0">최종 시험 <small>${mine ? '우리 매장 시험' : '+EV 기본 시험'} · ${L.length}문제 · ${passN(L.length)}개 이상 합격</small></h3><button class="btn sm" data-act="exam-view">${show ? '접기' : '문제 보기'}</button></div>
    ${show ? `<ol class="exam">${L.map(x => `<li><b>${esc(x.q)}</b> <small class="mut">${x.type === 'sa' ? '주관식' : `객관식 ${x.o.length}지`}</small><div>${x.type === 'sa' ? `<span class="ok">✓ ${esc(x.a)}</span>` : x.o.map((o, j) => `<span class="${j === x.a ? 'ok' : ''}">${j === x.a ? '✓ ' : ''}${esc(o)}</span>`).join('')}</div></li>`).join('')}</ol>` : ''}
    <div class="row" style="margin-top:10px"><button class="btn sm pri" data-act="exam-edit">우리 매장에 맞게 고치기</button>${mine ? '<button class="btn sm" data-act="exam-reset">기본 시험으로 되돌리기</button>' : ''}</div>
    <p class="note">하우스 룰·우리 매장 칩 단위·블라인드 구조 같은 문제를 넣어보세요. 정답은 대표·점장만 봐요.</p></div>`;
}
function examSheet() {
  const L = S.examDraft || (S.examDraft = examItems().map(x => ({ ...x, o: [...x.o] })));
  openSheet(`<h2 style="margin:0 0 10px">우리 매장 시험 만들기</h2><form class="f" id="cquiz-form">${L.map((x, i) => `<fieldset class="qedit"><legend>${i + 1}번 <select name="t${i}" class="qtype"><option value="mc" ${x.type !== 'sa' ? 'selected' : ''}>객관식</option><option value="sa" ${x.type === 'sa' ? 'selected' : ''}>주관식</option></select> <button type="button" class="btn sm red" data-act="exam-del" data-v="${i}">삭제</button></legend>
    <input name="q${i}" value="${esc(x.q)}" placeholder="문제">
    ${x.type === 'sa' ? `<input name="s${i}" value="${esc(typeof x.a === 'string' ? x.a : '')}" placeholder="정답 (여러 답을 인정하면 쉼표로: 번, burn)">`
    : `<div class="grid2">${x.o.map((o, j) => `<label class="qo"><input type="radio" name="a${i}" value="${j}" ${x.a === j ? 'checked' : ''} title="정답"><input name="o${i}_${j}" value="${esc(o || '')}" placeholder="보기 ${j + 1}"></label>`).join('')}</div>
    <div class="row" style="gap:6px"><small class="mut">보기 ${x.o.length}개</small><button type="button" class="btn sm" data-act="exam-opt" data-v="${i}" data-d="-1" ${x.o.length <= 2 ? 'disabled' : ''}>− 보기 빼기</button><button type="button" class="btn sm" data-act="exam-opt" data-v="${i}" data-d="1" ${x.o.length >= 6 ? 'disabled' : ''}>+ 보기 더하기</button></div>`}</fieldset>`).join('')}
    <button type="button" class="btn full" data-act="exam-add">+ 문제 추가</button><p class="note">객관식은 동그라미를 누른 보기가 정답이고 보기는 2~6개예요. 주관식은 띄어쓰기·대소문자를 무시하고 비교해요. 80% 이상 맞히면 합격이에요.</p><button class="btn pri full">저장하기</button></form>`);
}
const examKeep = () => { const f = $('#cquiz-form'); if (!f) return; const fd = new FormData(f); S.examDraft = S.examDraft.map((x, i) => { const type = fd.get('t' + i) || x.type || 'mc'; return type === 'sa' ? { q: fd.get('q' + i) ?? x.q, type, o: [], a: (fd.get('s' + i) ?? (typeof x.a === 'string' ? x.a : '')) } : { q: fd.get('q' + i) ?? x.q, type, o: x.o.map((o, j) => fd.get(`o${i}_${j}`) ?? o), a: fd.has('a' + i) ? +fd.get('a' + i) : (typeof x.a === 'number' ? x.a : 0) }; }); };
function vEdu() {
  const own = isOwner(), open = !!S.company?.academy_at, n = S.hires ?? 3;
  return `${storeHead('교육')}
  <div class="card hero2"><div class="hero-cover">${cover('', '+EV 딜러 아카데미', 160, '5개 강의 + 최종 시험 · 전 매장 평생')}</div><span class="pill y">신입 딜러 교육 · 매장 패키지</span><h2 style="margin-top:8px">신입 딜러 교육, 선배 딜러 인건비로 하지 마세요</h2>
    <p class="mut" style="margin:0">한 번 결제하면 우리 회사 모든 매장 딜러가 평생 들을 수 있어요. 5개 강의 + 최종 시험, 결과는 대표·점장에게 바로 와요.</p>
    <div class="row" style="margin-top:12px"><span class="mut" style="font-size:13px">1년에 뽑는 신입 딜러</span><button class="btn sm" data-act="hires" data-v="-1">−</button><b class="num" style="min-width:40px;text-align:center">${n}명</b><button class="btn sm" data-act="hires" data-v="1">+</button></div>
    <div class="vs"><div><small class="mut">지금처럼 가르치면 (${n}명)</small><b class="num down">₩${E.won(n * 320000)}</b><small class="mut">1명당 선배 동행 20시간 × 13,000 + 실수 손실 약 6만</small></div><div class="x">VS</div><div class="g"><small class="mut">+EV 딜러 교육 (인원 무제한)</small><b class="num up">₩${E.won(ACADEMY_PRICE)}</b><small class="mut">${n * 320000 > ACADEMY_PRICE ? `${n}명이면 <b class="up">₩${E.won(n * 320000 - ACADEMY_PRICE)}</b> 아껴요` : '1명만 뽑아도 거의 본전이에요'}</small></div></div>
    ${open ? `<div class="pill g" style="margin-top:12px">✓ ${esc(S.company.name)} 전 매장 이용 중</div>` : own ? `<button class="btn gold" data-act="academy-buy" style="margin-top:12px">₩${E.won(ACADEMY_PRICE)} · 바로 열기</button>${payNote()}` : `<button class="btn" data-act="ask-owner" data-v="딜러 교육 구매" style="margin-top:12px">대표님께 구매 요청</button>`}</div>
  <div class="card"><h3>딜러 교육 강의 <small>매장당 한 번 · 평생</small></h3>${lessonList(open)}</div>
  ${examCard()}
  <div class="card"><h3>우리 딜러 학습 현황</h3>${open ? (S.acBoard?.length ? `<div class="tbl"><table style="min-width:0"><thead><tr><th>딜러</th><th class="r">진도</th><th class="r">시험</th><th>결과</th></tr></thead><tbody>${S.acBoard.map(r => `<tr><td><b>${esc(r.nick)}</b></td><td class="r num">${r.done * 20}%</td><td class="r num">${r.score ?? '—'}${r.score != null ? '/5' : ''}</td><td><span class="pill ${r.passed ? 'g' : r.score != null ? 'r' : ''}">${r.passed ? '합격' : r.score != null ? '재시험' : '진행 중'}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="mut" style="margin:0">앱에 가입해 소속된 직원이 들으면 여기에 보여요.</p>') : '<p class="mut" style="margin:0">열면 딜러별 진도와 시험 점수가 여기에 보여요.</p>'}</div>
  ${own ? `<div class="card"><h3>사장님 강의 <small>매장을 키우는 운영 노하우 · 준비 중</small></h3><div class="courses">${OWNER_COURSES.map(([ic, t, d, p], i) => { const on = (S.interest || []).includes(i); return `<div class="course">${cover(ic, t, 20 + i * 55, `₩${E.won(p)} · 준비 중`)}<div class="cb"><small class="mut">${d}</small><button class="btn sm ${on ? '' : 'pri'}" data-act="interest" data-v="${i}">${on ? '✓ 알림 신청됨' : '열리면 알림'}</button></div></div>`; }).join('')}</div><p class="note">강의가 열리면 알림으로 알려드려요. 신청이 많은 강의부터 먼저 만들어요.</p></div>` : ''}`;
}
// 법정 공휴일(대체공휴일 포함) 자동 — 매장이 따로 지정한 날도 함께
const KR_HOL = new Set(['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-03', '2026-06-06', '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
  '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-05', '2027-05-13', '2027-06-06', '2027-08-15', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04', '2027-10-09', '2027-10-11', '2027-12-25', '2027-12-27']);
const isHoliday = k => KR_HOL.has(k) || (S.store.holidays || []).includes(k);
const needOn = (k, need) => { const [y, m, d] = k.split('-').map(Number); return isHoliday(k) ? (need[7] ?? need[6]) : need[E.wdOf(y, m, d)]; };
const addDay = (k, n) => { const [y, m, d] = k.split('-').map(Number), t = new Date(y, m - 1, d + n); return E.ymd(t.getFullYear(), t.getMonth() + 1, t.getDate()); };
// 일간 근무표 — 가로 타임라인. 영업이 자정을 넘으면 다음 날 새벽까지 이어서 그림
function dayTimeline(k, compact) {
  const [y, m, d] = k.split('-').map(Number), staff = S.members.filter(p => p.role !== 'owner');
  const L = staff.map(p => ({ p, t: E.shiftOn(p.id, y, m, d, S.tpl, S.ov) })).filter(x => x.t).map(x => { const a = E.toMin(x.t.s); let b = E.toMin(x.t.e); if (b <= a) b += 1440; return { ...x, a, b }; }).sort((u, v) => u.a - v.a || u.b - v.b);
  const need = needOn(k, S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2]);
  if (!L.length) return `<div class="empty">${compact ? '오늘' : '이날'} 근무자가 없어요${compact ? '' : ` <button class="chip add" data-act="add-d" data-d="${k}">+ 근무 추가</button>`}</div>`;
  const h0 = Math.floor(Math.min(...L.map(x => x.a)) / 60), h1 = Math.ceil(Math.max(...L.map(x => x.b)) / 60), span = Math.max(1, h1 - h0), pct = v => (v - h0 * 60) / (span * 60) * 100;
  const hours = Array.from({ length: span + 1 }, (_, i) => h0 + i), step = compact ? (span > 8 ? 3 : 2) : span > 12 ? 2 : 1;
  const cov = hours.slice(0, -1).map(h => L.filter(x => x.a < (h + 1) * 60 && x.b > h * 60).length);
  return `<div class="tl ${compact ? 'fit' : ''}"><div class="tlh"><span></span><div>${hours.filter((h, i) => i % step === 0).map(h => `<em style="left:${pct(h * 60)}%">${h % 24}</em>`).join('')}</div></div>
    ${L.map(({ p, t, a, b }) => `<div class="tlr"><span class="nm"><b>${esc(p.nick)}</b><small>${esc(p.job_role || '')}</small></span><div class="tlt">${hours.map(h => `<i style="left:${pct(h * 60)}%"></i>`).join('')}<button class="bar ${p.job_role === '딜러' ? '' : 'fl'} ${t.ov ? 'ov' : ''}" data-act="edit-d" data-m="${p.id}" data-d="${k}" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%">${t5(t.s)}–${t5(t.e)}${t.brk ? ` <small>휴${t.brk}</small>` : ''}</button></div></div>`).join('')}
    <div class="tlr cov"><span class="nm"><small>시간별 인원</small></span><div class="tlt">${cov.map((c, i) => `<span class="${c < need ? 'lo' : ''}" style="left:${pct(hours[i] * 60)}%;width:${100 / span}%">${c}</span>`).join('')}</div></div></div>
    ${compact ? '' : `<p class="note">막대를 누르면 고쳐요. 빨간 숫자는 적정 인원(${need}명)보다 적은 시간이에요.</p>`}`;
}
function vSched() {
  const need = S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2], D = E.daysIn(S.y, S.m), lead = E.wdOf(S.y, S.m, 1), staff = S.members.filter(p => p.role !== 'owner');
  if (!staff.length) return `${storeHead('스케줄')}<div class="card empty">먼저 직원을 등록해 주세요 <button class="btn sm pri" data-tab="staff">직원 등록</button></div>`;
  const view = S.schedView || 'month';
  const head = `${storeHead('스케줄')}<div class="row between" style="margin-top:10px">${view === 'day' ? '<span></span>' : monthNav()}<div class="seg">${[['month', '월간'], ['day', '일간'], ['week', '매주 기본']].map(([k, l]) => `<button data-act="sview" data-v="${k}" aria-pressed="${view === k}">${l}</button>`).join('')}</div></div>
  ${isOwner() ? `<div class="row" style="margin-top:8px;justify-content:flex-end"><button class="btn sm" data-act="ai-draft">다음 주 스케줄 AI 초안 만들기</button></div>` : ''}`;
  if (view === 'week') return `${head}<div class="card"><p class="note" style="margin-top:0">매주 반복되는 기본 근무예요. 칸을 눌러 고치세요. 날짜마다 다르면 '월간'에서 그날만 바꾸세요.</p><div class="tbl"><table><thead><tr><th>이름</th>${E.WD.map(w => `<th>${w}</th>`).join('')}</tr></thead><tbody>
    ${staff.map(p => `<tr><td><b>${esc(p.nick)}</b></td>${E.WD.map((_, i) => { const t = S.tpl.find(x => x.member_id === p.id && x.weekday === i); return `<td><button class="chip ${t ? '' : 'add'}" data-act="edit-w" data-m="${p.id}" data-w="${i}">${t ? `${t5(t.start_t)}–${t5(t.end_t)}` : '+'}</button></td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  if (view === 'day') { const k = S.schedDay || TODAY, [y, m, d] = k.split('-').map(Number), hol = isHoliday(k), n = staff.filter(p => E.shiftOn(p.id, y, m, d, S.tpl, S.ov)).length, nd = needOn(k, need);
    return `${head}<div class="card"><div class="row between"><button class="btn sm" data-act="day-go" data-v="-1">◀</button><div style="text-align:center"><b style="font-size:17px" class="${hol || E.wdOf(y, m, d) === 6 ? 'down' : ''}">${m}월 ${d}일 (${E.WD[E.wdOf(y, m, d)]})${hol ? ' · 공휴일' : ''}</b><small class="mut" style="display:block">${n}명 근무 · 적정 ${nd}명 ${n < nd ? `<b class="down">${nd - n}명 부족</b>` : ''}</small></div><button class="btn sm" data-act="day-go" data-v="1">▶</button></div>
      <div class="row" style="justify-content:center;margin:10px 0 4px"><button class="btn sm ${hol ? 'gold' : ''}" data-act="holiday" data-d="${k}">${hol ? '✓ 공휴일' : '공휴일로 지정'}</button><button class="btn sm" data-act="add-d" data-d="${k}">+ 근무 추가</button>${k !== TODAY ? `<button class="btn sm" data-act="day-open" data-d="${TODAY}">오늘</button>` : ''}</div>
      ${dayTimeline(k)}</div>`; }
  let cells = '', short = 0;
  for (let d = 1; d <= D; d++) {
    const k = E.ymd(S.y, S.m, d), list = staff.map(p => ({ p, t: E.shiftOn(p.id, S.y, S.m, d, S.tpl, S.ov) })).filter(x => x.t), nd = needOn(k, need), hol = isHoliday(k);
    if (list.length < nd) short++;
    cells += `<div class="cell ${list.length < nd ? 'short' : ''} ${k === TODAY ? 'today' : ''} ${S.selCell === k ? 'csel' : ''}" data-d="${k}" data-act="cellsel"><div class="ch"><button class="dn ${hol ? 'hol' : ''}" data-act="day-open" data-d="${k}" title="일간 근무표">${d}${hol ? '<small>휴</small>' : ''}</button><span class="pill ${list.length < nd ? 'r' : 'g'}">${list.length}/${nd}</span></div>
      ${list.map(({ p, t }) => `<div role="button" tabindex="0" class="chip ${p.job_role === '딜러' ? '' : 'fl'} ${t.ov ? 'ov' : ''} ${selHas(p.id, k) ? 'sel' : ''}" draggable="true" data-act="chip" data-m="${p.id}" data-d="${k}">${esc(p.nick)}<small>${t5(t.s).slice(0, 2)}-${t5(t.e).slice(0, 2)}</small></div>`).join('')}
      <button class="chip add" data-act="add-d" data-d="${k}">+</button></div>`;
  }
  const SL = S.sels || [], one = SL.length === 1 ? (() => { const x = SL[0], p = S.members.find(q => q.id === x.m), t = p && shiftOf(x.m, x.d), [, mm, dd] = x.d.split('-').map(Number); return t ? `<span><b>${esc(p.nick)} · ${mm}/${dd} ${t5(t.s)}–${t5(t.e)}</b></span><span class="row"><button class="btn sm" data-act="edit-d" data-m="${p.id}" data-d="${x.d}">수정</button><button class="btn sm" data-act="sel-off">휴무</button><button class="btn sm" data-act="unsel">✕</button></span>` : ''; })() : '';
  const selbar = `<div class="clipbar sel ${SL.length || S.clip ? '' : 'idle'}">${S.clip ? `<span><b>${S.clip.items.length}개 복사됨</b> · ${S.selCell ? '' : '붙일 날짜 칸을 누르고 Ctrl+V'}</span><span class="row">${S.selCell ? `<button class="btn sm pri" data-act="paste-here">${+S.selCell.slice(8)}일에 붙이기 (Ctrl+V)</button>` : ''}<button class="btn sm" data-act="clip-end">✕</button></span>`
    : SL.length > 1 ? `<span><b>${SL.length}개 선택</b> · 끌면 한꺼번에 옮겨요</span><span class="row"><button class="btn sm" data-act="sel-off">휴무</button><button class="btn sm" data-act="unsel">✕</button></span>`
    : one || '<span class="mut">누르면 선택 · Shift 누르고 더 누르면 여러 개 · 두 번 누르면 수정 · 끌어서 옮기기 · Ctrl+C/V · Delete 휴무</span>'}</div>`, clip = '';
  return `${head}${clip}<div class="card"><div class="row between" style="margin-bottom:8px"><div class="row needs"><span class="mut" style="font-size:12px">적정 인원</span>${[...E.WD, '공휴일'].map((w, i) => `<label class="row" style="gap:3px;font-size:12px">${w}<input type="number" min="0" max="20" value="${need[i] ?? need[6]}" data-need="${i}" style="width:48px;padding:5px"></label>`).join('')}</div>${short ? `<span class="pill r">인원 부족 ${short}일</span>` : '<span class="pill g">모든 날 충분</span>'}</div>
    ${selbar}<div class="cal">${E.WD.map(w => `<div class="h">${w}</div>`).join('')}${'<div></div>'.repeat(lead)}${cells}</div>
    ${S.selCell ? `<div class="daytl"><div class="row between"><b>${+S.selCell.slice(5, 7)}월 ${+S.selCell.slice(8)}일 (${E.WD[E.wdOf(...S.selCell.split('-').map(Number))]}) 타임라인</b><button class="btn sm" data-act="day-open" data-d="${S.selCell}">크게 보기</button></div>${dayTimeline(S.selCell, true)}</div>` : ''}
    <p class="note">엑셀처럼 써요. 이름을 누르면 선택, Shift(또는 Ctrl)를 누른 채 더 누르면 여러 명·여러 날을 한꺼번에 골라요. 고른 걸 끌면 같이 옮겨지고(Ctrl 누르고 끌면 복사), Ctrl+C → 붙일 날짜 칸 누르기 → Ctrl+V, Delete는 휴무예요. 날짜 숫자를 누르면 그날 타임라인이 나와요.</p></div>`;
}
function shiftSheet({ memberId, date, weekday, add }) {
  const p = S.members.find(x => x.id === memberId), [y, m, d] = date ? date.split('-').map(Number) : [];
  const t = memberId ? (date ? E.shiftOn(memberId, y, m, d, S.tpl, S.ov) : (w => w && { s: w.start_t, e: w.end_t, brk: w.break_min })(S.tpl.find(x => x.member_id === memberId && x.weekday === weekday))) : null;
  const off = date ? S.members.filter(q => q.role !== 'owner' && !E.shiftOn(q.id, y, m, d, S.tpl, S.ov)) : [];
  openSheet(`<h2>${add ? `${m}월 ${d}일 근무 추가` : `${esc(p.nick)} · ${date ? `${m}월 ${d}일 (${E.WD[E.wdOf(y, m, d)]})` : `매주 ${E.WD[weekday]}요일`}`}</h2>
  <form class="f" id="shift-form" data-m="${memberId || ''}" data-d="${date || ''}" data-w="${weekday ?? ''}">
    ${add ? (off.length ? `<label class="fl">누구<select name="member">${off.map(q => `<option value="${q.id}">${esc(q.nick)} (${esc(q.job_role || '')})</option>`).join('')}</select></label>` : '<p class="mut">이날은 모든 직원이 근무해요.</p>') : ''}
    <div class="grid2"><label class="fl">시작<input type="time" name="s" value="${t5(t?.s || '20:00')}" required></label><label class="fl">끝<input type="time" name="e" value="${t5(t?.e || '04:00')}" required></label></div>
    <div class="fl"><span>휴게</span><div class="seg brk">${[[0, '없음'], [30, '30분'], [60, '1시간'], [90, '1시간 30분']].map(([v, l]) => `<label><input type="radio" name="brk" value="${v}" ${(t?.brk ?? 30) === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
    ${date ? `<label class="tog"><span>매주 ${E.WD[E.wdOf(y, m, d)]}요일에도 똑같이</span><input type="checkbox" name="rep"></label>` : ''}
    <button class="btn pri full">저장</button>${!add && t ? `<button class="btn red full" type="button" data-act="shift-off">${date ? '이날 휴무' : '이 요일 근무 없애기'}</button>` : ''}
    <button class="btn full" type="button" data-act="close">취소</button></form>`);
}
const POS = ['토스플레이스', '페이히어', '이지포스', 'OKPOS', '포스뱅크'];
const DMET = [['sales', '매출'], ['entries', '엔트리'], ['card', '카드'], ['cash', '현금'], ['cash_diff', '금고 차액'], ['all', '전체']];
function dailyCal() {
  const met = S.dmet || 'sales', D = E.daysIn(S.y, S.m), lead = E.wdOf(S.y, S.m, 1), by = Object.fromEntries(S.hist.map(r => [r.report_date, r])), rs = S.reports;
  const fmt = (r, k) => r[k] == null ? '-' : k === 'entries' ? r[k] + '명' : k === 'cash_diff' ? (r[k] ? (r[k] > 0 ? '+' : '−') + E.won(Math.abs(r[k])) : '0') : man(r[k]);
  const sum = k => rs.reduce((a, r) => a + (+r[k] || 0), 0), mx = Math.max(1, ...rs.map(r => r.sales));
  let cells = ''; for (let d = 1; d <= D; d++) { const k = E.ymd(S.y, S.m, d), r = by[k];
    cells += `<div class="dcell ${r ? 'has' : ''} ${k === TODAY ? 'today' : ''} ${r && met === 'cash_diff' && r.cash_diff ? (Math.abs(r.cash_diff) >= 10000 ? 'bad' : 'warn') : ''}" ${r ? `data-act="day-rep" data-d="${k}"` : ''}><span class="dn2 ${E.wdOf(S.y, S.m, d) === 6 || isHoliday(k) ? 'down' : ''}">${d}</span>
      ${r ? (met === 'all' ? `<small class="num">${man(r.sales)}</small><small class="mut">${r.entries ?? '-'}명</small>` : `<small class="num">${fmt(r, met)}</small>`) + (met === 'sales' ? `<i style="height:${r.sales / mx * 100}%"></i>` : '') : ''}</div>`; }
  return `<div class="card"><div class="row between"><h3 style="margin:0">${S.m}월 일 매출 <small>${rs.length}일 마감</small></h3>${monthNav()}</div>
    <div class="chips" style="margin:10px 0">${DMET.map(([k, l]) => `<button class="fchip ${met === k ? 'on' : ''}" data-act="dmet" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="dsum">${[['매출', '₩' + man(sum('sales'))], ['엔트리', sum('entries') + '명'], ['카드', '₩' + man(sum('card'))], ['현금', '₩' + man(sum('cash'))], ['하루 평균', '₩' + man(rs.length ? sum('sales') / rs.length : 0)]].map(([l, v]) => `<div><small>${l}</small><b class="num">${v}</b></div>`).join('')}</div>
    <div class="cal dcal">${E.WD.map(w => `<div class="h">${w}</div>`).join('')}${'<div></div>'.repeat(lead)}${cells}</div>
    <p class="note">날짜를 누르면 그날 마감 내용이 나와요.</p></div>`;
}
function vDaily() { return `${storeHead('일 매출')}${dailyCal()}`; }
function vSales() {
  const r0 = S.reports.find(r => r.report_date === TODAY) || {}, ask = S.posAsk;
  return `${storeHead('매출 마감')}
  <div class="card pos"><div><b>포스기 연동</b><small>${ask ? `<span class="warn">${esc(ask)}</span> 연동 신청됨 · 준비되면 알림으로 알려드려요` : '연동하면 매출·카드·현금이 마감 때 자동으로 채워져요. 숫자는 그대로 고칠 수 있어요.'}</small></div>${ask ? '<span class="pill y">준비 중</span>' : '<button class="btn sm pri" data-act="pos">포스기 연동하기</button>'}</div>
  ${S.open ? `<div class="card openbar"><span><b>${fmtDT(S.open.opened_at).split(' ').slice(-2).join(' ')} 오픈</b> · 시작 시재 ₩${E.won(S.open.start_cash)}</span><button class="btn sm" data-act="open-edit">수정</button></div>`
    : `<form class="f card openbar" id="open-form"><div><b>오늘 오픈</b><small class="mut" style="display:block">영업 전 금고에 있는 돈을 넣고 오픈하세요</small></div><div class="row" style="flex-wrap:nowrap"><input name="start_cash" type="number" inputmode="numeric" value="${S.lastStart ?? 300000}" style="width:140px"><button class="btn pri">오픈</button></div></form>`}
  <form class="f card" id="report-form"><div class="row between"><h3 style="margin:0">마감</h3><label class="fl" style="margin:0"><input type="date" name="date" value="${TODAY}" max="${TODAY}" style="width:auto"></label></div>
    <div class="grid2 big"><label class="fl">총매출 (원)<input name="sales" type="number" inputmode="numeric" required value="${r0.sales ?? ''}" placeholder="0"></label><label class="fl">엔트리 수<input name="entries" type="number" inputmode="numeric" value="${r0.entries ?? ''}" placeholder="0"></label></div>
    <details class="more" ${r0.card ? 'open' : ''}><summary>결제수단 · 금고 정산 <small class="mut">금고 차액을 잡아줘요</small></summary>
      <div class="grid2"><label class="fl">카드<input name="card" type="number" inputmode="numeric" value="${r0.card ?? ''}"></label><label class="fl">계좌이체<input name="transfer" type="number" inputmode="numeric" value="${r0.transfer ?? ''}"></label>
      <label class="fl">현금으로 쓴 돈 (소모품 등)<input name="expense" type="number" inputmode="numeric" value="${r0.expense ?? ''}"></label><label class="fl">시작 시재 ${S.open ? '<small class="mut">(오픈 때 넣은 금액)</small>' : ''}<input name="start" type="number" value="${S.open?.start_cash ?? S.lastStart ?? 300000}"></label></div>
      <small class="mut">금고 현금 세기 · 장수만 넣으세요</small><div class="bills">${BILLS.map(b => `<label class="fl">${E.won(b)}원<input name="b${b}" type="number" min="0" inputmode="numeric"></label>`).join('')}</div>
      <div id="close-out"></div></details>
    <label class="fl">메모<input name="memo" value="${esc(r0.memo || '')}" placeholder="특이사항·차액 이유"></label><button class="btn pri full">마감하기</button>
    <p class="note">임대료·전기세 같은 고정비는 <button type="button" class="btn sm" data-tab="home">홈</button>에서 넣어요.</p></form>
  ${stockCard()}
  ${dailyCal()}`;
}
// 직원 정렬: 점장 → 정규(매니저·플로어·딜러 순) → 파트타임 → 대타
const rankOf = p => (p.role === 'owner' ? 0 : p.role === 'manager' ? 1 : 2) * 100 + ({ 정규: 0, 파트타임: 20, 대타: 40 }[p.emp_type || '파트타임'] ?? 20) + ({ 매니저: 0, 플로어: 5, 딜러: 10 }[p.job_role] ?? 15);
const EMP = ['정규', '파트타임', '대타'], tenure = d => { if (!d) return ''; const [y, m] = d.split('-').map(Number), n = (now.getFullYear() - y) * 12 + now.getMonth() + 1 - m; return n >= 12 ? `${Math.floor(n / 12)}년 ${n % 12 ? n % 12 + '개월' : ''}` : `${Math.max(0, n)}개월`; };
function vStaff() {
  const all = S.members.filter(p => p.role !== 'owner'), f = S.empF || '전체', staff = f === '전체' ? all : all.filter(p => (p.emp_type || '파트타임') === f);
  const rows = all.map(p => ({ p, r: payOf(p) })), sum = k => rows.reduce((a, x) => a + x.r[k], 0), cnt = t => all.filter(p => (p.emp_type || '파트타임') === t).length;
  const kv = (k, v) => `<div><small>${k}</small><b>${v || '<span class="mut">-</span>'}</b></div>`;
  return `${storeHead('직원·급여')}
  ${S.joins.length ? `<div class="card" style="border-color:rgba(245,158,11,.5)"><h3>소속 신청 <small>${S.joins.length}건</small></h3>${S.joins.map(j => `<div class="li"><div><b>${esc(j.name)}</b><small>경력 ${j.career_months}개월 · ${esc(j.bio || '')}</small></div><button class="btn sm pri" data-act="join-open" data-r="${j.req_id}">승인</button></div>`).join('')}</div>` : ''}
  <div class="seg sub2" style="margin-top:12px">${[['list', '직원 현황'], ['pay', '급여 대장']].map(([k, l]) => `<button data-act="stab" data-v="${k}" aria-pressed="${(S.staffTab || 'list') === k}">${l}</button>`).join('')}</div>
  ${(S.staffTab || 'list') === 'list' ? `
  <div class="row between" style="margin:12px 0 10px"><div class="chips">${['전체', ...EMP].map(t => `<button class="fchip ${f === t ? 'on' : ''}" data-act="empf" data-v="${t}">${t} <b class="num">${t === '전체' ? all.length : cnt(t)}</b></button>`).join('')}</div><button class="btn pri sm" data-act="staff-new">+ 직원 등록</button></div>
  ${staff.map(p => `<div class="card emp"><div class="row between"><div class="row" style="gap:6px"><b style="font-size:17px">${esc(p.nick)}</b><span class="pill">${esc(p.job_role || '-')}</span><span class="pill et ${{ 정규: 'g', 파트타임: '', 대타: 'y' }[p.emp_type || '파트타임']}">${esc(p.emp_type || '파트타임')}</span>${p.role === 'manager' ? '<span class="pill y">점장</span>' : ''}${p.user_id ? '<span class="pill g">앱 연결</span>' : ''}</div>
      <span class="row">${isOwner() && p.user_id ? `<button class="btn sm" data-act="mgr" data-m="${p.id}" data-v="${p.role !== 'manager'}">${p.role === 'manager' ? '점장 해제' : '점장 권한'}</button>` : ''}${isOwner() || p.role === 'staff' ? `<button class="btn sm" data-act="staff-edit" data-m="${p.id}">수정</button>` : ''}</span></div>
    <div class="kv">${kv('실명', esc(p.real_name || ''))}${kv('연락처', p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : '')}${kv('시급', p.hourly_rate ? `₩${E.won(p.hourly_rate)}` : '')}${kv('계약', p.contract === '4대' ? '4대보험' : '3.3% 프리랜서')}${kv('입사일', p.joined_on ? `${p.joined_on} <small class="mut">(${tenure(p.joined_on)})</small>` : '')}${kv('수당', [p.night_pay ? '야간' : '', (p.labor_law ?? p.contract === '4대') ? '연장·주휴' : ''].filter(Boolean).join(' · ') || '없음')}</div>
    <div class="acct">${p.bank_name ? `<b>${esc(p.bank_name)}</b> <span class="num">${esc(p.bank_acct || '')}</span> <small class="mut">예금주 ${esc(p.bank_holder || '-')}</small>${p.bank_acct ? `<button class="btn sm" data-act="copy" data-v="${esc(p.bank_acct)}">계좌 복사</button>` : ''}` : '<span class="mut">계좌 미등록</span>'}</div></div>`).join('') || `<div class="card empty">${all.length ? '해당하는 직원이 없어요' : '아직 직원이 없어요'}</div>`}
  <div class="card"><h3>매장 가입코드 <small>직원·딜러가 앱에서 이 코드로 소속 신청해요</small></h3><div class="row between"><b class="num" style="font-size:24px;letter-spacing:.12em">${esc(S.store.join_code)}</b><button class="btn sm" data-act="copy" data-v="${esc(S.store.join_code)}">복사</button></div>
    <p class="note">점장 권한은 앱에 가입해 소속된 직원에게만 줄 수 있어요. 점장은 자기 매장의 스케줄·매출·구인을 관리해요.</p></div>` : `
  <div class="row between" style="margin:12px 0 8px">${monthNav()}<span class="row"><button class="btn sm" data-act="pay-copy">이체 목록 복사</button><button class="btn sm pri" data-act="csv">엑셀</button></span></div>
  ${rows.length ? `<div class="card paysum"><div><small>${S.m}월 실지급 합계 <span class="mut">(어제까지)</span></small><b class="num">₩${E.won(sum('net'))}</b></div><div class="ps3"><div><small>지급총액</small><b class="num">₩${man(sum('gross'))}</b></div><div><small>공제</small><b class="num down">−₩${man(sum('ded'))}</b></div><div><small>월말 예상</small><b class="num">₩${man(sum('fullGross'))}</b></div></div></div>
  <p class="legend">${[['기본급', '#10B981'], ['야간', '#6366F1'], ['연장', '#F59E0B'], ['주휴', '#3B82C4'], ['인센티브', '#EC4899']].map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')} <span class="mut">· 이름을 누르면 자세히</span></p>
  ${rows.sort((a, b) => b.r.net - a.r.net).map(({ p, r }) => { const parts = [['기본급', r.base, '#10B981'], ['야간', r.np, '#6366F1'], ['연장', r.otp, '#F59E0B'], ['주휴', r.juhu, '#3B82C4'], ['인센티브', r.inc, '#EC4899']], tot = Math.max(1, r.gross);
    return `<details class="card payrow"><summary><div><b>${esc(p.nick)}</b> <small class="mut">${esc(p.job_role || '')} · ${esc(p.emp_type || '파트타임')} · ${r.days}일 ${r.hours.toFixed(0)}시간</small><div class="pbar">${parts.map(([, v, c]) => v > 0 ? `<i style="width:${v / tot * 100}%;background:${c}"></i>` : '').join('')}</div></div><div class="pr-r"><small>실지급</small><b class="num up">₩${E.won(r.net)}</b></div></summary>
      <div class="pd">${parts.map(([n, v, c]) => `<div class="li"><span><i class="dot" style="background:${c}"></i>${n}</span>${n === '인센티브' ? `<input type="number" step="1000" value="${r.inc}" data-inc="${p.id}" style="width:120px;padding:6px;text-align:right">` : `<span class="num">₩${E.won(v)}</span>`}</div>`).join('')}
        <div class="li"><b>지급총액</b><b class="num">₩${E.won(r.gross)}</b></div><div class="li"><span class="mut">공제 (${p.contract === '4대' ? '4대보험 근로자분' : '3.3%'})</span><span class="num down">−₩${E.won(r.ded)}</span></div><div class="li"><b>실지급</b><b class="num up" style="font-size:18px">₩${E.won(r.net)}</b></div>
        <p class="note" style="margin:6px 0 0">${p.bank_name ? `입금: ${esc(p.bank_name)} ${esc(p.bank_acct || '')} (${esc(p.bank_holder || '')})` : '계좌가 없어요 — 직원 현황에서 넣어주세요'} · 월말까지 스케줄대로면 ₩${E.won(r.fullGross)}</p></div></details>`; }).join('')}
  <details class="more"><summary>계산 방법 보기</summary><p class="note" style="margin:0">어제까지 근무 기준 · 근무시간 = 스케줄 − 휴게 · 야간 = 22~06시 × 시급 × 0.5 · 연장 = 하루 8시간 넘는 시간 × 0.5 · 주휴 = 주 15시간 이상인 주. 연장·주휴는 '연장·주휴 적용' 직원만. 4대보험은 근로자 부담분이고 소득세는 따로 떼요.</p></details>` : '<div class="card empty">직원을 등록하면 급여가 자동으로 계산돼요</div>'}`}`;
}
const BANKS = ['KB국민', '신한', '우리', '하나', 'NH농협', 'IBK기업', '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일', '새마을금고', '우체국', '부산', '대구'];
function staffSheet(id) {
  const p = S.members.find(x => x.id === id) || { contract: '3.3', night_pay: true, job_role: '딜러', hourly_rate: 13000 };
  openSheet(`<h2>${id ? `${esc(p.nick)} 수정` : '직원 등록'}</h2><form class="f" id="staff-form" data-m="${id || ''}">
    <div class="grid2"><label class="fl">닉네임<input name="nick" required value="${esc(p.nick || '')}"></label><label class="fl">실명<input name="real_name" value="${esc(p.real_name || '')}"></label>
    <label class="fl">직책<select name="job_role">${['딜러', '플로어', '매니저'].map(r => `<option ${p.job_role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <label class="fl">계약<select name="contract"><option value="3.3" ${p.contract === '3.3' ? 'selected' : ''}>3.3% (프리랜서)</option><option value="4대" ${p.contract === '4대' ? 'selected' : ''}>4대보험</option></select></label>
    <label class="fl">시급 (원)<input name="rate" type="number" step="100" required value="${p.hourly_rate || ''}"></label><label class="fl">입사일<input name="joined" type="date" value="${p.joined_on || TODAY}"></label>
    <label class="fl">연락처<input name="phone" type="tel" inputmode="numeric" placeholder="010-0000-0000" value="${esc(p.phone || '')}"></label></div>
    <div class="fl"><span>고용 형태</span><div class="seg brk">${EMP.map(t => `<label><input type="radio" name="emp" value="${t}" ${(p.emp_type || '파트타임') === t ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
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
const dueText = at => { const t = new Date(at), ms = t - Date.now(), h = Math.floor(ms / 36e5), mi = Math.floor(ms % 36e5 / 6e4); return `${t.getMonth() + 1}/${t.getDate()}(${E.WD[(t.getDay() + 6) % 7]}) ${E.pad(t.getHours())}:${E.pad(t.getMinutes())} 마감 · ${ms <= 0 ? '마감됨' : h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간 남음` : h ? `${h}시간 ${mi}분 남음` : `${mi}분 남음`}`; };
const PREFER = ['경력자', '토너먼트 경험', '장기 근무 가능', '주말 가능', '인근 거주'], mapUrl = a => `https://map.naver.com/p/search/${encodeURIComponent(a)}`;
function vJobs() {
  const k = S.postKind || 'urgent', urg = k === 'urgent';
  return `${storeHead('구인')}<div class="card"><div class="seg" style="margin-bottom:12px"><button data-act="pkind" data-v="urgent" aria-pressed="${urg}">긴급 (24시간)</button><button data-act="pkind" data-v="hire" aria-pressed="${!urg}">상시 아르바이트</button></div>
  <form class="f" id="post-form">
    <div class="grid2"><label class="fl">직책<select name="role">${(urg ? ['딜러', '플로어'] : ['딜러', '플로어', '매니저', '동업자', '사장(대표)']).map(r => `<option>${r}</option>`).join('')}</select></label><label class="fl">몇 명<input name="heads" type="number" min="1" max="10" value="1"></label></div>
    <label class="fl">제목<input name="title" required value="${urg ? '오늘 밤 딜러 급구' : '주말 고정 딜러 모집'}"></label>
    ${urg ? '' : `<div class="fl"><span>근무 요일</span><div class="days">${E.WD.map((w, i) => `<label><input type="checkbox" name="wd" value="${w}" ${i >= 4 && i <= 5 ? 'checked' : ''}><span>${w}</span></label>`).join('')}</div></div>`}
    <div class="grid2"><label class="fl">시작 시간<input type="time" name="s" value="20:00" required></label><label class="fl">마감 시간<input type="time" name="e" value="04:00" required></label>
      ${urg ? '<label class="fl">일당 (원)<input name="pay" type="number" inputmode="numeric" step="5000" value="130000" required></label>' : `<label class="fl">급여<span class="row" style="gap:6px"><select name="ptype" style="width:auto">${['시급', '일급', '월급', '협의'].map(x => `<option>${x}</option>`).join('')}</select><input name="pamt" type="number" inputmode="numeric" value="15000" placeholder="협의면 비워도 돼요"></span></label>`}
      <label class="fl">택시비 지원 (원)<input name="taxi" type="number" inputmode="numeric" value="0"></label></div>
    ${urg ? '' : '<label class="tog"><span><b>급여 협의 가능</b><small>공고에 "협의 가능"이 같이 나가요</small></span><input type="checkbox" name="nego"></label>'}
    <div class="fl incbox"><span>인센티브</span><div class="seg brk"><label><input type="radio" name="inc_on" value="0" checked><span>없음</span></label><label><input type="radio" name="inc_on" value="1"><span>있음</span></label></div><input name="inc" class="incin" placeholder="예: 토너먼트 1회당 1만 원, 월 개근 5만 원"></div>
    <div class="fl"><span>우대 조건 <small class="mut">(선택)</small></span><div class="days wrap">${PREFER.map(x => `<label><input type="checkbox" name="pf" value="${x}"><span>${x}</span></label>`).join('')}</div><input name="pf_etc" placeholder="직접 입력 (예: 영어 가능)"></div>
    <label class="fl">내용<textarea name="body" rows="3" placeholder="게임 종류, 복장, 분위기"></textarea></label>
    ${urg ? '' : `<label class="fl">게시 기간 <small class="mut">알바몬 즉시등록(14일 8,800원)과 같아요</small><select name="days">${[14, 30].map(d => `<option value="${d}" ${d === 14 ? 'selected' : ''}>${d}일 · ${E.won(E.postBase(d))}원${E.FEES.DISC[d] ? ` (옵션 ${E.FEES.DISC[d] * 100}% 할인)` : ''}</option>`).join('')}</select></label>
    <div class="fl"><span>노출 방식</span><div class="expo">${[['0', '기본', '올린 순서대로'], ['2', '끌올 2회', `하루 ${E.won(E.FEES.JUMP[2])}원`], ['5', '끌올 5회', `하루 ${E.won(E.FEES.JUMP[5])}원`], ['8', '끌올 8회', `하루 ${E.won(E.FEES.JUMP[8])}원`], ['top', '상단 고정', `하루 ${E.won(E.FEES.TOP_DAY)}원 · 끌올 포함`]].map(([v, t, d]) => `<label><input type="radio" name="expo" value="${v}" ${v === '5' ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}</div>
      <small class="mut">끌올은 정해진 간격마다 목록 맨 위로 올라가요. 상단 고정은 기간 내내 끌올 공고보다 항상 위에 있어요.</small></div>`}
    <label class="tog"><span><b>반짝 강조</b><small>${urg ? '3,300원' : '하루 3,300원'} · 공고 옆 표시가 깜빡여요</small></span><input type="checkbox" name="flash"></label>
    ${S.store.address ? `<p class="note">공고에 매장 주소와 네이버 지도가 같이 나가요: ${esc(S.store.address)}</p>` : `<p class="note warn">매장 주소가 없어요. 넣으면 공고에 지도가 같이 나가요. <button type="button" class="btn sm" data-act="goto" data-t="more" data-s="settings">주소 넣기</button></p>`}
    <div id="fee-box"></div>
    ${urg ? '<p class="note">급여는 미리 결제해 두고, 근무가 끝나면 딜러에게 지급돼요. 못 구한 자리는 급여와 매칭 수수료를 돌려드려요.</p>' : ''}${payNote()}
    <button class="btn gold full" id="post-btn">공고 올리기</button></form></div>
  <div class="card"><h3>우리 매장 공고 <small>${S.posts.length}건</small></h3>${S.posts.map(p => `<div class="job ${p.kind === 'urgent' ? 'urgent' : ''}"><div class="row between"><div><span class="pill ${p.status === 'open' ? 'g' : p.status === 'unpaid' ? 'y' : ''}">${{ open: '모집 중', unpaid: '결제 전' }[p.status] || '마감'}</span> <small class="mut">${p.kind === 'urgent' ? '긴급' : '상시'} · ${esc(p.job_role)} · ${fmtDT(p.created_at)} 올림</small><h4>${esc(p.title)}</h4>${p.status === 'open' ? `<small class="${new Date(p.expires_at) - Date.now() < 864e5 ? 'warn' : 'mut'}">${dueText(p.expires_at)}</small>` : ''}</div>
    ${p.status === 'unpaid' ? `<button class="btn sm gold" data-act="paypost" data-p="${p.id}">₩${E.won(p.paid_amount)} 결제</button>` : `<button class="btn sm pri" data-act="manage" data-p="${p.id}" data-k="${p.kind}">관리</button>`}</div><div id="mg-${p.id}"></div></div>`).join('') || '<div class="empty">올린 공고가 없어요</div>'}</div>`;
}
const postVals = f => { const fd = new FormData(f), v = formVals(f); return { ...v, wd: fd.getAll('wd'), pf: [...fd.getAll('pf'), ...(v.pf_etc ? [v.pf_etc.trim()] : [])].filter(Boolean), heads: +v.heads || 1, top: v.expo === 'top', jump: v.expo === 'top' ? 0 : +v.expo || 0 }; };
function feeBox() {
  const f = $('#post-form'), box = $('#fee-box'); if (!f || !box) return; const v = postVals(f), urg = (S.postKind || 'urgent') === 'urgent';
  const L = E.feeLines(urg ? 'urgent' : 'hire', { pay: +v.pay || 0, heads: v.heads, flash: !!v.flash, top: v.top, jump: v.jump, days: +v.days || 14 }), tot = L.reduce((a, x) => a + x[1], 0);
  box.innerHTML = `<div class="receipt"><div class="rh">결제 계산서</div>${L.map(([n, a]) => `<div class="rl"><span>${esc(n)}</span><span class="num ${a <= 0 ? 'up' : ''}">${a === 0 ? '무료' : `${a < 0 ? '−' : ''}₩${E.won(Math.abs(a))}`}</span></div>`).join('')}<div class="rl tot"><b>합계</b><b class="num">₩${E.won(tot)}</b></div>
    ${urg ? `<small class="mut">딜러 급여 ₩${E.won((+v.pay || 0) * v.heads)}는 근무 후 딜러에게 그대로 가요. 매칭 수수료는 사람을 구했을 때만 받아요.</small>` : `<small class="mut">알바몬 기준: 즉시등록 8,800원 · 유료 공고 14일 · 끌올(점프) 하루 27,500~29,700원. +EV는 등록 ${E.won(E.postBase(+v.days || 14))}원에 끌올 하루 ${E.won(E.FEES.JUMP[v.jump] || 0)}원이에요. 올린 뒤에도 관리에서 기간·노출을 늘릴 수 있어요.</small>`}</div>`;
  const b = $('#post-btn'); if (b) b.textContent = `₩${E.won(tot)} 결제하고 공고 올리기`;
}
// 공고 수정 + 연장/옵션 추가 (추가 금액은 서버 post_extra_fee 와 같은 식)
const optFee = (top, jump, flash, d) => Math.round(((top ? E.FEES.TOP_DAY : E.FEES.JUMP[jump] || 0) + (flash ? E.FEES.FLASH_DAY : 0)) * d * (1 - (d >= 30 ? .2 : d >= 15 ? .15 : d >= 7 ? .1 : 0)) / 100) * 100;
const leftDays = p => Math.max(1, Math.ceil((new Date(p.expires_at) - Date.now()) / 864e5));
function extraFee(p, x) { return x.days > 0 ? E.postBase(x.days) + optFee(x.top, x.jump, x.flash, x.days) : optFee(x.top && !p.top, x.jump > p.jump_per_day ? x.jump : 0, x.flash && !p.flash, leftDays(p)); }
function postEdit(p) {
  const hire = p.kind === 'hire';
  return `<form class="f pedit" id="pedit-${p.id}" data-p="${p.id}"><h4 style="margin:12px 0 0">공고 고치기</h4>
    <label class="fl">제목<input name="title" value="${esc(p.title)}" required></label>
    ${hire ? `<div class="grid2"><label class="fl">급여<input name="pay_text" value="${esc(p.pay_text || '')}"></label><label class="fl">근무 시간<input name="work_time" value="${esc(p.work_time || '')}"></label></div>` : ''}
    <label class="fl">인센티브 <small class="mut">(없으면 비워두세요)</small><input name="incentive" value="${esc(p.incentive || '')}"></label>
    <label class="fl">내용<textarea name="body" rows="2">${esc(p.body || '')}</textarea></label>
    <button class="btn full" name="save" value="1">고친 내용 저장 (무료)</button>
    ${hire ? `<h4 style="margin:8px 0 0">⏫ 기간 늘리기 · 노출 올리기</h4>
    <div class="grid2"><label class="fl">기간 추가<select name="days"><option value="0">늘리지 않음</option>${[14, 30].map(d => `<option value="${d}">+${d}일 · ${E.won(E.postBase(d))}원</option>`).join('')}</select></label>
      <label class="fl">노출<select name="expo"><option value="${p.top ? 'top' : p.jump_per_day}">지금 그대로</option>${[['2', '끌올 2회'], ['5', '끌올 5회'], ['8', '끌올 8회'], ['top', '상단 고정']].filter(([v]) => v === 'top' ? !p.top : !p.top && +v > p.jump_per_day).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label></div>
    <label class="tog"><span><b>반짝 강조</b><small>하루 3,300원</small></span><input type="checkbox" name="flash" ${p.flash ? 'checked disabled' : ''}></label>
    <div class="xfee"></div>` : ''}</form>`;
}
function xfeeBox(f) {
  const p = S.posts.find(x => x.id === f.dataset.p), box = f.querySelector('.xfee'); if (!p || !box) return;
  const v = Object.fromEntries(new FormData(f)), x = { days: +v.days || 0, top: v.expo === 'top' || p.top, jump: v.expo === 'top' ? 0 : +v.expo || 0, flash: !!v.flash || p.flash }, fee = extraFee(p, x);
  box.innerHTML = fee > 0 ? `<div class="receipt"><div class="rl"><span>${x.days ? `+${x.days}일 등록` : `남은 ${leftDays(p)}일 동안 노출 올리기`}</span><b class="num">₩${E.won(fee)}</b></div></div><button class="btn gold full" name="extra" value="1">₩${E.won(fee)} 결제하고 적용</button>` : '<p class="note">기간이나 노출을 고르면 추가 금액이 바로 계산돼요.</p>';
}
async function manage(postId, kind) {
  const box = $('#mg-' + postId); if (!box) return; const apps = await q(sb.rpc('post_applicants', { p_post: postId })), slots = kind === 'urgent' ? await q(sb.rpc('post_slots', { p_post: postId })) : [];
  const btn = s => ({ MATCHED: `<button class="btn sm" data-act="slot" data-s="${s.slot_id}" data-v="start">출근 확인</button><button class="btn sm red" data-act="slot" data-s="${s.slot_id}" data-v="noshow">안 왔어요</button>`,
    WORKING: `<button class="btn sm" data-act="slot" data-s="${s.slot_id}" data-v="extra">+1시간 연장</button>`,
    DONE: `<button class="btn sm pri" data-act="slot" data-s="${s.slot_id}" data-v="ok">근무 완료 확인·지급</button><button class="btn sm red" data-act="slot" data-s="${s.slot_id}" data-v="dispute">문제 신고</button>` }[s.status] || '');
  const P = S.posts.find(x => x.id === postId);
  box.innerHTML = `${slots.map(s => `<div class="slot"><span><b class="num">${t5(s.start_t)}–${t5(s.end_t)}</b> · ₩${E.won(s.pay)}${s.extra ? ` <span class="up">+₩${E.won(s.extra)}</span>` : ''}<br><small class="mut">${s.dealer_name ? esc(s.dealer_name) : '아직 채용 전'}</small></span><span class="row"><span class="pill ${SLOT[s.status][0]}">${SLOT[s.status][1]}</span>${btn(s)}</span></div>`).join('')}
  <div style="margin-top:8px;font-size:12px;color:var(--muted)">지원자 ${apps.length}명</div>
  ${apps.map(x => `<div class="slot"><div><b>${esc(x.name)}</b> <small class="mut">경력 ${x.career_months}개월${x.rep ? ` · 근무 ${x.rep.done}건 · 재호출 ${x.rep.recall_pct == null ? '-' : x.rep.recall_pct + '%'} · 노쇼 ${x.rep.noshow}` : ''}</small><div style="font-size:13px">${esc(x.bio)}</div></div>
    ${x.status === 'applied' ? `<button class="btn sm pri" data-act="hire" data-a="${x.app_id}" data-p="${postId}" data-k="${kind}">채용하기</button>` : x.status === 'hired' ? `<span class="row"><button class="btn sm" data-act="contact" data-a="${x.app_id}">연락처</button><button class="btn sm red" data-act="cancel-hire" data-a="${x.app_id}" data-p="${postId}" data-k="${kind}">채용 취소</button></span>` : `<span class="pill">${{ rejected: '불채용', cancelled: '취소', expired: '마감' }[x.status] || x.status}</span>`}</div>`).join('') || '<p class="note">아직 지원자가 없어요. 연락처는 채용하기를 누른 뒤에만 보여요.</p>'}${P ? postEdit(P) : ''}`;
  const ef = $('#pedit-' + postId); if (ef) { enhanceInputs(ef); xfeeBox(ef); }
}
function vMore() {
  const sub = S.sub;
  if (!sub) return vHome();
  const back = '';
  if (sub === 'pnl') {
    const months = Array.from({ length: 6 }, (_, i) => { const dt = new Date(S.y, S.m - 6 + i, 1); return [dt.getFullYear(), dt.getMonth() + 1]; }).map(([yy, mm]) => ({ yy, mm, s: monthSummary(yy, mm) }));
    const keys = [...new Set(months.flatMap(x => Object.keys(x.s.exp)))];
    return `${storeHead('월간 손익')}${back}<div class="card"><div class="tbl"><table><thead><tr><th>항목</th>${months.map(x => `<th class="r">${x.mm}월</th>`).join('')}</tr></thead><tbody>
      <tr><td><b>매출</b></td>${months.map(x => `<td class="r num"><b>${man(x.s.proj)}</b></td>`).join('')}</tr>
      <tr><td class="mut">인건비</td>${months.map(x => `<td class="r num">${man(x.s.labor)}</td>`).join('')}</tr>
      ${keys.map(k => `<tr><td class="mut">${CAT[k] || k}</td>${months.map(x => `<td class="r num">${x.s.exp[k] ? man(x.s.exp[k]) : '-'}</td>`).join('')}</tr>`).join('')}
      <tr><td><b>남는 돈</b></td>${months.map(x => `<td class="r num ${x.s.left >= 0 ? 'up' : 'down'}"><b>${man(x.s.left)}</b></td>`).join('')}</tr>
      <tr><td class="mut">손익분기 날</td>${months.map(x => `<td class="r num mut">${x.s.proj ? (x.s.bep <= E.daysIn(x.yy, x.mm) ? x.s.bep + '일' : '못 넘음') : '-'}</td>`).join('')}</tr></tbody></table></div>
      <p class="note">이번 달은 지금 속도로 계산한 월말 예상이에요.</p></div>`;
  }
  if (sub === 'qr') return `${storeHead('출퇴근 코드')}${back}<div class="card" style="text-align:center"><p class="sub">직원은 앱의 <b>출퇴근</b> 탭에서 이 번호를 넣으면 기록돼요. 30초마다 바뀌어서 사진으로 찍어 보내도 못 써요.</p>
    <div id="qr-code" class="num" style="font-size:56px;font-weight:800;letter-spacing:.18em;color:#6EE7B7">······</div><div class="mut" id="qr-left">불러오는 중</div></div>`;
  if (sub === 'settings') {
    const c = S.company || {}, pro = c.plan === 'pro';
    return `${storeHead('매장 설정')}${back}
    <div class="card"><h3>요금제 <small>14일 무료 체험 후 프로 · 매장당 월 ₩${E.won(PRICE.pro)}</small></h3>
      ${pro && S.active ? `<div class="li"><div><b>프로 이용 중</b><small>${c.paid_until ? new Date(c.paid_until).toLocaleDateString('ko-KR') + '까지 결제돼 있어요' : ''}</small></div>${isOwner() ? `<button class="btn sm" data-act="plan" data-v="pro">30일 연장 결제</button>` : ''}</div>`
      : S.active ? `<div class="li"><div><b>무료 체험 중 · D-${trialLeft(c)}</b><small>${new Date(c.trial_ends).toLocaleDateString('ko-KR')}까지 전부 써 볼 수 있어요. 그 뒤엔 보기만 돼요</small></div>${isOwner() ? `<button class="btn sm gold" data-act="plan" data-v="pro">지금 프로 시작</button>` : '<button class="btn sm" data-act="ask-owner" data-v="프로 요금제">대표님께 요청</button>'}</div>`
      : `<div class="li"><div><b class="warn">체험이 끝났어요</b><small>보기만 돼요. 마감·스케줄·급여 입력은 프로에서 이어서 할 수 있어요</small></div>${isOwner() ? `<button class="btn sm gold" data-act="plan" data-v="pro">프로로 계속 쓰기</button>` : '<button class="btn sm" data-act="ask-owner" data-v="프로 요금제">대표님께 요청</button>'}</div>`}
      <p class="note">프로: 매출·손익 · 직원 · 스케줄 · 급여 · 매장 비교(순위·경고등·처방) · 월간 리포트. 구인·장터·가맹은 요금제와 별개로 건별 결제예요. 카드로 30일씩 결제 (매장 ${S.stores.length}곳 × ₩${E.won(PRICE.pro)}).</p>${payNote()}</div>
    ${pushRow() ? `<div class="card">${pushRow()}</div>` : ''}
    <form class="f card" id="store-form"><h3>매장 정보</h3><label class="fl">매장 이름<input name="name" value="${esc(S.store.name)}" ${isOwner() ? '' : 'disabled'}></label><label class="fl">지역<input name="area" value="${esc(S.store.area || '')}" ${isOwner() ? '' : 'disabled'}></label><label class="fl">주소 <small class="mut">구인 공고에 지도로 나가요</small><input name="address" value="${esc(S.store.address || '')}" placeholder="예: 서울 강남구 테헤란로 8길 21, 3층" ${isOwner() ? '' : 'disabled'}></label>
      <div class="grid2"><label class="fl">평수<input type="number" name="py" min="1" step="0.1" value="${S.store.pyeong ?? ''}" placeholder="예: 32" ${isOwner() ? '' : 'disabled'}></label><label class="fl">테이블 수<input type="number" name="tables" min="1" value="${S.store.tables ?? ''}" placeholder="예: 7" ${isOwner() ? '' : 'disabled'}></label></div>
      <div class="grid2"><label class="fl">야간 시작<input type="time" name="ns" value="${t5(S.store.night_start)}" ${isOwner() ? '' : 'disabled'}></label><label class="fl">야간 끝<input type="time" name="ne" value="${t5(S.store.night_end)}" ${isOwner() ? '' : 'disabled'}></label></div>
      ${isOwner() ? '<button class="btn pri full">저장</button>' : '<p class="note">매장 정보는 대표님만 바꿀 수 있어요.</p>'}</form>
    ${isOwner() ? `<form class="f card" id="addstore-form"><h3>매장 추가</h3><div class="grid2"><label class="fl">매장 이름<input name="name" required placeholder="예: 홍대 2호점"></label><label class="fl">지역<input name="area"></label></div>
      ${!pro ? '<div class="promo"><span>체험 중엔 매장을 <b>무료</b>로 추가해요.</span></div><button class="btn pri full">무료로 매장 추가</button>' : `<div class="promo"><span>프로 요금제예요. 새 매장도 <b>월 ₩${E.won(PRICE.pro)}</b>이 바로 결제되고 프로로 시작해요.</span></div><button class="btn gold full">₩${E.won(PRICE.pro)} 결제하고 매장 추가</button>${payNote()}`}</form>
    <div class="card"><h3>사업자 정보</h3><div class="li"><span>사업자등록번호</span><span class="num">${esc((c.biz_no || '').replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3'))}</span></div><div class="li"><span>확인 상태</span><span class="pill ${c.biz_verified ? 'g' : 'y'}">${c.biz_verified ? '✓ 국세청 형식 확인' : '번호가 맞지 않아요 · 문의로 알려주세요'}</span></div></div>` : ''}`;
  }
  if (sub === 'inq') return `${storeHead('운영사 문의')}${back}${inqBlock()}`;
  if (sub === 'rot') return S.rot ? vRot() : `${storeHead('테이블 로테이션')}<div class="boot">불러오는 중…</div>`;
  if (sub === 'order') return vOrder();
  if (sub === 'edu') return vEdu();
  if (sub === 'used') return `${storeHead('중고 장터')}${back}${usedBlock()}`;
  if (sub === 'board') return `${storeHead('전체 구인 공고')}${boardList(true)}`;
  if (sub === 'notice') return `${storeHead('운영사 공지')}${back}${(S.notices || []).map(n => `<div class="card notice"><div class="row between"><b>${esc(n.title)}</b><small class="mut">${fmtDT(n.created_at)}</small></div><div class="nb">${esc(n.body).replace(/\n/g, '<br>')}</div></div>`).join('') || '<div class="card empty">아직 공지가 없어요</div>'}`;
  if (sub === 'franchise') return `${storeHead('가맹 모집')}${back}${frBlock()}`;
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
function siseTag(u) {
  const kw = u.category; if (!kw) return '';
  const ago = Date.now() - 90 * 864e5, ps = S.used.filter(x => x.category === kw && new Date(x.created_at) > ago && x.price > 0).map(x => x.price).sort((a, b) => a - b);
  if (ps.length < 3) return ''; const qt = f => ps[Math.floor((ps.length - 1) * f)], lo = qt(.25), hi = qt(.75), tag = u.price < lo ? ['g', '시세보다 쌈'] : u.price > hi ? ['r', '시세보다 비쌈'] : ['', '시세 안'];
  return `<small class="mut" style="display:block">${kw} 시세 ₩${E.won(lo)}~${E.won(hi)} <span class="pill ${tag[0]}">${tag[1]}</span></small>`;
}
const USED_CAT = ['홀덤 테이블', '칩', '카드', '의자', '조명', 'CCTV', 'POS', '카메라', '인테리어 집기', '음향장비', '기타 매장용품'];
const USED_ICON = { '홀덤 테이블': '', 칩: '', 카드: '', 의자: '', 조명: '', CCTV: '', POS: '', 카메라: '', '인테리어 집기': '', 음향장비: '', '기타 매장용품': '' };
const USED_COND = ['새 상품', '거의 새것', '사용감 적음', '사용감 많음', '수리 필요'], USED_ST = ['판매중', '예약중', '판매완료'];
const BOOST = { get top() { return ['상단 노출', PRICING.used.top, 3, '3일 동안 카테고리 맨 위'] }, get urgent() { return ['급매', PRICING.used.urgent, 7, '7일 맨 위 + 급매 배지 + 강조 테두리'] } };
const usedIcon = u => USED_ICON[u.category] || '', ucover = u => u.images?.[0] || u.image_url;
const boostOn = u => u.boost && new Date(u.boost_until) > now ? u.boost : null;
const usedThumb = u => ucover(u) ? `<img src="${esc(ucover(u))}" alt="" loading="lazy">` : `<span class="ph">${esc(u.category?.slice(0, 2) || '')}</span>`;
function usedBlock() {
  const F = S.uf || { c: '전체', r: '전체', st: '판매중', sort: 'new', min: '', max: '' }, rank = u => ({ urgent: 2, top: 1 }[boostOn(u)] || 0);
  const list = S.used.filter(u => (F.c === '전체' || u.category === F.c) && (F.r === '전체' || (u.area || '').startsWith(F.r)) && (F.st === '전체' || (u.status || '판매중') === F.st) && (!F.min || u.price >= +F.min) && (!F.max || u.price <= +F.max))
    .sort((a, b) => F.sort === 'low' ? a.price - b.price : rank(b) - rank(a) || (b.created_at > a.created_at ? 1 : -1));
  const chip = (k, v, l = v) => `<button class="fchip ${F[k] === v ? 'on' : ''}" data-act="uf" data-k="${k}" data-v="${v}">${l}</button>`;
  const files = S.upFiles || [];
  return `<div class="row between" style="margin:12px 0 8px"><b>중고장터 <small class="mut">등록 무료</small></b><button class="btn pri sm" data-act="used-new">${S.usedNew ? '닫기' : '+ 판매 글 올리기'}</button></div>
  ${S.usedNew ? `<form class="f card" id="used-form">
    <label class="photo-in"><input type="file" name="photos" accept="image/*" multiple hidden><span><b>사진 올리기 (최대 10장)</b><small>필수 · 누른 사진이 대표 사진이 돼요</small></span></label>
    ${files.length ? `<div class="upv">${files.map((f, i) => `<button type="button" class="${(S.upCover || 0) === i ? 'on' : ''}" data-act="upcover" data-v="${i}"><img src="${f.url}" alt="">${(S.upCover || 0) === i ? '<i>대표</i>' : ''}</button>`).join('')}</div>` : ''}
    <div class="grid2"><label class="fl">카테고리<select name="category" required>${USED_CAT.map(c => `<option>${c}</option>`).join('')}</select></label><label class="fl">상품 상태<select name="condition">${USED_COND.map(c => `<option ${c === '사용감 적음' ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
    <label class="fl">제목<input name="title" required placeholder="예: 10인 홀덤 테이블 2대"></label>
    <div class="grid2"><label class="fl">판매 가격 (원)<input name="price" type="number" inputmode="numeric" required></label><label class="fl">수량 <small class="mut">(선택)</small><input name="qty" type="number" min="1" value="1"></label></div>
    <label class="fl">지역<span class="row" style="flex-wrap:nowrap;gap:6px"><select name="sido" style="width:auto">${SIDO.map(x => `<option ${(S.store?.area || '').startsWith(x) ? 'selected' : ''}>${x}</option>`).join('')}</select><input name="area2" required placeholder="구·동 (예: 강남구 역삼동)"></span></label>
    <label class="fl">상세 설명<textarea name="body" rows="3" required placeholder="사용 기간, 하자, 포함 구성품"></textarea></label>
    <label class="fl">연락 방법<input name="contact" required placeholder="010-0000-0000 또는 카카오톡 오픈채팅 링크"></label>
    <details class="more"><summary>선택 입력 (구매 시기·배송·네고)</summary><div class="f" style="margin-top:8px"><label class="fl">구매 시기<input name="bought" placeholder="예: 2025년 3월"></label>
      <div class="days wrap"><label><input type="checkbox" name="ship"><span>배송 가능</span></label><label><input type="checkbox" name="direct" checked><span>직거래 가능</span></label><label><input type="checkbox" name="nego"><span>네고 가능</span></label></div></div></details>
    <button class="btn pri full">무료로 올리기</button></form>` : ''}
  <div class="filters"><div class="chips">${['전체', ...USED_CAT].map(c => chip('c', c, c)).join('')}</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px"><select data-uf="r" style="width:auto"><option ${F.r === '전체' ? 'selected' : ''}>전체</option>${SIDO.map(x => `<option ${F.r === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select data-uf="st" style="width:auto">${['판매중', '예약중', '판매완료', '전체'].map(x => `<option ${F.st === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <input data-uf="min" type="number" placeholder="최소 가격" value="${F.min}" style="width:110px"><input data-uf="max" type="number" placeholder="최대 가격" value="${F.max}" style="width:110px">
      ${chip('sort', 'new', '최신순')}${chip('sort', 'low', '낮은 가격순')}</div></div>
  <div class="ugrid">${list.map(u => { const b = boostOn(u); return `<button class="ucard ${b === 'urgent' ? 'urg' : ''}" data-act="used-open" data-v="${u.id}"><div class="uimg">${usedThumb(u)}${b ? `<span class="pill ${b === 'urgent' ? 'r' : 'y'}">${BOOST[b][0]}</span>` : ''}${u.status && u.status !== '판매중' ? `<span class="ust">${u.status}</span>` : ''}</div><div class="ub"><b>${esc(u.title)}</b><span class="num">₩${E.won(u.price)}</span><small>${esc(u.category || '')} · ${esc((u.area || '').split(' ').slice(0, 2).join(' '))} · ${fmtDT(u.created_at).split(' ').slice(0, 2).join(' ')}</small></div></button>`; }).join('') || '<div class="card empty">조건에 맞는 물건이 없어요</div>'}</div>
  <p class="note">시세는 최근 3개월 올라온 비슷한 물건들의 가격 범위예요. 거래는 판매자와 직접 해요 (+EV는 결제를 대신하지 않아요).</p>`;
}
const contactBtn = c => !c ? '' : /^https?:\/\//.test(c) ? `<a class="btn pri full" href="${esc(c)}" target="_blank" rel="noopener">카카오톡으로 문의</a>` : `<a class="btn pri full" href="tel:${esc(c.replace(/[^\d+]/g, ''))}">${esc(fmtPhone(c))} 전화하기</a>`;
function usedSheet(id) {
  const u = S.used.find(x => x.id === id); if (!u) return; const imgs = u.images?.length ? u.images : u.image_url ? [u.image_url] : [], mine = u.seller === S.user.id, b = boostOn(u);
  openSheet(`<div class="ugal">${imgs.map(x => `<img src="${esc(x)}" alt="">`).join('') || `<div class="ph big"><small>사진 없음</small></div>`}</div>${imgs.length > 1 ? `<small class="mut">← 옆으로 넘기면 ${imgs.length}장</small>` : ''}
    <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${b ? `<span class="pill ${b === 'urgent' ? 'r' : 'y'}">${BOOST[b][0]}</span>` : ''}<span class="pill">${esc(u.status || '판매중')}</span><span class="pill">${usedIcon(u)} ${esc(u.category || '')}</span><span class="pill">${esc(u.condition || '')}</span></div>
    <h2 style="margin:8px 0 4px">${esc(u.title)}</h2><div class="num" style="font-size:24px;font-weight:800">₩${E.won(u.price)} <small class="mut" style="font-size:13px">(${man(u.price)}원)</small></div>${siseTag(u)}
    <p class="mut" style="margin:8px 0">${esc(u.area || '')} · ${fmtDT(u.created_at)} 등록${u.qty > 1 ? ` · ${u.qty}개` : ''}${u.bought ? ` · ${esc(u.bought)} 구매` : ''}</p>
    <div class="row" style="gap:6px;flex-wrap:wrap">${u.ship ? '<span class="pill g">배송 가능</span>' : ''}${u.direct ? '<span class="pill g">직거래</span>' : ''}${u.nego ? '<span class="pill g">네고 가능</span>' : ''}</div>
    ${u.body ? `<p style="white-space:pre-wrap">${esc(u.body)}</p>` : ''}
    ${mine ? `<div class="card" style="background:var(--card2)"><b>내 글 관리</b><div class="seg" style="margin:8px 0">${USED_ST.map(x => `<button data-act="used-st" data-v="${u.id}" data-s="${x}" aria-pressed="${(u.status || '판매중') === x}">${x}</button>`).join('')}</div>
      ${(u.status || '판매중') !== '판매완료' ? `<div class="boosts">${Object.entries(BOOST).map(([k, [n, p, d, t]]) => `<button class="boost ${k}" data-act="used-boost" data-v="${u.id}" data-t="${k}"><b>${n}</b><span class="num">₩${E.won(p)}</span><small>${t}</small></button>`).join('')}</div>${b ? `<small class="up">${BOOST[b][0]} ${new Date(u.boost_until).toLocaleDateString('ko-KR')}까지</small>` : ''}` : '<small class="mut">판매완료라 상단 노출이 끝났어요</small>'}
      <button class="btn red full" style="margin-top:8px" data-act="used-del" data-v="${u.id}">글 지우기</button></div>`
      : `${contactBtn(u.contact) || `<button class="btn pri full" data-act="used-ask" data-v="${u.id}">운영사 통해 연락하기</button>`}<p class="note">거래 전에 물건 상태를 꼭 직접 확인하세요.</p>`}`);
}
// 사진은 긴 변 1280px JPEG로 줄여서 올림 (용량·데이터 절약)
async function shrink(file) {
  const img = await createImageBitmap(file), k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', .82));
}
async function listingsLoad() { S.listings = await q(sb.from('transfer_listings').select('*').order('premium_ad', { ascending: false }).order('created_at', { ascending: false })); render(); }
const payback = l => l.monthly_profit > 0 ? Math.round(l.premium / l.monthly_profit) : null;
// 다른 매물 평균 회수 기간보다 15% 이상 빠르면 '평소보다 싸요'
const avgPayback = () => { const v = (S.listings || []).map(payback).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 12; };
const cheap = l => payback(l) && payback(l) <= Math.min(10, avgPayback() * .85);
const lBadges = l => `${l.premium_ad ? '<span class="pill y">금매물</span>' : ''}${l.verified ? '<span class="pill g">매출 검증</span>' : '<span class="pill">검증 전</span>'}${l.inspected ? '<span class="pill g">실사 검증</span>' : ''}${cheap(l) ? '<span class="pill r">평소보다 싸요</span>' : ''}`;
// 새로 차릴 때 드는 돈(추정) — 인테리어 평당 200만, 테이블·칩·장비 테이블당 250만, 가맹비 1,000만, 오픈 준비 3개월 월세, 초기 홍보 500만
const newCost = l => { const py = +l.pyeong || 40, t = +l.tables || 6; return [['인테리어 (평당 약 200만 원)', py * 2e6], ['테이블·칩·장비 (테이블당 약 250만 원)', t * 25e5], ['가맹비 (프랜차이즈 기준)', 1e7], ['오픈 준비 3개월 월세', (+l.rent || 4e6) * 3], ['초기 홍보·딜러 교육', 5e6], ['자리 잡기까지 약 6개월, 못 버는 순이익 (이 매장 기준 절반)', (+l.monthly_profit || 0) * 3]]; };
const saveOf = l => newCost(l).reduce((a, x) => a + x[1], 0) - l.premium;
function listingSheet(id) {
  const l = (S.listings || []).find(x => x.id === id); if (!l) return; const h = l.sales_hist || [], mx = Math.max(1, ...h);
  const NC = newCost(l), nct = NC.reduce((a, x) => a + x[1], 0);
  openSheet(`<div class="row" style="gap:6px;flex-wrap:wrap">${lBadges(l)}</div><h2 style="margin:8px 0 4px">${esc(l.headline)}</h2><p class="mut" style="margin:0 0 10px">${esc(l.area)} · ${l.pyeong || '-'}평 · 테이블 ${l.tables || '-'}대 · 상호 비공개</p>
    <div class="ps3"><div><small>권리금</small><b class="num">₩${man(l.premium)}</b></div><div><small>월 순이익</small><b class="num up">₩${man(l.monthly_profit || 0)}</b></div><div><small>회수 기간</small><b class="num">${payback(l) ? payback(l) + '개월' : '-'}</b></div></div>
    ${h.length ? `<div style="margin:14px 0 4px"><small class="mut">최근 ${h.length}개월 매출 ${l.verified ? '(+EV 마감 데이터)' : '(매도자 입력)'}</small><div class="bars" style="height:90px">${h.map((v, i) => `<div class="bar"><em class="num">${man(v)}</em><i style="height:${v / mx * 100}%"></i><small>${i - h.length + 1 || '이번'}${i - h.length + 1 ? '달' : ''}</small></div>`).join('')}</div></div>` : ''}
    <div class="li"><span class="mut">보증금 / 월세</span><span class="num">₩${man(l.deposit || 0)} / ₩${man(l.rent || 0)}</span></div><div class="li"><span class="mut">월 매출</span><span class="num">₩${man(l.monthly_sales || 0)}</span></div>
    ${cheap(l) ? `<div class="promo" style="margin:10px 0"><span>회수 기간 <b>${payback(l)}개월</b> — 다른 매물 평균(${avgPayback().toFixed(0)}개월)보다 빨라요. 평소보다 싸게 나온 매물이에요.</span></div>` : ''}
    <div class="card" style="margin:10px 0;background:var(--card2)"><b>새로 차리면 vs 이 매장 인수</b>${NC.map(([n, v]) => `<div class="li"><span class="mut">${n}</span><span class="num">₩${man(v)}</span></div>`).join('')}
      <div class="li"><span>새로 차리면 약</span><b class="num">₩${man(nct)}</b></div><div class="li"><span>이 매장 권리금</span><b class="num">₩${man(l.premium)}</b></div>
      <div class="li tot"><b>아끼는 돈</b><b class="num up">${nct > l.premium ? `₩${man(nct - l.premium)}` : '비슷해요'}</b></div><small class="mut">+ 오픈 준비 3~4개월이 없어서 인수 첫날부터 매출·단골·딜러가 그대로예요. 금액은 업계 평균으로 잡은 추정치예요.</small></div>
    ${l.body ? `<p>${esc(l.body)}</p>` : ''}<button class="btn gold full" data-act="listing-ask" data-v="${l.id}">관심 있어요 · 상담 신청</button><p class="note">권리금 회수 기간 = 권리금 ÷ 월 순이익. 보통 10~12개월이면 적정 수준이에요.</p>`);
}
// 매장 내놓기 상담: 고르기 + 기타(직접 입력)
const SIDO = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const SELL_Q = [
  ['어느 지역 매장인가요?', null, '시·도를 고르고 구·동을 적어주세요 (예: 강남구 역삼동)'],
  ['희망 권리금은 어느 정도예요?', ['5천만 원 이하', '5천만~1억 원', '1억~1억 5천만 원', '1억 5천만~2억 원', '2억~3억 원', '3억 원 이상', '잘 모르겠어요 (추천받기)'], '직접 적기: 숫자만 적어도 돼요 (예: 1억 2천만 → 12000만 또는 1억2천)'],
  ['언제까지 넘기고 싶으세요?', ['1개월 안에', '3개월 안에', '6개월 안에', '급하지 않아요 (좋은 조건이면)'], '예: 12월 말까지'],
  ['넘기시려는 이유는요? (매수자에게 안 보여요)', ['다른 사업 준비', '건강·개인 사정', '이사·이전', '운영이 힘들어서', '말하기 어려워요'], '직접 적기'],
  ['+EV 매출 검증·실사 검증 배지를 붙일까요?', ['매출 검증 + 실사 검증 둘 다 (추천)', '매출 검증만', '나중에 할게요'], null]];
function transferBlock() {
  const tab = S.trTab || 'list';
  const head = `<div class="seg sub2" style="margin-top:12px">${[['list', '매물 보기'], ['sell', '내 매장 내놓기'], ['fee', '요금']].map(([k, l]) => `<button data-act="trtab" data-v="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>`;
  if (tab === 'list') return `${head}<div class="stats4" style="grid-template-columns:repeat(3,1fr)"><div><small>매물</small><b class="num">${(S.listings || []).length}개</b></div><div><small>매출 검증</small><b class="num">${(S.listings || []).filter(l => l.verified).length}개</b></div><div><small>평균 회수</small><b class="num">${(ls => ls.length ? Math.round(ls.reduce((a, b) => a + b, 0) / ls.length) + '개월' : '-')((S.listings || []).map(payback).filter(Boolean))}</b></div></div>
    ${(S.listings || []).map(l => `<button class="card lcard ${l.premium_ad ? 'prem' : ''}" data-act="listing-open" data-v="${l.id}"><div class="row between"><div class="row" style="gap:6px;flex-wrap:wrap">${lBadges(l)}</div><small class="mut">${fmtDT(l.created_at)}</small></div>
      <b class="lh">${esc(l.headline)}</b><small class="mut">${esc(l.area)} · ${l.pyeong || '-'}평 · 테이블 ${l.tables || '-'}대</small>
      <div class="ps3"><div><small>권리금</small><b class="num">₩${man(l.premium)}</b></div><div><small>월 순이익</small><b class="num up">₩${man(l.monthly_profit || 0)}</b></div><div><small>회수</small><b class="num">${payback(l) ? payback(l) + '개월' : '-'}</b></div></div><small class="up">${saveOf(l) > 0 ? `새로 차리는 것보다 약 ₩${man(saveOf(l))} 아끼고, ` : ''}인수 첫날부터 매출·단골·딜러 그대로</small></button>`).join('') || '<div class="card empty">지금 나온 매물이 없어요</div>'}
    <p class="note">매출 검증은 +EV 매일 마감 데이터로 확인된 숫자, 실사 검증은 +EV 담당자가 매장을 직접 보고 확인했다는 뜻이에요. 상호와 정확한 위치는 상담 후에만 알려드려요.</p>`;
  if (tab === 'fee') { const P = S.feeP || 1e8, fee = P * PRICING.transfer.successPct / 100, AD = PRICING.transfer.fast, M0 = monthSummary(S.y, S.m), mp = Math.max(0, M0.left);
    return `${head}<div class="card fee-hero"><small>+EV 점포 양도양수</small><h2>사장님, 그동안<br>정말 고생 많으셨습니다</h2><p>버텨 온 시간과 쌓아 온 매출, 그 값을 <b>끝까지 제대로</b> 받아 드릴게요.</p></div>
    <div class="card quote"><p>“무릎에 사서 어깨에 판다.”</p><small>가게도 같아요. 매출이 꺾인 뒤엔 권리금도 같이 꺾여요. <b>잘될 때 파는 것</b>이 가장 비싸게 파는 전략이에요.${mp ? ` 지금 우리 매장 순이익이면 권리금 <b class="up">₩${man(mp * 10)}~${man(mp * 12)}</b> 선이에요.` : ''}</small></div>
    <div class="fees">
      <div class="fee"><small>기본 등록</small><b class="num">${PRICING.transfer.basic / 1e4}<span>만 원</span></b><ul><li>팔릴 때까지 게시</li><li>매출 검증 + 실사 검증 배지</li><li>상호·위치 끝까지 비공개</li><li>관심 매수자 상담 연결</li><li><b class="up">팔리면 수수료에서 빼 드려요</b></li></ul></div>
      <div class="fee best"><span class="pill y">금매물</span><small>빠르게 팔기</small><b class="num">${PRICING.transfer.fast / 1e4}<span>만 원</span></b><ul><li>1개월 동안 매물 맨 위 고정</li><li>홀덤펍 창업 희망자에게 먼저 연락</li><li>전담 매니저 + 12개월 매출 리포트</li><li>1개월 뒤엔 기본 매물로 자동 전환</li><li><b class="up">팔리면 수수료에서 빼 드려요</b></li></ul></div>
      <div class="fee"><small>성사 수수료</small><b class="num">${PRICING.transfer.successPct}<span>%</span></b><ul><li>권리금 기준, <b>거래가 됐을 때만</b></li><li>안 팔리면 수수료 0원</li><li>계약서는 제휴 행정사·변호사가 작성</li></ul></div></div>
    <div class="card"><h3>권리금으로 계산해 보기</h3><div class="chips">${[5e7, 1e8, 2e8, 3e8].map(v => `<button class="fchip ${P === v ? 'on' : ''}" data-act="feep" data-v="${v}">${man(v)}</button>`).join('')}</div>
      <div class="li"><span>권리금</span><b class="num">₩${E.won(P)}</b></div><div class="li"><span>성사 수수료 10%</span><b class="num">₩${E.won(fee)}</b></div>
      <div class="li"><span>금매물로 올렸다면</span><b class="num up">광고비 ₩${E.won(AD)} 차감 → ₩${E.won(fee - AD)}</b></div>
      <div class="li tot"><span><b>사장님 손에 남는 돈</b></span><b class="num up" style="font-size:20px">₩${man(P - fee)}</b></div>
      <p class="note">+EV는 권리금 거래를 알선해요. 상가 임대차(보증금·월세) 계약은 공인중개사가, 권리금 계약서는 제휴 행정사·변호사가 맡아요.</p></div>
    <button class="btn gold full" data-act="trtab" data-v="sell">매장 내놓기 상담 (상담은 무료) →</button>`; }
  const a = S.sellA || [], M = monthSummary(S.y, S.m), mp = Math.max(0, M.left);
  return `${head}<div class="card chat"><h3>매장 내놓기 상담 <small>상호는 끝까지 비공개</small></h3>
    ${a.map((x, i) => `<div class="bub a">${SELL_Q[i][0]}</div><div class="bub me">${esc(x)}</div>`).join('')}
    ${a.length < SELL_Q.length ? (([qq, opts, hint]) => `<div class="bub a">${qq}</div>${a.length === 0 ? `<form class="f" id="sell-form" style="margin-top:8px"><div class="row" style="flex-wrap:nowrap"><select name="sido" style="width:auto">${SIDO.map(x => `<option>${x}</option>`).join('')}</select><input name="a" required placeholder="${hint}" style="flex:1"></div><button class="btn sm pri">보내기</button></form>`
      : `<div class="chips sellopt">${opts.map(o => `<button class="fchip" data-act="sell-pick" data-v="${esc(o)}">${o}</button>`).join('')}</div>${hint ? `<form class="row" id="sell-form" style="margin-top:8px"><input name="a" required placeholder="${hint}" style="flex:1"><button class="btn sm pri">기타로 보내기</button></form>` : ''}`}`)(SELL_Q[a.length])
    : `<div class="bub a">감사해요! 지금 이 매장은 월 순이익이 약 ₩${man(mp)}이에요. 권리금은 보통 <b>순이익 10~12개월치</b>라서 <b>약 ₩${man(mp * 10)} ~ ₩${man(mp * 12)}</b>로 보여요. 운영사 담당자가 곧 연락드려요.</div>${S.sellSaved ? '<span class="pill g">상담 접수 완료</span>' : '<button class="btn gold full" data-act="sell-save">상담 신청하기</button>'}`}</div>`;
}

// ===== 프랜차이즈 가맹 모집 =====
// 공고: 월 300,000원 게시비(선결제). 본사 실제 번호는 숨기고 +EV 추적번호(0507)로만 연결
const FR_FIELDS = [['brand', '브랜드명', 1], ['corp_name', '법인명', 1], ['biz_no', '사업자번호', 1, 'biz'], ['ceo', '대표자명', 1], ['regions', '모집 지역', 1, '', '예: 서울 강남·서초 / 경기 성남'], ['invest', '예상 창업비용 (원)', 1, 'money'], ['fee', '가맹비 (원)', 1, 'money'], ['edu_fee', '교육비 (원)', 0, 'money'], ['interior_est', '인테리어 예상비 (원)', 0, 'money'], ['royalty', '로열티', 1, '', '예: 월 매출 3% 또는 월 50만 원'], ['min_py', '최소 평수', 0, 'num'], ['address', '본사 주소', 1], ['homepage', '홈페이지', 0, 'url'], ['phone_fr', '상담 전화번호 (실제 번호 · 공고엔 안 나가요)', 1, 'tel'], ['kakao', '카카오 상담 링크', 0, 'url'], ['video', '소개 영상 링크', 0, 'url']];
async function frLoad() { S.frList = await q(sb.from('franchise_public').select('*').order('created_at', { ascending: false })); if (S.prof?.can_post_franchise) S.frMine = await q(sb.from('franchise_postings').select('*').eq('owner_user', S.user.id).order('created_at', { ascending: false })); render(); }
const frCard = f => `<button class="card frcard" data-act="fr-open" data-v="${f.id}"><div class="frh">${f.logo_url ? `<img class="frlogo" src="${esc(f.logo_url)}" alt="">` : '<span class="frlogo ph"></span>'}<div><b>${esc(f.brand)}</b><small class="mut">${esc(f.regions || '')} 가맹 모집</small></div></div>
  ${f.image_url ? `<img class="frimg" src="${esc(f.image_url)}" alt="" loading="lazy">` : ''}
  <div class="ps3"><div><small>예상 창업비용</small><b class="num">₩${man(f.invest || 0)}~</b></div><div><small>가맹비</small><b class="num">₩${E.won(f.fee || 0)}</b></div><div><small>로열티</small><b>${esc(f.royalty || '-')}</b></div></div></button>`;
function frBlock() {
  const can = S.prof?.can_post_franchise, L = S.frList || [], mine = S.frMine || [];
  return `${can ? `<div class="card"><div class="row between"><h3 style="margin:0">내 가맹 공고</h3><button class="btn pri sm" data-act="fr-new">+ 새 공고</button></div>
    ${mine.map(f => `<div class="li"><div><b>${esc(f.brand)}</b><small>${{ draft: '결제 전 (임시 저장)', active: `게시 중 · ${new Date(f.end_at).toLocaleDateString('ko-KR')}까지`, expired: '게시 끝남', paused: '멈춤' }[f.status]}${f.status === 'active' ? ` · 자동 연장 ${f.auto_renew ? '켬' : '끔'}` : ''}</small></div><span class="row">${f.status === 'active' ? `<button class="btn sm" data-act="fr-lead" data-v="${f.id}">리드</button><a class="btn sm" href="fr.html?id=${f.id}" target="_blank" rel="noopener">공개 페이지</a>` : ''}<button class="btn sm" data-act="fr-edit" data-v="${f.id}">수정</button>${f.status !== 'active' ? `<button class="btn sm gold" data-act="fr-pay" data-v="${f.id}">₩${E.won(PRICING.franchise.postingMonthly)} 게시하기</button>` : ''}</span></div>`).join('') || '<p class="mut" style="margin:8px 0 0">아직 공고가 없어요. 30일 게시에 ₩${E.won(PRICING.franchise.postingMonthly)}이고, 상담 전화가 30초 이상 연결되면 건당 ₩${E.won(PRICING.franchise.qualifiedLead)}이에요.</p>'}</div>` : ''}
  <div class="row between" style="margin:12px 0 8px"><b>홀덤 프랜차이즈 가맹 모집 <small class="mut">${L.length}개</small></b></div>
  ${L.map(frCard).join('') || '<div class="card empty">지금 모집 중인 브랜드가 없어요</div>'}
  ${can ? '' : `<div class="card" style="margin-top:12px"><b>프랜차이즈 본사이신가요?</b><p class="mut" style="margin:6px 0 10px">가맹 모집 공고는 가맹본사 계정만 올릴 수 있어요. 등록 방법·금액은 운영사가 직접 안내해 드려요.</p><button class="btn pri full" data-act="fr-contact">운영사에 문의하기 (가맹 공고 등록·금액)</button></div>`}`;
}
function frSheet(id) {
  const f = (S.frList || []).find(x => x.id === id); if (!f) return; sb.rpc('fr_hit', { p_post: id, p_kind: 'detail' }).then(() => { });
  const limited = f.limit_action === 'hide' && S.frLimited?.[id];
  openSheet(`<div class="frh">${f.logo_url ? `<img class="frlogo" src="${esc(f.logo_url)}" alt="">` : '<span class="frlogo ph"></span>'}<div><h2 style="margin:0">${esc(f.brand)}</h2><small class="mut">${esc(f.regions || '')} 가맹 모집</small></div></div>
    ${f.image_url ? `<img class="frimg" src="${esc(f.image_url)}" alt="">` : ''}
    <div class="ps3" style="margin-top:10px"><div><small>예상 창업비용</small><b class="num">₩${man(f.invest || 0)}~</b></div><div><small>가맹비</small><b class="num">₩${man(f.fee || 0)}</b></div><div><small>로열티</small><b>${esc(f.royalty || '-')}</b></div></div>
    <div class="card" style="margin:10px 0;background:var(--card2)"><div class="li"><span class="mut">교육비</span><span class="num">₩${E.won(f.edu_fee || 0)}</span></div><div class="li"><span class="mut">인테리어 예상비</span><span class="num">₩${E.won(f.interior_est || 0)}</span></div><div class="li"><span class="mut">최소 평수</span><span>${f.min_py ? f.min_py + '평' : '-'}</span></div><div class="li"><span class="mut">모집 지역</span><span>${esc(f.regions || '-')}</span></div></div>
    ${f.support ? `<h3>본사 지원</h3><p style="white-space:pre-wrap">${esc(f.support)}</p>` : ''}${f.description ? `<h3>브랜드 소개</h3><p style="white-space:pre-wrap">${esc(f.description)}</p>` : ''}
    <p class="mut">${esc(f.address || '')}${f.homepage ? ` · <a href="${esc(f.homepage)}" target="_blank" rel="noopener">홈페이지</a>` : ''}${f.video ? ` · <a href="${esc(f.video)}" target="_blank" rel="noopener">소개 영상</a>` : ''}</p>
    ${limited ? '<p class="note">이번 달 전화 상담 접수가 마감됐어요. 카카오 상담을 이용해 주세요.</p>' : f.tracking_number ? `<a class="btn gold full" href="tel:${esc(f.tracking_number.replace(/[^\d]/g, ''))}" data-act="fr-call" data-v="${f.id}">전화 상담하기</a>` : '<button class="btn full" data-act="fr-ask" data-v="${f.id}">전화 상담 요청 (운영사 연결)</button>'}
    ${f.kakao ? `<a class="btn full" style="margin-top:8px" href="${esc(f.kakao)}" target="_blank" rel="noopener">카카오톡 상담</a>` : ''}
    <p class="note">전화는 +EV 상담 번호로 연결돼요. 상담 내용은 본사가 직접 응대해요.</p>`);
}
function frForm(f = {}) {
  openSheet(`<h2 style="margin:0 0 10px">${f.id ? '가맹 공고 수정' : '가맹 공고 등록'}</h2><form class="f" id="fr-form" data-id="${f.id || ''}">
    <div class="grid2"><label class="photo-in sm"><input type="file" name="logo" accept="image/*" hidden><span id="fr-logo-prev">${f.logo_url ? `<img src="${esc(f.logo_url)}" alt="">` : '<b>브랜드 로고</b>'}</span></label><label class="photo-in sm"><input type="file" name="image" accept="image/*" hidden><span id="fr-img-prev">${f.image_url ? `<img src="${esc(f.image_url)}" alt="">` : '<b>대표 이미지</b>'}</span></label></div>
    ${FR_FIELDS.map(([k, l, req, t, ph]) => `<label class="fl">${l}${req ? '' : ' <small class="mut">(선택)</small>'}<input name="${k}" ${req ? 'required' : ''} value="${esc(f[k] ?? (k === 'phone_fr' ? f.phone : '') ?? '')}" ${t === 'money' || t === 'num' ? 'type="number" inputmode="numeric"' : t === 'url' ? 'type="url"' : ''} placeholder="${esc(ph || '')}"></label>`).join('')}
    <label class="fl">브랜드 설명<textarea name="description" rows="4" required>${esc(f.description || '')}</textarea></label>
    <label class="fl">지원 내용<textarea name="support" rows="3" placeholder="예: 오픈 3개월 본사 매니저 상주 · 딜러 교육 · 간판 제작">${esc(f.support || '')}</textarea></label>
    <label class="tog"><span><b>자동 연장</b><small>게시 끝나기 3일 전 알려드리고, 켜 두면 30일씩 ₩${E.won(PRICING.franchise.postingMonthly)}이 결제돼요</small></span><input type="checkbox" name="auto_renew" ${f.auto_renew !== false ? 'checked' : ''}></label>
    <div class="grid2"><label class="fl">월 리드 한도 (원) <small class="mut">(선택)</small><input name="lead_limit_amt" type="number" inputmode="numeric" value="${f.lead_limit_amt ?? ''}" placeholder="예: 500000"></label><label class="fl">월 리드 한도 (건) <small class="mut">(선택)</small><input name="lead_limit_n" type="number" value="${f.lead_limit_n ?? ''}" placeholder="예: 10"></label></div>
    <label class="fl">한도에 닿으면<select name="limit_action"><option value="keep" ${f.limit_action !== 'hide' ? 'selected' : ''}>공고는 계속 노출 · 전화 버튼도 유지 (초과분도 과금)</option><option value="hide" ${f.limit_action === 'hide' ? 'selected' : ''}>공고는 계속 노출 · 전화 버튼만 숨김</option></select></label>
    <div class="receipt"><div class="rh">요금</div><div class="rl"><span>게시비 30일</span><b class="num">₩${E.won(PRICING.franchise.postingMonthly)}</b></div><div class="rl"><span>유효 전화 상담 (30초 이상 연결)</span><b class="num">건당 ₩${E.won(PRICING.franchise.qualifiedLead)}</b></div><small class="mut">같은 번호는 30일에 1건만 과금돼요. 리드 비용은 월말에 모아서 다음 달 초 자동 결제돼요.</small></div>
    <button class="btn pri full">${f.id ? '저장' : '저장하고 결제로'}</button></form>`);
}
// 본사 리드 대시보드: 이번 달 노출·상세·클릭·유효 리드·비용 + 리드 목록(이의제기) + 청구서 결제
async function frLeadSheet(id) {
  const f = (S.frMine || []).find(x => x.id === id); if (!f) return;
  const [D, L, bills] = await Promise.all([q(sb.rpc('fr_dash', { p_post: id })), q(sb.from('franchise_leads').select('*').eq('posting_id', id).order('connected_at', { ascending: false }).limit(60)), q(sb.from('payments').select('*').eq('kind', 'franchise_leads').eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(12))]);
  const ST = { qualified: ['g', '유효'], short: ['', '30초 미만'], duplicate: ['', '30일 내 재통화'], invalid: ['', '무효'], disputed: ['y', '이의제기 중'], limit: ['y', '한도 초과'] }, mm = s => `${Math.floor(s / 60)}분 ${s % 60}초`;
  const myBills = bills.filter(b => b.arg?.post === id);
  openSheet(`<h2 style="margin:0 0 2px">${esc(f.brand)} · 이번 달</h2><small class="mut">${now.getMonth() + 1}월 1일부터 오늘까지</small>
    <div class="stats4" style="margin-top:10px"><div><small>공고 노출</small><b class="num">${E.won(D.views)}회</b></div><div><small>상세 조회</small><b class="num">${E.won(D.details)}회</b></div><div><small>전화 버튼 클릭</small><b class="num">${D.clicks}회</b></div><div><small>유효 상담 전화</small><b class="num up">${D.leads}건</b></div></div>
    <div class="card" style="margin:10px 0;background:var(--card2)"><div class="li"><span>이번 달 리드 비용</span><b class="num" style="font-size:20px">₩${E.won(D.cost)}</b></div><div class="li"><span class="mut">게시비 (선결제)</span><span class="num">₩${E.won(PRICING.franchise.postingMonthly)} / 30일</span></div>${f.lead_limit_amt || f.lead_limit_n ? `<div class="li"><span class="mut">월 한도</span><span>${f.lead_limit_amt ? '₩' + E.won(f.lead_limit_amt) : ''}${f.lead_limit_amt && f.lead_limit_n ? ' · ' : ''}${f.lead_limit_n ? f.lead_limit_n + '건' : ''}${D.limited ? ' <span class="pill y">도달</span>' : ''}</span></div>` : ''}<small class="mut">리드 비용은 다음 달 1일에 청구서로 모아 보내드려요. 30초 이상 연결된 통화만, 같은 번호는 30일에 1건만 세요.</small></div>
    ${myBills.length ? `<h3>청구서</h3>${myBills.map(b => `<div class="li"><div><b>${esc(b.order_name)}</b><small>${fmtDT(b.created_at)}</small></div>${b.status === 'due' ? `<button class="btn sm gold" data-act="fr-bill" data-v="${b.order_id}">₩${E.won(b.amount)} 결제</button>` : `<span class="pill ${b.status === 'done' ? 'g' : ''}">${b.status === 'done' ? '결제 완료' : b.status}</span>`}</div>`).join('')}` : ''}
    <h3>전화 리드 <small>최근 ${L.length}건</small></h3><div class="tbl"><table style="min-width:0;font-size:12.5px"><thead><tr><th>날짜</th><th>시간</th><th class="r">통화</th><th>상태</th><th class="r">비용</th><th></th></tr></thead><tbody>
    ${L.map(l => { const t = new Date(l.connected_at); return `<tr><td>${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')}</td><td>${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}</td><td class="r num">${mm(l.duration_seconds)}</td><td><span class="pill ${ST[l.status]?.[0] || ''}">${ST[l.status]?.[1] || l.status}</span>${l.reason ? `<small class="mut" style="display:block">${esc(l.reason)}</small>` : ''}</td><td class="r num">${l.charge_amount ? '₩' + E.won(l.charge_amount) : '0'}</td><td>${l.status === 'qualified' && !l.billed_month ? `<button class="btn sm" data-act="fr-dispute" data-v="${l.id}">이의</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="mut">아직 상담 전화가 없어요</td></tr>'}</tbody></table></div>
    <p class="note">발신 번호는 저장하지 않고 뒷자리만 보관해요. 광고·잘못 걸린 전화·반복 전화는 '이의'를 누르면 운영사가 확인하고 비용을 빼 드려요.</p>`);
}
// ===== 직원 (소속) =====
function vWork() {
  const me = S.my[0], r = payOf(me), [y, m, d] = TODAY.split('-').map(Number), wk0 = d - E.wdOf(y, m, d), D = E.daysIn(S.y, S.m);
  let cal = ''; for (let i = 1; i <= D; i++) { const t = E.shiftOn(me.id, S.y, S.m, i, S.tpl, S.ov), k = E.ymd(S.y, S.m, i); cal += `<div class="dc ${t ? 'on' : ''} ${k === TODAY ? 'today' : ''}"><b>${i}</b><small>${t ? `${t5(t.s).slice(0, 2)}–${t5(t.e).slice(0, 2)}` : ''}</small></div>`; }
  return `<h1>내 근무</h1><p class="sub">${esc(S.store.name || '')} · ${esc(me.nick)}</p>
  ${S.academy ? `<button class="card rankbar" data-tab="learn" style="width:100%;text-align:left;cursor:pointer;color:var(--text)"><div><b>딜러 교육이 열렸어요</b><small class="mut" style="display:block">${(S.lessons || []).length}/5 강의 완료${S.quizRes ? ` · 시험 ${S.quizRes.score}/5` : ''}</small></div><span class="btn sm pri">들으러 가기 →</span></button>` : ''}
  <div class="card dsum"><div><small>${S.m}월 예상 실수령</small><b class="num up">₩${E.won(r.fullNet)}</b></div><div><small>근무</small><b class="num">${r.shifts.length}일</b></div><div><small>휴게 뺀 시간</small><b class="num">${r.shifts.reduce((a, x) => a + x.hours, 0).toFixed(0)}h</b></div><div><small>지금까지 번 돈</small><b class="num">₩${E.won(r.gross)}</b></div></div>
  ${S.slots.length ? `<div class="card"><h3>긴급 근무</h3>${S.slots.map(s => `<div class="slot"><span><b>${esc(s.title)}</b><br><small class="mut">${esc(s.store_name)} · ${t5(s.start_t)}–${t5(s.end_t)}</small></span><span class="row"><span class="pill ${SLOT[s.status][0]}">${SLOT[s.status][1]}</span>${s.status === 'WORKING' ? `<button class="btn sm pri" data-act="dslot" data-s="${s.slot_id}">근무 완료</button>` : ''}</span></div>`).join('')}</div>` : ''}
  <div class="card"><h3>이번 주</h3>${E.WD.map((w, i) => { const dd = wk0 + i, ok = dd >= 1 && dd <= E.daysIn(y, m), t = ok ? E.shiftOn(me.id, y, m, dd, S.tpl, S.ov) : null; return `<div class="li ${dd === d ? 'today' : ''}"><div><b>${w}</b><small>${ok ? `${m}/${dd}` : ''}</small></div>${t ? `<span class="num"><b>${t5(t.s)} – ${t5(t.e)}</b></span>` : '<span class="mut">휴무</span>'}</div>`; }).join('')}</div>
  <div class="card"><h3>${S.m}월 달력 ${monthNav()}</h3><div class="cal">${E.WD.map(w => `<div class="h">${w}</div>`).join('')}${'<div></div>'.repeat(E.wdOf(S.y, S.m, 1))}${cal}</div></div>
  <div class="card"><h3>${S.m}월 급여 <small>어제까지 · 월말 예상 세전 ₩${E.won(r.fullGross)}</small></h3>${[['기본급', r.base], ['야간수당', r.np], ['연장수당', r.otp], ['주휴수당', r.juhu], ['인센티브', r.inc]].map(([n, v]) => `<div class="li"><span class="mut">${n}</span><span class="num">₩${E.won(v)}</span></div>`).join('')}<div class="li"><span class="mut">공제 (${me.contract === '4대' ? '4대보험' : '3.3%'})</span><span class="num down">−₩${E.won(r.ded)}</span></div><div class="li"><b>지금까지 실수령</b><b class="num up" style="font-size:18px">₩${E.won(r.net)}</b></div></div>`;
}
function vAttend() {
  const last = S.att?.[0];
  return `<h1>출퇴근</h1><p class="sub">매장 화면에 뜬 6자리 번호를 넣어주세요.</p>
  <form class="f card" id="attend-form"><input name="code" inputmode="numeric" maxlength="6" required placeholder="000000" style="font-size:32px;text-align:center;letter-spacing:.3em"><button class="btn pri full">${last?.kind === 'in' ? '퇴근하기' : '출근하기'}</button></form>
  <div class="card"><h3>최근 기록</h3>${(S.att || []).map(a => `<div class="li"><span>${a.kind === 'in' ? '🟢 출근' : '⚪ 퇴근'}</span><span class="num">${fmtDT(a.at)}</span></div>`).join('') || '<div class="empty">아직 기록이 없어요</div>'}</div>`;
}

// ===== 딜러 =====
const hoursOf = (s, e) => { const a = E.toMin(s); let b = E.toMin(e); if (b <= a) b += 1440; return (b - a) / 60; };
function jobCard(j, view) {
  const applied = !view && (S.apps || []).some(a => a.post_id === j.id), slots = j.slots || [], pays = slots.map(s => s.pay), open = slots.filter(s => s.status === 'OPEN').length;
  const s0 = slots[0], hrs = s0 ? hoursOf(s0.start, s0.end) : 0, same = slots.every(s => s.start === s0?.start && s.end === s0?.end);
  return `<div class="job ${j.kind === 'urgent' ? 'urgent' : ''}"><div class="row between"><div class="row">${j.kind === 'urgent' ? `<span class="pill r urgpill">긴급 대타 · ${Math.max(0, Math.ceil((new Date(j.expires_at) - Date.now()) / 36e5))}시간 남음</span>` : ''}${j.flash ? '<span class="spark">반짝</span>' : ''}${j.top ? '<span class="pill y"></span>' : ''}<small class="mut">${esc(j.job_role)}</small></div>
    <span class="pay">${pays.length ? `일당 ₩${E.won(Math.min(...pays))}${pays.length > 1 && Math.max(...pays) !== Math.min(...pays) ? '~' + E.won(Math.max(...pays)) : ''}` : esc(j.pay_text || '')}</span></div>
  <h4>${esc(j.title)}</h4>${j.body ? `<div style="font-size:14px">${esc(j.body)}</div>` : ''}
  ${j.incentive || j.prefer ? `<div class="jx">${j.incentive ? `<span>인센티브 · ${esc(j.incentive)}</span>` : ''}${j.prefer ? `<span>우대 · ${esc(j.prefer)}</span>` : ''}</div>` : ''}
  <div class="meta"><span>${esc(j.store_name)} · ${esc(j.area || '')}</span><span>${slots.length ? (same ? `${t5(s0.start)}–${t5(s0.end)} · ${hrs}시간` : slots.map(s => `${t5(s.start)}–${t5(s.end)}`).join(' / ')) : esc(j.work_time || '')}</span>
    ${slots.length && hrs ? `<span class="up">시급으로 약 ₩${E.won(Math.round(Math.min(...pays) / hrs / 10) * 10)}</span>` : ''}${slots.length > 1 ? `<span>${open}/${slots.length}자리 남음</span>` : ''}${j.taxi_amt ? `<span class="up">택시비 ₩${E.won(j.taxi_amt)}</span>` : ''}</div>
  ${j.address ? `<a class="jaddr" href="${mapUrl(j.address)}" target="_blank" rel="noopener">${esc(j.address)} <b>네이버 지도 ›</b></a>` : ''}
  ${view ? '' : applied ? '<span class="pill g">지원 완료 · 매장 확인 중</span>' : `<button class="btn ${j.kind === 'urgent' ? 'gold' : 'pri'}" data-act="apply" data-p="${j.id}">지원권 1장으로 지원</button>`}</div>`;
}
function vBoard() { return `<div class="row between"><h1>구인</h1><span class="pill y">지원권 ${S.tickets}장</span></div><p class="sub">지원하면 지원권 1장이 잠기고, 채용돼 연락처가 열리면 사용돼요. 안 뽑히거나 매장이 취소하면 돌아와요.</p>${boardList(false)}`; }
function boardList(view) {
  const F = S.jf || { k: '전체', r: '전체', a: '전체' }; S.board = S.board || [];
  const areas = [...new Set(S.board.map(j => (j.area || '').split(' ').slice(0, 2).join(' ')).filter(Boolean))];
  const list = S.board.filter(j => (F.k === '전체' || (F.k === '긴급') === (j.kind === 'urgent')) && (F.r === '전체' || j.job_role === F.r) && (F.a === '전체' || (j.area || '').startsWith(F.a))).sort((a, b) => (b.kind === 'urgent') - (a.kind === 'urgent'));
  const chip = (key, v) => `<button class="fchip ${F[key] === v ? 'on' : ''}" data-act="jf" data-k="${key}" data-v="${v}">${v === '긴급' ? '긴급' : v}</button>`;
  return `${view ? '<p class="sub">딜러들이 보는 것과 같은 화면이에요. 다른 매장 시급·조건을 보고 우리 공고를 정해 보세요.</p>' : ''}<div class="filters"><div class="chips">${['전체', '긴급', '상시'].map(v => chip('k', v)).join('')}</div><div class="chips">${['전체', '딜러', '플로어', '매니저'].map(v => chip('r', v)).join('')}</div>${areas.length > 1 ? `<div class="chips">${['전체', ...areas].map(v => chip('a', v)).join('')}</div>` : ''}</div>
  <p class="mut" style="font-size:13px;margin:8px 2px">${list.length}개 공고</p>
  ${list.map(j => jobCard(j, view)).join('') || `<div class="card empty">${S.board.length ? '조건에 맞는 공고가 없어요' : '지금 올라온 공고가 없어요'}</div>`}`;
}
function vMyWork() {
  const L = { applied: ['', '매장 확인 중'], hired: ['g', '채용됐어요'], rejected: ['', '아쉽게 안 됐어요'], cancelled: ['y', '매장 취소 · 지원권 반환'], expired: ['', '마감 · 지원권 반환'] };
  return `<h1>내 근무</h1><div class="card"><h3>긴급 근무</h3>${S.slots.map(s => `<div class="slot"><span><b>${esc(s.title)}</b><br><small class="mut">${esc(s.store_name)} · ${t5(s.start_t)}–${t5(s.end_t)} · ₩${E.won(s.pay + s.extra)}</small>${s.result ? `<br><small class="up">받는 돈 ₩${E.won(s.result.net)} (3.3% 원천세 −${E.won(s.result.tax)})</small>` : ''}</span>
    <span class="row"><span class="pill ${SLOT[s.status][0]}">${SLOT[s.status][1]}</span>${s.status === 'WORKING' ? `<button class="btn sm pri" data-act="dslot" data-s="${s.slot_id}">퇴근했어요 · 근무 완료</button>` : ''}</span></div>`).join('') || '<div class="empty">채용된 긴급 근무가 없어요</div>'}
    <p class="note">근무 완료를 누르면 매장이 확인하거나 3시간이 지나면 자동으로 지갑에 들어와요.</p></div>
  <div class="card"><h3>내 지원</h3>${S.apps.map(a => `<div class="li"><div><b>${esc(a.title)}</b><small>${esc(a.store_name)} · ${new Date(a.created_at).toLocaleDateString('ko-KR')}</small></div><span class="pill ${L[a.status][0]}">${L[a.status][1]}</span></div>`).join('') || '<div class="empty">아직 지원한 공고가 없어요</div>'}</div>`;
}
const TICKET_PACKS = [1, 5, 10].map(n => [n, PRICING.dealer.tickets[n]]), PRO_PRICE = PRICING.dealer.pro, INSTANT_FEE = PRICING.dealer.instantFee;
const isPro = () => S.prof?.pro_until && new Date(S.prof.pro_until) > now;
function vWallet() {
  const w = S.wallet, pro = isPro(), hasBank = S.prof?.bank_acct && S.prof?.bank_holder;
  return `<h1>지갑</h1><div class="card dsum" style="grid-template-columns:1fr 1fr"><div><small>지갑 잔액</small><b class="num up">₩${E.won(w.balance)}</b></div><div><small>지금 출금 가능</small><b class="num">₩${E.won(w.available)}</b></div></div>
  <div class="card"><h3>출금 ${pro ? '<span class="pill y">PRO · 번개 출금 0원</span>' : ''}</h3>${hasBank ? `<p class="mut" style="margin:0 0 10px">${esc(S.prof.bank_name || '')} ${esc(S.prof.bank_acct)} · ${esc(S.prof.bank_holder)}</p>
    <div class="grid2"><button class="btn gold" style="flex-direction:column" data-act="withdraw" data-v="1" ${w.available < 1000 + (pro ? 0 : INSTANT_FEE) ? 'disabled' : ''}>번개 출금<br><small>${pro ? '수수료 0원' : `수수료 ${E.won(INSTANT_FEE)}원`}</small></button><button class="btn" style="flex-direction:column" data-act="withdraw" data-v="0" ${w.available < 1000 ? 'disabled' : ''}>일반 출금<br><small>무료 · 다음 영업일</small></button></div>` : '<p class="mut" style="margin:0">내 정보에서 받을 계좌를 먼저 넣어주세요.</p><button class="btn sm" data-tab="me" style="margin-top:8px">계좌 넣기</button>'}
    <p class="note">긴급 근무 급여는 매장 확인 후 5시간 뒤부터 출금할 수 있어요. 출금 가능한 돈 전부가 한 번에 나가요.</p>
    ${S.wds?.length ? S.wds.map(x => `<div class="li"><div><b>₩${E.won(x.amount)}</b><small>${x.instant ? '번개' : '일반'} · ${fmtDT(x.created_at)}${x.fee ? ` · 수수료 ${E.won(x.fee)}` : ''}</small></div><span class="pill ${x.status === '송금 완료' ? 'g' : 'y'}">${esc(x.status)}</span></div>`).join('') : ''}</div>
  <div class="card"><h3>지원권 <small>지금 ${S.tickets}장</small></h3><div class="plans">${TICKET_PACKS.map(([n, p], i) => `<div class="plan ${i === 1 ? 'cur' : ''}">${i === 1 ? '<span class="pill y">인기</span>' : ''}<b>${n}장</b><b class="num">₩${E.won(p)}</b><small>장당 ₩${E.won(p / n)}</small><button class="btn sm ${i === 1 ? 'pri' : ''}" data-act="tickets" data-v="${i + 1}">받기</button></div>`).join('')}</div>
    <p class="note">지원하면 1장이 잠기고, 채용돼야 쓰여요. 안 뽑히면 돌아와요.</p>${payNote()}</div>
  <div class="card game"><h3>딜러 PRO 패스 <small>월 ₩${E.won(PRO_PRICE)}</small></h3><div class="li"><span>번개 출금 수수료</span><b>0원</b></div><div class="li"><span>지원권</span><b>매달 2장</b></div>
    ${pro ? `<p class="up" style="margin:10px 0 0"><b>PRO 이용 중</b> · ${new Date(S.prof.pro_until).toLocaleDateString('ko-KR')}까지</p>` : `<button class="btn gold full" data-act="pro" style="margin-top:10px">PRO 시작하기</button><p class="note">번개 출금을 한 달에 7번 이상 쓰면 PRO가 이득이에요. 30일씩 결제해요.</p>${payNote()}`}</div>`;
}
function vMe() {
  const p = S.prof;
  return `<h1>내 정보</h1><form class="f card" id="dealer-form"><label class="fl">이름(닉네임)<input name="name" value="${esc(p.name)}"></label><label class="fl">휴대폰<input name="phone" value="${esc(p.phone || '')}"></label>
  <label class="fl">경력 (개월)<input name="career" type="number" value="${p.career_months || 0}"></label><label class="fl">자기소개<textarea name="bio" rows="3">${esc(p.bio || '')}</textarea></label>
  <div class="grid2"><label class="fl">활동 지역 (시·도)<select name="area"><option value="">전국</option>${SIDO.map(a => `<option ${p.area === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label><label class="fl">가능 게임<input name="games" value="${esc(p.games || '')}" placeholder="예: 홀덤, 오마하"></label></div>
  <label class="tog"><span><b>다른 매장 긴급 대타 받기</b><small>같은 지역 긴급 대타가 뜨면 알림을 드려요. 지원해서 근무하면 지갑으로 바로 지급</small></span><input type="checkbox" name="open_to_sub" ${p.open_to_sub ? 'checked' : ''}></label>
  <button class="btn pri full">저장</button></form>
  ${pushRow() ? `<div class="card">${pushRow()}</div>` : ''}
  ${S.rep ? `<div class="card"><h3>내 평판 <small>점주가 지원자 목록에서 보는 숫자</small></h3><div class="fxg">${[['완료 근무', S.rep.done + '건'], ['근무 매장', S.rep.stores + '곳'], ['재호출률', S.rep.recall_pct == null ? '-' : S.rep.recall_pct + '%'], ['노쇼', S.rep.noshow + '회'], ['교육 수료', S.rep.edu + '개']].map(([l, v]) => `<div><small>${l}</small><b class="num">${v}</b></div>`).join('')}</div><p class="note">재호출률 = 두 번 이상 불러준 매장 비율. 이 숫자가 대타 매칭 순서를 정해요.</p></div>` : ''}
  <form class="f card" id="bank-form"><h3>받을 계좌 <small>출금할 때 이 계좌로 보내드려요</small></h3><div class="grid2"><label class="fl">은행<input name="bank" value="${esc(p.bank_name || '')}" placeholder="예: 카카오뱅크"></label><label class="fl">예금주<input name="holder" value="${esc(p.bank_holder || '')}"></label></div><label class="fl">계좌번호<input name="acct" inputmode="numeric" value="${esc(p.bank_acct || '')}"></label><button class="btn full">계좌 저장</button></form>
  <form class="f card" id="join-code-form"><h3>매장 소속 신청 <small>점장님께 받은 가입코드</small></h3><input name="code" required placeholder="D-XXXXXX" style="text-transform:uppercase;letter-spacing:.15em"><button class="btn full">소속 신청</button></form>
  ${inqBlock()}
  <div class="card"><h3>알림</h3>${S.notis.map(x => `<div class="li"><span>${esc(x.body)}</span><small>${fmtDT(x.created_at)}</small></div>`).join('') || '<div class="empty">알림이 없어요</div>'}</div>`;
}

// ===== 운영사 =====
function vHqDash() {
  const st = S.stats || [], sales = st.reduce((a, x) => a + +x.sales, 0), open = (S.inq || []).filter(x => !x.reply).length;
  const T = S.hqToday || {}, R = S.hqRev || {}, KN = { subscription: '구독', jobs: '구인', boost: '중고 부스팅', franchise_post: '가맹 게시', franchise_lead: '가맹 리드', academy: '교육', dealer: '딜러', post: '구인', post_extra: '구인', store: '구독', plan: '구독', used_boost: '중고 부스팅', franchise: '가맹 게시', franchise_leads: '가맹 리드', fr_bill: '가맹 리드', tickets: '딜러', pro: '딜러' };
  const todo = [['biz', '사업자 확인 대기', 'stores'], ['inq', '답변 대기 문의', 'inq'], ['disputes', '긴급 근무 분쟁', 'dash'], ['pay_fail', '결제 미완료 (1시간+)', 'dash'], ['fr_disputes', '가맹 리드 이의제기', 'fr'], ['withdrawals', '출금 요청', 'dash'], ['trial_ending', '체험 종료 3일 전', 'stores'], ['expired', '체험 끝난 매장', 'stores']].filter(([k]) => +T[k] > 0);
  const months = [...new Set((R.by_kind || []).map(x => x.month))].sort(), kinds = [...new Set((R.by_kind || []).map(x => x.kind))], amt = (m, k) => (R.by_kind || []).filter(x => x.month === m && x.kind === k).reduce((a, x) => a + x.amount, 0);
  const A = R.activation || {}, DA = R.dealer_activation || {}, RT = R.retention || {};
  return `<h1>운영사</h1><p class="sub">${S.y}년 ${S.m}월</p>
  <div class="card"><h3>오늘 처리할 것 <small>${todo.length ? `${todo.reduce((a, [k]) => a + +T[k], 0)}건` : '없어요'}</small></h3>${todo.map(([k, l, t]) => `<div class="li"><span>${l}</span><span class="row"><b class="num ${['pay_fail', 'disputes', 'fr_disputes'].includes(k) ? 'down' : ''}">${T[k]}</b><button class="btn sm" data-tab="${t}">보기</button></span></div>`).join('') || '<div class="empty">처리할 일이 없어요</div>'}</div>
  <div class="grid2"><div class="card kpi"><div class="l">입점 매장</div><div class="v num">${st.length}곳</div><small class="mut">체험 ${R.plans?.trial ?? 0} · 프로 ${R.plans?.pro ?? 0} · 종료 ${R.plans?.expired ?? 0}</small></div><div class="card kpi"><div class="l">MRR (프로 구독)</div><div class="v num up">₩${man(R.mrr || 0)}</div><small class="mut">이번 달 매장 매출 합계 ₩${man(sales)}</small></div></div>
  <div class="card"><h3>매출 (결제 완료 기준) <small>최근 6개월</small></h3>${months.length ? `<div class="tbl"><table style="min-width:0"><thead><tr><th></th>${months.map(m => `<th class="r">${+m.slice(5)}월</th>`).join('')}</tr></thead><tbody>${kinds.map(k => `<tr><td>${KN[k] || k}</td>${months.map(m => `<td class="r num">${amt(m, k) ? '₩' + E.won(amt(m, k)) : '-'}</td>`).join('')}</tr>`).join('')}<tr><td><b>합계</b></td>${months.map(m => `<td class="r num"><b>₩${E.won(kinds.reduce((a, k) => a + amt(m, k), 0))}</b></td>`).join('')}</tr></tbody></table></div>` : '<div class="empty">아직 결제가 없어요</div>'}</div>
  <div class="card"><h3>Activation · 리텐션 <small>최근 90일 가입 기준</small></h3>
    <div class="li"><span>점주 Activation <small>7일 내 직원 1 + 마감 1 + 스케줄 1</small></span><b class="num">${A.activated ?? 0} / ${A.signups ?? 0}${A.signups ? ` (${Math.round(A.activated / A.signups * 100)}%)` : ''}</b></div>
    <div class="li"><span>딜러 Activation <small>프로필 + 지원 1회</small></span><b class="num">${DA.activated ?? 0} / ${DA.signups ?? 0}${DA.signups ? ` (${Math.round(DA.activated / DA.signups * 100)}%)` : ''}</b></div>
    <div class="li"><span>매장 리텐션 D1 · D7 · D30 <small>가입 n일 뒤 마감 입력</small></span><b class="num">${[RT.d1, RT.d7, RT.d30].map(v => v == null ? '-' : Math.round(v * 100) + '%').join(' · ')}</b></div>
    <div class="li"><span>"AI 스케줄 초안" 버튼 클릭 <small>Fake door</small></span><b class="num">${R.fake_door ?? 0}회</b></div></div>
  <div class="card"><h3>발주 요청 <small>${(S.hqOrders || []).filter(o => o.status !== '도착').length}건 진행 중</small></h3>${(S.hqOrders || []).map(o => { const st = (S.stats || []).find(x => x.store_id === o.store_id); return `<div class="li"><div><b>${esc(st?.store || '매장')}</b> <small>${o.items.map(i => `${esc(item(i.id)?.n)}×${i.q}${i.alc ? '(주류)' : ''}`).join(', ')} · ₩${E.won(o.total)} · ${o.tax_invoice ? '세금계산서' : '계산서 없음'} · ${fmtDT(o.created_at)}</small></div><span class="row">${OSTEP.map(s => `<button class="btn sm ${o.status === s ? 'pri' : ''}" data-act="ostat" data-o="${o.id}" data-v="${s}">${s}</button>`).join('')}</span></div>${o.status !== '도착' ? `<form class="row oship" data-o="${o.id}" style="margin:-4px 0 10px;gap:6px"><input name="courier" placeholder="택배사" value="${esc(o.courier || '')}" style="width:90px"><input name="tracking" placeholder="송장번호" value="${esc(o.tracking || '')}" style="flex:1"><input type="date" name="eta" value="${o.eta || ''}" style="width:auto"><button class="btn sm pri">배송 정보 저장</button></form>` : ''}`; }).join('') || '<div class="empty">발주 요청이 없어요</div>'}</div>
  <div class="card"><h3>출금 요청 <small>${(S.hqWds || []).filter(x => x.status !== '송금 완료').length}건 대기</small></h3>${(S.hqWds || []).map(x => `<div class="li"><div><b>₩${E.won(x.amount)}</b> ${x.instant ? '<span class="pill y">번개</span>' : ''}<small>${esc((S.hqProfiles || []).find(p => p.id === x.user_id)?.name || '')} · ${esc(x.bank || '')} · ${fmtDT(x.created_at)}</small></div>${x.status === '송금 완료' ? '<span class="pill g">송금 완료</span>' : `<button class="btn sm pri" data-act="wd-done" data-v="${x.id}">송금했어요</button>`}</div>`).join('') || '<div class="empty">출금 요청이 없어요</div>'}<p class="note">번개 출금은 10분 안에 보내주세요. 은행 이체 후 '송금했어요'를 누르면 딜러에게 알림이 가요.</p></div>
  <div class="card"><h3>결제 ${PAY_TEST ? '<span class="pill y">테스트 모드</span>' : ''} <small>이번 달 ₩${E.won((S.hqPays || []).filter(x => x.status === 'done' && x.approved_at?.slice(0, 7) === TODAY.slice(0, 7)).reduce((a, x) => a + x.amount - x.refunded, 0))}</small> <button class="btn sm" data-act="tax-csv">계산서 발행 목록</button></h3>
    ${(S.hqPays || []).filter(x => x.status === 'done').slice(0, 30).map(x => { const due = x.refund_due - x.refunded; return `<div class="li"><div><b>${esc(x.order_name)}</b>${x.tax_invoice ? ' <span class="pill y">계산서</span>' : ''}<small>${fmtDT(x.approved_at)} · ₩${E.won(x.amount)}${x.refunded ? ` · 환불 ₩${E.won(x.refunded)}` : ''}</small></div>${due > 0 ? `<button class="btn sm gold" data-act="refund" data-o="${x.order_id}">₩${E.won(due)} 환불</button>` : ''}</div>`; }).join('') || '<div class="empty">아직 결제가 없어요</div>'}
    <p class="note">긴급 구인이 마감됐는데 못 구한 자리가 있으면 '환불' 버튼이 생겨요. 누르면 그 금액만 카드로 돌려줘요.</p></div>`;
}
function vHqGoods() {
  return `<div class="row between"><h1>발주 상품</h1><button class="btn pri sm" data-act="hq-prod" data-v="new">+ 상품 추가</button></div><p class="sub">매장 발주 화면에 그대로 나가요. 사진·가격·설명을 여기서 관리하세요.</p>
    ${Object.entries(SHOP_CAT).map(([c, l]) => `<h2 class="band">${l}</h2><div class="shop">${SHOP.filter(p => p.c === c).map(p => `<button class="sitem ${p.active === false ? 'off' : ''}" data-act="hq-prod" data-v="${p.id}"><span class="simg">${prodImg(p)}</span><b>${esc(p.n)}</b><small class="mut">${esc(p.u)}${p.active === false ? ' · 숨김' : ''}</small><div><s class="mut num" style="font-size:12px">₩${E.won(p.p)}</s> <b class="num up">₩${E.won(p.sp)}</b></div></button>`).join('')}</div>`).join('')}`;
}
function hqProdSheet(id) {
  const p = id === 'new' ? { id: Math.max(0, ...SHOP.map(x => x.id)) + 1, c: 'drink', n: '', u: '', p: 0, sp: 0, body: '', active: true, isNew: true } : item(id);
  openSheet(`<h2>${p.isNew ? '상품 추가' : esc(p.n)}</h2><form class="f" id="hq-prod-form" data-id="${p.id}">
    <label class="photo-in"><input type="file" name="photo" accept="image/*" hidden><span id="photo-prev">${p.img ? `<img src="${esc(p.img)}" alt=""><small>누르면 사진을 바꿔요</small>` : '<b>상품 사진</b><small>매장에서 누르면 크게 보여요</small>'}</span></label>
    <div class="grid2"><label class="fl">분류<select name="cat">${Object.entries(SHOP_CAT).map(([k, l]) => `<option value="${k}" ${p.c === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="fl">단위<input name="unit" required value="${esc(p.u)}" placeholder="예: 30캔"></label></div>
    <label class="fl">상품 이름<input name="name" required value="${esc(p.n)}"></label>
    <div class="grid2"><label class="fl">정가 (원)<input name="price" type="number" required value="${p.p || ''}"></label><label class="fl">+EV 가격 (원)<input name="sale" type="number" required value="${p.sp || ''}"></label></div>
    <label class="fl">설명<textarea name="body" rows="2">${esc(p.body || '')}</textarea></label>
    <label class="tog"><span><b>매장에 보이기</b><small>끄면 발주 화면에서 숨겨요</small></span><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}></label>
    <button class="btn pri full">저장</button></form>`);
}
function vHqStores() {
  return `<h1>입점 매장</h1><div class="card"><h3>가맹본사 권한 <small>켜면 가맹 모집 공고를 올릴 수 있어요</small></h3>${(S.hqProfiles || []).filter(p => p.kind === 'owner').map(p => `<div class="li"><span>${esc(p.name || '이름 없음')} <small class="mut">${p.id.slice(0, 8)}</small></span><button class="btn sm ${p.can_post_franchise ? 'pri' : ''}" data-act="fr-perm" data-u="${p.id}" data-v="${p.can_post_franchise ? 'false' : 'true'}">${p.can_post_franchise ? '✓ 가맹본사' : '권한 주기'}</button></div>`).join('') || '<div class="empty">대표 계정이 없어요</div>'}</div><div class="card">${(S.companies || []).map(c => `<div class="li"><div><b>${esc(c.name)}</b>${c.brand ? ` <small class="mut">${esc(c.brand)}</small>` : ''}<small>사업자 ${esc(c.biz_no || '')} · ${{ trial: '무료 체험', basic: '베이직', pro: '프로' }[c.plan]} · ${new Date(c.created_at).toLocaleDateString('ko-KR')}</small></div>${c.biz_verified ? '<span class="pill g">확인 완료</span>' : `<button class="btn sm pri" data-act="verify" data-c="${c.id}">사업자 확인</button>`}</div>`).join('') || '<div class="empty">아직 매장이 없어요</div>'}</div>`;
}
function vHqData() {
  const st = S.stats || [];
  return `<h1>데이터 자산</h1><p class="sub">매장별 ${S.m}월 매출·지출 (엑시트용 데이터 모음)</p><div class="row">${monthNav()}<button class="btn sm pri" data-act="hq-csv">엑셀</button></div>
  <div class="card"><div class="tbl"><table><thead><tr><th>회사</th><th>매장</th><th>지역</th><th class="r">매출</th><th class="r">보고일</th><th class="r">지출</th><th class="r">직원</th></tr></thead><tbody>${st.map(x => `<tr><td>${esc(x.company)}</td><td>${esc(x.store)}</td><td>${esc(x.area || '')}</td><td class="r num">${E.won(x.sales)}</td><td class="r num">${x.days}</td><td class="r num">${E.won(x.expenses)}</td><td class="r num">${x.staff}</td></tr>`).join('')}</tbody></table></div></div>`;
}
// 업데이트할 때마다 고객에게 보낼 공지를 미리 써 둔 초안 — 운영사는 고르고 보내기만
const NOTICE_DRAFTS = [
  ['v0.16', '더 편해진 +EV — 이번 업데이트 소식', `사장님, 안녕하세요. +EV 운영팀이에요.\n이번 업데이트로 이렇게 바뀌었어요.\n\n· 스케줄: 엑셀처럼 여러 칸을 한꺼번에 골라 옮기고, Ctrl+C / Ctrl+V로 붙여요. 공휴일은 자동으로 들어가요.\n· 비용 점검: 에어컨·인터넷·CCTV를 한 번만 입력하면 항목별로 줄일 수 있는 금액을 알려드려요.\n· 발주: 도착 예정일과 송장번호로 배송을 바로 확인해요.\n· 결제: 카카오페이·네이버페이·토스페이도 돼요. 세금계산서 자동 발행도 켤 수 있어요.\n· 테이블 로테이션: 입구·화장실·바를 배치도에 넣을 수 있어요.\n\n불편한 점은 앱의 문의로 편하게 알려주세요. 늘 고맙습니다.`],
  ['점검', '[안내] 서비스 점검 예정', `사장님, 안녕하세요. +EV 운영팀이에요.\n더 안정적인 서비스를 위해 아래 시간에 점검이 있어요.\n\n· 일시: 0월 0일 (0) 새벽 5시 ~ 6시\n· 영향: 점검 중에는 잠시 접속이 안 될 수 있어요. 마감 기록은 그대로 남아 있어요.\n\n영업 시간을 피해서 진행할게요. 양해 부탁드려요.`],
  ['요금', '[안내] 요금제 변경 소식', `사장님, 안녕하세요. +EV 운영팀이에요.\n요금제가 이렇게 바뀌어요.\n\n· 베이직: 무료 — 매장 관리 기능 전부\n· 프로: 매장당 월 35,000원 — 주변 매장 비교 순위·경고등·매달 처방\n\n이미 결제한 기간은 그대로 쓰실 수 있어요.`],
  ['장애', '[사과] 일시적인 접속 문제 안내', `사장님, 안녕하세요. +EV 운영팀이에요.\n0월 0일 0시부터 0시까지 일부 화면이 열리지 않는 문제가 있었어요. 지금은 정상으로 돌아왔어요.\n\n· 원인: \n· 영향: 입력한 기록은 모두 안전하게 남아 있어요.\n\n불편을 드려 죄송해요. 같은 일이 없도록 더 꼼꼼히 챙길게요.`]];
// 운영자: 가맹 정산 — 등록 프랜차이즈·게시 기간·결제·리드 통계·이의 처리·추적번호·통화 수기 입력
function vHqFr() {
  const P = S.hqFr || [], L = S.hqLeads || [], m0 = TODAY.slice(0, 7), thisM = l => l.connected_at.slice(0, 7) === m0, pays = (S.hqPays || []);
  const post = pays.filter(x => x.status === 'done' && x.kind === 'franchise' && x.approved_at?.slice(0, 7) === m0).reduce((a, x) => a + x.amount, 0), lead = L.filter(l => l.is_qualified && thisM(l)).reduce((a, l) => a + l.charge_amount, 0);
  const used = pays.filter(x => x.status === 'done' && x.kind === 'used_boost' && x.approved_at?.slice(0, 7) === m0), nm = id => (S.hqProfiles || []).find(p => p.id === id)?.name || '본사';
  const ST = { qualified: ['g', '유효'], short: ['', '30초 미만'], duplicate: ['', '재통화'], invalid: ['', '무효'], disputed: ['y', '이의제기'], limit: ['y', '한도'] };
  return `<h1>가맹 · 정산</h1>
  <div class="stats4"><div><small>${+m0.slice(5)}월 게시 매출</small><b class="num">₩${E.won(post)}</b></div><div><small>${+m0.slice(5)}월 리드 매출</small><b class="num up">₩${E.won(lead)}</b></div><div><small>중고 상단노출</small><b class="num">₩${E.won(used.filter(x => x.arg?.type !== 'urgent').reduce((a, x) => a + x.amount, 0))}</b></div><div><small>중고 급매</small><b class="num">₩${E.won(used.filter(x => x.arg?.type === 'urgent').reduce((a, x) => a + x.amount, 0))}</b></div></div>
  <div class="card"><h3>등록 프랜차이즈 <small>${P.length}개</small></h3>${P.map(f => { const my = L.filter(l => l.posting_id === f.id && thisM(l)); return `<div class="li"><div><b>${esc(f.brand)}</b> <small class="mut">${esc(nm(f.owner_user))}</small><small>${{ draft: '결제 전', active: `게시 중 · ${new Date(f.end_at).toLocaleDateString('ko-KR')}까지`, expired: '만료', paused: '멈춤' }[f.status]} · 추적번호 ${esc(f.tracking_number || '없음')} · 이번 달 유효 ${my.filter(l => l.is_qualified).length} / 무효 ${my.filter(l => !l.is_qualified).length}건 · ₩${E.won(my.reduce((a, l) => a + l.charge_amount, 0))}</small></div><button class="btn sm" data-act="fr-track" data-v="${f.id}">추적번호</button></div>`; }).join('') || '<div class="empty">등록된 프랜차이즈가 없어요</div>'}</div>
  <div class="card"><h3>이의제기 <small>${L.filter(l => l.status === 'disputed').length}건 대기</small></h3>${L.filter(l => l.status === 'disputed').map(l => `<div class="li"><div><b>${esc(P.find(p => p.id === l.posting_id)?.brand || '')}</b> · ${fmtDT(l.connected_at)} · ${l.duration_seconds}초 · 뒷자리 ${esc(l.caller_tail || '')}<small>사유: ${esc(l.dispute_note || '')}</small></div><span class="row"><button class="btn sm red" data-act="fr-resolve" data-v="${l.id}" data-ok="false" data-r="${esc(l.dispute_note || '')}">무효 · 비용 취소</button><button class="btn sm pri" data-act="fr-resolve" data-v="${l.id}" data-ok="true">유효 유지</button></span></div>`).join('') || '<p class="mut" style="margin:0">대기 중인 이의제기가 없어요</p>'}</div>
  <div class="card"><h3>통화 기록 넣기 <small>전화 연동사 웹훅이 없을 때 수기 입력</small></h3><form class="f" id="fr-call-form" onsubmit="return false"><div class="grid2"><label class="fl">추적번호<input name="tracking" required placeholder="0507-1234-5678"></label><label class="fl">발신 번호<input name="caller" required placeholder="010-0000-0000"></label><label class="fl">연결 시각<input name="at" type="datetime-local" required value="${new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)}"></label><label class="fl">통화 시간 (초)<input name="seconds" type="number" min="0" required value="60"></label></div><button class="btn pri full" data-act="fr-logcall">기록하고 판정하기</button></form><p class="note">웹훅 주소: <code>/functions/v1/fr-call-hook</code> · 헤더 x-hook-secret · 본문 {tracking, caller, connected_at, seconds}. 판정: 30초 이상 = 유효, 같은 번호 30일 1회, 한도 초과 시 설정대로.</p></div>
  <div class="card"><h3>최근 리드 <small>${L.length}건</small></h3><div class="tbl"><table style="min-width:0;font-size:12.5px"><thead><tr><th>브랜드</th><th>일시</th><th class="r">통화</th><th>상태</th><th class="r">비용</th><th></th></tr></thead><tbody>${L.slice(0, 40).map(l => `<tr><td>${esc(P.find(p => p.id === l.posting_id)?.brand || '')}</td><td>${fmtDT(l.connected_at)}</td><td class="r num">${l.duration_seconds}초</td><td><span class="pill ${ST[l.status]?.[0] || ''}">${ST[l.status]?.[1] || l.status}</span></td><td class="r num">${l.charge_amount ? '₩' + E.won(l.charge_amount) : '0'}</td><td>${l.is_qualified ? `<button class="btn sm" data-act="fr-resolve" data-v="${l.id}" data-ok="false" data-r="운영사 확인 · 무효">무효</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function vHqNotice() {
  const dr = S.noticeDraft || NOTICE_DRAFTS[0];
  return `<h1>공지 보내기</h1><p class="sub">보내면 모든 대표·점장에게 알림이 가고, 매장 브리핑 맨 위에 떠요.</p>
  <div class="card"><h3>미리 써 둔 초안</h3><div class="chips">${NOTICE_DRAFTS.map((x, i) => `<button class="fchip ${dr === x ? 'on' : ''}" data-act="ndraft" data-v="${i}">${x[0]}</button>`).join('')}</div></div>
  <form class="f card" id="notice-form"><label class="fl">제목<input name="title" required value="${esc(dr[1])}"></label><label class="fl">내용<textarea name="body" rows="12" required>${esc(dr[2])}</textarea></label><button class="btn pri full">모든 매장에 보내기</button></form>
  <div class="card"><h3>보낸 공지</h3>${(S.notices || []).map(n => `<div class="li"><div><b>${esc(n.title)}</b><small>${fmtDT(n.created_at)}</small></div></div>`).join('') || '<div class="empty">아직 보낸 공지가 없어요</div>'}</div>`;
}
function vHqInq() {
  const nm = id => (S.hqProfiles || []).find(p => p.id === id)?.name || '회원';
  return `<h1>문의함</h1>${(S.inq || []).map(x => `<div class="card"><div class="row between"><b>${esc(nm(x.from_user))}</b><small class="mut">${fmtDT(x.created_at)}</small></div><p style="margin:6px 0">${esc(x.body)}</p>
    ${x.reply ? `<div class="up">↳ ${esc(x.reply)}</div>` : `<form class="row" data-inq="${x.id}"><input name="reply" required placeholder="답변 쓰기" style="flex:1"><button class="btn sm pri">보내기</button></form>`}</div>`).join('') || '<div class="card empty">문의가 없어요</div>'}`;
}

// ===== 시트 =====
function openSheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="in">${html}</div>`; s.hidden = false; enhanceInputs(s); }
// 금액: 쉼표 + "13만 5,900원" 읽기 / 휴대폰: 010-0000-0000 / 사업자번호: 000-00-00000 (10자리)
const MONEY = /^(invest|fee|edu_fee|interior_est|lead_limit_amt|start_cash|net_fee|cctv_fee|pos_fee|rent_etc|sales|card|transfer|expense|start|pay|taxi|pamt|price|amount|goal|rent|mgmt|elec|water|net|rate)$/;
const digits = v => String(v ?? '').replace(/[^\d]/g, '');
const fmtMoney = v => { const d = digits(v); return d ? (+d).toLocaleString('ko-KR') : ''; };
const readWon = n => { if (!n) return ''; const e = Math.floor(n / 1e8), m = Math.floor(n % 1e8 / 1e4), r = n % 1e4; return [e ? `${e}억` : '', m ? `${m.toLocaleString('ko-KR')}만` : '', r ? r.toLocaleString('ko-KR') : ''].filter(Boolean).join(' ') + '원'; };
const fmtPhone = v => { let d = digits(v); if (d && !d.startsWith('0')) d = '010' + d; d = d.slice(0, 11); return d.length < 4 ? d : d.length < 8 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`; };
// 국세청 사업자등록번호 검증식 (DB biz_ok 와 같은 계산)
const bizOk = v => { const d = digits(v); if (d.length !== 10) return false; const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let t = w.reduce((a, x, i) => a + x * +d[i], 0) + Math.floor(+d[8] * 5 / 10); return (10 - t % 10) % 10 === +d[9]; };
const fmtBiz = v => { const d = digits(v).slice(0, 10); return d.length < 4 ? d : d.length < 6 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`; };
function enhanceInputs(root) {
  root.querySelectorAll('input').forEach(i => {
    if (i.dataset.fx) return;
    if (i.type === 'number' && MONEY.test(i.name)) { i.dataset.fx = 'money'; i.type = 'text'; i.inputMode = 'numeric'; i.removeAttribute('step'); i.value = fmtMoney(i.value); i.insertAdjacentHTML('afterend', `<small class="won">${readWon(+digits(i.value))}</small>`); }
    else if (i.name === 'phone') { i.dataset.fx = 'phone'; i.type = 'tel'; i.inputMode = 'numeric'; i.maxLength = 13; i.placeholder = '010-0000-0000'; i.value = fmtPhone(i.value); }
    else if (i.name === 'biz') { i.dataset.fx = 'biz'; i.inputMode = 'numeric'; i.maxLength = 12; i.value = fmtBiz(i.value); }
  });
}
document.addEventListener('input', e => { const i = e.target, fx = i.dataset?.fx; if (!fx) return;
  if (fx === 'money') { i.value = fmtMoney(i.value); const w = i.nextElementSibling; if (w?.classList.contains('won')) w.textContent = readWon(+digits(i.value)); }
  if (fx === 'phone') i.value = fmtPhone(i.value); if (fx === 'biz') i.value = fmtBiz(i.value); }, true);
const formVals = f => { const v = Object.fromEntries(new FormData(f)); f.querySelectorAll('[data-fx=money]').forEach(i => v[i.name] = digits(i.value)); return v; };
function closeSheet() { $('#sheet').hidden = true; }
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

// ===== 스케줄 복사·붙여넣기 =====
// 엑셀처럼 바로 반영: 화면 먼저 바꾸고 저장은 뒤에서 (실패하면 다시 불러옴)
function putOv(rows) {
  rows.forEach(r => { const i = S.ov.findIndex(o => o.member_id === r.member_id && o.work_date === r.work_date); if (i >= 0) S.ov[i] = { ...S.ov[i], ...r }; else S.ov.push(r); });
  render(); sb.from('shift_overrides').upsert(rows).then(({ error }) => { if (error) { toast('저장하지 못했어요. 다시 불러올게요'); reload(); } });
}
// 여러 칸 한꺼번에: 같은 날짜 간격을 유지해서 옮기기·붙이기
const selHas = (m, d) => (S.sels || []).some(x => x.m === m && x.d === d);
const shiftOf = (m, k) => { const [y, mo, dd] = k.split('-').map(Number); return E.shiftOn(m, y, mo, dd, S.tpl, S.ov); };
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const offRow = (m, d) => ({ member_id: m, work_date: d, off: true, start_t: null, end_t: null, break_min: null });
const onRow = (m, d, t) => ({ member_id: m, work_date: d, off: false, start_t: t.s, end_t: t.e, break_min: t.brk ?? 30 });
function moveShift(m, from, to, copy) { const off = dayDiff(from, to); if (!off) return;
  const group = selHas(m, from) ? S.sels : [{ m, d: from }], mp = new Map(), next = [];
  const G = group.map(x => ({ ...x, t: shiftOf(x.m, x.d) })).filter(x => x.t);
  if (!copy) G.forEach(x => mp.set(x.m + x.d, offRow(x.m, x.d)));
  G.forEach(x => { const nd = addDay(x.d, off); mp.set(x.m + nd, onRow(x.m, nd, x.t)); next.push({ m: x.m, d: nd }); });
  S.sels = next; S.selCell = null; putOv([...mp.values()]);
  toast(`${G.length > 1 ? `${G.length}개를 ` : ''}${Math.abs(off)}일 ${off > 0 ? '뒤로' : '앞으로'} ${copy ? '복사했어요' : '옮겼어요'}`); }
function copySel(list) { const G = list.map(x => ({ ...x, t: shiftOf(x.m, x.d) })).filter(x => x.t); if (!G.length) return; const base = G.map(x => x.d).sort()[0];
  S.clip = { items: G.map(x => ({ m: x.m, off: dayDiff(base, x.d), t: x.t })) }; S.schedView = 'month'; render(); toast(`${G.length}개 복사했어요. 붙일 날짜 칸을 누르고 Ctrl+V`); }
function pasteTo(k) { const c = S.clip; if (!c) return; const rows = c.items.map(x => onRow(x.m, addDay(k, x.off), x.t)); S.sels = rows.map(r => ({ m: r.member_id, d: r.work_date })); S.selCell = k; putOv(rows); toast(`${+k.slice(8)}일에 ${rows.length > 1 ? `${rows.length}개 ` : ''}붙였어요`); }
function selOff() { const L = (S.sels || []).filter(x => shiftOf(x.m, x.d)); if (!L.length) return; S.sels = []; putOv(L.map(x => offRow(x.m, x.d))); toast(`${L.length}개를 휴무로 바꿨어요`); }
document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-act=chip]'); if (c) { S.dragChip = { m: c.dataset.m, d: c.dataset.d }; e.dataTransfer.effectAllowed = 'copyMove'; } });
document.addEventListener('dragover', e => { if (S.dragChip && e.target.closest?.('.cell[data-d]')) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move'; } });
document.addEventListener('drop', e => { const cell = e.target.closest?.('.cell[data-d]'); if (cell && S.dragChip) { e.preventDefault(); const c = S.dragChip; S.dragChip = null; moveShift(c.m, c.d, cell.dataset.d, e.ctrlKey || e.altKey); } });
document.addEventListener('dragend', () => { S.dragChip = null; });
document.addEventListener('dblclick', e => { const c = e.target.closest?.('[data-act=chip]'); if (c) { S.edit = { memberId: c.dataset.m, date: c.dataset.d }; shiftSheet(S.edit); } });
document.addEventListener('mouseover', e => { const el = e.target.closest('[data-d]'); S.hover = el ? { m: el.dataset.m, d: el.dataset.d } : null; });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) return closeSheet();
  if (S.tab !== 'sched' || e.target.closest('input,textarea,select') || !$('#sheet').hidden) return;
  if (e.key === 'Escape') { S.sels = []; S.clip = null; S.selCell = null; return render(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sels?.length) { e.preventDefault(); return selOff(); }
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.code === 'KeyC' ? 'c' : e.code === 'KeyV' ? 'v' : e.key.toLowerCase(); // 한글 입력 상태(ㅊ·ㅍ)에서도 Ctrl+C/V 되게
  if (key === 'c' && !String(getSelection())) { const L = S.sels?.length ? S.sels : S.hover?.m ? [S.hover] : []; if (L.length) { e.preventDefault(); copySel(L); } }
  if (key === 'v' && S.clip) { const dst = S.selCell || S.hover?.d; if (dst) { e.preventDefault(); pasteTo(dst); } }
});
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
  if (a === 'sub') { S.tab = d.v ? 'more' : 'home'; S.sub = d.v || null; closeSheet(); render(); scrollTo(0, 0); if (d.v === 'used') busy(async () => { S.used = await q(sb.from('used_items').select('*').order('created_at', { ascending: false }).limit(100)); render(); }); if (d.v === 'rot') busy(async () => { await loadRot(); render(); }); if (d.v === 'transfer') busy(listingsLoad); if (d.v === 'franchise') busy(frLoad); if (d.v === 'board') busy(async () => { S.board = await q(sb.rpc('job_board')); render(); }); if (d.v === 'notice') busy(async () => { S.notices = await q(sb.from('notices').select('*').order('created_at', { ascending: false }).limit(30)); try { localStorage.setItem('ev-notice', S.notices[0]?.id || '') } catch { } render(); }); if (d.v === 'edu') busy(loadEdu); if (d.v === 'inq') busy(async () => { S.inq = await q(sb.from('inquiries').select('*').eq('from_user', S.user.id).order('created_at', { ascending: false })); render(); }); }
  if (a === 'mon') busy(async () => { S.m += +d.v; if (S.m > 12) { S.m = 1; S.y++; } if (S.m < 1) { S.m = 12; S.y--; } await reload(); });
  if (a === 'stab') { S.staffTab = d.v; render(); }
  if (a === 'empf') { S.empF = d.v; render(); }
  if (a === 'sview') { S.schedView = d.v; S.clip = null; render(); }
  if (a === 'day-open') { S.tab = 'sched'; S.schedView = 'day'; S.schedDay = d.d; S.clip = null; closeSheet(); render(); scrollTo(0, 0); }
  if (a === 'day-go') { S.schedDay = addDay(S.schedDay || TODAY, +d.v); render(); }
  if (a === 'holiday' && KR_HOL.has(d.d)) return toast('법정 공휴일이라 자동으로 들어가 있어요');
  if (a === 'holiday') busy(async () => { const on = !isHoliday(d.d); await q(sb.rpc('set_holiday', { p_store: S.store.id, p_date: d.d, p_on: on })); S.store.holidays = on ? [...(S.store.holidays || []), d.d] : S.store.holidays.filter(x => x !== d.d); render(); toast(on ? '공휴일로 지정했어요. 적정 인원이 공휴일 기준으로 바뀌어요' : '공휴일을 풀었어요'); });
  if (a === 'clip-end') { S.clip = null; render(); }
  if (a === 'sel-off') { selOff(); return; }
  if (a === 'paste-here') { if (S.clip && S.selCell) pasteTo(S.selCell); return; }
  if (a === 'chip') { const multi = e.shiftKey || e.ctrlKey || e.metaKey, has = selHas(d.m, d.d); if (multi) S.sels = has ? S.sels.filter(x => !(x.m === d.m && x.d === d.d)) : [...(S.sels || []), { m: d.m, d: d.d }]; else if (has && S.sels.length === 1) return; else S.sels = [{ m: d.m, d: d.d }]; S.selCell = d.d; render(); return; }
  if (a === 'cellsel') { if (e.target.closest('.dn, .chip')) return; S.selCell = d.d; S.sels = []; render(); return; }
  if (a === 'unsel') { S.sels = []; S.selCell = null; render(); return; }
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
  if (a === 'pay-copy') { const t = S.members.filter(p => p.role !== 'owner').map(p => { const r = payOf(p); return `${p.bank_holder || p.real_name || p.nick}\t${p.bank_name || '-'}\t${p.bank_acct || '-'}\t${r.net}`; }).join('\n'); navigator.clipboard?.writeText(t).then(() => toast('예금주·은행·계좌·금액을 복사했어요. 은행 앱 대량이체에 붙여넣으세요'), () => toast('복사가 막혀 있어요')); }
  if (a === 'copy') { navigator.clipboard?.writeText(d.v).then(() => toast('복사했어요'), () => toast(d.v)); }
  if (a === 'exp-del') busy(async () => { await q(sb.from('expenses').delete().eq('id', d.id)); closeSheet(); await reload(); toast('삭제했어요'); });
  if (a === 'exp-new') openSheet(`<h2>고지서·기타 비용</h2><form class="f" id="expense-form"><div class="grid2"><label class="fl">항목<select name="cat">${Object.entries(CAT).filter(([k]) => k !== 'card').map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label class="fl">금액 (원)<input name="amount" type="number" inputmode="numeric" required></label></div><label class="fl">날짜<input type="date" name="date" value="${TODAY}"></label><button class="btn pri full">추가</button></form>`);
  if (a === 'exp-list') openSheet(`<h2>${S.m}월 비용 내역</h2>${S.expenses.map(x => `<div class="li"><div><b>${CAT[x.category] || x.category}</b><small>${x.spent_on} · ${x.source === 'close' ? '마감 때 쓴 현금' : '직접 입력'}</small></div><span class="row"><span class="num">₩${E.won(x.amount)}</span><button class="btn sm" data-act="exp-del" data-id="${x.id}">삭제</button></span></div>`).join('') || '<div class="empty">비용 기록이 없어요</div>'}`);
  if (a === 'pos') openSheet(`<h2>포스기 연동</h2><p class="mut">매장에서 쓰는 포스기를 골라주세요. 운영사가 연동을 준비해서 알려드려요.</p><form class="f" id="pos-form"><div class="seg brk" style="flex-wrap:wrap">${[...POS, '기타'].map((p, i) => `<label style="flex:1 1 30%"><input type="radio" name="pos" value="${p}" ${i ? '' : 'checked'}><span>${p}</span></label>`).join('')}</div><label class="fl">기타면 이름<input name="etc" placeholder="예: 포스 회사 이름"></label><button class="btn pri full">연동 신청</button></form>`);
  if (a === 'csv') {
    const rows = [['이름', '실명', '직책', '계약', '시급', '근무일', '근무시간', '기본급', '야간수당', '연장수당', '주휴수당', '인센티브', '지급총액', '공제', '실지급', '은행', '계좌번호', '예금주']];
    S.members.filter(p => p.role !== 'owner').forEach(p => { const r = payOf(p); rows.push([p.nick, p.real_name, p.job_role, p.contract, p.hourly_rate, r.days, r.hours.toFixed(1), r.base, r.np, r.otp, r.juhu, r.inc, r.gross, r.ded, r.net, p.bank_name, p.bank_acct, p.bank_holder]); });
    download(`급여대장_${S.store.name}_${S.y}-${E.pad(S.m)}.csv`, rows);
  }
  if (a === 'hq-csv') download(`데이터자산_${S.y}-${E.pad(S.m)}.csv`, [['회사', '브랜드', '매장', '지역', '사업자확인', '요금제', '매출', '보고일', '지출', '직원'], ...(S.stats || []).map(x => [x.company, x.brand, x.store, x.area, x.verified ? 'O' : 'X', x.plan, x.sales, x.days, x.expenses, x.staff])]);
  if (a === 'pkind') { S.postKind = d.v; render(); }
  if (a === 'manage') busy(() => manage(d.p, d.k));
  if (a === 'hire') busy(async () => { await q(sb.rpc('hire', { p_app: d.a })); track('job_matched'); toast('채용했어요! 연락처가 열렸어요'); await manage(d.p, d.k); });
  if (a === 'cancel-hire') busy(async () => { if (!confirm('채용을 취소할까요? 딜러에게 지원권을 돌려드려요.')) return; await q(sb.rpc('cancel_hire', { p_app: d.a })); toast('채용을 취소했어요'); await manage(d.p, d.k); });
  if (a === 'contact') busy(async () => { const ph = await q(sb.rpc('get_contact', { p_app: d.a })); b.outerHTML = `<a class="btn sm pri" href="tel:${esc(ph)}">${esc(ph || '번호 없음')}</a>`; });
  if (a === 'slot') busy(async () => { if (d.v === 'dispute' && !confirm('문제를 신고할까요? 자동 지급이 멈추고 운영사가 확인해요.')) return; await q(sb.rpc('slot_act', { p_slot: d.s, p_act: d.v })); toast({ start: '출근을 확인했어요', noshow: '다시 모집해요', extra: '1시간 연장했어요', ok: '확인했어요. 딜러에게 지급돼요', dispute: '운영사에 신고했어요' }[d.v]); const mb = b.closest('.job')?.querySelector('[data-act=manage]'); if (mb) await manage(mb.dataset.p, mb.dataset.k); });
  if (a === 'dslot') busy(async () => { await q(sb.rpc('slot_act', { p_slot: d.s, p_act: 'done' })); toast('근무 완료를 알렸어요. 수고하셨어요!'); await reload(); });
  if (a === 'apply') busy(async () => { if (S.tickets < 1) return toast('지원권이 없어요'); track('job_applied'); await q(sb.rpc('apply_job', { p_post: d.p })); toast('지원했어요! 매장이 채용하면 알림이 와요'); await reload(); });
  if (a === 'uf') { S.uf = { ...(S.uf || { c: '전체', r: '전체', st: '판매중', sort: 'new', min: '', max: '' }), [d.k]: d.v }; render(); return; }
  if (a === 'upcover') { S.upCover = +d.v; document.querySelectorAll('.upv button').forEach((x, i) => { x.classList.toggle('on', i === S.upCover); x.querySelector('i')?.remove(); if (i === S.upCover) x.insertAdjacentHTML('beforeend', '<i>대표</i>'); }); return; }
  if (a === 'used-st') busy(async () => { await q(sb.from('used_items').update({ status: d.s }).eq('id', d.v)); const u = S.used.find(x => x.id === d.v); u.status = d.s; if (d.s === '판매완료') u.boost = null; usedSheet(d.v); render(); toast(`${d.s}(으)로 바꿨어요`); });
  if (a === 'used-boost') busy(() => pay('used_boost', { item: d.v, type: d.t }));
  if (a === 'jf') { S.jf = { ...(S.jf || { k: '전체', r: '전체', a: '전체' }), [d.k]: d.v }; render(); }
  if (a === 'used-new') { S.usedNew = !S.usedNew; S.upFiles = []; S.upCover = 0; render(); }
  if (a === 'used-open') usedSheet(d.v);
  if (a === 'used-del') busy(async () => { await q(sb.from('used_items').delete().eq('id', d.v)); S.used = S.used.filter(x => x.id !== d.v); closeSheet(); render(); toast('글을 내렸어요'); });
  if (a === 'used-ask') busy(async () => { const u = S.used.find(x => x.id === d.v); await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store?.id || null, body: `[중고 연락] ${u.title} (₩${E.won(u.price)}) — 판매자와 연결 부탁드려요` })); closeSheet(); toast('운영사에 연결을 요청했어요'); });
  if (a === 'trtab') { S.trTab = d.v; render(); }
  if (a === 'listing-open') listingSheet(d.v);
  if (a === 'listing-ask') busy(async () => { const l = S.listings.find(x => x.id === d.v); await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store?.id || null, body: `[양수 상담] ${l.headline} (${l.area}, 권리금 ₩${E.won(l.premium)})` })); closeSheet(); toast('상담을 신청했어요. 운영사가 연락드려요'); });
  if (a === 'sell-pick') { S.sellA = [...(S.sellA || []), d.v]; render(); return; }
  if (a === 'sell-save') busy(async () => { await q(sb.from('transfer_leads').insert({ company_id: S.company.id, store_id: S.store.id, answers: S.sellA })); S.sellSaved = true; render(); toast('상담을 신청했어요. 담당자가 연락드려요'); });
  if (a === 'pick') { S.pick = S.pick === d.m ? null : d.m; render(); }
  if (a === 'drop' && S.pick) { const mid = S.pick; S.pick = null; rotMove(mid, d.v); render(); busy(saveRot); }
  if (a === 'rot-auto') { const n = rotAuto(); render(); busy(saveRot); toast(n ? `${n}명 교대했어요` : '휴식을 마친 사람이 없어요'); }
  if (a === 'lay-edit') { S.editLayout = true; S.selItem = null; render(); }
  if (a === 'item') { S.selItem = S.selItem === d.v ? null : d.v; render(); }
  if (a === 'cell' && S.selItem) { const [x, y] = d.v.split(',').map(Number), it = S.layout.find(i => i.id === S.selItem); if (it.x !== undefined && S.layout.every(o => o === it || o.y !== y || o.x + o.w <= x || x + it.w <= o.x) && x + it.w <= 8) { it.x = x; it.y = y; S.selItem = null; } else toast('들어갈 자리가 없어요'); render(); }
  if (a === 'lay-add') { const fx = d.v, w = fx && fx !== 'bar' ? 1 : 2, ids = S.layout.filter(i => /^T\d+$/.test(i.id)).map(i => +i.id.slice(1)), id = fx ? fx.toUpperCase() + Date.now().toString(36).slice(-4) : 'T' + ((ids.length ? Math.max(...ids) : 0) + 1), rows = Math.max(...S.layout.map(i => i.y)) + 2; let spot = null;
    for (let y = 0; y < rows && !spot; y++) for (let x = 0; x <= 8 - w && !spot; x += 1) if (S.layout.every(o => o.y !== y || o.x + o.w <= x || x + w <= o.x)) spot = { x, y };
    S.layout.push({ id, w, ...(fx ? { fx } : {}), ...spot }); S.selItem = id; render(); }
  if (a === 'lay-del') { if (!S.selItem || S.selItem === 'C') return toast('지울 칸을 먼저 누르세요'); const R = rotState(); if (R.t[S.selItem]) rotMove(R.t[S.selItem].m, 'BREAK'); S.layout = S.layout.filter(i => i.id !== S.selItem); S.selItem = null; render(); }
  if (a === 'lay-save') busy(async () => { await q(sb.rpc('set_layout', { p_store: S.store.id, p_layout: S.layout })); S.store.layout = S.layout; S.editLayout = false; S.selItem = null; await saveRot(); render(); toast('배치를 저장했어요'); });
  if (a === 'stk') busy(async () => { const id = +d.i, row = S.stock.find(s => s.item_id === id) || { store_id: S.store.id, item_id: id, qty: 0, min: 2, use_per_day: .3 }, k = d.f;
    row[k] = Math.max(0, Math.round(+row[k] || 0) + +d.d); await q(sb.from('stock').upsert({ store_id: S.store.id, item_id: id, qty: Math.round(row.qty), min: Math.round(row.min), use_per_day: row.use_per_day ?? .3 })); if (!S.stock.includes(row)) S.stock.push(row); render(); });
  if (a === 'cart') { const n = +(d.n || 1); S.cart[d.v] = Math.max(0, (S.cart[d.v] || 0) + n); if (!S.cart[d.v]) delete S.cart[d.v]; if (S.tab === 'more' && S.sub === 'order') render(); else toast(`${item(d.v).n} ${n}개 담았어요 · 매출 › 재고·발주 → 발주`); }
  if (a === 'restock-all') { S.stock.filter(s => s.qty < s.min).forEach(s => S.cart[s.item_id] = (S.cart[s.item_id] || 0) + restockQty(s)); S.tab = 'more'; S.sub = 'order'; render(); scrollTo(0, 0); }
  if (a === 'scat') { S.shopCat = d.v; render(); }
  if (a === 'hq-prod') hqProdSheet(d.v);
  if (a === 'dmet') { S.dmet = d.v; render(); }
  if (a === 'day-rep') { const r = S.hist.find(x => x.report_date === d.d), [, mm, dd] = d.d.split('-').map(Number); openSheet(`<h2>${mm}월 ${dd}일 마감</h2>${[['총매출', '₩' + E.won(r.sales)], ['엔트리', (r.entries ?? '-') + '명'], ['카드', '₩' + E.won(r.card)], ['현금', '₩' + E.won(r.cash)], ['계좌이체', '₩' + E.won(r.transfer)], ['현금으로 쓴 돈', '₩' + E.won(r.expense)], ['금고 차액', r.cash_diff == null ? '안 셈' : r.cash_diff ? (r.cash_diff > 0 ? '+' : '−') + '₩' + E.won(Math.abs(r.cash_diff)) : '딱 맞음']].map(([k, v]) => `<div class="li"><span class="mut">${k}</span><b class="num">${v}</b></div>`).join('')}${r.memo ? `<p>${esc(r.memo)}</p>` : ''}`); }
  if (a === 'open-edit') { S.open = null; render(); }
  if (a === 'prod') { const p = item(d.v); openSheet(`<div class="udetail">${p.img ? `<img src="${esc(p.img)}" alt="">` : `<div class="ph big">${SHOP_ICON[p.c] || ''}<small>사진 준비 중</small></div>`}</div><small class="mut">${SHOP_CAT[p.c]} · ${esc(p.u)}</small><h2 style="margin:4px 0">${esc(p.n)}</h2><div><s class="mut num">₩${E.won(p.p)}</s> <b class="num up" style="font-size:22px">₩${E.won(p.sp)}</b> <span class="pill g">${Math.round((1 - p.sp / p.p) * 100)}% 할인</span></div>${p.body ? `<p>${esc(p.body)}</p>` : ''}<button class="btn pri full" data-act="cart" data-v="${p.id}">주문서에 담기${S.cart[p.id] ? ` (지금 ${S.cart[p.id]}개)` : ''}</button>`); }
  if (a === 'order') busy(async () => { const items = Object.entries(S.cart).map(([id, n]) => ({ id: +id, q: n, price: item(id).sp, alc: item(id).c === 'alc' })), total = items.filter(i => !i.alc).reduce((x, i) => x + i.price * i.q, 0);
    await q(sb.from('orders').insert({ store_id: S.store.id, items, total, tax_invoice: $('#tax-inv')?.checked !== false })); S.cart = {}; await reload(); toast('주문했어요. 도착 예정일은 아래 주문 기록에서 볼 수 있어요'); });
  if (a === 'ostat') busy(async () => { await q(sb.from('orders').update({ status: d.v }).eq('id', d.o)); await reload(); toast(`${d.v}(으)로 바꿨어요`); });
  if (a === 'plan' && d.v === 'pro') return pay('plan', { plan: 'pro' });
  if (a === 'ai-draft') { track('ai_schedule_click'); return toast('준비 중이에요. 신청이 많은 매장부터 먼저 열어드릴게요'); } // ponytail: fake door — 클릭 수요 확인 후 개발
  if (a === 'withdraw') busy(async () => { const n = await q(sb.rpc('withdraw', { p_instant: d.v === '1' })); await reload(); toast(d.v === '1' ? `₩${E.won(n)} 번개 출금을 요청했어요` : `₩${E.won(n)} 출금을 요청했어요. 다음 영업일에 들어가요`); });
  if (a === 'tickets') busy(() => pay('tickets', { pack: +d.v }));
  if (a === 'pro') busy(() => pay('pro'));
  if (a === 'wd-done') busy(async () => { await q(sb.from('withdrawals').update({ status: '송금 완료' }).eq('id', d.v)); await reload(); toast('송금 완료로 바꿨어요'); });
  if (a === 'pay-go') busy(async () => { const o = S.payOrder; if (!o) return; closeSheet(); await payGo(o, d.v); });
  if (a === 'tax-csv') { const C = Object.fromEntries((S.companies || []).map(c => [c.id, c])); download('세금계산서_발행대상.csv', [['결제일', '상호', '사업자번호', '품목', '공급가액', '부가세', '합계'], ...(S.hqPays || []).filter(x => x.status === 'done' && x.tax_invoice).map(x => [x.approved_at?.slice(0, 10), C[x.company_id]?.name || '', C[x.company_id]?.biz_no || '', x.order_name, Math.round(x.amount / 1.1), x.amount - Math.round(x.amount / 1.1), x.amount])]); return; }
  if (a === 'exam-view') { S.examOpen = !S.examOpen; render(); return; }
  if (a === 'exam-edit') { S.examDraft = null; examSheet(); return; }
  if (a === 'exam-add') { examKeep(); S.examDraft.push({ q: '', type: 'mc', o: ['', '', '', ''], a: 0 }); examSheet(); return; }
  if (a === 'exam-opt') { examKeep(); const x = S.examDraft[+d.v]; if (+d.d > 0 && x.o.length < 6) x.o.push(''); if (+d.d < 0 && x.o.length > 2) { x.o.pop(); if (x.a >= x.o.length) x.a = 0; } examSheet(); return; }
  if (a === 'exam-del') { examKeep(); S.examDraft.splice(+d.v, 1); examSheet(); return; }
  if (a === 'exam-reset') busy(async () => { await q(sb.from('company_quiz').delete().eq('company_id', S.company.id)); S.cquiz = null; render(); toast('+EV 기본 시험으로 되돌렸어요'); });
  if (a === 'ndraft') { S.noticeDraft = NOTICE_DRAFTS[+d.v]; render(); return; }
  if (a === 'fr-perm') busy(async () => { await q(sb.rpc('set_franchise_perm', { p_user: d.u, p_on: d.v === 'true' })); await reload(); toast(d.v === 'true' ? '가맹본사 권한을 줬어요' : '권한을 회수했어요'); });
  if (a === 'fr-contact') busy(async () => { await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store?.id || null, body: `[가맹 공고 문의] 가맹 모집 공고 등록 방법과 금액 안내 부탁드려요 (${S.company?.name || ''})` })); toast('운영사에 문의를 남겼어요. 답변이 오면 알림으로 알려드려요'); });
  if (a === 'fr-open') { frSheet(d.v); return; }
  if (a === 'fr-lead') busy(() => frLeadSheet(d.v));
  if (a === 'fr-bill') busy(() => pay('fr_bill', { order: d.v }));
  if (a === 'fr-dispute') { const note = prompt('어떤 문제였나요? (예: 광고 전화, 잘못 걸린 전화, 같은 사람 반복)'); if (!note) return; busy(async () => { await q(sb.rpc('fr_dispute', { p_lead: d.v, p_note: note })); closeSheet(); toast('이의제기를 보냈어요. 운영사가 확인하면 알려드려요'); }); return; }
  if (a === 'fr-resolve') busy(async () => { await q(sb.rpc('fr_resolve', { p_lead: d.v, p_valid: d.ok === 'true', p_reason: d.ok === 'true' ? null : (d.r || '운영사 확인 · 무효') })); await reload(); toast(d.ok === 'true' ? '유효로 확정했어요' : '무효 처리하고 비용을 뺐어요'); });
  if (a === 'fr-track') busy(async () => { const v = prompt('추적 전화번호 (예: 0507-1234-5678)'); if (v == null) return; await q(sb.from('franchise_postings').update({ tracking_number: v.trim() || null }).eq('id', d.v)); await reload(); toast('추적번호를 저장했어요'); });
  if (a === 'fr-logcall') busy(async () => { const f = $('#fr-call-form'), v = formVals(f); const r = await q(sb.rpc('fr_log_call_hq', { p_tracking: v.tracking, p_caller: v.caller, p_connected_at: new Date(v.at).toISOString(), p_seconds: +v.seconds || 0 })); await reload(); toast(`기록했어요 · ${{ qualified: `유효 리드 ₩${E.won(PRICING.franchise.qualifiedLead)}`, short: '30초 미만 · 과금 없음', duplicate: '30일 내 재통화 · 과금 없음', limit: '한도 초과 · 과금 없음' }[r.status] || r.status}`); });
  if (a === 'fr-new') { frForm(); return; }
  if (a === 'fr-edit') { frForm((S.frMine || []).find(x => x.id === d.v) || {}); return; }
  if (a === 'fr-pay') busy(() => pay('franchise', { post: d.v }));
  if (a === 'fr-call') { sb.rpc('fr_hit', { p_post: d.v, p_kind: 'click' }).then(() => { }); return; }
  if (a === 'fr-ask') busy(async () => { await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store?.id || null, body: `[가맹 상담] ${(S.frList || []).find(x => x.id === d.v)?.brand || ''} 전화 상담 연결 부탁드려요` })); closeSheet(); toast('운영사에 연결을 요청했어요'); });
  if (a === 'feep') { S.feeP = +d.v; render(); return; }
  if (a === 'paypost') busy(() => pay('post', { post: d.p }));
  if (a === 'refund') busy(async () => { const { data, error } = await sb.functions.invoke('pay-refund', { body: { orderId: d.o } }); if (error || !data?.ok) return toast(data?.message || '환불에 실패했어요'); await reload(); toast(`₩${E.won(data.refunded)} 환불했어요`); });
  if (a === 'hires') { S.hires = Math.max(1, (S.hires ?? 3) + +d.v); render(); }
  if (a === 'academy-buy') busy(() => pay('academy'));
  if (a === 'ask-owner') busy(async () => { await q(sb.rpc('ask_owner', { p_store: S.store.id, p_what: d.v })); toast('대표님께 요청했어요'); });
  if (a === 'interest') busy(async () => { const i = +d.v; if ((S.interest || []).includes(i)) await q(sb.from('course_interest').delete().eq('course', i)); else await q(sb.from('course_interest').insert({ course: i })); await loadEdu(); });
  if (a === 'lesson') busy(async () => { await q(sb.rpc('lesson_done', { p_lesson: +d.v })); S.lessons = await q(sb.from('lesson_progress').select('lesson')); S.openLesson = +d.v < 5 ? +d.v : null; render(); toast(S.lessons.length >= 5 ? '강의를 다 들었어요! 이제 시험을 볼 수 있어요' : '다음 강의로 넘어가요'); });
  if (a === 'quiz-start') { S.quizOn = true; render(); }
  if (a === 'quest') busy(async () => { const k = d.k, mon = thisMonth(), on = S.quests.some(x => x.month === mon && x.key === k);
    if (on) await q(sb.from('store_quests').delete().eq('store_id', S.store.id).eq('month', mon).eq('key', k)); else await q(sb.from('store_quests').insert({ store_id: S.store.id, month: mon, key: k }));
    S.quests = await q(sb.from('store_quests').select('*').eq('store_id', S.store.id)); render(); toast(on ? '체크를 풀었어요' : '잘했어요! 다음 달 숫자로 효과를 확인해 드려요'); });
  if (a === 'goal') { const gy = +d.y || S.y, gm = +d.m || S.m; openSheet(`<h2>${gy}년 ${gm}월 목표 매출</h2><form class="f" id="goal-form" data-mon="${monKey(gy, gm)}"><label class="fl">목표 (원)<input name="goal" type="number" min="0" required value="${goalOf(gy, gm) || goalSuggest()?.v || ''}"></label>${goalSuggest() ? `<p class="note">추천: ₩${E.won(goalSuggest().v)} (${goalSuggest().from}보다 8% 높게)</p>` : ''}<button class="btn pri full">저장</button></form>`); }
  if (a === 'goal-set') busy(async () => { await q(sb.from('store_goals').upsert({ store_id: S.store.id, month: monKey(S.y, S.m), goal: +d.v })); await reload(); toast('목표를 정했어요'); });
  if (a === 'fixed') { const y = +d.y || S.y, m = +d.m || S.m, fx = fixedFor(y, m).fx; openSheet(`<h2>${y}년 ${m}월 고정비</h2><form class="f" id="fixed-form" data-mon="${E.ymd(y, m, 1)}">${FIXED.map(([k, n]) => `<label class="fl">${n} (원)<input name="${k}" type="number" min="0" value="${+fx[k] || ''}"></label>`).join('')}<p class="note">저장하면 ${m}월부터 다음에 바꿀 때까지 매달 이 금액으로 계산돼요.</p><button class="btn pri full">저장</button></form>`); }
  if (a === 'fixed-year') fixedYearSheet(+d.v || S.y);
  if (a === 'partner') busy(async () => { await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store.id, body: `[${d.v}] 견적 요청 — ${S.store.name} (${S.store.pyeong || '?'}평). 연락 부탁드려요.` })); toast(`${d.v} 견적을 요청했어요. 운영사가 연락드려요`); });
  if (a === 'ask-pro') toast('요금제는 대표님 앱의 매장 설정에서 바꿀 수 있어요');
  if (a === 'verify') busy(async () => { await q(sb.rpc('hq_verify', { p_company: d.c })); await reload(); toast('사업자 확인을 완료했어요'); });
});
document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-act=pick]'); if (c) S.pick = c.dataset.m; });
document.addEventListener('dragover', e => { if (e.target.closest?.('[data-act=drop]')) e.preventDefault(); });
document.addEventListener('drop', e => { const z = e.target.closest?.('[data-act=drop]'); if (z && S.pick) { e.preventDefault(); const mid = S.pick; S.pick = null; rotMove(mid, z.dataset.v); render(); busy(saveRot); } });
function download(name, rows) {
  const blob = new Blob(['﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')], { type: 'text/csv' });
  const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = name; l.click();
}
document.addEventListener('input', e => { const pe = e.target.closest('.pedit'); if (pe) xfeeBox(pe); if (e.target.closest('#post-form')) feeBox(); if (e.target.closest('#report-form')) closeCalc(); });
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d?.act === 'push') { pushToggle(t.checked).catch(err => { toast(err.message || '알림을 켤 수 없어요'); t.checked = !t.checked; }); return; }
  if (t.classList?.contains('qtype')) { examKeep(); S.examDraft[+t.name.slice(1)].type = t.value; if (t.value === 'mc' && !S.examDraft[+t.name.slice(1)].o.length) { S.examDraft[+t.name.slice(1)].o = ['', '', '', '']; S.examDraft[+t.name.slice(1)].a = 0; } examSheet(); return; }
  if (t.dataset?.uf) { S.uf = { ...(S.uf || { c: '전체', r: '전체', st: '판매중', sort: 'new', min: '', max: '' }), [t.dataset.uf]: t.value }; render(); return; }
  if (t.name === 'photos' && t.files?.length) { const fs = [...(S.upFiles || []), ...[...t.files].map(f => ({ f, url: URL.createObjectURL(f) }))]; if (fs.length > 10) toast('사진은 10장까지예요. 앞의 10장만 올려요'); const keep = formVals(t.form); S.upFiles = fs.slice(0, 10); render(); const nf = $('#used-form'); if (nf) Object.entries(keep).forEach(([k, v]) => { const el = nf.elements[k]; if (el && el.type !== 'checkbox' && el.type !== 'file') el.value = v; }); return; }
  if ((t.name === 'logo' || t.name === 'image') && t.files?.[0]) { const pv = $(t.name === 'logo' ? '#fr-logo-prev' : '#fr-img-prev'); if (pv) pv.innerHTML = `<img src="${URL.createObjectURL(t.files[0])}" alt="">`; return; }
  if (t.name === 'photo' && t.files?.[0]) { const pv = $('#photo-prev'); if (pv) pv.innerHTML = `<img src="${URL.createObjectURL(t.files[0])}" alt=""><small>다시 누르면 바꿔요</small>`; }
  if (t.closest('#post-form')) feeBox();
  if (t.id === 'store-sel') busy(async () => { S.store = S.stores.find(s => s.id === t.value); await loadStore(); render(); });
  if (d.rot) { const R = rotState(); R[d.rot] = Math.max(5, +t.value || 5); render(); busy(saveRot); }
  if (d.stock || d.stockmin) busy(async () => { const id = +(d.stock || d.stockmin), row = S.stock.find(s => s.item_id === id), patch = d.stock ? { qty: +t.value || 0 } : { min: +t.value || 0 }; Object.assign(row, patch); await q(sb.from('stock').update(patch).eq('store_id', S.store.id).eq('item_id', id)); render(); });
  if (t.id === 'tax-inv') S.taxInv = t.checked;
  if (d.need !== undefined) busy(async () => { const need = [...(S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2])]; if (need.length < 8) need[7] = need[6]; need[+d.need] = +t.value || 0; await q(sb.rpc('set_need', { p_store: S.store.id, p_need: need })); S.store.need_by_wd = need; render(); });
  if (d.inc) busy(async () => { const month = E.ymd(S.y, S.m, 1); await q(sb.from('incentives').delete().eq('member_id', d.inc).eq('month', month)); if (+t.value) await q(sb.from('incentives').insert({ member_id: d.inc, month, amount: +t.value, reason: '' })); await reload(); toast('인센티브를 반영했어요'); });
});
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target, v = formVals(f), id = f.id;
  busy(async () => {
    if (id === 'auth-form') {
      if (S.authMode === 'signup') { const { data, error } = await sb.auth.signUp({ email: v.email, password: v.pw, options: { data: { name: v.name }, emailRedirectTo: location.origin + location.pathname } }); if (error) return toast(error.message.includes('registered') ? '이미 가입된 이메일이에요. 로그인해 주세요' : error.message); if (!data.session) toast('확인 메일을 보냈어요. 메일의 버튼을 눌러주세요'); }
      else { const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.pw }); if (error) toast(error.message.includes('Invalid') ? '이메일이나 비밀번호가 달라요' : error.message); }
    }
    if (id === 'owner-form') { if (!bizOk(v.biz)) return toast('사업자등록번호가 맞지 않아요. 사업자등록증의 10자리를 다시 확인해 주세요'); await q(sb.rpc('create_company', { p_name: v.name, p_brand: v.brand || null, p_biz_no: v.biz, p_store: v.store, p_area: v.area || null, p_nick: v.nick })); track('store_created'); await q(sb.from('profiles').update({ name: v.nick }).eq('id', S.user.id)); toast('매장을 만들었어요! 사업자번호도 바로 확인됐어요'); await boot(); }
    if (id === 'dealer-form') { await q(sb.rpc('start_dealer', { p_name: v.name, p_phone: v.phone, p_career: +v.career || 0, p_bio: v.bio || '' })); if (S.mode !== 'onboard') await q(sb.from('profiles').update({ area: v.area || null, games: v.games || null, open_to_sub: !!f.open_to_sub?.checked }).eq('id', S.user.id)); if (S.mode === 'onboard') track('dealer_signup'); toast(S.mode === 'onboard' ? '환영해요! 지원권 3장을 드렸어요' : '저장했어요'); await boot(); }
    if (id === 'join-code-form') { const name = await q(sb.rpc('request_join', { p_code: v.code })); toast(`${name}에 소속 신청했어요. 승인되면 알림이 와요`); f.reset(); }
    if (id === 'join-form') { await q(sb.rpc('approve_join', { p_req: f.dataset.r, p_member: v.member || null, p_rate: +v.rate || 0, p_role: v.role, p_contract: v.contract })); closeSheet(); await reload(); toast('승인했어요. 이제 직원 앱에서 스케줄·급여가 보여요'); }
    if (id === 'shift-form') {
      const m = f.dataset.m || v.member, brk = +v.brk || 0, row = { start_t: v.s, end_t: v.e, break_min: brk };
      if (!m) return toast('추가할 직원이 없어요');
      if (f.dataset.d) { await q(sb.from('shift_overrides').upsert({ member_id: m, work_date: f.dataset.d, off: false, ...row })); if (v.rep) { const [y, mo, dd] = f.dataset.d.split('-').map(Number); await q(sb.from('shift_templates').upsert({ member_id: m, weekday: E.wdOf(y, mo, dd), ...row })); } }
      else await q(sb.from('shift_templates').upsert({ member_id: m, weekday: +f.dataset.w, ...row }));
      track('schedule_created'); closeSheet(); await reload(); toast('스케줄을 저장했어요. 급여에 바로 반영돼요');
    }
    if (id === 'hq-prod-form') { const pid = +f.dataset.id, file = f.photo?.files?.[0], cur = item(pid); let image_url = cur?.img || null;
      if (file) { const path = `${pid}/${Date.now()}.jpg`; await q(sb.storage.from('products').upload(path, await shrink(file), { contentType: 'image/jpeg' })); image_url = sb.storage.from('products').getPublicUrl(path).data.publicUrl; }
      await q(sb.from('products').upsert({ id: pid, cat: v.cat, name: v.name, unit: v.unit, price: +v.price || 0, sale_price: +v.sale || 0, body: v.body || null, image_url, active: !!v.active, sort: cur?.sort ?? pid }));
      await loadProducts(); closeSheet(); render(); toast('상품을 저장했어요. 매장 발주 화면에 바로 반영돼요'); }
    if (id === 'open-form') { await q(sb.from('day_opens').upsert({ store_id: S.store.id, day: TODAY, start_cash: +v.start_cash || 0 })); S.lastStart = +v.start_cash || 0; await reload(); toast('오픈했어요. 오늘도 좋은 하루 되세요'); }
    if (id === 'report-form') {
      await q(sb.from('daily_reports').upsert({ store_id: S.store.id, report_date: v.date, sales: +v.sales || 0, entries: +v.entries || null, card: +v.card || 0, cash: +f.dataset.cash || 0, transfer: +v.transfer || 0, expense: +v.expense || 0, cash_diff: f.dataset.diff === '' || f.dataset.diff == null ? null : +f.dataset.diff, memo: v.memo || null, reported_by: S.user.id }));
      await q(sb.from('expenses').delete().eq('store_id', S.store.id).eq('spent_on', v.date).eq('source', 'close'));
      if (+v.expense) await q(sb.from('expenses').insert({ store_id: S.store.id, spent_on: v.date, category: 'goods', amount: +v.expense, source: 'close' }));
      S.lastStart = +v.start || S.lastStart; track('sales_entry'); await reload(); const M = monthSummary(S.y, S.m), g = goalOf(S.y, S.m);
      toast(Math.abs(+f.dataset.diff || 0) >= 10000 ? '마감했어요. 금고 차액을 대표님께 알렸어요' : g ? `마감했어요. 이번 달 목표 ${Math.floor(M.sales / g * 100)}% 달성 (₩${man(M.sales)} / ₩${man(g)})` : '마감을 저장했어요. 수고하셨어요');
    }
    if (id === 'quiz-form') { const r = await q(sb.rpc('submit_quiz', { p_answers: quizList().map((x, i) => x.type === 'sa' ? String(v['q' + i] || '').trim() : +v['q' + i]) })); S.quizRes = r; S.quizOn = false; render(); scrollTo(0, 0); toast(r.passed ? `합격! ${r.score}/${r.total} · 대표님께 결과가 갔어요` : `${r.score}/${r.total} · ${passN(r.total)}개 이상이면 합격이에요. 다시 도전해요`); }
    if (id === 'cquiz-form') { examKeep(); const items = []; for (const [i, x] of S.examDraft.entries()) { const qq = (x.q || '').trim(); if (!qq) continue; if (x.type === 'sa') { if (!(x.a || '').trim()) return toast(`${i + 1}번 정답을 적어주세요`); items.push({ q: qq, type: 'sa', o: [], a: x.a.trim() }); } else { const o = x.o.map(z => (z || '').trim()); if (o.length < 2 || o.some(z => !z)) return toast(`${i + 1}번 보기 ${o.length}개를 모두 채워주세요`); items.push({ q: qq, type: 'mc', o, a: Math.min(x.a, o.length - 1) }); } }
      if (items.length < 3) return toast('문제는 3개 이상 넣어주세요'); await q(sb.from('company_quiz').upsert({ company_id: S.company.id, items, updated_at: new Date().toISOString() })); S.cquiz = items; closeSheet(); render(); return toast(`우리 매장 시험 ${items.length}문제를 저장했어요. 다음 시험부터 이걸로 나가요`); }
    if (id === 'bank-form') { await q(sb.from('profiles').update({ bank_name: v.bank || null, bank_acct: (v.acct || '').replace(/[^0-9-]/g, '') || null, bank_holder: v.holder || null }).eq('id', S.user.id)); S.prof = await q(sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle()); render(); toast('계좌를 저장했어요'); }
    if (id === 'pos-form') { const n = v.pos === '기타' ? (v.etc || '기타') : v.pos; await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store.id, body: `[포스 연동] ${n} — ${S.store.name}` })); S.posAsk = n; closeSheet(); render(); toast(`${n} 연동을 신청했어요`); }
    if (id === 'expense-form') { await q(sb.from('expenses').insert({ store_id: S.store.id, category: v.cat, amount: +v.amount, spent_on: v.date || TODAY, source: 'bill' })); closeSheet(); await reload(); toast('비용을 추가했어요'); }
    if (id === 'staff-form') {
      const row = { nick: v.nick, real_name: v.real_name || null, job_role: v.job_role, contract: v.contract, hourly_rate: +v.rate || 0, joined_on: v.joined || null, night_pay: !!v.night, labor_law: !!v.law, bank_name: v.bank || null, bank_acct: (v.acct || '').replace(/[^0-9-]/g, '') || null, bank_holder: v.holder || null, emp_type: v.emp || '파트타임', phone: (v.phone || '').replace(/[^0-9-]/g, '') || null };
      if (f.dataset.m) await q(sb.from('members').update(row).eq('id', f.dataset.m));
      else await q(sb.from('members').insert({ ...row, company_id: S.store.company_id, store_id: S.store.id, role: 'staff' }));
      closeSheet(); await reload(); toast('저장했어요. 스케줄·급여에 바로 반영돼요');
    }
    if (f.classList.contains('oship')) { await q(sb.from('orders').update({ courier: v.courier || null, tracking: v.tracking || null, eta: v.eta || null, ...(v.tracking ? { status: '배송 중' } : {}) }).eq('id', f.dataset.o)); await reload(); return toast('배송 정보를 저장했어요. 매장에서 바로 보여요'); }
    if (id === 'fr-form') {
      const up = async (name, key) => { const file = f[name]?.files?.[0]; if (!file) return undefined; const path = `${S.user.id}/${Date.now()}_${key}.jpg`; await q(sb.storage.from('franchise').upload(path, await shrink(file), { contentType: 'image/jpeg' })); return sb.storage.from('franchise').getPublicUrl(path).data.publicUrl; };
      if (!bizOk(v.biz_no)) return toast('사업자번호가 맞지 않아요');
      const row = { brand: v.brand, corp_name: v.corp_name, biz_no: digits(v.biz_no), ceo: v.ceo, regions: v.regions, invest: +v.invest || 0, fee: +v.fee || 0, edu_fee: +v.edu_fee || 0, interior_est: +v.interior_est || 0, royalty: v.royalty, min_py: +v.min_py || null, address: v.address, homepage: v.homepage || null, phone: v.phone_fr.trim(), kakao: v.kakao || null, video: v.video || null, description: v.description, support: v.support || null, auto_renew: !!v.auto_renew, lead_limit_amt: +v.lead_limit_amt || null, lead_limit_n: +v.lead_limit_n || null, limit_action: v.limit_action };
      const lg = await up('logo', 'logo'), im = await up('image', 'img'); if (lg) row.logo_url = lg; if (im) row.image_url = im;
      let pid = f.dataset.id; if (pid) await q(sb.from('franchise_postings').update(row).eq('id', pid)); else pid = (await q(sb.from('franchise_postings').insert(row).select()))[0].id;
      closeSheet(); await frLoad(); const cur = (S.frMine || []).find(x => x.id === pid); if (cur?.status === 'active') return toast('공고를 고쳤어요'); toast('저장했어요. 결제하면 바로 게시돼요'); return pay('franchise', { post: pid }); }
    if (id === 'notice-form') { await q(sb.from('notices').insert({ title: v.title.trim(), body: v.body.trim() })); S.notices = await q(sb.from('notices').select('*').order('created_at', { ascending: false }).limit(30)); render(); return toast('모든 매장에 공지를 보냈어요'); }
    if (id === 'equip-form') { const eq = {}; EQ.forEach(([k, , t]) => { const x = v[k]; if (x === undefined || x === '') return; eq[k] = typeof t === 'string' && t !== 'm' ? +x || 0 : x; }); await q(sb.from('stores').update({ equip: eq }).eq('id', S.store.id)); S.store.equip = eq; render(); return toast('저장했어요. 줄일 방법을 다시 계산했어요'); }
    if (f.classList.contains('pedit')) {
      const p = S.posts.find(x => x.id === f.dataset.p), btn = e.submitter?.name;
      await q(sb.from('job_posts').update({ title: v.title, body: v.body || null, incentive: (v.incentive || '').trim() || null, ...(p.kind === 'hire' ? { pay_text: v.pay_text || null, work_time: v.work_time || null } : {}) }).eq('id', p.id));
      if (btn === 'extra') { const x = { post: p.id, days: +v.days || 0, top: v.expo === 'top', jump: v.expo === 'top' ? 0 : +v.expo || 0, flash: !!v.flash }; return pay('post_extra', x); }
      await reload(); return toast('공고를 고쳤어요');
    }
    if (id === 'post-form') {
      const k = S.postKind || 'urgent', P = postVals(f), heads = P.heads;
      if (k === 'hire' && !P.wd.length) return toast('근무 요일을 골라주세요');
      if (P.inc_on === '1' && !(P.inc || '').trim()) return toast('인센티브 내용을 적어주세요');
      const PP = ({ p_store: S.store.id, p_kind: k, p_role: v.role, p_title: v.title, p_body: v.body || null, p_pay_text: k === 'hire' ? (P.ptype === '협의' || !+P.pamt ? '급여 협의' : `${P.ptype} ${E.won(+P.pamt)}원${P.nego ? ' (협의 가능)' : ''}`) : null, p_work_time: k === 'hire' ? `${P.wd.join('·')} ${v.s}–${v.e}` : null, p_heads: heads, p_taxi: +v.taxi || 0, p_flash: !!v.flash, p_top: P.top, p_days: +v.days || 1, p_jump: P.jump, p_slots: k === 'urgent' ? Array.from({ length: heads }, () => ({ start: v.s, end: v.e, pay: +v.pay || 0 })) : [], p_incentive: P.inc_on === '1' ? P.inc : null, p_prefer: P.pf.join(', ') || null });
      const pid = await q(sb.rpc('create_post', PP)); track('job_posted', { kind: PP.p_kind }); await reload(); await pay('post', { post: pid });
    }
    if (id === 'attend-form') { const k = await q(sb.rpc('attend', { p_code: v.code.trim() })); toast(k === 'in' ? '출근했어요. 오늘도 화이팅!' : '퇴근했어요. 수고하셨어요'); await reload(); }
    if (id === 'inq-form') { await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store?.id || null, body: v.body })); S.inq = await q(sb.from('inquiries').select('*').eq('from_user', S.user.id).order('created_at', { ascending: false })); render(); toast('운영사에 보냈어요. 답변이 오면 알림이 와요'); }
    if (id === 'used-form') {
      const files = S.upFiles || []; if (!files.length) return toast('사진을 1장 이상 올려주세요'); if (!/^https?:\/\//.test(v.contact) && digits(v.contact).length < 9) return toast('전화번호나 카카오톡 링크를 넣어주세요');
      const order = [S.upCover || 0, ...files.map((_, i) => i).filter(i => i !== (S.upCover || 0))], images = [];
      for (const i of order) { const path = `${S.user.id}/${Date.now()}_${i}.jpg`; await q(sb.storage.from('used').upload(path, await shrink(files[i].f), { contentType: 'image/jpeg' })); images.push(sb.storage.from('used').getPublicUrl(path).data.publicUrl); }
      const row = (await q(sb.from('used_items').insert({ seller: S.user.id, store_id: S.store?.id || null, side: 'sell', status: '판매중', category: v.category, condition: v.condition, title: v.title, price: +v.price || 0, qty: +v.qty || 1, area: `${v.sido} ${v.area2}`.trim(), body: v.body, contact: v.contact.trim(), bought: v.bought || null, ship: !!v.ship, direct: !!v.direct, nego: !!v.nego, images, image_url: images[0] }).select()))[0];
      S.usedNew = false; S.upFiles = []; S.used = await q(sb.from('used_items').select('*').order('created_at', { ascending: false }).limit(100)); render(); toast('올렸어요! 빨리 팔고 싶으면 상단 노출을 써 보세요'); if (row) usedSheet(row.id); return; }
    if (id === 'sell-form') { S.sellA = [...(S.sellA || []), v.sido ? `${v.sido} ${v.a}` : v.a]; render(); }
    if (id === 'goal-form') { if (+v.goal) await q(sb.from('store_goals').upsert({ store_id: S.store.id, month: f.dataset.mon, goal: +v.goal })); else await q(sb.from('store_goals').delete().eq('store_id', S.store.id).eq('month', f.dataset.mon)); closeSheet(); await reload(); toast('목표를 저장했어요'); }
    if (id === 'fixed-form') { const fixed = Object.fromEntries(FIXED.map(([k]) => [k, +v[k] || 0]).filter(x => x[1])), month = f.dataset.mon; await q(sb.from('store_fixed').upsert({ store_id: S.store.id, month, fixed })); closeSheet(); await reload(); toast(`${+month.slice(5, 7)}월 고정비를 저장했어요`); }
    if (id === 'store-form') { await q(sb.from('stores').update({ name: v.name, area: v.area || null, address: v.address || null, pyeong: +v.py || null, tables: +v.tables || null, night_start: v.ns, night_end: v.ne }).eq('id', S.store.id)); await boot(); toast('저장했어요'); }
    if (id === 'addstore-form') { if (S.company.plan === 'pro') return pay('store', { name: v.name, area: v.area || '' }); await q(sb.rpc('add_store', { p_name: v.name, p_area: v.area || '' })); await boot(); toast('매장을 추가했어요. 위에서 매장을 골라 전환하세요'); }
    if (f.dataset.inq) { await q(sb.from('inquiries').update({ reply: v.reply, replied_at: new Date().toISOString() }).eq('id', f.dataset.inq)); await reload(); toast('답변을 보냈어요'); }
  });
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
// ===== 푸시 알림 (오후 4시 오늘 인원·목표 / 다음날 오전 마감 리마인드 / 긴급 대타·알림) =====
const VAPID_PUBLIC = 'BJVzBvAx7NhcMd-vrqnjA1a9wGGEsz9pvPeUfDUp5P8pA2gvnrTx6qpfz7KsXFDweijHDfsIF67u9w-AFhuyyEU';
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && Notification.permission !== 'denied';
async function pushState() { try { const r = await navigator.serviceWorker.ready; S.push = !!(await r.pushManager.getSubscription()); } catch { S.push = false; } }
async function pushToggle(on) {
  const r = await navigator.serviceWorker.ready, cur = await r.pushManager.getSubscription();
  if (!on) { if (cur) { await sb.from('push_subs').delete().eq('endpoint', cur.endpoint); await cur.unsubscribe(); } S.push = false; return toast('알림을 껐어요'); }
  if ((await Notification.requestPermission()) !== 'granted') return toast('브라우저에서 알림이 막혀 있어요. 주소창 자물쇠 → 알림 허용');
  const sub = cur || await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)) });
  const j = sub.toJSON(); await q(sb.from('push_subs').upsert({ endpoint: j.endpoint, keys: j.keys, ua: navigator.userAgent.slice(0, 120) }));
  S.push = true; track('push_on'); toast('알림을 켰어요. 오늘 인원·마감 리마인드·긴급 대타를 보내드려요');
}
// 알림 설정 줄 (매장 설정·내 정보 공용)
const pushRow = () => pushOk() ? `<label class="tog"><span><b>푸시 알림</b><small>${S.mode === 'store' ? '오후 4시 오늘 근무 인원 · 다음날 오전 마감 리마인드 · 지원자·문의 답변' : '긴급 대타 · 채용 확정 · 지급'}</small></span><input type="checkbox" data-act="push" ${S.push ? 'checked' : ''}></label>` : '';

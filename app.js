import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import * as E from './engine.js';

const sb = createClient('https://hkcmsjwuwopxritafreg.supabase.co', 'sb_publishable_X7cb5p4Ja9y4TxrjbVQZAQ_P8n3E_W_');
const $ = s => document.querySelector(s), view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t5 = t => String(t || '').slice(0, 5);
const now = new Date(), TODAY = E.ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2600); }
async function q(p) { const { data, error } = await p; if (error) { toast(error.message); throw error; } return data; }

// ===== 상태 =====
const S = { user: null, prof: null, mode: null, tab: null, company: null, stores: [], store: null, members: [], tpl: [], ov: [], reports: [], inc: [], y: now.getFullYear(), m: now.getMonth() + 1, schedView: 'month', posts: [], board: [], tickets: 0, apps: [], notis: [], authMode: 'login' };
const night = () => [t5(S.store?.night_start || '22:00'), t5(S.store?.night_end || '06:00')];

// ===== 시작 =====
let booted = false;
sb.auth.onAuthStateChange((_e, session) => { const u = session?.user || null; if (!booted || u?.id !== S.user?.id) { booted = true; S.user = u; boot(); } });
async function boot() {
  if (!S.user) { Object.assign(S, { mode: 'auth', onb: null, tab: null, company: null, stores: [], store: null }); return render(); }
  S.prof = (await q(sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle())) || { name: '' };
  const mem = await q(sb.from('members').select('*').eq('user_id', S.user.id).eq('active', true));
  const owner = mem.find(m => m.role === 'owner'), mgr = mem.find(m => m.role === 'manager');
  if (owner || mgr) {
    S.mode = 'store'; S.myRole = owner ? 'owner' : 'manager';
    S.company = (await q(sb.from('companies').select('*').eq('id', (owner || mgr).company_id).maybeSingle()));
    S.stores = owner ? await q(sb.from('stores').select('*').eq('company_id', owner.company_id).order('created_at')) : await q(sb.from('stores').select('*').eq('id', mgr.store_id));
    S.store = S.stores[0]; S.tab = S.tab || 'home'; await loadStore();
  } else if (S.prof.kind === 'dealer') { S.mode = 'dealer'; S.tab = S.tab || 'jobs'; await loadDealer(); }
  else S.mode = 'onboard';
  render();
}
async function loadStore() {
  const st = S.store.id, first = E.ymd(S.y, S.m, 1), last = E.ymd(S.y, S.m, E.daysIn(S.y, S.m));
  S.members = await q(sb.from('members').select('*').eq('store_id', st).eq('active', true).order('created_at'));
  const ids = S.members.map(m => m.id);
  S.tpl = ids.length ? await q(sb.from('shift_templates').select('*').in('member_id', ids)) : [];
  S.ov = ids.length ? await q(sb.from('shift_overrides').select('*').in('member_id', ids).gte('work_date', first).lte('work_date', last)) : [];
  S.reports = await q(sb.from('daily_reports').select('*').eq('store_id', st).gte('report_date', first).lte('report_date', last).order('report_date', { ascending: false }));
  S.expenses = await q(sb.from('expenses').select('*').eq('store_id', st).gte('spent_on', first).lte('spent_on', last));
  S.inc = ids.length ? await q(sb.from('incentives').select('*').in('member_id', ids).eq('month', first)) : [];
  S.posts = await q(sb.from('job_posts').select('*, job_slots(*)').eq('store_id', st).order('created_at', { ascending: false }).limit(20));
  S.notis = await q(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(20));
}
async function loadDealer() {
  S.board = await q(sb.rpc('job_board')); S.tickets = await q(sb.rpc('ticket_balance'));
  S.apps = await q(sb.rpc('my_applications')); S.notis = await q(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(30));
}
const payOf = p => E.payroll(p, S.y, S.m, S.tpl, S.ov, S.inc.filter(i => i.member_id === p.id).reduce((a, i) => a + i.amount, 0), TODAY, night());

// ===== 화면 =====
const TABS = { store: [['home', '🏠', '홈'], ['sched', '🗓', '스케줄'], ['sales', '💰', '매출'], ['staff', '👥', '직원·급여'], ['jobs', '📣', '구인']], dealer: [['jobs', '📣', '구인'], ['apps', '📝', '내 지원'], ['me', '🙂', '내 정보']] };
function render() {
  const tabs = TABS[S.mode]; const nav = $('#tabs'); nav.hidden = !tabs;
  if (tabs) nav.innerHTML = tabs.map(([k, i, l]) => `<button data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}><span>${i}</span>${l}</button>`).join('');
  $('#top-r').innerHTML = S.user ? `<button class="btn sm" data-act="logout">로그아웃</button>` : '';
  view.innerHTML = S.mode === 'auth' ? vAuth() : S.mode === 'onboard' ? vOnboard() : S.mode === 'dealer' ? ({ jobs: vBoard, apps: vApps, me: vMe }[S.tab] || vBoard)() : ({ home: vHome, sched: vSched, sales: vSales, staff: vStaff, jobs: vJobs }[S.tab] || vHome)();
}

// ----- 로그인 -----
function vAuth() {
  const up = S.authMode === 'signup';
  return `<div class="hero"><img src="icon-512.png" width="96" height="96" alt=""><h1>+EV</h1><p class="sub">홀덤펍 매출·스케줄·급여·구인을 한 곳에서</p></div>
  <div class="card"><div class="seg" style="margin-bottom:14px"><button data-act="authmode" data-v="login" aria-pressed="${!up}">로그인</button><button data-act="authmode" data-v="signup" aria-pressed="${up}">처음이에요 (가입)</button></div>
  <form class="f" id="auth-form">${up ? '<label class="fl">이름<input name="name" required autocomplete="name"></label>' : ''}
    <label class="fl">이메일<input name="email" type="email" required autocomplete="email"></label>
    <label class="fl">비밀번호 <input name="pw" type="password" minlength="6" required autocomplete="${up ? 'new-password' : 'current-password'}"></label>
    <button class="btn pri full" type="submit">${up ? '가입하기' : '로그인'}</button></form>
  <p class="note">${up ? '가입하면 이메일로 확인 메일이 가요. 메일의 버튼을 누르면 바로 시작돼요.' : ''}</p></div>`;
}
// ----- 첫 설정 -----
function vOnboard() {
  const k = S.onb;
  if (!k) return `<h1>반가워요${S.prof.name ? `, ${esc(S.prof.name)}님` : ''}!</h1><p class="sub">어떤 분이세요?</p>
    <div class="choice"><button data-act="onb" data-v="owner"><b>🏢 매장 대표·점주예요</b><small>매출·스케줄·급여 관리, 딜러 구인. 사업자등록번호가 필요해요.</small></button>
    <button data-act="onb" data-v="dealer"><b>🃏 딜러·스태프예요</b><small>근처 홀덤펍 공고를 보고 지원해요. 가입하면 지원권 3장을 드려요.</small></button></div>
    <p class="note">점장·직원은 대표님이 직원으로 등록하고 권한을 주면 여기서 바로 보여요.</p>`;
  if (k === 'owner') return `<h1>매장 등록</h1><p class="sub">사업자 확인이 끝나야 모든 기능이 열려요. 2주 무료로 시작해요.</p>
    <form class="f card" id="owner-form"><label class="fl">회사(상호)<input name="name" required placeholder="예: 로얄플러시"></label>
    <label class="fl">브랜드 (프랜차이즈면)<input name="brand" placeholder="없으면 비워두세요"></label>
    <label class="fl">사업자등록번호 (10자리)<input name="biz" required inputmode="numeric" placeholder="123-45-67890"></label>
    <label class="fl">첫 매장 이름<input name="store" required placeholder="예: 강남 1호점"></label>
    <label class="fl">지역<input name="area" placeholder="예: 서울 강남"></label>
    <label class="fl">대표님 이름<input name="nick" required value="${esc(S.prof.name)}"></label>
    <button class="btn pri full">매장 만들기</button><button class="btn full" type="button" data-act="onb" data-v="">뒤로</button></form>`;
  return `<h1>딜러로 시작</h1><p class="sub">매장이 지원자 목록에서 보는 내용이에요. 연락처는 채용된 뒤에만 매장에 보여요.</p>
    <form class="f card" id="dealer-form"><label class="fl">이름(닉네임)<input name="name" required value="${esc(S.prof.name)}"></label>
    <label class="fl">휴대폰<input name="phone" required inputmode="tel" placeholder="010-0000-0000"></label>
    <label class="fl">경력 (개월)<input name="career" type="number" min="0" value="0"></label>
    <label class="fl">자기소개<textarea name="bio" rows="3" placeholder="예: 2년차 딜러, 토너먼트 진행 가능, 야간 가능"></textarea></label>
    <button class="btn pri full">시작하기 · 지원권 3장 받기</button><button class="btn full" type="button" data-act="onb" data-v="">뒤로</button></form>`;
}
// ----- 대표: 홈 -----
function storeHead(title) {
  return `<div class="row between"><div><h1>${title}</h1><p class="sub" style="margin:0">${esc(S.company?.name)} · ${esc(S.store?.name)}${S.company && !S.company.biz_verified ? ' · <span class="warn">사업자 확인 중</span>' : ''}</p></div>
  ${S.stores.length > 1 ? `<select id="store-sel" style="width:auto">${S.stores.map(s => `<option value="${s.id}" ${s.id === S.store.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}</div>`;
}
function monthNav() { return `<div class="row"><button class="btn sm" data-act="mon" data-v="-1">◀</button><b class="num">${S.y}년 ${S.m}월</b><button class="btn sm" data-act="mon" data-v="1">▶</button></div>`; }
function vHome() {
  const n = S.reports.length, sales = S.reports.reduce((a, r) => a + r.sales, 0), proj = n ? sales / n * E.daysIn(S.y, S.m) : 0;
  const pays = S.members.map(p => ({ p, r: payOf(p) })), labor = pays.reduce((a, x) => a + x.r.fullGross, 0) + pays.filter(x => x.p.contract === '4대').reduce((a, x) => a + x.r.fullGross * 0.105, 0);
  const other = S.expenses.reduce((a, x) => a + x.amount, 0), [y, m, d] = TODAY.split('-').map(Number);
  const todayList = S.members.map(p => ({ p, t: E.shiftOn(p.id, y, m, d, S.tpl, S.ov) })).filter(x => x.t);
  return `${storeHead('브리핑')}<div style="margin-top:10px">${monthNav()}</div>
  <div class="grid2"><div class="card kpi"><div class="l">${S.m}월 매출 (보고 ${n}일)</div><div class="v num">₩${E.won(sales)}</div></div><div class="card kpi"><div class="l">월말 예상</div><div class="v num up">₩${E.won(proj)}</div></div>
  <div class="card kpi"><div class="l">인건비 예상 (스케줄 기준)</div><div class="v num">₩${E.won(labor)}</div></div><div class="card kpi"><div class="l">남는 돈 예상</div><div class="v num ${proj - labor - other >= 0 ? 'up' : 'down'}">₩${E.won(proj - labor - other)}</div></div></div>
  <p class="note">남는 돈 = 월말 예상 매출 − 인건비(4대보험 사업주 부담 포함) − 이번 달 입력한 비용 ₩${E.won(other)}. 임대료·전기세는 매출 탭에서 넣어주세요.</p>
  <div class="card"><h3>오늘 근무 <small>${todayList.length}명</small></h3>${todayList.map(({ p, t }) => `<div class="li"><div><b>${esc(p.nick)}</b><small>${esc(p.job_role || '')}</small></div><span class="num">${t5(t.s)}–${t5(t.e)}</span></div>`).join('') || '<div class="empty">오늘 근무자가 없어요</div>'}</div>
  ${S.members.length ? '' : `<div class="card"><h3>처음 할 일</h3><div class="li"><div><b>① 직원 등록</b><small>시급·계약·계좌까지</small></div><button class="btn sm pri" data-tab="staff">하러 가기</button></div><div class="li"><div><b>② 스케줄 짜기</b><small>요일 기본 + 날짜별 수정</small></div><button class="btn sm" data-tab="sched">하러 가기</button></div><div class="li"><div><b>③ 매일 매출 보고</b></div><button class="btn sm" data-tab="sales">하러 가기</button></div></div>`}
  ${S.notis.length ? `<div class="card"><h3>알림</h3>${S.notis.slice(0, 5).map(x => `<div class="li"><span>${esc(x.body)}</span><small>${new Date(x.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('')}</div>` : ''}`;
}
// ----- 대표: 스케줄 -----
function vSched() {
  const need = S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2], D = E.daysIn(S.y, S.m), lead = E.wdOf(S.y, S.m, 1);
  if (!S.members.length) return `${storeHead('스케줄')}<div class="card empty">먼저 직원을 등록해 주세요 <button class="btn sm pri" data-tab="staff">직원 등록</button></div>`;
  const head = `${storeHead('스케줄')}<div class="row between" style="margin-top:10px">${monthNav()}<div class="seg">${[['month', '월간'], ['week', '매주 기본']].map(([k, l]) => `<button data-act="sview" data-v="${k}" aria-pressed="${S.schedView === k}">${l}</button>`).join('')}</div></div>`;
  if (S.schedView === 'week') return `${head}<div class="card"><p class="note" style="margin-top:0">매주 반복되는 기본 근무예요. 칸을 눌러 고치세요. 날짜마다 다르면 '월간'에서 그날만 바꾸세요.</p><div class="tbl"><table><thead><tr><th>이름</th>${E.WD.map(w => `<th>${w}</th>`).join('')}</tr></thead><tbody>
    ${S.members.map(p => `<tr><td><b>${esc(p.nick)}</b></td>${E.WD.map((_, i) => { const t = S.tpl.find(x => x.member_id === p.id && x.weekday === i); return `<td><button class="chip ${t ? '' : 'add'}" data-act="edit-w" data-m="${p.id}" data-w="${i}">${t ? `${t5(t.start_t)}–${t5(t.end_t)}` : '+'}</button></td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  let cells = '';
  for (let d = 1; d <= D; d++) {
    const list = S.members.map(p => ({ p, t: E.shiftOn(p.id, S.y, S.m, d, S.tpl, S.ov) })).filter(x => x.t), nd = need[E.wdOf(S.y, S.m, d)], k = E.ymd(S.y, S.m, d);
    cells += `<div class="cell ${list.length < nd ? 'short' : ''} ${k === TODAY ? 'today' : ''}"><div class="ch"><span>${d}</span><span class="pill ${list.length < nd ? 'r' : 'g'}">${list.length}/${nd}</span></div>
      ${list.map(({ p, t }) => `<button class="chip ${p.job_role === '딜러' ? '' : 'fl'} ${t.ov ? 'ov' : ''}" data-act="edit-d" data-m="${p.id}" data-d="${k}">${esc(p.nick)}<small>${t5(t.s).slice(0, 2)}-${t5(t.e).slice(0, 2)}</small></button>`).join('')}
      <button class="chip add" data-act="add-d" data-d="${k}">+</button></div>`;
  }
  return `${head}<div class="card"><div class="row" style="margin-bottom:8px"><span class="mut" style="font-size:12px">요일별 적정 인원</span>${E.WD.map((w, i) => `<label class="row" style="gap:3px;font-size:12px">${w}<input type="number" min="0" max="20" value="${need[i]}" data-need="${i}" style="width:48px;padding:5px"></label>`).join('')}</div>
    <div class="cal">${E.WD.map(w => `<div class="h">${w}</div>`).join('')}${'<div></div>'.repeat(lead)}${cells}</div>
    <p class="note">이름을 누르면 그날 근무를 고치고, + 로 추가해요. 점선은 그날만 바꾼 근무예요. 빨간 칸은 적정 인원보다 적은 날이에요.</p></div>`;
}
function shiftSheet({ memberId, date, weekday, add }) {
  const p = S.members.find(x => x.id === memberId), [y, m, d] = date ? date.split('-').map(Number) : [];
  const t = memberId ? (date ? E.shiftOn(memberId, y, m, d, S.tpl, S.ov) : (w => w && { s: w.start_t, e: w.end_t, brk: w.break_min })(S.tpl.find(x => x.member_id === memberId && x.weekday === weekday))) : null;
  const off = date ? S.members.filter(q => !E.shiftOn(q.id, y, m, d, S.tpl, S.ov)) : [];
  openSheet(`<h2>${add ? `${m}월 ${d}일 근무 추가` : `${esc(p.nick)} · ${date ? `${m}월 ${d}일 (${E.WD[E.wdOf(y, m, d)]})` : `매주 ${E.WD[weekday]}요일`}`}</h2>
  <form class="f" id="shift-form" data-m="${memberId || ''}" data-d="${date || ''}" data-w="${weekday ?? ''}">
    ${add ? `<label class="fl">누구<select name="member">${off.map(q => `<option value="${q.id}">${esc(q.nick)} (${esc(q.job_role || '')})</option>`).join('')}</select></label>` : ''}
    <div class="grid2"><label class="fl">시작<input type="time" name="s" value="${t5(t?.s || '20:00')}" required></label><label class="fl">끝<input type="time" name="e" value="${t5(t?.e || '04:00')}" required></label></div>
    <label class="fl">휴게<select name="brk">${[['', '법대로 자동 (4h↑30분, 8h↑1시간)'], [0, '없음'], [30, '30분'], [60, '1시간'], [90, '1시간 30분']].map(([v, l]) => `<option value="${v}" ${String(t?.brk ?? '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${date ? `<label class="tog"><span>매주 ${E.WD[E.wdOf(y, m, d)]}요일에도 똑같이</span><input type="checkbox" name="rep"></label>` : ''}
    <button class="btn pri full">저장</button>${!add && t ? `<button class="btn red full" type="button" data-act="shift-off">${date ? '이날 휴무' : '이 요일 근무 없애기'}</button>` : ''}
    <button class="btn full" type="button" data-act="close">취소</button></form>`);
}
// ----- 대표: 매출 -----
function vSales() {
  const r0 = S.reports.find(r => r.report_date === TODAY) || {};
  return `${storeHead('매출 보고')}<form class="f card" id="report-form"><h3>하루 마감 <small>한 번 더 저장하면 고쳐져요</small></h3>
    <label class="fl">날짜<input type="date" name="date" value="${TODAY}" max="${TODAY}"></label>
    <div class="grid2"><label class="fl">총매출 (원)<input name="sales" type="number" inputmode="numeric" required value="${r0.sales ?? ''}"></label><label class="fl">엔트리 수<input name="entries" type="number" value="${r0.entries ?? ''}"></label>
    <label class="fl">카드<input name="card" type="number" value="${r0.card ?? ''}"></label><label class="fl">계좌이체<input name="transfer" type="number" value="${r0.transfer ?? ''}"></label>
    <label class="fl">현금<input name="cash" type="number" value="${r0.cash ?? ''}"></label><label class="fl">오늘 지출 (소모품 등)<input name="expense" type="number" value="${r0.expense ?? ''}"></label></div>
    <label class="fl">메모<input name="memo" value="${esc(r0.memo || '')}"></label><button class="btn pri full">저장</button></form>
  <form class="f card" id="expense-form"><h3>고지서·기타 비용 <small>월간 손익에 들어가요</small></h3>
    <div class="grid2"><label class="fl">항목<select name="cat">${[['rent', '임대료'], ['elec', '전기세'], ['water', '수도세'], ['net', '통신·보안'], ['goods', '음료·소모품'], ['etc', '기타']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label class="fl">금액 (원)<input name="amount" type="number" required></label></div>
    <button class="btn full">비용 추가</button></form>
  <div class="card"><h3>${S.m}월 보고 기록 <small>${S.reports.length}일</small></h3>${S.reports.map(r => `<div class="li"><div><b>${r.report_date.slice(5).replace('-', '/')}</b><small>엔트리 ${r.entries ?? '-'} · 카드 ${E.won(r.card)} · 현금 ${E.won(r.cash)}${r.memo ? ' · ' + esc(r.memo) : ''}</small></div><b class="num">₩${E.won(r.sales)}</b></div>`).join('') || '<div class="empty">아직 기록이 없어요</div>'}</div>`;
}
// ----- 대표: 직원·급여 -----
function vStaff() {
  const rows = S.members.map(p => ({ p, r: payOf(p) })), sum = k => rows.reduce((a, x) => a + x.r[k], 0);
  return `${storeHead('직원·급여')}<div class="row" style="margin-top:10px"><button class="btn pri" data-act="staff-new">+ 직원 등록</button></div>
  <div class="card"><h3>직원 <small>${S.members.length}명 · 이름을 누르면 수정</small></h3>${S.members.map(p => `<div class="li"><div><b>${esc(p.nick)}</b> <span class="pill">${esc(p.job_role || '-')}</span><small>${p.contract === '4대' ? '4대보험' : '3.3%'} · 시급 ${E.won(p.hourly_rate)}원${p.bank_name ? ` · ${esc(p.bank_name)} ${esc(p.bank_acct)}` : ''}</small></div><button class="btn sm" data-act="staff-edit" data-m="${p.id}">수정</button></div>`).join('') || '<div class="empty">아직 직원이 없어요</div>'}</div>
  ${rows.length ? `<div class="card"><h3><span>${S.m}월 급여 대장</span><button class="btn sm pri" data-act="csv">📥 엑셀 파일</button></h3><div class="row" style="margin-bottom:8px">${monthNav()}</div>
  <div class="tbl"><table><thead><tr><th>이름</th><th class="r">근무</th><th class="r">기본급</th><th class="r">야간</th><th class="r">연장</th><th class="r">주휴</th><th class="r">인센티브</th><th class="r">지급총액</th><th class="r">공제</th><th class="r">실지급</th><th class="r">월말 예상</th></tr></thead><tbody>
  ${rows.map(({ p, r }) => `<tr><td><b>${esc(p.nick)}</b></td><td class="r num">${r.days}일 ${r.hours.toFixed(0)}h</td><td class="r num">${E.won(r.base)}</td><td class="r num">${E.won(r.np)}</td><td class="r num">${E.won(r.otp)}</td><td class="r num">${E.won(r.juhu)}</td>
    <td class="r"><input type="number" step="1000" value="${r.inc}" data-inc="${p.id}" style="width:96px;padding:5px;font-size:13px"></td><td class="r num">${E.won(r.gross)}</td><td class="r num down">−${E.won(r.ded)}</td><td class="r num up"><b>${E.won(r.net)}</b></td><td class="r num mut">${E.won(r.fullGross)}</td></tr>`).join('')}
  <tr><td><b>합계</b></td><td></td><td class="r num">${E.won(sum('base'))}</td><td class="r num">${E.won(sum('np'))}</td><td class="r num">${E.won(sum('otp'))}</td><td class="r num">${E.won(sum('juhu'))}</td><td class="r num">${E.won(sum('inc'))}</td><td class="r num"><b>${E.won(sum('gross'))}</b></td><td class="r num down">−${E.won(sum('ded'))}</td><td class="r num up"><b>${E.won(sum('net'))}</b></td><td class="r num mut">${E.won(sum('fullGross'))}</td></tr></tbody></table></div>
  <p class="note">오늘 전날까지 근무 기준. 근무시간 = 스케줄 − 휴게 · 야간 = 22~06시 × 시급 × 0.5 · 연장 = 하루 8시간 초과 × 0.5 · 주휴 = 주 15시간 이상인 주. 연장·주휴는 '연장·주휴 적용' 직원만. 4대보험은 근로자 부담분, 소득세 간이세액 미반영.</p></div>` : ''}`;
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
// ----- 대표: 구인 -----
function vJobs() {
  const k = S.postKind || 'urgent';
  return `${storeHead('구인')}<div class="card"><div class="seg" style="margin-bottom:12px"><button data-act="pkind" data-v="urgent" aria-pressed="${k === 'urgent'}">🚨 긴급 (24시간)</button><button data-act="pkind" data-v="hire" aria-pressed="${k === 'hire'}">상시 아르바이트</button></div>
  <form class="f" id="post-form"><div class="grid2"><label class="fl">직책<select name="role">${['딜러', '플로어', '매니저'].map(r => `<option>${r}</option>`).join('')}</select></label><label class="fl">택시비 지원 (원)<input name="taxi" type="number" step="5000" value="0"></label></div>
    <label class="fl">제목<input name="title" required value="${k === 'urgent' ? '오늘 밤 딜러 급구' : '주말 고정 딜러 모집'}"></label>
    <label class="fl">내용<textarea name="body" rows="3" placeholder="게임 종류, 복장, 우대 조건"></textarea></label>
    ${k === 'urgent' ? `<div class="grid2"><label class="fl">시작<input type="time" name="s" value="20:00"></label><label class="fl">끝<input type="time" name="e" value="04:00"></label><label class="fl">일당 (원)<input name="pay" type="number" step="5000" value="130000"></label><label class="fl">몇 명<input name="heads" type="number" min="1" max="10" value="1"></label></div>`
    : `<div class="grid2"><label class="fl">근무 조건<input name="work" value="금·토 20:00–04:00"></label><label class="fl">급여<input name="paytext" value="시급 15,000원"></label><label class="fl">몇 명<input name="heads" type="number" min="1" value="1"></label><label class="fl">광고 기간<select name="days">${[3, 5, 7, 15, 30].map(d => `<option value="${d}" ${d === 7 ? 'selected' : ''}>${d}일</option>`).join('')}</select></label></div>`}
    <label class="tog"><span><b>✨ 반짝이</b><small>하루 9,900원</small></span><input type="checkbox" name="flash"></label>${k === 'hire' ? '<label class="tog"><span><b>📌 상단 고정</b><small>하루 33,000원</small></span><input type="checkbox" name="top"></label>' : ''}
    <p class="note">🎉 베타 기간에는 공고 등록이 무료예요. 정식 오픈 후 결제(토스페이먼츠)가 붙어요. 성별·나이 조건은 법상 넣을 수 없어요.</p>
    <button class="btn gold full">공고 올리기</button></form></div>
  <div class="card"><h3>우리 매장 공고 <small>${S.posts.length}건</small></h3>${S.posts.map(p => `<div class="job ${p.kind === 'urgent' ? 'urgent' : ''}"><div class="row between"><div><span class="pill ${p.status === 'open' ? 'g' : ''}">${p.status === 'open' ? '모집 중' : '마감'}</span> <small class="mut">${p.kind === 'urgent' ? '긴급' : '상시'} · ${esc(p.job_role)}</small><h4>${esc(p.title)}</h4></div>
    <button class="btn sm pri" data-act="applicants" data-p="${p.id}">지원자 보기</button></div>${(p.job_slots || []).sort((a, b) => a.idx - b.idx).map(s => `<div class="slot"><span class="num">${t5(s.start_t)}–${t5(s.end_t)} · ₩${E.won(s.pay)}</span><span class="pill ${s.status === 'OPEN' ? '' : 'g'}">${{ OPEN: '모집 중', MATCHED: '채용 확정', WORKING: '근무 중', DONE: '근무 끝', PAID: '지급 완료', REFUND: '환불', DISPUTED: '확인 중' }[s.status]}</span></div>`).join('')}
    <div id="ap-${p.id}"></div></div>`).join('') || '<div class="empty">올린 공고가 없어요</div>'}</div>`;
}
// ----- 딜러 -----
function jobCard(j) {
  const applied = S.apps.some(a => a.post_id === j.id), slots = j.slots || [], pays = slots.map(s => s.pay);
  return `<div class="job ${j.kind === 'urgent' ? 'urgent' : ''}"><div class="row between"><div class="row">${j.kind === 'urgent' ? `<span class="pill r">🚨 긴급 · ${Math.max(0, Math.ceil((new Date(j.expires_at) - Date.now()) / 36e5))}시간 남음</span>` : ''}${j.flash ? '<span class="spark">✨ 반짝</span>' : ''}<small class="mut">${esc(j.job_role)}</small></div>
    <span class="pay">${pays.length ? `일당 ₩${E.won(Math.min(...pays))}${pays.length > 1 && Math.max(...pays) !== Math.min(...pays) ? '~' + E.won(Math.max(...pays)) : ''}` : esc(j.pay_text || '')}</span></div>
  <h4>${esc(j.title)}</h4>${j.body ? `<div style="font-size:14px">${esc(j.body)}</div>` : ''}
  <div class="meta"><span>${esc(j.store_name)} · ${esc(j.area || '')}</span><span>${slots.length ? slots.map(s => `${t5(s.start)}–${t5(s.end)}`).join(' / ') : esc(j.work_time || '')}</span>${j.taxi_amt ? `<span class="up">🚕 택시비 ₩${E.won(j.taxi_amt)}</span>` : ''}</div>
  ${applied ? '<span class="pill g">지원 완료 · 매장 확인 중</span>' : `<button class="btn ${j.kind === 'urgent' ? 'gold' : 'pri'}" data-act="apply" data-p="${j.id}">🎟 지원권 1장으로 지원</button>`}</div>`;
}
function vBoard() {
  return `<div class="row between"><h1>구인</h1><span class="pill y">🎟 지원권 ${S.tickets}장</span></div><p class="sub">지원하면 지원권 1장이 잠기고, 채용돼 연락처가 열리면 사용돼요. 안 뽑히면 돌아와요.</p>
  ${S.board.map(jobCard).join('') || '<div class="card empty">지금 올라온 공고가 없어요</div>'}`;
}
function vApps() {
  const L = { applied: ['', '매장 확인 중'], hired: ['g', '채용됐어요'], rejected: ['', '아쉽게 안 됐어요'], cancelled: ['y', '매장이 취소 · 지원권 반환'], expired: ['', '마감 · 지원권 반환'] };
  return `<h1>내 지원</h1><div class="card">${S.apps.map(a => `<div class="li"><div><b>${esc(a.title)}</b><small>${esc(a.store_name)} · ${new Date(a.created_at).toLocaleDateString('ko-KR')}</small></div><span class="pill ${L[a.status][0]}">${L[a.status][1]}</span></div>`).join('') || '<div class="empty">아직 지원한 공고가 없어요</div>'}</div>
  <div class="card"><h3>알림</h3>${S.notis.map(x => `<div class="li"><span>${esc(x.body)}</span><small>${new Date(x.created_at).toLocaleDateString('ko-KR')}</small></div>`).join('') || '<div class="empty">알림이 없어요</div>'}</div>`;
}
function vMe() {
  const p = S.prof;
  return `<h1>내 정보</h1><form class="f card" id="dealer-form"><label class="fl">이름(닉네임)<input name="name" value="${esc(p.name)}"></label><label class="fl">휴대폰<input name="phone" value="${esc(p.phone || '')}"></label>
  <label class="fl">경력 (개월)<input name="career" type="number" value="${p.career_months || 0}"></label><label class="fl">자기소개<textarea name="bio" rows="3">${esc(p.bio || '')}</textarea></label><button class="btn pri full">저장</button></form>`;
}

// ===== 시트 =====
function openSheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="in">${html}</div>`; s.hidden = false; s._ctx = s._ctx || {}; }
function closeSheet() { $('#sheet').hidden = true; }
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

// ===== 동작 =====
const busy = async (fn) => { try { document.body.style.cursor = 'progress'; await fn(); } catch (e) { console.error(e); } finally { document.body.style.cursor = ''; } };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tab],[data-act]'); if (!b) return; const d = b.dataset;
  if (d.tab) { S.tab = d.tab; closeSheet(); render(); scrollTo(0, 0); return; }
  const a = d.act;
  if (a === 'authmode') { S.authMode = d.v; render(); }
  if (a === 'logout') busy(async () => { await sb.auth.signOut(); });
  if (a === 'onb') { S.onb = d.v || null; render(); }
  if (a === 'close') closeSheet();
  if (a === 'mon') busy(async () => { S.m += +d.v; if (S.m > 12) { S.m = 1; S.y++; } if (S.m < 1) { S.m = 12; S.y--; } await loadStore(); render(); });
  if (a === 'sview') { S.schedView = d.v; render(); }
  if (a === 'edit-d') { S.edit = { memberId: d.m, date: d.d }; shiftSheet(S.edit); }
  if (a === 'add-d') { S.edit = { date: d.d, add: true }; shiftSheet(S.edit); }
  if (a === 'edit-w') { S.edit = { memberId: d.m, weekday: +d.w }; shiftSheet(S.edit); }
  if (a === 'shift-off') busy(async () => {
    const { memberId, date, weekday } = S.edit;
    if (date) await q(sb.from('shift_overrides').upsert({ member_id: memberId, work_date: date, off: true, start_t: null, end_t: null }));
    else await q(sb.from('shift_templates').delete().eq('member_id', memberId).eq('weekday', weekday));
    closeSheet(); await loadStore(); render(); toast('휴무로 바꿨어요');
  });
  if (a === 'staff-new') staffSheet(null);
  if (a === 'staff-edit') staffSheet(d.m);
  if (a === 'staff-del') busy(async () => { await q(sb.from('members').update({ active: false }).eq('id', $('#staff-form').dataset.m)); closeSheet(); await loadStore(); render(); toast('퇴사 처리했어요'); });
  if (a === 'csv') {
    const rows = [['이름', '실명', '직책', '계약', '시급', '근무일', '근무시간', '기본급', '야간수당', '연장수당', '주휴수당', '인센티브', '지급총액', '공제', '실지급', '은행', '계좌번호', '예금주']];
    S.members.forEach(p => { const r = payOf(p); rows.push([p.nick, p.real_name, p.job_role, p.contract, p.hourly_rate, r.days, r.hours.toFixed(1), r.base, r.np, r.otp, r.juhu, r.inc, r.gross, r.ded, r.net, p.bank_name, p.bank_acct, p.bank_holder]); });
    const blob = new Blob(['﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')], { type: 'text/csv' });
    const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `급여대장_${S.y}-${E.pad(S.m)}.csv`; l.click();
  }
  if (a === 'pkind') { S.postKind = d.v; render(); }
  if (a === 'applicants') busy(async () => {
    const list = await q(sb.rpc('post_applicants', { p_post: d.p })), box = $('#ap-' + d.p);
    box.innerHTML = list.length ? list.map(x => `<div class="slot"><div><b>${esc(x.name)}</b> <small class="mut">경력 ${x.career_months}개월</small><div style="font-size:13px">${esc(x.bio)}</div></div>
      ${x.status === 'applied' ? `<button class="btn sm pri" data-act="hire" data-a="${x.app_id}">채용하기</button>` : x.status === 'hired' ? `<span class="row"><button class="btn sm" data-act="contact" data-a="${x.app_id}">📞 연락처</button><button class="btn sm red" data-act="cancel-hire" data-a="${x.app_id}">채용 취소</button></span>` : `<span class="pill">${x.status}</span>`}</div>`).join('') : '<p class="note">아직 지원자가 없어요.</p>';
  });
  if (a === 'hire') busy(async () => { await q(sb.rpc('hire', { p_app: d.a })); toast('채용했어요! 연락처가 열렸어요'); await loadStore(); render(); });
  if (a === 'cancel-hire') busy(async () => { if (!confirm('채용을 취소할까요? 딜러에게 지원권을 돌려드려요.')) return; await q(sb.rpc('cancel_hire', { p_app: d.a })); toast('채용을 취소했어요'); await loadStore(); render(); });
  if (a === 'contact') busy(async () => { const ph = await q(sb.rpc('get_contact', { p_app: d.a })); b.outerHTML = `<a class="btn sm pri" href="tel:${esc(ph)}">${esc(ph || '번호 없음')}</a>`; });
  if (a === 'apply') busy(async () => { if (S.tickets < 1) return toast('지원권이 없어요'); await q(sb.rpc('apply_job', { p_post: d.p })); toast('지원했어요! 매장이 채용하면 알림이 와요'); await loadDealer(); render(); });
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (t.id === 'store-sel') busy(async () => { S.store = S.stores.find(s => s.id === t.value); await loadStore(); render(); });
  if (d.need !== undefined) busy(async () => { const need = [...(S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2])]; need[+d.need] = +t.value || 0; await q(sb.from('stores').update({ need_by_wd: need }).eq('id', S.store.id)); S.store.need_by_wd = need; render(); });
  if (d.inc) busy(async () => { const month = E.ymd(S.y, S.m, 1); await q(sb.from('incentives').delete().eq('member_id', d.inc).eq('month', month)); if (+t.value) await q(sb.from('incentives').insert({ member_id: d.inc, month, amount: +t.value, reason: '' })); await loadStore(); render(); toast('인센티브를 반영했어요'); });
});
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target, v = Object.fromEntries(new FormData(f)), id = f.id;
  busy(async () => {
    if (id === 'auth-form') {
      if (S.authMode === 'signup') { const { data, error } = await sb.auth.signUp({ email: v.email, password: v.pw, options: { data: { name: v.name }, emailRedirectTo: location.origin } }); if (error) return toast(error.message); if (!data.session) toast('확인 메일을 보냈어요. 메일의 버튼을 눌러주세요'); }
      else { const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.pw }); if (error) toast(error.message.includes('Invalid') ? '이메일이나 비밀번호가 달라요' : error.message); }
    }
    if (id === 'owner-form') { await q(sb.rpc('create_company', { p_name: v.name, p_brand: v.brand || null, p_biz_no: v.biz, p_store: v.store, p_area: v.area || null, p_nick: v.nick })); await q(sb.from('profiles').update({ name: v.nick }).eq('id', S.user.id)); toast('매장을 만들었어요! 2주 무료로 시작해요'); await boot(); }
    if (id === 'dealer-form') { await q(sb.rpc('start_dealer', { p_name: v.name, p_phone: v.phone, p_career: +v.career || 0, p_bio: v.bio || '' })); toast(S.mode === 'dealer' ? '저장했어요' : '환영해요! 지원권 3장을 드렸어요'); await boot(); }
    if (id === 'shift-form') {
      const m = f.dataset.m || v.member, brk = v.brk === '' ? null : +v.brk, row = { start_t: v.s, end_t: v.e, break_min: brk };
      if (!m) return toast('추가할 직원이 없어요');
      if (f.dataset.d) { await q(sb.from('shift_overrides').upsert({ member_id: m, work_date: f.dataset.d, off: false, ...row })); if (v.rep) { const [y, mo, dd] = f.dataset.d.split('-').map(Number); await q(sb.from('shift_templates').upsert({ member_id: m, weekday: E.wdOf(y, mo, dd), ...row })); } }
      else await q(sb.from('shift_templates').upsert({ member_id: m, weekday: +f.dataset.w, ...row }));
      closeSheet(); await loadStore(); render(); toast('스케줄을 저장했어요. 급여에 바로 반영돼요');
    }
    if (id === 'report-form') {
      await q(sb.from('daily_reports').upsert({ store_id: S.store.id, report_date: v.date, sales: +v.sales || 0, entries: +v.entries || null, card: +v.card || 0, cash: +v.cash || 0, transfer: +v.transfer || 0, expense: +v.expense || 0, memo: v.memo || null, reported_by: S.user.id }));
      if (+v.expense) await q(sb.from('expenses').insert({ store_id: S.store.id, spent_on: v.date, category: 'goods', amount: +v.expense, source: 'close' }));
      await loadStore(); render(); toast('마감을 저장했어요. 수고하셨어요');
    }
    if (id === 'expense-form') { await q(sb.from('expenses').insert({ store_id: S.store.id, category: v.cat, amount: +v.amount, source: 'bill' })); await loadStore(); render(); toast('비용을 추가했어요'); }
    if (id === 'staff-form') {
      const row = { nick: v.nick, real_name: v.real_name || null, job_role: v.job_role, contract: v.contract, hourly_rate: +v.rate || 0, joined_on: v.joined || null, night_pay: !!v.night, labor_law: !!v.law, bank_name: v.bank || null, bank_acct: (v.acct || '').replace(/[^0-9-]/g, '') || null, bank_holder: v.holder || null };
      if (f.dataset.m) await q(sb.from('members').update(row).eq('id', f.dataset.m));
      else await q(sb.from('members').insert({ ...row, company_id: S.company.id, store_id: S.store.id, role: 'staff' }));
      closeSheet(); await loadStore(); render(); toast('저장했어요. 스케줄·급여에 바로 반영돼요');
    }
    if (id === 'post-form') {
      const k = S.postKind || 'urgent', heads = +v.heads || 1;
      await q(sb.rpc('create_post', { p_store: S.store.id, p_kind: k, p_role: v.role, p_title: v.title, p_body: v.body || null, p_pay_text: k === 'hire' ? v.paytext : null, p_work_time: k === 'hire' ? v.work : null, p_heads: heads, p_taxi: +v.taxi || 0, p_flash: !!v.flash, p_top: !!v.top, p_days: +v.days || 1, p_slots: k === 'urgent' ? Array.from({ length: heads }, () => ({ start: v.s, end: v.e, pay: +v.pay || 0 })) : [] }));
      await loadStore(); render(); toast('공고를 올렸어요! 딜러들에게 보여요');
    }
  });
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

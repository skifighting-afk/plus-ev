import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import * as E from './engine.js';
import { PRICING, applyPricing } from './pricing.js';
import { laborBody, payslipBody, sigPad } from './docs.js';

const sb = createClient('https://hkcmsjwuwopxritafreg.supabase.co', 'sb_publishable_X7cb5p4Ja9y4TxrjbVQZAQ_P8n3E_W_');
const $ = s => document.querySelector(s), view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t5 = t => String(t || '').slice(0, 5);
const kstYmd = () => { const k = new Date(Date.now() + 9 * 3600e3); return E.ymd(k.getUTCFullYear(), k.getUTCMonth() + 1, k.getUTCDate()); }; /* 폰 시간대가 달라도 한국 날짜 */
let now = new Date(), TODAY = kstYmd();
// 켜둔 채 자정이 지나면 오늘 날짜를 바꾸고 다시 불러옴
setInterval(() => { now = new Date(); const t = kstYmd(); if (t !== TODAY) { TODAY = t; if (S?.user && !working) reload().then(render, () => { }); } }, 60000);
const fmtDT = d => new Date(d).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const man = n => !n ? '0' : Math.abs(n) < 1e4 ? E.won(n) : Math.abs(n) >= 1e8 ? `${(n / 1e8).toFixed(Math.round(n / 1e7) % 10 ? 1 : 0)}억` : `${E.won(n / 10000)}만`;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2800); }
const KO_ERR = [[/duplicate key|already exists/i, '이미 있는 항목이에요'], [/violates foreign key/i, '연결된 항목이 있어서 할 수 없어요'], [/violates (check|not-null)/i, '입력값을 확인해 주세요'], [/permission denied|row-level security|not allowed/i, '권한이 없어요'], [/JWT|token.*expired|not authenticated/i, '로그인이 풀렸어요. 다시 로그인해 주세요'], [/Failed to fetch|NetworkError|network/i, '인터넷 연결을 확인해 주세요'], [/timeout|timed out/i, '서버 응답이 늦어요. 잠시 뒤 다시 해주세요'], [/invalid input syntax/i, '입력 형식이 맞지 않아요'], [/payload too large|exceeded the maximum/i, '파일이 너무 커요']];
const koErr = m => (KO_ERR.find(([r]) => r.test(m || '')) || [, m])[1];
async function q(p) { const { data, error } = await p; if (error) { toast(koErr(error.message)); throw error; } return data; }
const STORE_COLS = 'cfg,geo_lat,geo_lng,geo_m,peak,inc_rule,id,company_id,name,area,address,pyeong,tables,layout,night_start,night_end,need_by_wd,join_code,created_at,goal,fixed,holidays,contract_tpl,equip,entry_note,hire_msg';
const PRICE = { get basic() { return PRICING.basicMonthly }, get pro() { return PRICING.proMonthly } }; // 값은 pricing.js
// 무료 체험 중이거나 프로 결제 중이면 쓸 수 있어요. 끝나면 보기만 (데이터는 그대로). 서버 트리거(guard_active)와 같은 기준
const compActive = c => !!c && (((c.plan === 'pro' || c.plan === 'basic') && c.paid_until && new Date(+new Date(c.paid_until) + 7 * 864e5) > now) || (c.trial_ends && c.trial_ends >= TODAY) || (c.diag_until && new Date(c.diag_until) > now));
const trialLeft = c => c?.trial_ends ? Math.ceil((new Date(c.trial_ends) - new Date(TODAY)) / 864e5) : 0;
// 사용 이벤트 (Activation·리텐션 계산용). 실패해도 화면엔 영향 없음
const track = (name, props = {}) => { try { sb.from('events').insert({ name, props, company_id: S.company?.id || null, store_id: S.store?.id || null }).then(() => { }, () => { }); } catch { } };
const CAT = { rent: '임대료', mgmt: '관리비', elec: '전기세', water: '수도세', net: '통신·보안', goods: '음료·소모품', card: '카드 수수료', labor: '기타 인건비', etc: '기타' };
const SLOT = { OPEN: ['', '모집 중'], MATCHED: ['y', '채용 확정'], WORKING: ['g', '근무 중'], DONE: ['y', '근무 끝 · 확인 대기'], DISPUTED: ['r', '문제 신고 · 운영사 확인'], PAID: ['g', '지급 완료'], REFUND: ['', '미채용 환불'] };


// ===== 전자 서류 (근로계약서 · 급여명세서) =====
const docUrl = (t, app) => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}doc.html?t=${t}${app ? '&from=app' : ''}`;
const docOf = (mid, kind, title) => (S.docs || []).find(d => d.member_id === mid && d.kind === kind && (!title || d.title === title));
const docPill = d => !d ? '<span class="pill">없음</span>' : d.status === 'signed' ? `<span class="pill g">${d.kind === 'payslip' ? '수령 확인' : '체결 완료'}</span>` : '<span class="pill y">서명 대기</span>';
function docRow(p) {
  const d = docOf(p.id, 'labor');
  return `<div class="docrow"><span><b>근로계약서</b> ${docPill(d)}${d?.signed_at ? `<small class="mut"> ${new Date(d.signed_at).toLocaleDateString('ko-KR')}</small>` : ''}</span><span class="row">${d ? `<button class="btn sm" data-act="doc-open" data-v="${d.token}">${d.status === 'signed' ? '보기·출력' : '보기'}</button>${d.status === 'sent' ? `<button class="btn sm" data-act="doc-link" data-v="${d.token}">링크</button>` : ''}` : ''}<button class="btn sm ${d ? '' : 'pri'}" data-act="doc-new" data-m="${p.id}">${d ? '다시 보내기' : '보내기'}</button></span></div>`;
}
const slipTitle = () => `${S.y}년 ${S.m}월 급여명세서`;
function slipRow(p) {
  const d = docOf(p.id, 'payslip', slipTitle());
  return `<div class="docrow"><span><b>${S.m}월 명세서</b> ${docPill(d)}</span><span class="row">${d ? `<button class="btn sm" data-act="doc-open" data-v="${d.token}">보기·출력</button>` : ''}<button class="btn sm ${d ? '' : 'pri'}" data-act="doc-slip" data-m="${p.id}">${d ? '다시 발송' : '명세서 발송'}</button></span></div>`;
}
function myDocsCard(onlyPending) {
  const L = (S.myDocs || []).filter(d => !onlyPending || d.status === 'sent');
  if (!L.length) return onlyPending ? '' : '<div class="card"><h3>내 서류 <small>근로계약서 · 급여명세서</small></h3><p class="mut" style="margin:0">아직 받은 서류가 없어요</p></div>';
  return `<div class="card" ${onlyPending ? 'style="border-color:rgba(245,158,11,.55)"' : ''}><h3>${onlyPending ? '서명할 서류가 있어요' : '내 서류'} <small>${esc(L[0].store_name || '')}</small></h3>${L.map(d => `<div class="li"><div><b>${esc(d.title)}</b><small>${new Date(d.created_at).toLocaleDateString('ko-KR')} 도착${d.signed_at ? ` · ${new Date(d.signed_at).toLocaleDateString('ko-KR')} 서명` : ''}</small></div><button class="btn sm ${d.status === 'sent' ? 'gold' : ''}" data-act="doc-open" data-v="${d.token}">${d.status === 'sent' ? (d.kind === 'payslip' ? '확인·서명' : '서명하기') : '보기·출력'}</button></div>`).join('')}</div>`;
}
const lastSig = () => { try { return localStorage.getItem('ev-owner-sig') || '' } catch { return '' } };
function sigBlock() {
  const ls = lastSig();
  return `<div class="fl" style="margin-top:4px">대표 서명<div class="sigpad"><canvas id="own-cv"></canvas><span>여기에 서명</span></div>
    <span class="row"><button type="button" class="btn sm" data-act="sig-clear">지우기</button>${ls ? '<button type="button" class="btn sm" data-act="sig-last">지난 서명 쓰기</button>' : ''}</span></div>`;
}
let PAD = null, useLast = false;
function mountPad() { const cv = $('#own-cv'); if (cv) { PAD = sigPad(cv); useLast = false; } }
function ownerSig() { if (useLast && lastSig()) return lastSig(); if (!PAD || PAD.isEmpty()) return null; const v = PAD.png(); try { localStorage.setItem('ev-owner-sig', v) } catch { } return v; }
const baseTerms = p => ({ company_name: S.company?.name || S.store.name, biz_no: String(S.company?.biz_no || '').replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3'), owner_name: S.prof?.name || '', store_name: S.store.name, employee_name: p.real_name || p.nick, role: p.job_role || '', contract: p.contract, hourly: p.hourly_rate || 0, bank: p.bank_name ? `${p.bank_name} ${p.bank_acct || ''} (${p.bank_holder || ''})` : '' });
// 매장 표준 근로계약서 양식 — 한 번 저장해 두면 직원마다 이름·시급·입사일만 자동으로 바뀌어 나가요
const TPL0 = { place: '', duty: '{직책} 업무', days: '근무표에 따름 (주 5일 이내)', tf: '19:00', tt: '03:00', brk: 60, payday: 10, extra: '' };
const tplOf = () => ({ ...TPL0, place: S.store.address || S.store.name, ...(S.store.contract_tpl || {}) });
const tplFields = (t, pre = '') => `<label class="fl">근무장소<input name="${pre}place" value="${esc(t.place)}"></label>
    <div class="grid2"><label class="fl">업무 <small class="mut">{직책}은 직원 직책으로 바뀌어요</small><input name="${pre}duty" value="${esc(t.duty)}"></label><label class="fl">근로일<input name="${pre}days" value="${esc(t.days)}"></label></div>
    <div class="grid2"><label class="fl">시작 시각<input type="time" name="${pre}tf" value="${esc(t.tf)}"></label><label class="fl">끝 시각<input type="time" name="${pre}tt" value="${esc(t.tt)}"></label></div>
    <div class="grid2"><label class="fl">휴게(분)<input type="number" name="${pre}brk" value="${+t.brk || 0}"></label><label class="fl">급여일 (매월)<input type="number" name="${pre}payday" min="1" max="31" value="${+t.payday || 10}"></label></div>
    <label class="fl">특약 <small class="mut">선택</small><input name="${pre}extra" value="${esc(t.extra)}" placeholder="예: 수습 3개월, 복장 규정"></label>`;
function tplSheet() {
  openSheet(`<h2>표준 근로계약서 양식</h2><p class="sub">매장 공통 조건을 한 번만 저장해 두세요. 보낼 때는 직원 <b>이름 · 시급 · 입사일 · 3.3%/4대보험 · 계좌</b>만 자동으로 바뀌어요.</p>
  <form class="f" id="tpl-form">${tplFields(tplOf())}<button type="button" class="btn pri full" data-act="tpl-save">양식 저장</button></form>`);
}
const needContract = () => S.members.filter(p => p.role !== 'owner' && !['sent', 'signed'].includes(docOf(p.id, 'labor')?.status));
function contractTerms(p, t, start) {
  return { ...baseTerms(p), start: start || p.joined_on || TODAY, end: '', place: t.place, duty: String(t.duty || '').replace('{직책}', p.job_role || '딜러'), days: t.days, time_from: t.tf, time_to: t.tt, break_min: +t.brk || 0, payday: +t.payday || 10, night: !!p.night_pay, law: !!(p.labor_law ?? p.contract === '4대'), extra: t.extra || '' };
}
function contractSheet(mid) {
  const p = S.members.find(x => x.id === mid); if (!p) return; const t = tplOf();
  openSheet(`<h2>근로계약서 보내기</h2><p class="sub">매장 표준 양식${S.store.contract_tpl ? '' : ' <small class="warn">(아직 저장 전 · 기본값)</small>'}으로 보내요.</p>
  <div class="kvbox"><div><small>직원</small><b>${esc(p.real_name || p.nick)}${p.real_name ? '' : ' <small class="warn">실명 미등록</small>'}</b></div><div><small>시급</small><b>₩${E.won(p.hourly_rate || 0)}</b></div><div><small>시작일</small><b>${p.joined_on || TODAY}</b></div><div><small>계약</small><b>${p.contract === '4대' ? '4대보험' : '3.3%'}</b></div><div><small>근무</small><b>${esc(t.days)} · ${esc(t.tf)}~${esc(t.tt)}</b></div><div><small>급여일</small><b>매월 ${+t.payday || 10}일</b></div></div>
  <form class="f" id="doc-form" data-m="${p.id}">
    <details class="more"><summary>이 직원만 내용 바꾸기 <small class="mut">양식은 그대로</small></summary><div class="f" style="margin-top:10px"><label class="fl">시작일<input type="date" name="start" value="${p.joined_on || TODAY}"></label>${tplFields(t, 'o_')}</div></details>
    ${sigBlock()}
    <button type="button" class="btn pri full" data-act="doc-send">대표 서명하고 보내기</button>
    <button type="button" class="btn full" data-act="tpl-edit">표준 양식 관리</button>
  </form>`); mountPad();
}
function bulkSheet() {
  const L = needContract();
  if (!L.length) return toast('계약서를 보낼 직원이 없어요. 모두 발송·체결됐어요');
  openSheet(`<h2>계약서 한 번에 보내기</h2><p class="sub">표준 양식으로 아직 계약서가 없는 직원에게 한꺼번에 보내요. 대표 서명은 한 번만 하면 돼요.</p>
  <form class="f" id="bulk-form">${L.map(p => `<label class="tog"><span><b>${esc(p.real_name || p.nick)}</b><small>${esc(p.job_role || '')} · 시급 ₩${E.won(p.hourly_rate || 0)}${p.real_name ? '' : ' · <span class="warn">실명 미등록</span>'}</small></span><input type="checkbox" name="m_${p.id}" ${p.real_name && p.hourly_rate ? 'checked' : ''}></label>`).join('')}
    ${sigBlock()}<button type="button" class="btn pri full" data-act="bulk-send">서명하고 선택한 직원에게 보내기</button></form>`); mountPad();
}
function slipSheet(mid) {
  const p = S.members.find(x => x.id === mid); if (!p) return; const r = payOf(p), nx = new Date(S.y, S.m, 10);
  openSheet(`<h2>${slipTitle()} 발송</h2><p class="sub">${esc(p.real_name || p.nick)} · 실지급 ₩${E.won(r.net)} · ${r.days}일 ${r.hours.toFixed(1)}시간${S.y === now.getFullYear() && S.m === now.getMonth() + 1 ? ' <b class="warn">(이번 달은 어제까지 근무 기준이에요)</b>' : ''}</p>
  <form class="f" id="slip-form" data-m="${p.id}"><label class="fl">지급일<input type="date" name="pay_date" value="${E.ymd(nx.getFullYear(), nx.getMonth() + 1, 10)}"></label>${sigBlock()}
  <button type="button" class="btn pri full" data-act="slip-send">서명하고 명세서 보내기</button></form>`); mountPad();
}
async function afterSend(tok, name) {
  await reload();
  openSheet(`<h2>보냈어요</h2><p class="sub">${esc(name)}님이 앱 <b>내 근무</b>에서 바로 서명할 수 있어요. 앱을 안 쓰는 직원이면 아래 링크를 카톡·문자로 보내 주세요.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="doc-link" data-v="${tok}">링크 복사</button>${navigator.share ? `<button class="btn" data-act="doc-share" data-v="${tok}">카톡·문자로 보내기</button>` : ''}<button class="btn pri" data-act="doc-open" data-v="${tok}">서류 보기</button></div>`);
}

// ===== 결제 (토스페이먼츠) =====
// 테스트 키(토스 문서 공개용) — 실제 운영 땐 토스 가맹 후 받은 라이브 클라이언트 키로 바꾸고, 서버 쪽 TOSS_SECRET_KEY도 같이 바꿔요
const TOSS_CLIENT_KEY = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq', PAY_TEST = TOSS_CLIENT_KEY.startsWith('test_');
const loadToss = () => window.TossPayments ? Promise.resolve() : new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://js.tosspayments.com/v2/standard'; sc.onload = ok; sc.onerror = () => no(new Error('결제창을 불러오지 못했어요')); document.head.append(sc); });
// 결제수단 — 카드 / 카카오페이 / 네이버페이 / 토스페이 / 계좌이체 (토스페이먼츠 한 곳으로)
const PAYM = [['CARD', '', '신용·체크카드', null], ['KAKAOPAY', '🟡', '카카오페이', 'KAKAOPAY'], ['NAVERPAY', '🟢', '네이버페이', 'NAVERPAY'], ['TOSSPAY', '', '토스페이', 'TOSSPAY'], ['TRANSFER', '', '계좌이체', null]];
async function pay(kind, arg = {}) {
  if (PAY_TEST && !S.prof?.is_hq) { openSheet(`<h2>🛠 준비중</h2><p class="sub">유료 기능은 결제 연결을 마치는 대로 열려요.</p>${kind === 'post' || kind === 'post_extra' ? '<p class="note">공고는 유료 옵션(상단 고정·끌어올리기 등)을 빼면 지금 바로 무료로 올릴 수 있어요.</p>' : ''}<button class="btn pri full" data-act="close">확인</button>`); return; }
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
  // 플레이스토어 앱 안이면 구글 대체결제 안내창 → 신고 토큰부터 (구글 정책, 한국). 돌아오면 altpayReturn이 이어서 결제
  if (IN_APP && !o.gp) { lsSet('ev-altpay', JSON.stringify({ o, m })); location.href = 'intent://altpay?o=' + o.order_id + '#Intent;scheme=plusev;package=kr.plusevapp.twa;end'; return; }
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
const IN_APP = (() => { try { if (document.referrer.startsWith('android-app://kr.plusevapp.twa')) sessionStorage.setItem('ev-twa', '1'); return sessionStorage.getItem('ev-twa') === '1'; } catch { return false; } })();
async function altpayReturn(pr) {
  let p; try { p = JSON.parse(lsGet('ev-altpay')); } catch { } lsSet('ev-altpay', '');
  if (!p || p.o.order_id !== pr.get('altpay')) return toast('결제 정보를 찾지 못했어요. 다시 시도해 주세요');
  if (!pr.get('tok')) return toast(/^(avail|setup)/.test(pr.get('err') || '') ? '이 기기에서는 앱 결제를 할 수 없어요' : '결제를 취소했어요');
  await q(sb.rpc('pay_gp_token', { p_order: p.o.order_id, p_token: pr.get('tok') }));
  await payGo({ ...p.o, gp: 1 }, p.m);
}
window.__evPayReturn = async p => { await payReturn(new URLSearchParams(p)); await boot(); };
const payNote = () => PAY_TEST ? '<p class="note">정식 결제 오픈 전이라 지금은 돈이 나가지 않아요. 오픈하면 미리 알려드려요.</p>' : '';

// ===== 상태 =====
const S = { user: null, prof: null, mode: null, tab: null, sub: null, company: null, stores: [], store: null, members: [], tpl: [], ov: [], reports: [], hist: [], expenses: [], expAll: [], inc: [], joins: [], rank: null, cart: {}, stock: [], orders: [],
  y: now.getFullYear(), m: now.getMonth() + 1, schedView: 'month', posts: [], board: [], tickets: 0, apps: [], slots: [], wallet: { balance: 0, available: 0 }, notis: [], inq: [], used: [], authMode: 'login', my: [] };
const night = () => [t5(S.store?.night_start || '22:00'), t5(S.store?.night_end || '06:00')];
const isOwner = () => S.myRole === 'owner';
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { } };
{ const u = new URLSearchParams(location.search); if (/^[0-9A-Za-z]{6}$/.test(u.get('ref') || '')) lsSet('ev_ref', u.get('ref').toUpperCase()); if (/^[0-9a-f-]{36}$/.test(u.get('cv') || '')) setTimeout(() => cvView(u.get('cv')), 400); }
{ const u = new URLSearchParams(location.search); if (u.get('join')) lsSet('ev_join', u.get('join').toUpperCase()); if (u.get('post')) lsSet('ev_post', u.get('post')); if (u.get('att')) lsSet('ev_att', u.get('att')); if (['join', 'post', 'att'].some(k => u.has(k))) { ['join', 'post', 'att'].forEach(k => u.delete(k)); try { history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); } catch { } } }
const bulkRows = t => String(t || '').split(/\r?\n/).map(l => l.split(/\t|,|\s{2,}/).map(x => x.trim())).filter(c => c[0] && !/^(이름|성명|닉네임|name)$/i.test(c[0]) && !(S.members || []).some(p => p.nick === c[0].slice(0, 20))).map(c => ({ nick: c[0].slice(0, 20), hourly_rate: +String(c[1] || '').replace(/[^0-9]/g, '') || 0, job_role: c[2] || '딜러', phone: (c[3] || '').replace(/[^0-9-]/g, '') || null }));
document.addEventListener('input', e => { if (e.target.name !== 't' || !e.target.closest?.('#bulk-form')) return; const L = bulkRows(e.target.value), el = $('#bulk-pv'); if (el) el.textContent = L.length ? `${L.length}명: ${L.slice(0, 5).map(r => `${r.nick}(${r.hourly_rate ? '₩' + E.won(r.hourly_rate) : '시급 없음'})`).join(', ')}${L.length > 5 ? ' …' : ''}` : '붙여넣으면 몇 명인지 바로 보여요'; });
addEventListener('online', () => toast('인터넷이 다시 연결됐어요'));
function payInfoCard(me) {
  if (!me || (me.real_name && me.bank_acct && me.bank_holder)) return '';
  return `<div class="card" style="border-color:var(--gold)"><div class="row between"><div><b>급여 받을 정보를 넣어주세요</b><small class="mut" style="display:block">${[!me.real_name && '실명', !me.bank_acct && '계좌', me.bank_acct && !me.bank_holder && '예금주'].filter(Boolean).join('·')}이 없으면 명세서·이체가 늦어져요</small></div><button class="btn pri sm" data-act="my-pay">1분 입력</button></div></div>`;
}
const whtAll = () => [...whtRows(), ...(S.whtU || []).map(u => ({ p: { real_name: u.name, nick: '긴급 대타 ' + String(u.work_on).slice(5).replace('-', '/') }, gross: u.gross, it: u.it, lt: u.lt, net: u.net }))];
// 출퇴근 기록: 새벽 8시 전 기록은 전날 근무로 묶음
// 출퇴근 위치 확인: 매장 위치가 저장된 매장만 서버가 [GEO]로 위치를 요구 → 그때만 폰 위치를 물어봄
const getPos = () => new Promise(ok => { if (!navigator.geolocation) return ok(null); navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => ok(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }); });
async function attendGeo(code) {
  const r = await sb.rpc('attend', { p_code: code });
  if (!/\[GEO\]/.test(r.error?.message || '')) return r;
  if (!lsGet('ev_geo_ok') && !confirm('출퇴근 확인을 위해 지금 위치를 한 번 확인해요.\n좌표는 저장하지 않고 매장과의 거리만 남겨요. 동의할까요?')) return { error: { message: '위치 확인에 동의해야 출퇴근할 수 있어요' } };
  lsSet('ev_geo_ok', '1'); const p = await getPos();
  if (!p) return { error: { message: '위치를 못 가져왔어요. 폰 설정에서 위치 권한을 켜주세요' } };
  return sb.rpc('attend', { p_code: code, p_lat: p.lat, p_lng: p.lng });
}
function attLogCard() {
  const by = {};
  (S.attStore || []).forEach(a => { const t = new Date(a.at), b = new Date(+t - 8 * 36e5), k = `${b.getMonth() + 1}/${b.getDate()}`, r = ((by[k] = by[k] || { _t: +b, m: {} }).m[a.member_id] = by[k].m[a.member_id] || {});
    if (a.kind === 'in') { if (!r.in || t < r.in) r.in = t; } else if (!r.out || t > r.out) r.out = t; });
  const hm = t => t.toTimeString().slice(0, 5), days = Object.entries(by).sort((x, y) => y[1]._t - x[1]._t).slice(0, 7);
  return `<div class="card"><h3>출퇴근 기록 <small>${S.m}월 · 최근 ${days.length}일</small></h3>${days.map(([k, d]) => `<div class="li" style="display:block"><b>${k}</b>${Object.entries(d.m).map(([m, r]) => `<div class="row between" style="font-size:14px;margin-top:4px"><span>${esc(S.members.find(p => p.id === m)?.nick || '직원')}</span><span class="num">${r.in ? '🟢 ' + hm(r.in) : '<span class="down">출근 기록 없음</span>'} → ${r.out ? '⚪ ' + hm(r.out) : '<span class="warn">퇴근 전·누락</span>'}</span></div>`).join('')}</div>`).join('') || '<p class="note">이번 달 출퇴근 기록이 없어요. 직원이 QR을 찍으면 여기에 쌓여요.</p>'}</div>`;
}
// 자동 새로고침: 앱으로 돌아올 때 + 1분마다 (입력 중·시트 열림이면 건너뜀)
document.addEventListener('input', e => { if (e.target.closest?.('#view')) S.dirty = true; }, true);
const autoRefresh = () => { if (document.hidden || working || !S.user || S.dirty || !$('#sheet').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return; working = true; reload().catch(() => { }).finally(() => { working = false; }); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoRefresh(); });
setInterval(autoRefresh, 60000);
const qrDraw = async code => { const box = $('#qr-img'); if (!box) return; if (!window.QRCode) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; sc.onload = ok; sc.onerror = no; document.head.append(sc); }).catch(() => { }); if (!window.QRCode || box.dataset.c === code) return; box.dataset.c = code; box.innerHTML = ''; new QRCode(box, { text: `${location.origin}/?att=${code}`, width: 180, height: 180 }); };
const inPk = H => { const pk = S.store?.peak; if (!pk?.from || !pk?.to || !+pk.extra) return false; const a = E.toMin(pk.from) / 60; let b = E.toMin(pk.to) / 60; if (b <= a) b += 24; return [H, H + 24, H - 24].some(x => x >= a && x < b); };
const nearOf = j => { const p = S.prof || {}, ar = j.area || '', a2 = (p.area2 || '').split(/[,·\s]+/).map(x => x.trim().replace(/(구|시|군)$/, '')).filter(Boolean); return a2.some(x => ar.includes(x)) ? 2 : p.area && ar.startsWith(p.area) ? 1 : 0; };
const hideTab = k => S.mode === 'store' && ((S.myRole === 'manager' && S.me?.perms?.sales === false && ['home', 'sales'].includes(k)) || featOff(k));
const MIN_WAGE = { 2026: 10320, 2027: 10700 }, minWage = () => MIN_WAGE[+TODAY.slice(0, 4)] || MIN_WAGE[2027];
const iosNoPwa = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !lsGet('ev_ios_ok');
const iosCard = () => iosNoPwa() ? `<div class="card" style="border-color:var(--gold)"><div class="row between"><b>아이폰은 홈 화면에 추가해야 알림이 와요</b><button class="btn sm" data-act="ios-ok">닫기</button></div><small class="mut">사파리 아래쪽 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b> → 홈 화면의 +EV 아이콘으로 열기</small></div>` : '';
const nmKey = () => { const [y, m] = TODAY.split('-').map(Number); return m === 12 ? E.ymd(y + 1, 1, 1) : E.ymd(y, m + 1, 1); };
const monthRange = (y = S.y, m = S.m) => [E.ymd(y, m, 1), E.ymd(y, m, E.daysIn(y, m))];

// ===== 시작 =====
let booted = false;
document.addEventListener('change', e => { if (e.target.id === 'mi-sel') { S.mi = +e.target.value; S.avSel = null; busy(reload); } });
document.addEventListener('change', e => { if (e.target.id !== 'bill-file' || !e.target.files[0]) return; const file = e.target.files[0]; e.target.value = ''; busy(async () => { const img = await createImageBitmap(file); const k = Math.min(1, 1280 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const { data, error } = await sb.functions.invoke('ai', { body: { store_id: S.store.id, mode: 'bill', image: c.toDataURL('image/jpeg', .85) } }); if (error || !data?.ok) return toast(data?.msg || '고지서를 못 읽었어요'); const f = $('#fixed-form'), el = f?.elements[data.cat] || f?.elements.etc; if (el && data.amount) { el.value = data.amount; el.dispatchEvent(new Event('input', { bubbles: true })); toast(`${CAT[data.cat] || '기타'} ₩${E.won(data.amount)} 넣었어요. 확인하고 저장하세요`); } else toast('금액을 못 찾았어요'); }); });
document.addEventListener('change', e => { if (e.target.id !== 'rcpt-file' || !e.target.files[0]) return; const file = e.target.files[0]; e.target.value = ''; busy(async () => {
  const img = await createImageBitmap(file); const k = Math.min(1, 1280 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const { data, error } = await sb.functions.invoke('receipt-read', { body: { store_id: S.store.id, image: c.toDataURL('image/jpeg', .85) } }); if (error || !data?.ok) return toast(data?.msg || '사진을 못 읽었어요');
  const f = $('#report-form'); if (!f) return; const set = (n, v) => { if (v != null && f.elements[n]) f.elements[n].value = v; };
  set('sales', data.sales); set('card', data.card); set('transfer', data.transfer); set('entries', data.count); if (data.date && data.date <= TODAY) set('date', data.date); if (data.card || data.transfer) f.querySelector('details.more')?.setAttribute('open', ''); closeCalc(); toast('사진에서 읽었어요. 숫자 확인하고 마감하세요'); }); });
sb.auth.onAuthStateChange((_e, session) => { if (_e === 'SIGNED_OUT' && S.user && !S.byMe) { closeSheet(); setTimeout(() => toast('로그아웃됐어요. 다시 로그인해 주세요'), 300); } if (_e === 'PASSWORD_RECOVERY') setTimeout(() => openSheet(`<h2>새 비밀번호</h2><p class="sub">6자 이상으로 정해 주세요.</p><form class="f" id="newpw-form"><label class="fl">새 비밀번호<input name="pw" type="password" minlength="6" required autocomplete="new-password"></label><label class="fl">한 번 더<input name="pw2" type="password" minlength="6" required autocomplete="new-password"></label><button class="btn pri full">바꾸기</button></form>`), 400); const u = session?.user || null; if (!booted || u?.id !== S.user?.id) { booted = true; S.user = u; setTimeout(boot); } });
async function boot() {
  try {
    if (!S.pricingLoaded) { applyPricing(await q(sb.from('pricing').select('key,amount'))); S.pricingLoaded = true; pushState(); } // 가격은 서버 한 곳
    const pr = new URLSearchParams(location.search); if (pr.get('share')) return shareView(pr.get('share'));
    if (S.user && pr.get('pay')) { history.replaceState(null, '', location.pathname); await payReturn(pr); } if (S.user && pr.get('altpay')) { history.replaceState(null, '', location.pathname); await altpayReturn(pr); }
    if (!S.user) { Object.assign(S, { mode: 'auth', onb: null, tab: null, sub: null, company: null, stores: [], store: null }); return render(); }
    S.prof = (await q(sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle())) || { name: '' };
    const mem = await q(sb.from('members').select('*').eq('user_id', S.user.id).eq('active', true));
    const owner = mem.find(m => m.role === 'owner'), mgr = mem.find(m => m.role === 'manager'), staff = mem.filter(m => m.role === 'staff');
    if (S.prof.is_hq) { S.mode = 'hq'; S.tab = S.tab || 'dash'; await loadHQ(); }
    else if (owner || mgr) {
      S.mode = 'store'; S.myRole = owner ? 'owner' : 'manager'; S.me = owner || mgr;
      S.company = await q(sb.from('companies').select('*').eq('id', S.me.company_id).maybeSingle()); S.active = compActive(S.company);
      S.stores = owner ? await q(sb.from('stores').select(STORE_COLS).eq('company_id', owner.company_id).order('created_at')) : await q(sb.from('stores').select(STORE_COLS).eq('id', mgr.store_id));
      S.store = S.stores.find(s => s.id === (S.store?.id || lsGet('ev_store'))) || S.stores[0]; S.tab = S.tab || 'home'; await loadStore();
    } else if (staff.length) { S.mode = 'staff'; S.my = staff; S.tab = S.tab || 'work'; await loadStaff(); }
    else if (S.prof.kind === 'dealer') { S.mode = 'dealer'; S.tab = S.tab || 'jobs'; await loadDealer(); }
    else S.mode = 'onboard';
    const go = new URLSearchParams(location.search).get('go'); if (go && !S.goDone) { S.goDone = 1; const t = { store: { sched: 'sched', sales: 'sales', jobs: 'jobs', docs: 'staff' }, staff: { sched: 'work', docs: 'work', sales: 'work', jobs: 'jobs', attend: 'attend' }, dealer: { jobs: 'jobs', sched: 'mywork', docs: 'mywork' } }[S.mode]?.[go]; if (t) S.tab = t; if (go === 'attend' && S.mode === 'store') { S.tab = 'more'; S.sub = 'qr'; } }
  } catch (e) { console.error(e); }
  render();
}
async function loadStore() {
  const st = S.store.id, [first, last] = monthRange(), h0 = new Date(S.y, S.m - 6, 1), hFirst = E.ymd(h0.getFullYear(), h0.getMonth() + 1, 1);
  S.members = (await q(sb.from('members').select('*').eq('store_id', st).eq('active', true).order('created_at'))).sort((a, b) => rankOf(a) - rankOf(b));
  /* 퇴사·삭제한 직원도 퇴사 전 근무분은 지난달 인건비에 남게 */
  S.gone = ((await sb.from('members').select('*').eq('store_id', st).eq('active', false)).data || []).filter(p => p.role !== 'owner' && (p.checks?.out?.at || '') >= hFirst);
  const ids = S.members.map(m => m.id).concat(S.gone.map(m => m.id));
  S.tpl = ids.length ? await q(sb.from('shift_templates').select('*').in('member_id', ids)) : [];
  S.ov = ids.length ? await q(sb.from('shift_overrides').select('*').in('member_id', ids).gte('work_date', hFirst).lte('work_date', last)) : [];
  S.dc = (await q(sb.rpc('dealer_count')))?.[0]; S.nmKey = S.rdKey || nmKey(); S.round = (await q(sb.from('sched_rounds').select('*').eq('store_id', st).eq('month', S.nmKey).neq('status', 'reset')))[0] || null; S.avails = S.round && ids.length ? await q(sb.from('sched_avail').select('*').in('member_id', ids).eq('month', S.nmKey)) : [];
  S.coMonth = S.stores.length > 1 && isOwner() ? await q(sb.rpc('company_month', { p_month: thisMonth() })) : null;
  S.attStore = await q(sb.from('attendance').select('member_id,kind,at').eq('store_id', st).gte('at', first + 'T00:00:00+09:00').lte('at', addDay(last, 1) + 'T12:00:00+09:00'));
  S.reqs = ids.length ? await q(sb.from('shift_reqs').select('*').in('member_id', ids).eq('status', 'wait').order('work_date')) : []; S.offers = ids.length ? await q(sb.from('shift_offers').select('*').in('member_id', ids).gte('work_date', TODAY)) : []; S.fixes = ids.length ? ((await sb.from('att_fix').select('*').in('member_id', ids).eq('status', 'wait').order('at')).data || []) : [];
  S.swaps = ids.length ? ((await sb.from('shift_swaps').select('*').in('from_member', ids).eq('status', 'mgr').order('work_date')).data || []) : []; S.lock = ((await sb.from('pay_locks').select('*').eq('store_id', st).eq('month', first).eq('on_', true)).data || [])[0] || null;
  S.hist = await q(sb.from('daily_reports').select('*').eq('store_id', st).gte('report_date', hFirst).lte('report_date', last).order('report_date', { ascending: false }));
  S.reports = S.hist.filter(r => r.report_date >= first);
  S.expAll = await q(sb.from('expenses').select('*').eq('store_id', st).gte('spent_on', hFirst).lte('spent_on', last));
  S.expenses = S.expAll.filter(x => x.spent_on >= first);
  S.inc = ids.length ? await q(sb.from('incentives').select('*').in('member_id', ids).eq('month', first)) : [];
  S.expiry = (await sb.from('store_notes').select('id,title,data').eq('store_id', st).eq('kind', 'expiry').is('status', null)).data || [];
  [S.marks, S.adv] = ids.length ? (await Promise.all([sb.from('pay_marks').select('*').in('member_id', ids).eq('month', first), sb.from('advances').select('*').in('member_id', ids).eq('month', first).order('given_on')])).map(r => r.data || []) : [[], []];
  S.posts = (await q(sb.from('job_posts').select('*').eq('store_id', st).order('created_at', { ascending: false }).limit(20))).map(p => p.status === 'open' && p.expires_at && new Date(p.expires_at) < Date.now() ? { ...p, status: 'expired' } : p);
  // 서로 기다릴 필요 없는 조회는 동시에 (첫 화면 빨라짐)
  const [joins, docs, rank, notis, nTop, quests, stock, orders, goals, fixedM, open] = await Promise.all([
    q(sb.rpc('join_list', { p_store: st })), q(sb.from('contracts').select('id,member_id,kind,title,status,token,created_at,signed_at').eq('store_id', st).neq('status', 'void').order('created_at', { ascending: false }).limit(200)),
    q(sb.rpc('store_rank', { p_store: st, p_from: first, p_to: last })),
    q(sb.from('notifications').select('*').neq('hidden', true).order('created_at', { ascending: false }).limit(20)), q(sb.from('notices').select('id,title,created_at').order('created_at', { ascending: false }).limit(1)),
    q(sb.from('store_quests').select('*').eq('store_id', st)), q(sb.from('stock').select('*').eq('store_id', st).order('item_id')),
    q(sb.from('orders').select('*').eq('store_id', st).order('created_at', { ascending: false }).limit(30)), q(sb.from('store_goals').select('month,goal').eq('store_id', st)),
    q(sb.from('store_fixed').select('month,fixed').eq('store_id', st).order('month')), q(sb.from('day_opens').select('*').eq('store_id', st).eq('day', bizDay()))]);
  S.joins = joins; S.docs = docs; S.rank = rank?.[0] || null; S.notis = notis; S.noticeTop = nTop[0] || null; S.quests = quests; S.stock = stock; S.orders = orders;
  S.goals = Object.fromEntries(goals.map(g => [g.month, +g.goal])); S.fixedM = fixedM; S.open = open[0] || null;
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
  const mine = S.my[S.mi || 0]; S.store = (await q(sb.from('stores').select(STORE_COLS).eq('id', mine.store_id).maybeSingle())) || {};
  const [first, last] = monthRange();
  S.members = S.my; S.tpl = await q(sb.from('shift_templates').select('*').in('member_id', S.my.map(m => m.id)));
  S.ov = await q(sb.from('shift_overrides').select('*').in('member_id', S.my.map(m => m.id)).gte('work_date', addDay(first, -7)).lte('work_date', addDay(last, 7)));
  S.myOffers = await q(sb.from('shift_offers').select('*').in('member_id', S.my.map(m => m.id)).gte('work_date', TODAY).order('work_date')); S.myReqs = await q(sb.from('shift_reqs').select('*').in('member_id', S.my.map(m => m.id)).order('created_at', { ascending: false }).limit(5)); S.myFix = (await sb.from('att_fix').select('*').in('member_id', S.my.map(m => m.id)).order('created_at', { ascending: false }).limit(5)).data || [];
  { const ids = S.my.map(m => m.id).join(','); S.mySwaps = (await sb.from('shift_swaps').select('*').or(`from_member.in.(${ids}),to_member.in.(${ids})`).gte('work_date', addDay(TODAY, -7)).order('created_at', { ascending: false }).limit(10)).data || []; }
  { const cm = TODAY.slice(0, 8) + '01', cr = (await q(sb.from('sched_rounds').select('status').eq('store_id', S.my[S.mi || 0].store_id).eq('month', cm)))[0]; S.nmKey = cr && !['done', 'reset'].includes(cr.status) ? cm : nmKey(); }
  { const [ny, nm] = S.nmKey.split('-').map(Number); S.round = (await q(sb.from('sched_rounds').select('*').eq('store_id', S.my[S.mi || 0].store_id).eq('month', S.nmKey).neq('status', 'reset')))[0] || null; S.myAvail = S.round ? (await q(sb.from('sched_avail').select('*').eq('member_id', S.my[S.mi || 0].id).eq('month', S.nmKey)))[0] || null : null; S.nextOv = S.round && ['sent', 'done'].includes(S.round.status) ? await q(sb.from('shift_overrides').select('*').in('member_id', S.my.map(m => m.id)).gte('work_date', S.nmKey).lte('work_date', E.ymd(ny, nm, E.daysIn(ny, nm)))) : []; }
  S.myStores = S.my.length > 1 ? Object.fromEntries((await q(sb.from('stores').select('id,name').in('id', S.my.map(m => m.store_id)))).map(s => [s.id, s.name])) : {};
  S.inc = await q(sb.from('incentives').select('*').in('member_id', S.my.map(m => m.id)).eq('month', first));
  [S.marks, S.adv] = (await Promise.all([sb.from('pay_marks').select('*').in('member_id', S.my.map(m => m.id)), sb.from('advances').select('*').in('member_id', S.my.map(m => m.id)).eq('month', first)])).map(r => r.data || []);
  S.att = await q(sb.from('attendance').select('*').order('at', { ascending: false }).limit(10));
  S.academy = await q(sb.rpc('my_academy')); S.lessons = await q(sb.from('lesson_progress').select('lesson'));
  S.quizRes = (await q(sb.from('quiz_results').select('score,passed,total').order('created_at', { ascending: false }).limit(1)))[0] || null;
  S.myQuiz = S.academy ? await q(sb.rpc('my_quiz')) : null;
  S.myDocs = await q(sb.rpc('my_docs'));
  await loadDealer();
}
async function loadDealer() {
  if (lsGet('ev_att') && S.mode === 'staff') { const c = lsGet('ev_att'); lsSet('ev_att', ''); try { const { data: k, error } = await attendGeo(c); setTimeout(() => toast(error ? (/코드가 맞지/.test(error.message) ? 'QR이 지났어요. 매장 화면의 새 QR을 찍거나 번호를 넣어주세요' : koErr(error.message)) : k === 'in' ? 'QR로 출근했어요. 오늘도 화이팅!' : 'QR로 퇴근했어요. 수고하셨어요'), 700); } catch { } }
  if (lsGet('ev_join') && S.mode === 'dealer') { const c = lsGet('ev_join'); lsSet('ev_join', ''); try { const { data: nm, error } = await sb.rpc('request_join', { p_code: c }); if (!error) setTimeout(() => toast(`초대받은 ${nm}에 소속 신청했어요. 승인되면 알림이 와요`), 600); } catch { } }
  if (lsGet('ev_post')) { S.hlPost = lsGet('ev_post'); lsSet('ev_post', ''); S.tab = 'jobs'; }
  S.board = (await q(sb.rpc('job_board'))).filter(j => !j.expires_at || new Date(j.expires_at) > Date.now()); S.tickets = await q(sb.rpc('ticket_balance'));
  S.apps = await q(sb.rpc('my_applications')); S.slots = await q(sb.rpc('my_slots2'));
  [S.saves, S.myBlocks] = (await Promise.all([sb.from('dealer_saves').select('*').eq('on_', true), sb.from('blocks').select('store_id,at').eq('by', 'dealer').eq('on_', true)])).map(r => r.data || []); S.slotDays = await sb.rpc('my_slot_days').then(r => r.data || [], () => []);
  S.wallet = (await q(sb.rpc('my_wallet')))?.[0] || { balance: 0, available: 0 }; if (S.mode === 'dealer') { if (lsGet('ev_ref') && !S.prof?.ref_by) { const c = lsGet('ev_ref'); lsSet('ev_ref', ''); sb.rpc('set_ref', { p_code: c }).then(({ data, error }) => { if (!error) { S.prof.ref_by = 1; toast(`${data}님 초대로 가입했어요`); } }); } S.spinN = await q(sb.rpc('spin_left')); S.spins = await q(sb.from('dealer_spins').select('hand,points,created_at').order('created_at', { ascending: false }).limit(5)); } S.rep = await q(sb.rpc('dealer_rep', { u: S.user.id })).catch(() => null);
  S.notis = await q(sb.from('notifications').select('*').neq('hidden', true).order('created_at', { ascending: false }).limit(30));
  S.inq = await q(sb.from('inquiries').select('*').eq('from_user', S.user.id).order('created_at', { ascending: false }));
  S.wds = await q(sb.from('withdrawals').select('*').eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(10));
}
async function loadHQ() {
  const [first, last] = monthRange();
  S.stats = await q(sb.rpc('hq_store_stats', { p_from: first, p_to: last })); S.refRep = await q(sb.rpc('hq_ref_report')).catch(() => []);
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
  S.traffic = (await sb.rpc('hq_traffic', { p_days: 30 })).data || null;
}
const payOf = p => { const r = E.payroll(p, S.y, S.m, S.tpl, S.ov, S.inc.filter(i => i.member_id === p.id).reduce((a, i) => a + i.amount, 0), TODAY, night()), meal = p.contract === '4대' ? Math.min(200000, +p.checks?.meal || 0) : 0, adv = (S.adv || []).filter(x => x.member_id === p.id).reduce((a, x) => a + x.amount, 0);
  // 비과세 식대(월 20만 한도, 4대보험 근로자만): 지급액엔 더하고 공제 계산엔 안 넣음 / 가불: 이체할 돈에서만 뺌
  const h = typeof holPay === 'function' ? holPay(p) : { done: 0, full: 0 }; if (h.full) { const g = r.gross + h.done, ded = E.dedOf(g, p.contract), fg = r.fullGross + h.full; return { ...r, hol: h.done, meal, adv, gross: g + meal, ded, net: g - ded + meal, fullGross: fg + meal, fullNet: fg - E.dedOf(fg, p.contract) + meal, xfer: Math.max(0, g - ded + meal - adv) }; }
  return { ...r, meal, adv, gross: r.gross + meal, fullGross: r.fullGross + meal, net: r.net + meal, xfer: Math.max(0, r.net + meal - adv) }; };
const monFirst = () => E.ymd(S.y, S.m, 1), markOf = id => (S.marks || []).find(x => x.member_id === id && x.month === monFirst());
const laborOf = (y, m) => S.members.filter(p => p.role !== 'owner').reduce((a, p) => { const r = E.payroll(p, y, m, S.tpl, S.ov, 0, TODAY, night()); return a + r.fullGross * (p.contract === '4대' ? 1.105 : 1); }, 0)
  + (S.gone || []).filter(p => p.checks.out.at >= E.ymd(y, m, 1)).reduce((a, p) => a + E.payroll(p, y, m, S.tpl, S.ov, 0, p.checks.out.at, night()).gross * (p.contract === '4대' ? 1.105 : 1), 0);

// ===== 화면 틀 =====
const TABS = {
  store: [['home', '', '홈'], ['sched', '', '스케줄'], ['sales', '', '매출'], ['staff', '', '직원'], ['jobs', '', '구인'], ['market', '', '장터']],
  staff: [['work', '', '내 근무'], ['attend', '', '출퇴근'], ['jobs', '', '구인'], ['wallet', '', '지갑'], ['me', '', '내 정보']],
  dealer: [['jobs', '', '구인'], ['mywork', '', '내 근무'], ['lounge', '', '라운지'], ['wallet', '', '지갑'], ['me', '', '내 정보']],
  hq: [['dash', '', '대시보드'], ['stores', '', '매장'], ['goods', '', '상품'], ['data', '', '데이터'], ['inq', '', '문의함'], ['notice', '', '공지'], ['fr', '', '가맹'], ['rep', '', '신고·정지']]
};
// 탭·상단 아이콘: 이모지 대신 단색 선 아이콘 (기기마다 같은 모양)
const ICON = { home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', sched: '<path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4"/>', sales: '<circle cx="12" cy="12" r="9"/><path d="M8 9l1.5 6 2.5-5 2.5 5L16 9M8 12h8"/>',
  staff: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-5-6.3"/>', jobs: '<path d="M3 10v4h3l8 5V5L6 10H3zM18 9a4 4 0 0 1 0 6"/>', market: '<path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2"/>',
  work: '<path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4"/>', attend: '<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.5"/>', wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7a2 2 0 0 1 2-2h12M16 13h5v4h-5a2 2 0 0 1 0-4z"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', mywork: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 8l2.5 3.5L12 15l-2.5-3.5z"/>', dash: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
  stores: '<path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6M4 21h16"/>', goods: '<path d="M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8"/>', data: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  inq: '<path d="M4 5h16v11H9l-5 4V5z"/>', notice: '<path d="M3 10v4h3l8 5V5L6 10H3zM18 9a4 4 0 0 1 0 6"/>', fr: '<path d="M3 21h18M5 21V9h5v12M14 21V4h5v17"/>', settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h13"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><circle cx="19" cy="12" r="2"/>' };
ICON.refresh = '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>'; ICON.menu = '<path d="M4 7h16M4 12h16M4 17h16"/>';
const svg = k => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
ICON.lounge = ICON.market; ICON.rep = '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M12 8v5M12 16v.5"/>';
function render() {
  clearInterval(S.qrTimer);
  { const vk = TODAY + (S.mode || 'guest'); if (S.vk !== vk && !location.pathname.includes('/demo')) { S.vk = vk; let vid = lsGet('ev_vid'); if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); lsSet('ev_vid', vid); } let rf = ''; try { rf = document.referrer && !document.referrer.includes(location.host) ? new URL(document.referrer).host : ''; } catch { } sb.rpc('log_visit', { p_vid: vid, p_mode: S.mode || 'guest', p_path: location.pathname, p_ref: rf, p_ua: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? (matchMedia('(display-mode: standalone)').matches ? 'app' : 'mobile') : 'pc' }).then(() => { }, () => { }); } }
  const tabs = TABS[S.mode]?.filter(([k]) => !hideTab(k)), nav = $('#tabs'); if (tabs && hideTab(S.tab)) S.tab = tabs[0]?.[0] || 'home'; nav.hidden = !tabs;
  const g = S.mode === 'store' ? groupOf() : S.tab;
  if (tabs) nav.innerHTML = tabs.map(([k, i, l]) => `<button ${k === 'market' ? 'data-act="sub" data-v="used"' : `data-tab="${k}"`} ${g === k ? 'aria-current="page"' : ''}><span>${ICON[k] ? svg(k) : i}</span>${l}</button>`).join('');
  ($('#top-r') || {}).innerHTML = S.user ? `${S.mode === 'store' ? `<button class="btn sm icon ${S.sub === 'notice' ? 'on' : ''}" data-act="sub" data-v="notice" title="운영사 공지" aria-label="운영사 공지">${svg('notice')}<i class="il">공지</i></button><button class="btn sm icon ${S.sub === 'inq' ? 'on' : ''}" data-act="sub" data-v="inq" title="운영사 문의" aria-label="운영사 문의">${svg('inq')}<i class="il">문의</i></button><button class="btn sm icon ${S.sub === 'settings' ? 'on' : ''}" data-act="sub" data-v="settings" title="매장 설정" aria-label="매장 설정">${svg('settings')}<i class="il">설정</i></button>` : ''}<button class="btn sm icon bell" data-act="notis" title="알림" aria-label="알림${(S.notis || []).filter(x => !x.read).length ? ` ${(S.notis || []).filter(x => !x.read).length}개 안 읽음` : ''}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg><i class="il">알림</i>${(S.notis || []).filter(x => !x.read).length ? `<b class="nbdg">${Math.min(99, (S.notis || []).filter(x => !x.read).length)}</b>` : ''}</button><button class="btn sm icon" data-act="refresh" title="새로고침" aria-label="새로고침">${svg('refresh')}<i class="il">새로고침</i></button><button class="btn sm icon" data-act="menu" title="메뉴 · 화면 색" aria-label="메뉴 · 화면 색">${svg('menu')}<i class="il">메뉴</i></button>` : '';
  const V = { auth: vAuth, onboard: vOnboard,
    store: () => ((S.tab === 'more' && S.sub === 'daily' ? vDaily : 0) || ({ improve: vImprove, home: vHome, sched: vSched, sales: vSales, staff: vStaff, jobs: vJobs, more: vMore }[S.tab] || vHome))(),
    staff: () => staffNotice() + ({ learn: vLearn, work: vWork, attend: vAttend, jobs: vBoard, wallet: vWallet, me: vMe }[S.tab] || vWork)(),
    dealer: () => ({ jobs: vBoard, mywork: vMyWork, lounge: vLounge, wallet: vWallet, me: vMe }[S.tab] || vBoard)(),
    hq: () => ({ dash: vHqDash, goods: vHqGoods, stores: vHqStores, data: vHqData, inq: vHqInq, notice: vHqNotice, fr: vHqFr, rep: vHqRep }[S.tab] || vHqDash)() };
  const lock = S.mode === 'store' && S.company && !S.active ? `<div class="lockbar"><div><b>무료 체험이 끝났어요.</b> 지금은 보기만 돼요 — 입력한 데이터는 그대로 있어요.</div>${isOwner() ? `<span class="row"><button class="btn sm" data-act="plan" data-v="basic">베이직 ₩${E.won(PRICE.basic)}</button><button class="btn sm gold" data-act="plan" data-v="pro">프로 ₩${E.won(PRICE.pro)}</button></span>` : '<button class="btn sm" data-act="ask-owner" data-v="요금제">대표님께 요청</button>'}</div>` : '';
  const c = S.company, paidPlan = c && (c.plan === 'pro' || c.plan === 'basic') && c.paid_until && new Date(c.paid_until) > now;
  const planbar = S.mode === 'store' && S.tab === 'home' && !S.sub && c && S.active && isOwner() ? `<div class="planbar"><div>${paidPlan ? `<b>${c.plan === 'pro' ? '프로' : '베이직'} 이용 중</b><small>${new Date(c.paid_until).toLocaleDateString('ko-KR')}까지 · 회사당 월 ₩${E.won(c.plan === 'pro' ? PRICE.pro : PRICE.basic)}</small>` : `<b>무료 체험 D-${trialLeft(c)}</b><small>끝나면 베이직 ₩${E.won(PRICE.basic)} · 프로 ₩${E.won(PRICE.pro)} (회사당 월) · 끝나도 데이터는 그대로 남아요</small>`}</div><button class="btn sm ${paidPlan && c.plan === 'pro' ? '' : 'gold'}" data-act="sub" data-v="pricing">${paidPlan ? '요금제 관리' : '요금제 보기'}</button></div>` : '';
  view.innerHTML = lock + planbar + (V[S.mode] || vAuth)(); enhanceInputs(view); S.dirty = false;
  if (S.mode === 'store' && S.tab === 'more' && S.sub === 'qr') startQR();
  if (S.mode === 'store' && S.tab === 'more' && S.sub === 'rot' && S.rot) rotTick();
  if (S.mode === 'store' && S.tab === 'sales') closeCalc();
  if (S.mode === 'store' && S.tab === 'jobs') feeBox();
  if (S.mode === 'dealer' && S.tab === 'lounge') loungeLoad();
  if (S.mode === 'hq' && S.tab === 'rep') hqRepLoad();
  if (S.mode === 'store' && (S.tab === 'sales' || S.tab === 'home') && S.store) tossLoad();
  if ((S.mode === 'store' && (S.tab === 'home' || !S.tab)) || S.mode === 'staff') noticesLoad();
  moneyPop(); basicsCheck(); draftRestore(); if (S.user && !S.pinChecked) { S.pinChecked = 1; pinLock(); }
  if (lock && !S.lockAsked) { S.lockAsked = 1; openSheet(`<h2>무료 체험 한 달이 끝났어요</h2><p class="sub">매출·직원·스케줄 등 입력하신 내용은 <b>모두 저장돼 있어요.</b> 지금은 보기만 돼요. 연장하시겠어요?</p>
    ${isOwner() ? `<div class="plans"><div class="plan"><b>베이직</b><b class="num">월 ₩${E.won(PRICE.basic)}</b><button class="btn sm" data-act="plan" data-v="basic">베이직으로 연장</button></div><div class="plan cur"><span class="pill y">추천</span><b>프로</b><b class="num">월 ₩${E.won(PRICE.pro)}</b><button class="btn sm gold" data-act="plan" data-v="pro">프로로 연장</button></div></div>` : '<p class="note">요금제는 대표님만 바꿀 수 있어요.</p><button class="btn full" data-act="ask-owner" data-v="요금제">대표님께 요청</button>'}
    <button class="btn full" data-act="sub" data-v="pricing" style="margin-top:8px">요금표 자세히 보기</button><button class="btn full" data-act="close" style="margin-top:8px">나중에 할게요</button>`); }
}

// ===== 로그인·첫 설정 =====
function vAuth() {
  const up = S.authMode === 'signup';
  return `<div class="hero"><img src="icon-512.png" width="96" height="96" alt=""><h1>+EV</h1><p class="sub">홀덤펍 매출·스케줄·급여·구인을 한 곳에서 · <a href="guide.html" target="_blank" rel="noopener">사용 가이드</a></p></div>
  <div class="card"><div class="seg" style="margin-bottom:14px"><button data-act="authmode" data-v="login" aria-pressed="${!up}">로그인</button><button data-act="authmode" data-v="signup" aria-pressed="${up}">처음이에요 (가입)</button></div>
  <form class="f" id="auth-form">${up ? '<label class="fl">이름<input name="name" required autocomplete="name"></label>' : ''}
    <label class="fl">이메일<input name="email" type="email" required autocomplete="email"></label>
    <label class="fl">비밀번호 <span class="pwwrap"><input name="pw" type="password" minlength="6" required autocomplete="${up ? 'new-password' : 'current-password'}"><span role="button" tabindex="0" class="pweye" data-act="pw-eye" aria-label="비밀번호 보기">👁</span></span></label>
    ${up ? '<label class="tog"><span><b>이용약관 · 개인정보 처리방침 동의 (필수)</b><small><a href="legal.html" target="_blank" rel="noopener">전문 보기</a></small></span><input type="checkbox" name="terms" required></label>' : ''}
    <button class="btn pri full" type="submit">${up ? '가입하기' : '로그인'}</button>${up ? '' : '<p class="note" style="text-align:center"><button type="button" class="tlink" data-act="pw-forgot">비밀번호를 잊으셨나요?</button></p>'}</form>${location.pathname.includes('/demo') ? '' : `<div class="or"><span>또는</span></div><button type="button" class="btn full kakao" data-act="kakao">카카오로 ${up ? '시작하기' : '로그인'}</button>`}${up ? '<p class="note">가입하면 바로 시작돼요. 가입하면 <a href="legal.html#terms" target="_blank" rel="noopener">이용약관</a>과 <a href="legal.html#privacy" target="_blank" rel="noopener">개인정보처리방침</a>에 동의한 것으로 봐요.</p>' : ''}</div>
  <div class="card" style="margin-top:12px"><h3>요금 안내</h3><p class="sub" style="margin:6px 0">첫 달 무료 · 베이직 매장당 월 ${E.won(PRICING.basicMonthly)}원 · 프로 매장당 월 ${E.won(PRICING.proMonthly)}원 · 딜러 구인 공고 무료</p><p class="note"><a href="legal.html#pricing" target="_blank" rel="noopener">상품·요금 자세히</a> · <a href="legal.html#refund" target="_blank" rel="noopener">환불 규정</a></p></div>
  <footer class="note" style="margin:18px 0 8px;line-height:1.7;opacity:.75">플러스이브이 · 대표 김경인 · 사업자등록번호 430-51-01099<br>서울특별시 구로구 경서로 7, 1층 101호(개봉동, 드림빌) · 전화 010-4823-2636 · skifighting@gmail.com<br>통신판매업 신고 진행 중 · <a href="legal.html#terms" target="_blank" rel="noopener">이용약관</a> · <a href="legal.html#privacy" target="_blank" rel="noopener">개인정보처리방침</a></footer>`;
}
function vOnboard() {
  const k = S.onb;
  if (!k) return `<h1>반가워요${S.prof.name ? `, ${esc(S.prof.name)}님` : ''}!</h1><p class="sub">어떤 분이세요?</p>
    <div class="choice"><button data-act="onb" data-v="owner"><b>대표·점장 및 매장이에요</b><small>매장 PC에 켜 두고 매출·스케줄·급여·구인을 관리해요. 처음 등록은 사업자등록번호가 필요해요.</small></button>
    <button data-act="onb" data-v="dealer"><b>딜러·스태프예요</b><small>공고를 보고 지원하거나, 매장 가입코드로 소속될 수 있어요. 공고 지원은 무료예요.</small></button></div>
    <p class="note">점장도 먼저 딜러·스태프로 가입해 매장 초대 링크(가입코드)로 소속 신청하세요. 대표님이 승인한 뒤 점장 권한을 주면 돼요.</p>`;
  if (k === 'owner') return `<h1>매장 등록</h1><p class="sub">사업자등록번호가 없으면 가입할 수 없어요. 첫 달 무료로 시작해요.</p>
    <form class="f card" id="owner-form"><label class="fl">회사(상호)<input name="name" required placeholder="예: 로얄플러시"></label>
    <label class="fl">브랜드 (프랜차이즈면)<input name="brand" list="brand-list" autocomplete="off" placeholder="골라도 되고 직접 써도 돼요 · 없으면 비워두세요"><datalist id="brand-list"><option value="ES 홀덤펍"><option value="KPC 홀덤"><option value="KT Stadium"><option value="MZ"><option value="VIP홀덤펍"><option value="WDHL"><option value="WDHL JUNIOR"><option value="골드버튼 홀덤펍"><option value="러너펍"><option value="몬스터홀덤펍"><option value="미믹"><option value="블랙레이디"><option value="쇼다운홀덤펍"><option value="시저스홀덤"><option value="액시스 홀덤펍"><option value="야자수"><option value="엠더블유(MW)홀덤펍"><option value="잭펍(JACKPUB)"><option value="젠틀래빗"><option value="포카드 홀덤펍"><option value="하이롤러"><option value="홀덤클라쓰"><option value="홀팡(HOLPANG)"></datalist></label>
    <label class="fl">사업자등록번호 (10자리)<input name="biz" required inputmode="numeric" placeholder="123-45-67890"></label>
    <label class="fl">첫 매장 이름<input name="store" required placeholder="예: 강남 1호점"></label>
    <label class="fl">지역<input name="area" placeholder="예: 서울 강남"></label>
    <label class="fl">추천인 <small class="mut">(선택 · 소개해 준 분 이름)</small><input name="ref" placeholder="없으면 비워두세요"></label>
    <label class="fl">대표님 이름<input name="nick" required value="${esc(S.prof.name)}"></label>
    <button class="btn pri full">매장 만들기</button><button class="btn full" type="button" data-act="onb" data-v="">뒤로</button></form>`;
  return `<h1>딜러·스태프로 시작</h1><p class="sub">매장이 지원자 목록에서 보는 내용이에요. 연락처는 채용된 뒤에만 매장에 보여요.</p>
    <form class="f card" id="dealer-form"><label class="fl">이름(닉네임)<input name="name" required value="${esc(S.prof.name)}"></label>
    <label class="fl">휴대폰<input name="phone" required inputmode="tel" placeholder="010-0000-0000"></label>
    <label class="fl">태어난 해 <small class="mut">홀덤펍은 성인만 일할 수 있어요</small><select name="birth" required><option value="">선택</option>${Array.from({ length: 60 }, (_, i) => now.getFullYear() - 19 - i).map(y => `<option>${y}</option>`).join('')}<option value="minor">${now.getFullYear() - 18}년 이후</option></select></label>
    <label class="fl">경력 (개월)<input name="career" type="number" min="0" value="0"></label>
    ${skillPick([])}
    <label class="fl">자기소개<textarea name="bio" rows="3" placeholder="예: 2년차 딜러, 토너먼트 진행 가능, 야간 가능"></textarea></label>
    <button class="btn pri full">시작하기</button><button class="btn full" type="button" data-act="onb" data-v="">뒤로</button></form>`;
}

// ===== 대표·점장 =====
// 하단 탭 하나에 세부 메뉴를 묶음 (더보기 없음)
const SUBNAV = { home: [['home', null, '브리핑'], ['improve', null, '매장 개선'], ['more', 'pnl', '월간 손익'], ['more', 'daily', '일 매출'], ['more', 'pricing', '요금제']], sched: [['sched', null, '근무표'], ['more', 'rot', '테이블 로테이션'], ['more', 'qr', '출퇴근 코드']],
  sales: [['sales', null, '오픈·마감'], ['more', 'order', '재고·발주']], staff: [['staff', null, '직원·급여'], ['more', 'edu', '교육']], jobs: [['jobs', null, '우리 공고 올리기'], ['more', 'board', '전체 구인 공고']], market: [['more', 'used', '중고 장터'], ['more', 'transfer', '점포 양도양수'], ['more', 'franchise', '가맹 모집']] };
const SUB_GROUP = { pricing: 'home', franchise: 'market', board: 'jobs', notice: 'home', daily: 'home', pnl: 'home', rot: 'sched', qr: 'sched', order: 'sales', edu: 'staff', used: 'market', transfer: 'market' };
const groupOf = () => S.tab === 'more' ? SUB_GROUP[S.sub] || null : S.tab === 'improve' ? 'home' : S.tab;
function subnav() {
  const items = (SUBNAV[groupOf()] || []).filter(([, s]) => s !== 'transfer' || isOwner()); if (items.length < 2) return '';
  return `<nav class="subnav">${items.map(([t, s, l]) => { const on = t === 'more' ? S.tab === 'more' && S.sub === s : S.tab === t; return `<button ${t === 'more' ? `data-act="sub" data-v="${s}"` : `data-tab="${t}"`} ${on ? 'aria-current="page"' : ''}>${l}</button>`; }).join('')}</nav>`;
}
function storeHead(title) {
  return `<div class="row between sh"><div><h1>${title}</h1><p class="sub" style="margin:0">${esc(S.company?.name || '')} · ${esc(S.store?.name)}${S.company && !S.company.biz_verified ? ' · <button class="tlink warn" data-act="goto" data-t="more" data-s="settings">사업자번호 확인 필요</button>' : ''}</p></div>
  <div class="row">${S.stores.length > 1 ? `<select id="store-sel" class="sh-sel" aria-label="매장 선택" style="width:auto">${S.stores.map(s => `<option value="${s.id}" ${s.id === S.store.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}</div></div>` + subnav();
}
function monthNav() { return `<span class="row"><button class="btn sm" data-act="mon" data-v="-1">◀</button><b class="num">${S.y}년 ${S.m}월</b><button class="btn sm" data-act="mon" data-v="1">▶</button></span>`; }
function monthSummary(y, m) {
  const [f, l] = monthRange(y, m), rs = S.hist.filter(r => r.report_date >= f && r.report_date <= l), n = rs.length, sales = rs.reduce((a, r) => a + r.sales, 0);
  const cur = y === now.getFullYear() && m === now.getMonth() + 1, pm = cur && n < 3 ? (() => { const d0 = new Date(y, m - 2, 1), [pf, pl] = monthRange(d0.getFullYear(), d0.getMonth() + 1), pr = S.hist.filter(r => r.report_date >= pf && r.report_date <= pl); return pr.length >= 5 ? pr.reduce((a, r) => a + r.sales, 0) / pr.length : 0; })() : 0, proj = cur && n >= 3 ? sales / n * E.daysIn(y, m) : pm ? sales + pm * (E.daysIn(y, m) - n) : sales; // 보고 3일 미만이면 예상 대신 실제 합계
  const exp = {}; S.expAll.filter(x => x.spent_on >= f && x.spent_on <= l).forEach(x => exp[x.category] = (exp[x.category] || 0) + x.amount);
  const card = rs.reduce((a, r) => a + (r.card || 0), 0) * (+S.store.equip?.card_rate || 1.6) / 100 * (cur && n ? E.daysIn(y, m) / n : 1);
  if (!exp.card && card) exp.card = card;
  if (n || pm) Object.entries(fixedFor(y, m).fx).forEach(([k, v]) => { if (+v && !exp[k]) exp[k] = +v; });
  const urgent = S.posts.filter(p => p.kind === 'urgent' && p.created_at.slice(0, 10) >= f && p.created_at.slice(0, 10) <= l).reduce((a, p) => a + (p.paid_amount || 0), 0);
  const labor = laborOf(y, m) + urgent, cost = labor + Object.values(exp).reduce((a, v) => a + v, 0);
  const D = E.daysIn(y, m), el = cur ? Math.max(1, now.getDate() - 1) : D;
  return { est: !!pm, n, sales, proj, exp, labor, urgent, cost, left: proj - cost, el, earned: sales - cost * el / D, bep: proj ? Math.ceil(cost / (proj / D)) : null };
}
// ===== 보안·계정: 다시 확인 · PIN 잠금 · 알림함 · 방해 금지 · 백업 · 도움말 =====
const fresh = () => S.reauthAt && Date.now() - S.reauthAt < 5 * 60e3, isEmailUser = () => (S.user?.app_metadata?.provider || 'email') === 'email';
async function sha(t) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
function reauth(fn, why) {
  if (fresh() || (!isEmailUser() && !lsGet('ev_pin'))) { S.reauthAt = Date.now(); return fn(); }
  S.reauthFn = fn; openSheet(`<h2>본인 확인</h2><p class="sub">${esc(why || '중요한 작업이라 한 번 더 확인해요')}</p><form class="f" id="reauth-form">${isEmailUser() ? '<label class="fl">비밀번호<input name="pw" type="password" autocomplete="current-password" required></label>' : '<label class="fl">앱 잠금 PIN<input name="pin" type="password" inputmode="numeric" maxlength="6" required></label>'}<button class="btn pri full">확인</button><p class="note">5분 동안은 다시 묻지 않아요.</p></form>`);
}
function pinLock() {
  if (!lsGet('ev_pin') || !S.user || $('#pinlock')) return; const el = document.createElement('div'); el.id = 'pinlock';
  el.innerHTML = `<div class="pl-in"><b>⁺EV</b><p>PIN을 넣어주세요</p><input id="pl-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" aria-label="PIN"><small id="pl-msg"></small><button type="button" class="btn sm" data-act="pin-forgot">PIN을 잊었어요 (로그아웃)</button></div>`;
  document.body.appendChild(el); const inp = el.querySelector('#pl-pin'); setTimeout(() => inp.focus(), 50);
  inp.addEventListener('input', async () => { if (inp.value.length < 4) return; if (await sha(inp.value + S.user.id) === lsGet('ev_pin')) { el.remove(); S.pinTry = 0; S.reauthAt = Date.now(); } else if (inp.value.length >= (+lsGet('ev_pinlen') || 4)) { S.pinTry = (S.pinTry || 0) + 1; inp.value = ''; el.querySelector('#pl-msg').textContent = S.pinTry >= 5 ? '5번 틀려서 로그아웃해요' : `틀렸어요 (${S.pinTry}/5)`; if (S.pinTry >= 5) { lsSet('ev_pin', ''); setTimeout(() => location.reload(), 900); await sb.auth.signOut(); } } });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) S.hidAt = Date.now(); else if (S.hidAt && Date.now() - S.hidAt > 3 * 60e3) pinLock(); });
function notiSheet() {
  const L = S.notis || [];
  openSheet(`<div class="row between"><h2 style="margin:0">알림</h2><span class="row" style="gap:6px">${L.some(x => !x.read) ? '<button class="btn sm" data-act="noti-read">모두 읽음</button>' : ''}${L.length ? '<button class="btn sm" data-act="noti-clear">지우기</button>' : ''}</span></div>
  <div class="nlist">${L.map(x => `<div class="li ${x.read ? '' : 'unread'}"><span>${esc(x.body)}</span><small>${fmtDT(x.created_at)}</small></div>`).join('') || '<div class="empty">알림이 없어요</div>'}</div>
  ${L.length >= 20 ? '<button class="btn full" data-act="noti-more">이전 알림 더 보기</button>' : ''}<button class="btn sm" data-act="noti-cfg" style="margin-top:10px">알림 종류 켜고 끄기 · 방해 금지 시간</button>`);
}
async function backupSheet() {
  openSheet(`<h2>백업</h2><p class="sub">매주 일요일 밤 자동으로 저장해요 · 최근 8주</p><div id="bk-l"><small class="mut">불러오는 중…</small></div><button class="btn full" data-act="backup" style="margin-top:12px">지금 화면 데이터 바로 내려받기 (엑셀)</button>`);
  const { data } = await sb.from('store_backups').select('id,made_at').eq('store_id', S.store.id).order('made_at', { ascending: false }); const el = $('#bk-l');
  if (el) el.innerHTML = (data || []).map(b => `<div class="li"><span>${fmtDT(b.made_at)}</span><button class="btn sm" data-act="bk-get" data-v="${b.id}">내려받기</button></div>`).join('') || '<small class="mut">첫 자동 백업은 이번 주 일요일 밤에 만들어져요</small>';
}
const HELP = { bill: '매출에서 인건비·고정비·지출을 뺀 돈이에요. 이번 달은 지금 속도로 월말까지 간다고 보고 계산해요.', goal: '목표를 정하면 남은 날 하루에 얼마 팔아야 하는지 알려줘요.', lbud: '인건비가 매출의 몇 %인지예요. 홀덤펍은 보통 25~35%예요.', upc: '급여일·세금 신고·보건증·생일처럼 놓치기 쉬운 날을 모아 보여줘요.', pay: '어제까지 근무한 시간으로 계산해요. 이름을 누르면 기본급·야간·연장·주휴가 나와요.', leave: '5인 이상 매장, 주 15시간 이상 일하는 직원 기준이에요. 1년 미만은 매달 1일, 1년부터 15일이에요.', ops: '직원끼리 인수인계·고장·분실물을 남기고, 대표는 공지·투표를 올려요.', pos: '토스 POS를 연결하면 결제가 들어올 때마다 오늘 매출이 바로 쌓여요.' };
const help = k => `<button type="button" class="hq" data-act="help" data-v="${k}" aria-label="도움말">?</button>`;
// ===== 운영: 지금 매장 현황 · 태블릿 출퇴근 모드 · 직원별 매출 기여 · 매장끼리 비교 =====
function liveCard() {
  if (!S.store || !S.members.some(p => p.role !== 'owner')) return '';
  const today = bizDay(), last = {}; (S.attStore || []).filter(x => { const t = new Date(+new Date(x.at) - 6 * 36e5); return ymdOf(t) === today; }).sort((a, b) => a.at.localeCompare(b.at)).forEach(x => last[x.member_id] = x);
  const inNow = Object.values(last).filter(x => x.kind === 'in').map(x => S.members.find(p => p.id === x.member_id)).filter(Boolean), [y, m, d] = TODAY.split('-').map(Number);
  const plan = S.members.filter(p => p.role !== 'owner' && E.shiftOn(p.id, y, m, d, S.tpl, S.ov)).length, me = (S.toss || []).find(x => x.store_id === S.store.id), t = S.tossSum;
  return `<div class="card live"><div class="row between"><h3 style="margin:0"><i class="dot-live"></i>지금 매장</h3><small class="mut">${new Date().toTimeString().slice(0, 5)} 기준</small></div><div class="lv"><div><small>출근해 있는 사람</small><b class="num">${inNow.length}<i>/${plan}명</i></b><small>${inNow.map(p => esc(p.nick)).join(' · ') || '아직 없어요'}</small></div><div><small>오늘 매출</small><b class="num">${me ? '₩' + man(t?.total || 0) : '-'}</b><small>${me ? `토스 POS ${t?.n || 0}건` : '<button class="tlink" data-tab="sales">POS 연결하면 실시간 ›</button>'}</small></div><div><small>시작 시재</small><b class="num">${S.open ? '₩' + man(S.open.start_cash) : '-'}</b><small>${S.open ? fmtDT(S.open.opened_at).split(' ').slice(-2).join(' ') + ' 오픈' : '아직 오픈 전'}</small></div></div></div>`;
}
function contribCard() {
  const D = E.daysIn(S.y, S.m), by = {}, rs = S.hist.filter(r => r.report_date.startsWith(`${S.y}-${String(S.m).padStart(2, '0')}`) && r.sales); if (rs.length < 3) return '';
  rs.forEach(r => { const dd = +r.report_date.slice(8, 10), W = S.members.filter(p => p.role !== 'owner').map(p => { const t = E.shiftOn(p.id, S.y, S.m, dd, S.tpl, S.ov); return t ? [p, Math.max(0, hoursOf(t5(t.s), t5(t.e)) - (t.brk ?? 0) / 60)] : null; }).filter(Boolean), tot = W.reduce((a, [, h]) => a + h, 0); if (!tot) return; W.forEach(([p, h]) => { const b = by[p.id] = by[p.id] || { p, h: 0, s: 0 }; b.h += h; b.s += r.sales * h / tot; }); });
  const L = Object.values(by).filter(x => x.h >= 4).map(x => ({ ...x, ph: x.s / x.h })).sort((a, b) => b.ph - a.ph); if (L.length < 2) return ''; const mx = L[0].ph;
  return `<div class="card"><h3>직원별 매출 기여 <small>${S.m}월 · 근무한 시간만큼 그날 매출을 나눔 · 시급의 몇 배를 버는지</small></h3>${L.map(x => `<div class="cb"><span>${esc(x.p.nick)}</span><div class="bar"><i style="width:${x.ph / mx * 100}%"></i></div><b class="num">₩${man(x.ph)}${+x.p.hourly_rate ? ` · 시급의 ${(x.ph / x.p.hourly_rate).toFixed(1)}배` : ''}<small>/시간</small></b></div>`).join('')}<p class="note">근무 시간이 겹친 사람끼리 나눈 추정치예요. 시급 대비 기여를 볼 때 참고하세요.</p></div>`;
}
// ===== 매장 노트: 공지·인수인계·체크리스트·고장·분실물·사고·키·칭찬·투표·평가·발주처·유통기한 + 비상 연락 =====
const NK = { notice: ['공지', 'g'], handover: ['인수인계', ''], check: ['체크리스트', 'g'], broken: ['고장', 'r'], lost: ['분실물', 'y'], incident: ['사고·분쟁', 'r'], key: ['키·금고', ''], praise: ['칭찬', 'g'], vote: ['투표', 'y'], review: ['월말 평가', ''], vendor: ['발주처', ''], expiry: ['유통기한', 'y'] };
const MGR_K = ['notice', 'praise', 'vote', 'review', 'vendor', 'expiry'], STAFF_K = ['handover', 'broken', 'lost', 'incident', 'key'];
const EDU = [['chip', '칩 계산·페이아웃'], ['rule', '하우스 룰'], ['deal', '딜링 순서·실수 처리'], ['open', '오픈·마감 순서'], ['cash', '금고·시재 세기'], ['guest', '손님 응대·분쟁'], ['sos', '비상 연락·대피']];
const CHK0 = { open: ['테이블·칩 정리', '카드 덱 확인', '금고 시재 확인', '음료 재고 확인', '조명·음악 켜기'], close: ['칩 수량 세기', '금고 정산·마감 입력', '테이블 닦기', '가스·전기 끄기', '문 잠그기'] };
const isMgr = () => S.mode === 'store' && (isOwner() || S.myRole === 'manager'), opsStore = () => S.mode === 'staff' ? S.my[S.mi || 0].store_id : S.store.id, myNick = () => S.mode === 'staff' ? S.my[S.mi || 0].nick : (S.members.find(p => p.user_id === S.user.id)?.nick || '대표');
async function opsLoad() {
  const st = opsStore(), [n, m] = await Promise.all([sb.from('store_notes').select('*').eq('store_id', st).order('created_at', { ascending: false }).limit(80), sb.from('store_note_marks').select('*')]);
  S.notes = n.data || []; const ids = new Set(S.notes.map(x => x.id)); S.nmarks = (m.data || []).filter(x => ids.has(x.note_id)); render();
}
function chkCard() {
  const tpl = S.notes.find(n => n.kind === 'checklist')?.data || CHK0, day = bizDay();
  return ['open', 'close'].map(t => { const row = S.notes.find(n => n.kind === 'check' && n.data?.day === day && n.data?.type === t), done = row?.data?.done || [], L = tpl[t] || [];
    return `<div class="card chk"><div class="row between"><h3 style="margin:0">${t === 'open' ? '오픈' : '마감'} 체크 <small>${done.length}/${L.length}</small></h3>${isMgr() ? `<button class="btn sm" data-act="chk-edit" data-v="${t}">항목 바꾸기</button>` : ''}</div><div class="chks col">${L.map((x, i) => `<label><input type="checkbox" data-act="chk" data-t="${t}" data-i="${i}" ${done.includes(i) ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>${row?.data?.by ? `<small class="mut">마지막 체크 ${esc(row.data.by)}</small>` : ''}</div>`; }).join('');
}
function noteCard(n) {
  const [lab, c] = NK[n.kind] || [n.kind, ''], mk = S.nmarks.filter(x => x.note_id === n.id), mine = mk.find(x => x.user_id === S.user.id), canDel = isMgr() || n.created_by === S.user.id;
  let extra = '';
  if (n.kind === 'vote') { const O = n.data?.options || []; extra = `<div class="vote">${O.map((o, i) => { const k = mk.filter(x => x.val === String(i)).length; return `<button class="${mine?.val === String(i) ? 'on' : ''}" data-act="vote" data-v="${n.id}" data-i="${i}"><span>${esc(o)}</span><b class="num">${k}</b><i style="width:${mk.length ? k / mk.length * 100 : 0}%"></i></button>`; }).join('')}</div>`; }
  if (n.kind === 'notice') extra = isMgr() ? `<small class="mut">읽음 ${mk.length}명</small> <button class="btn sm" data-act="pin" data-v="${n.id}">${n.pinned ? '고정 해제' : '맨 위 고정'}</button>` : mine ? '<span class="pill g">확인함</span>' : `<button class="btn sm pri" data-act="nread" data-v="${n.id}">확인했어요</button>`;
  if (n.kind === 'broken') extra = n.status === 'done' ? '<span class="pill g">✓ 고침</span>' : `<button class="btn sm" data-act="nstat" data-v="${n.id}" data-s="done">고쳤어요</button>`;
  if (n.kind === 'lost') extra = n.status === 'done' ? '<span class="pill g">✓ 돌려줌</span>' : `<button class="btn sm" data-act="nstat" data-v="${n.id}" data-s="done">주인 찾음</button>`;
  if (n.kind === 'review') extra = `<span class="pill y">${'★'.repeat(+n.data?.score || 0)}</span>`;
  if (n.kind === 'expiry') extra = `<span class="pill ${n.data?.date <= addDay(TODAY, 3) ? 'r' : 'y'}">${esc(n.data?.date || '')}까지</span>${n.status ? '' : ` <button class="btn sm" data-act="nstat" data-v="${n.id}" data-s="done">처리함</button>`}`;
  if (n.kind === 'vendor' && n.data?.phone) extra = `<button class="btn sm" data-act="copy" data-v="${esc(n.data.phone)}">${esc(n.data.phone)} 복사</button>`;
  const tgt = n.target && S.members.find(p => p.id === n.target);
  return `<div class="card note ${n.pinned ? 'pin' : ''} ${n.status === 'done' ? 'done' : ''}"><div class="row between"><span class="row" style="gap:6px"><span class="pill ${c}">${lab}</span>${n.pinned ? '<span class="pill g">📌</span>' : ''}${tgt ? `<b>${esc(tgt.nick)}</b>` : ''}</span><small class="mut">${esc(n.data?.by || '')} · ${fmtDT(n.created_at)}</small></div>${n.title ? `<b class="nt">${esc(n.title)}</b>` : ''}${n.body ? `<p class="nb">${esc(n.body)}</p>` : ''}<div class="row between" style="margin-top:6px"><span class="row" style="gap:6px">${extra}</span>${canDel ? `<button class="btn sm" data-act="ndel" data-v="${n.id}" aria-label="지우기">지우기</button>` : ''}</div></div>`;
}
function vOps() {
  if (!S.notes) { opsLoad(); return `<div class="card empty">불러오는 중…</div>`; }
  const f = S.opsF || 'all', K = isMgr() ? Object.keys(NK).filter(k => k !== 'check') : Object.keys(NK).filter(k => !['check', 'review', 'vendor'].includes(k));
  const L = S.notes.filter(n => !['check', 'checklist'].includes(n.kind) && (f === 'all' || n.kind === f)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)), cnt = k => S.notes.filter(n => n.kind === k && n.status !== 'done').length;
  const head = S.mode === 'staff' ? `<div class="row between"><h1 style="margin:0">매장 노트 ${help('ops')}</h1><button class="btn sm" data-act="ops-close">← 내 근무</button></div>` : storeHead('매장 노트');
  return `${head}<div class="row" style="gap:6px;margin:10px 0;flex-wrap:wrap"><button class="btn pri" data-act="note-new">+ 쓰기</button><button class="btn sos" data-act="sos">🚨 비상 연락</button></div>
  ${f === 'all' || f === 'check' ? chkCard() : ''}
  <div class="chips" style="margin:12px 0">${[['all', '전체'], ...K.map(k => [k, NK[k][0]])].map(([k, l]) => `<button class="fchip ${f === k ? 'on' : ''}" data-act="opsf" data-v="${k}">${l}${k !== 'all' && cnt(k) ? ` <b class="num">${cnt(k)}</b>` : ''}</button>`).join('')}</div>
  ${L.map(noteCard).join('') || '<div class="card empty">아직 기록이 없어요. 교대할 때 인수인계부터 남겨보세요.</div>'}`;
}
function opsEntry() { return `<button class="card opsent" data-act="ops-open"><div><b>매장 노트</b><small>공지 · 인수인계 · 체크리스트 · 고장 · 분실물 · 투표</small></div><span aria-hidden="true">→</span></button>`; }
function eduCard(me) { const d = me.checks?.edu || []; if (d.length >= EDU.length) return ''; return `<div class="card"><div class="row between"><b>신입 교육 <small class="mut">${d.length}/${EDU.length}</small></b></div><div class="sktags edu" style="margin-top:6px">${EDU.map(([k, l]) => `<i class="${d.includes(k) ? 'on' : ''}">${d.includes(k) ? '✓ ' : ''}${l}</i>`).join('')}</div><small class="mut">대표·점장님이 교육하고 체크해줘요</small></div>`; }
async function sosSheet() {
  const st = opsStore(), store = S.mode === 'staff' ? { name: S.store?.name, address: S.store?.address } : S.store;
  openSheet(`<h2>🚨 비상 연락</h2><div class="sos2"><a class="btn" href="tel:119"><b>119</b><small>화재·응급</small></a><a class="btn" href="tel:112"><b>112</b><small>경찰·폭력</small></a></div><div class="li"><span><small class="mut">매장 주소 (신고할 때 불러주세요)</small><b style="display:block">${esc(store.address || store.name || '-')}</b></span><button class="btn sm" data-act="copy" data-v="${esc(store.address || '')}">복사</button></div><h3 style="margin-top:14px">매장 사람들</h3><div id="sos-l"><small class="mut">불러오는 중…</small></div>`);
  const { data } = await sb.rpc('emergency_contacts', { p_store: st }), seen = new Set(), L = (data || []).filter(x => { const k = x.nick + x.phone; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => { const o = S.store?.equip?.sos || [], k = x => o.includes(`${x.nick}|${x.phone || ''}`) ? o.indexOf(`${x.nick}|${x.phone || ''}`) : o.indexOf(x.nick), r = x => k(x) >= 0 ? k(x) - 100 : ({ owner: 0, manager: 1 }[x.role] ?? 2); return r(a) - r(b); });
  const el = $('#sos-l'); if (el) el.innerHTML = L.map(x => `<div class="li"><span><b>${esc(x.nick)}</b> <small class="mut">${x.role === 'owner' ? '대표' : x.role === 'manager' ? '점장' : esc(x.job_role || '직원')}</small></span>${x.phone ? `<a class="btn sm ${x.role === 'staff' ? '' : 'pri'}" href="tel:${esc(x.phone)}">${esc(x.phone)}</a>` : '<small class="mut">번호 없음</small>'}</div>`).join('') || '<small class="mut">등록된 번호가 없어요</small>';
}
function noteSheet() {
  const K = isMgr() ? [...STAFF_K, ...MGR_K] : STAFF_K, staff = (S.mode === 'staff' ? [] : S.members.filter(p => p.role !== 'owner'));
  openSheet(`<h2>매장 노트 쓰기</h2><form class="f" id="note-form"><div class="fl"><span>종류</span><div class="seg brk" style="flex-wrap:wrap">${K.map((k, i) => `<label style="flex:1 1 30%"><input type="radio" name="kind" value="${k}" ${i ? '' : 'checked'}><span>${NK[k][0]}</span></label>`).join('')}</div></div>
  ${staff.length ? `<label class="fl" data-k="praise review">누구<select name="target"><option value="">선택</option>${staff.map(p => `<option value="${p.id}">${esc(p.nick)}</option>`).join('')}</select></label>` : ''}
  <label class="fl">제목 <small class="mut">(선택 · 발주처는 업체명 · 유통기한은 품목)</small><input name="title" maxlength="60"></label>
  <label class="fl">내용<textarea name="body" rows="4" placeholder="예: 3번 테이블 셔플러 소리 남 / 금고 열쇠 민지에게 넘김 / 손님 A 칩 분쟁 — CCTV 21:40 확인"></textarea></label>
  <div class="grid2"><label class="fl">투표 선택지 <small class="mut">쉼표로</small><input name="opts" placeholder="금요일, 토요일, 일요일"></label><label class="fl">유통기한 날짜<input name="date" type="date"></label><label class="fl">발주처 전화<input name="phone" type="tel"></label><label class="fl">평가 별점<select name="score">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${'★'.repeat(n)}</option>`).join('')}</select></label></div>
  <button class="btn pri full">올리기</button></form>`);
}
// ===== v0.65 매출 묶음: 하루 결산·같은 요일 비교·이벤트 비교·요일 히트맵·인건비 예산 =====
const ymdOf = dt => E.ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()), dAdd = (k, n) => { const [y, m, d] = k.split('-').map(Number); return ymdOf(new Date(y, m - 1, d + n)); };
const dayLaborOf = k => { const [y, m] = k.split('-').map(Number); return laborOf(y, m) / E.daysIn(y, m); }; // ponytail: 월 인건비를 일수로 나눈 평균, 일별 정확도가 필요하면 E.payroll 일 단위로
function sameWd(r) { const p = S.hist.find(x => x.report_date === dAdd(r.report_date, -7)); return p && p.sales ? Math.round((r.sales - p.sales) / p.sales * 100) : null; }
function daySlip(r) {
  const [y, m, d] = r.report_date.split('-').map(Number), lab = dayLaborOf(r.report_date), left = r.sales - lab - (r.expense || 0) - (r.detail?.prize || 0), wd = sameWd(r), who = S.members.find(p => p.user_id === r.reported_by)?.nick || (r.reported_by === S.user?.id ? '나' : '대표');
  const txt = `[${S.store.name}] ${m}/${d}(${E.WD[E.wdOf(y, m, d)]}) 결산\n매출 ₩${E.won(r.sales)}${r.entries ? ` · 엔트리 ${r.entries}명` : ''}\n카드 ₩${E.won(r.card)} · 현금 ₩${E.won(r.cash)} · 이체 ₩${E.won(r.transfer)}\n인건비(평균) ₩${E.won(lab)} · 지출 ₩${E.won(r.expense || 0)}\n남은 돈 약 ₩${E.won(left)}${wd != null ? `\n지난주 같은 요일 대비 ${wd >= 0 ? '+' : ''}${wd}%` : ''}${r.detail?.event ? `\n이벤트: ${r.detail.event}` : ''}\n마감: ${who}`;
  return `<div class="slip1"><div class="s1-top"><small>${E.WD[E.wdOf(y, m, d)]}요일 결산${r.detail?.event ? ` · 🎉 ${esc(r.detail.event)}` : ''}</small><b class="num">₩${E.won(r.sales)}</b>${wd != null ? `<span class="pill ${wd >= 0 ? 'g' : 'r'}">지난주 ${E.WD[E.wdOf(y, m, d)]}요일보다 ${wd >= 0 ? '+' : ''}${wd}%</span>` : ''}</div>
  <div class="s1-g"><div><small>인건비 <span class="mut">평균</span></small><b class="num">₩${man(lab)}</b></div><div><small>현금 지출</small><b class="num">₩${man(r.expense || 0)}</b></div><div><small>남은 돈 약</small><b class="num ${left >= 0 ? 'up' : 'down'}">${left < 0 ? '−' : ''}₩${man(Math.abs(left))}</b></div></div>
  <div class="row between"><small class="mut">마감 ${esc(who)} · ${fmtDT(r.created_at || r.report_date)}</small><button class="btn sm" data-act="copy" data-v="${esc(txt)}">카톡용 복사</button></div></div>`;
}
function eventCard() {
  const rs = S.hist.slice(0, 120), ev = rs.filter(r => r.detail?.event), no = rs.filter(r => !r.detail?.event && r.sales);
  if (!ev.length || no.length < 5) return '';
  const avg = L => L.reduce((a, r) => a + r.sales, 0) / L.length, a = avg(ev), b = avg(no), p = Math.round((a - b) / b * 100);
  return `<div class="card"><h3>이벤트 효과 <small>최근 ${ev.length}번</small></h3><div class="evc"><div><small>이벤트한 날 평균</small><b class="num">₩${man(a)}</b></div><div><small>평소 평균</small><b class="num mut">₩${man(b)}</b></div><div><small>차이</small><b class="num ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '+' : ''}${p}%</b></div></div>${ev.slice(0, 4).map(r => `<div class="li"><span><span class="mut">${r.report_date.slice(5).replace('-', '/')}</span> ${esc(r.detail.event)}</span><b class="num">₩${man(r.sales)}</b></div>`).join('')}</div>`;
}
function laborBudget(M, cur) {
  const pct = +S.store.equip?.labor_pct || 0; if (!isOwner() && !pct) return '';
  if (!pct) return `<div class="card lbud"><div><b>인건비 예산</b><small>매출의 몇 %까지 쓸지 정하면 넘을 때 알려드려요</small></div><button class="btn sm" data-act="lbud">정하기</button></div>`;
  const r = M.proj ? M.labor / M.proj * 100 : 0, over = r > pct;
  return `<div class="card lbud ${over ? 'over' : ''}"><div><b>인건비 ${r.toFixed(1)}% <small class="mut">/ 예산 ${pct}%</small> ${help('lbud')}</b><small>${over ? `예산보다 ₩${man(M.labor - M.proj * pct / 100)} 많아요${cur ? ' · 손님 적은 시간 인원을 줄여보세요' : ''}` : `예산 안이에요 · 여유 ₩${man(M.proj * pct / 100 - M.labor)}`}</small><div class="bar"><i style="width:${Math.min(100, r / pct * 100)}%"></i></div></div>${isOwner() ? '<button class="btn sm" data-act="lbud">바꾸기</button>' : ''}</div>`;
}
// 그 달 고정비: 그 달에 넣은 값, 없으면 가장 최근 달 값을 이어서 씀
const fixedFor = (y, m) => { const f = E.ymd(y, m, 1), rows = (S.fixedM || []).filter(r => r.month <= f); const r = rows[rows.length - 1]; return { fx: r?.fixed || {}, from: r?.month || null, own: r?.month === f }; };
const FIXED = [['rent', '임대료'], ['mgmt', '관리비'], ['elec', '전기세'], ['water', '수도세'], ['net', '통신·보안']];
const monKey = (y, m) => E.ymd(y, m, 1), goalOf = (y, m) => (S.goals || {})[monKey(y, m)] || 0, nextMon = () => { const t = new Date(now.getFullYear(), now.getMonth() + 1, 1); return [t.getFullYear(), t.getMonth() + 1]; };
const goalSuggest = () => { const p = new Date(S.y, S.m - 2, 1), L = monthSummary(p.getFullYear(), p.getMonth() + 1), M = monthSummary(S.y, S.m), base = Math.max(L.sales, M.proj); const wk = (() => { const [f0] = monthRange(S.y, S.m), H = S.hist.filter(r => r.report_date >= addDay(f0, -56) && r.report_date < f0 && r.sales > 0); if (H.length < 20) return 0; const by = Array.from({ length: 7 }, () => []); H.forEach(r => { const [a, b2, c] = r.report_date.split('-').map(Number); by[E.wdOf(a, b2, c)].push(r.sales); }); const av = by.map(L2 => L2.length ? L2.reduce((a, v) => a + v, 0) / L2.length : 0); let t = 0; for (let i = 1; i <= E.daysIn(S.y, S.m); i++) t += isHoliday(E.ymd(S.y, S.m, i)) ? av[5] : av[E.wdOf(S.y, S.m, i)]; return t; })();
  if (wk) return { v: Math.ceil(wk * 1.05 / 1e6) * 1e6, base: wk, from: '최근 8주 요일별 평균으로 본 이번 달', pct: 5 };
  return base ? { v: Math.ceil(base * 1.08 / 1e6) * 1e6, base: L.sales ? L.sales : M.proj, from: L.sales ? '지난달 매출' : '이번 달 예상', pct: 8 } : null; };
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
  if (!goal) return `<div class="card goal"><h3>${S.m}월 목표 매출</h3>${sg ? `<p style="margin:0 0 10px">${sg.from} ₩${man(sg.base)}보다 ${sg.pct || 8}% 높은 <b class="num" style="font-size:22px">₩${man(sg.v)}</b>을 추천해요.</p>` : '<p class="mut">마감이 쌓이면 목표를 추천해 드려요.</p>'}
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
    ${[['매출', s => s.proj, true, mw], ['인건비 비율', s => s.proj > 0 && s.labor <= s.proj * 1.5 ? s.labor / s.proj * 100 : NaN, false, pct], ['비용 합계', s => s.cost, false, mw], ['남는 돈', s => s.left, true, mw]].map(([n, f, g, fm]) => { const v = [...ms].reverse().map(x => f(x.s)), d = v[2] - v[1]; return `<tr><td>${n}</td>${v.map((x, i) => `<td class="r num ${i < 2 ? 'mut' : ''}">${isNaN(x) ? '-' : fm(x)}</td>`).join('')}<td class="r num ${!d || isNaN(d) ? '' : (d > 0) === g ? 'up' : 'down'}">${!d || isNaN(d) ? '-' : (d > 0 ? '▲' : '▼') + fm(Math.abs(d))}</td></tr>`; }).join('')}</tbody></table></div>
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
  const prob = L.length ? [L[0].n, rx ? `고치면 월 ${rx[0].startsWith('rev') ? '+' : '−'}₩${man(rx[3])}` : '평균보다 나빠요', 'down', 'improve'] : goal && gap < 0 ? [`목표 ₩${man(-gap)} 부족`, '월말 예상 기준', 'down', 'home'] : short && !S.members.some(p => p.role !== 'owner') ? ['직원 0명', '직원 초대부터 해주세요', 'down', 'staff'] : short ? [`인원 부족 ${short}일`, '이번 달 남은 날 중', 'down', 'sched'] : M.left < 0 ? ['이번 달 적자', '비용이 매출보다 커요', 'down', 'home'] : ['없어요', '지금처럼만 하세요', 'up', null];
  return `<div class="top3"><button class="card kpi go" data-tab="staff"><div class="l">오늘 현황</div><div class="v num ${today[2]}">${today[0]}</div><small class="mut">${today[1]} ›</small></button>
    <div class="card kpi"><div class="l">이번 달 예상 순이익${M.n < 3 && M.est ? ' <small>(지난달 기준 추정)</small>' : ''}</div><div class="v num ${M.left >= 0 ? 'up' : 'down'}">${M.n >= 3 || M.est ? `${M.left < 0 ? '−' : ''}₩${man(Math.abs(M.left))}` : '<small class="mut" style="font-size:13px">마감 3일부터</small>'}</div><small class="mut">매출 ₩${man(M.proj)} − 비용 ₩${man(M.cost)}${M.est ? ' · 지난달 하루 평균으로 예측' : ''}</small></div>
    <button class="card kpi ${prob[3] ? 'go' : ''}" ${prob[3] ? `data-tab="${prob[3]}"` : ''}><div class="l">지금 가장 큰 문제</div><div class="v ${prob[2]}" style="font-size:16px">${esc(prob[0])}</div><small class="mut">${esc(prob[1])}${prob[3] ? ' ›' : ''}</small></button></div>`;
}
function vHome() {
  const M = monthSummary(S.y, S.m), [y, m, d] = TODAY.split('-').map(Number), cur = S.y === y && S.m === m, hasStaff = S.members.some(p => p.role !== 'owner');
  const months = Array.from({ length: 6 }, (_, i) => { const dt = new Date(S.y, S.m - 6 + i, 1); return [dt.getFullYear(), dt.getMonth() + 1]; }).map(([yy, mm]) => ({ yy, mm, s: monthSummary(yy, mm) })).filter(x => x.s.n);
  const mx = Math.max(1, ...months.map(x => Math.abs(x.s.left)));
  const nt = S.noticeTop, seen = (() => { try { return localStorage.getItem('ev-notice') } catch { return null } })(), newN = nt && nt.id !== seen && Date.now() - new Date(nt.created_at) < 14 * 864e5;
  // 주 컬럼: 오늘·이번 달 판단에 필요한 것 / 보조 컬럼: 참고 정보 (모바일에선 같은 순서로 세로)
  return `<div class="home">${setupCard()}<div class="hhead">${storeHead('브리핑')}${newN ? `<button class="card nbanner" data-act="sub" data-v="notice"><span class="ntag">공지</span><div><small>운영사에서 새 소식이 왔어요</small><b>${esc(nt.title)}</b></div><span class="mut">›</span></button>` : ''}</div>
  <div class="hmain">${coCard()}
  ${cur ? noShowCard() + liveCard() + forecastCard() + payDayCard() + iosCard() + startCard() + todoCard() + upcomingCard() + laborCard() + noticeCard() + `<button class="card nowline" data-act="poster"><small>홍보</small><b>🎨 포스터 스튜디오 · 템플릿 6종</b><span class="mut">›</span></button>` : ''}${cur && isOwner() ? `<div class="card"><h3>AI 비서 <span class="pill g">PRO</span> <small>우리 매장 숫자로 답하고, 글도 써요</small></h3><div class="row" style="gap:6px"><input id="ai-q" placeholder="질문, 또는 공지·홍보할 내용 (예: 토요일 8시 토너먼트 바인 3만)" style="flex:1;min-width:0"><button class="btn sm pri" data-act="ai-ask">묻기</button></div><div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><button class="chip" data-act="ai-ask" data-q="1">📊 이번 달 총평</button><button class="chip" data-act="ai-write" data-k="notice">📢 직원 공지 쓰기</button><button class="chip" data-act="ai-write" data-k="promo">🎉 손님 홍보글 쓰기</button></div><p class="note" id="ai-a" style="white-space:pre-wrap"></p><button class="btn sm" id="ai-copy" data-act="ai-copy" hidden>복사</button></div>` : ''}${cur ? topStrip(M) : ''}
  ${(() => { const g = goalOf(S.y, S.m), T = cur && g ? todayTodo(M, g) : []; return T.length ? `<button class="card nowline" ${T[0][3] ? `data-act="goto" data-t="${T[0][3] === 'order' ? 'more' : T[0][3]}" ${T[0][3] === 'order' ? 'data-s="order"' : ''}` : ''}><small>지금 할 일</small><b>${T[0][1]}</b><span class="mut">›</span></button>` : ''; })()}
  ${rankBar()}
  <div class="sech"><h2>${S.m}월 손익</h2>${monthNav()}</div>
  ${goalCard(M)}
  ${laborBudget(M, cur)}
  <div class="card bill"><h3>${S.m}월 계산서 ${help('bill')} <small>${cur ? '월말 예상 기준' : '확정'}</small></h3>
    ${cur ? `<div class="lead"><small>오늘까지 남은 돈 (${M.el}일)</small><b class="num ${M.earned >= 0 ? 'up' : 'down'}">${M.earned < 0 ? '−' : ''}₩${man(Math.abs(M.earned))}</b></div>` : ''}
    <div class="li"><b>매출${cur ? ' <small class="mut">월말 예상</small>' : ''}</b><b class="num">₩${man(M.proj)}</b></div>
    <div class="li"><span class="mut">− 인건비 (스케줄·4대보험 사업주분·긴급 구인 포함)</span><span class="num">₩${man(M.labor)}</span></div>
    ${Object.entries(M.exp).map(([k, v]) => `<div class="li"><span class="mut">− ${CAT[k] || k}</span><span class="num">₩${man(v)}</span></div>`).join('')}
    <div class="li sum"><b>= ${cur ? '월말 예상 남는 돈' : '남는 돈'}</b><b class="num ${M.left >= 0 ? 'up' : 'down'}">${M.n >= 3 || !cur || M.est ? `${M.left < 0 ? '−' : ''}₩${man(Math.abs(M.left))}${M.left < 0 ? ' 적자' : ''}${cur && M.n < 3 ? ' <small class="mut">추정</small>' : ''}` : '<small class="mut" style="font-size:13px">마감 3일부터 보여요</small>'}</b></div>
    <p class="note" style="margin-bottom:0">매출 = 매일 마감 · 인건비 = 근무표 자동 · 월세 등 = 고정지출에 한 번만 <button class="btn sm" data-act="fixed">고정지출 넣기</button></p><p class="note">${M.bep && M.bep <= E.daysIn(S.y, S.m) ? `손익분기: <b class="up">${S.m}월 ${M.bep}일</b>에 넘어요.` : '이번 달은 손익분기를 못 넘어요.'}</p></div>
  ${lightsCard(false)}
  ${selfCard()}
  </div><details class="hmore" ${matchMedia('(min-width:900px)').matches ? 'open' : ''}><summary class="card">더 보기 <small class="mut">월별 손익 · 우리 지역 딜러 · 매장 노트 · 고정비 · 오늘 근무표 · 알림</small></summary><div class="hside">
  ${months.length ? `<div class="card"><h3>월별 손익 <small>매출 − 비용 = 남은 돈</small></h3><div class="pnl">${months.map(x => `<div class="pr"><span class="mut">${x.mm}월</span><span class="num">₩${man(x.s.proj)}</span><span class="num mut">−₩${man(x.s.cost)}</span><span class="pb"><i class="${x.s.left >= 0 ? 'g' : 'r'}" style="width:${Math.max(3, Math.abs(x.s.left) / mx * 100)}%"></i></span><b class="num ${x.s.left >= 0 ? 'up' : 'down'}">${x.s.left < 0 ? '−' : '+'}₩${man(Math.abs(x.s.left))}</b></div>`).join('')}</div>${months.at(-1).yy === y && months.at(-1).mm === m ? '<p class="note">이번 달은 월말 예상이에요.</p>' : ''}</div>` : ''}
  ${opsEntry()}
  ${fixedCard()}
  ${hasStaff ? `<div class="card"><div class="row between"><h3 style="margin:0">오늘 근무표 <small>${m}월 ${d}일 (${E.WD[E.wdOf(y, m, d)]})</small></h3><button class="btn sm" data-act="day-open" data-d="${TODAY}">스케줄 →</button></div>${dayTimeline(TODAY, true)}</div>` : ''}
  ${hasStaff ? '' : `<div class="card"><h3>처음 할 일</h3><div class="li"><div><b>① 직원 등록</b><small>시급·계약·계좌까지</small></div><button class="btn sm pri" data-tab="staff">하러 가기</button></div><div class="li"><div><b>② 스케줄 짜기</b><small>요일 기본 + 날짜별 수정</small></div><button class="btn sm" data-tab="sched">하러 가기</button></div><div class="li"><div><b>③ 매일 매출 보고</b></div><button class="btn sm" data-tab="sales">하러 가기</button></div></div>`}
  ${S.joins.length ? `<div class="card" style="border-color:rgba(245,158,11,.5)"><h3>소속 신청 ${S.joins.length}건 <button class="btn sm pri" data-tab="staff">확인</button></h3></div>` : ''}
  ${S.notis.length ? `<div class="card"><h3>알림</h3>${S.notis.slice(0, 5).map(x => `<div class="li"><span>${esc(x.body)}</span><small>${fmtDT(x.created_at)}</small></div>`).join('')}</div>` : ''}
  </div></details></div>`;
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
  return `<div class="card rankbar"><div><b>우리 매장 순위</b><small class="mut" style="display:block">비슷한 매장 ${B.n}곳 중 · ${+B.month.slice(5, 7)}월 <button class="tlink" data-act="bench-why">기준?</button></small></div>
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
  return `<div class="card lights2"><h3>우리 매장 경고등 <small>${+B.month.slice(5, 7)}월 마감 기준 · ${bad.length ? `고칠 곳 <b class="down">${bad.length}개</b>` : '모두 좋아요'}</small></h3>
    ${!full && gain ? `<div class="bigwin"><small>경고등을 고치면 매달</small><b class="num">+₩${man(gain)}</b><small>더 남아요</small></div>` : ''}
    <div class="lts">${(full ? sorted : sorted.slice(0, 2)).map(row).join('')}</div>${!full && sorted.length > 2 ? `<details class="ltmore"><summary class="mut">나머지 ${sorted.length - 2}개 보기</summary><div class="lts">${sorted.slice(2).map(row).join('')}</div></details>` : ''}
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
    <polygon points="${poly([50, 50, 50, 50, 50])}" fill="none" stroke="#F59E0B" stroke-dasharray="4 3"/><polygon points="${poly(mine)}" fill="rgba(143,227,196,.25)" stroke="#8FE3C4" stroke-width="2"/>
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
  <div class="card"><h3>5가지 점수 <small>100점 만점 · <b style="color:#8FE3C4">초록</b> 내 매장 · <b style="color:#F59E0B">점선</b> 비슷한 매장 중간</small></h3>${radar(B.score)}</div>
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
const SHOP_ICON = { drink: '🥤', alc: '🍺', snack: '🍿', supply: '🃏' }, prodImg = p => p?.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : `<span class="ph">${SHOP_ICON[p?.c] || ''}</span>`;
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
const xrowHtml = (c = 'goods', a = '') => `<div class="xrow"><select name="xc">${Object.entries(CAT).filter(([k]) => k !== 'card').map(([v, l]) => `<option value="${v}" ${v === c ? 'selected' : ''}>${l}</option>`).join('')}</select><input name="xa" type="number" inputmode="numeric" placeholder="금액" value="${a}"><button type="button" class="btn sm" data-act="xrow-del" aria-label="지우기">✕</button></div>`;
function closeRows(r0) { const L = (S.expenses || []).filter(x => x.spent_on === TODAY && x.source === 'close'); if (L.length) return L.map(x => xrowHtml(x.category, x.amount)).join(''); return r0?.expense ? xrowHtml('goods', r0.expense) : ''; }
function xsum() { const f = $('#report-form'); if (!f) return; f.elements.expense.value = [...f.querySelectorAll('.xrow [name=xa]')].reduce((s, i) => s + (+digits(i.value) || 0), 0) || ''; closeCalc(); }
function closeCalc() {
  const f = $('#report-form'); if (!f) return; const v = n => +digits(f.elements[n]?.value) || 0, counted = BILLS.reduce((a, b) => a + b * v('b' + b), 0), cashSales = v('sales') - v('card') - v('transfer'), expected = v('start') + cashSales - v('expense'), diff = counted - expected, any = BILLS.some(b => f.elements['b' + b].value !== '');
  $('#close-out').innerHTML = `<div class="li"><span class="mut">현금 매출 (매출 − 카드 − 이체)</span><span class="num">₩${E.won(cashSales)}</span></div><div class="li"><span class="mut">금고에 있어야 할 돈</span><span class="num">₩${E.won(expected)}</span></div>
    ${any ? `<div class="li"><span class="mut">센 돈</span><span class="num">₩${E.won(counted)}</span></div><div class="li"><b>차액</b><b class="num ${Math.abs(diff) >= 10000 ? 'down' : diff ? 'warn' : 'up'}">${diff ? (diff > 0 ? '+' : '−') + '₩' + E.won(Math.abs(diff)) : '딱 맞아요'}</b></div>${Math.abs(diff) >= 10000 ? '<p class="note down" style="margin:0">1만 원 넘게 차이 나요. 저장하면 대표님께 알림이 가요.</p>' : ''}` : '<p class="note" style="margin:0">금고 현금을 세서 장수를 넣으면 차액을 계산해요.</p>'}`;
  f.dataset.diff = any ? diff : ''; f.dataset.cash = cashSales; f.dataset.cnt = any ? counted : (v('start') || cashSales ? Math.max(0, expected) : '');
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
  ${S.orders?.[0] ? `<button class="card nowline" data-act="reorder"><small>원클릭</small><b>↻ 지난 주문 그대로 담기 · ${S.orders[0].items.length}개</b><span class="mut">›</span></button>` : ''}
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
    <div class="tlr cov"><span class="nm"><small>시간별 인원</small></span><div class="tlt">${cov.map((c, i) => `<span class="${c < need + (inPk(hours[i]) ? +S.store.peak.extra : 0) ? 'lo' : ''}" style="left:${pct(hours[i] * 60)}%;width:${100 / span}%">${c}</span>`).join('')}</div></div></div>
    ${compact ? '' : `<p class="note">막대를 누르면 고쳐요. 빨간 숫자는 적정 인원(${need}명${S.store.peak ? `, ${S.store.peak.from}~${S.store.peak.to}는 +${S.store.peak.extra}명` : ''})보다 적은 시간이에요.</p>`}`;
}
// ===== 다음 달 스케줄 자동 (가능일 수집 → 자동 배정 → 직원 확인 → 확정) =====
const shortList = s => (s || []).length ? `<div class="note"><b class="down">빈자리 ${s.length}일</b> <small class="mut">· 날짜를 누르면 우리 직원에게 대타 요청</small><div class="row" style="gap:4px;flex-wrap:wrap;margin-top:6px">${s.slice(0, 10).map(x => `<button class="chip" data-act="sub-day" data-d="${x.d}">${+x.d.slice(5, 7)}/${+x.d.slice(8)} ${x.need - x.have}명 ＋</button>`).join('')}${s.length > 10 ? `<span class="mut">외 ${s.length - 10}일</span>` : ''}</div></div>` : '<p class="note">빈자리 없음 ✓</p>';
const rdMon = () => `<span class="row" style="gap:4px">${[TODAY.slice(0, 8) + '01', nmKey()].map(k => `<button class="btn sm ${k === S.nmKey ? 'pri' : ''}" data-act="rd-mon" data-k="${k}">${+k.slice(5, 7)}월</button>`).join('')}</span>`;
function roundCard() {
  const R = S.round, nm = +(S.nmKey || nmKey()).slice(5, 7), staff = S.members.filter(p => p.role !== 'owner'), av = id => (S.avails || []).find(a => a.member_id === id);
  if (!R) return `<div class="card" style="margin-top:10px"><div class="row between"><div><b>${nm}월 스케줄 자동</b><small class="mut" style="display:block">직원 가능일 받기 → 자동 배정 → 직원 확인까지 알아서 해요</small></div>${rdMon()}</div><button class="btn pri full" data-act="rd-start" style="margin-top:10px">${nm}월 시작</button></div>`;
  const sub = staff.filter(p => av(p.id)?.submitted_at).length, okN = staff.filter(p => av(p.id)?.confirm === 'ok').length, ch = staff.filter(p => av(p.id)?.confirm === 'change');
  const steps = [['collect', '가능일 받기'], ['draft', '초안'], ['sent', '직원 확인'], ['done', '확정']], si = steps.findIndex(s => s[0] === R.status);
  const bar = `<div class="rsteps">${steps.map(([, l], i) => `<span class="${i < si ? 'done' : i === si ? 'on' : ''}">${i < si ? '✓ ' : ''}${l}</span>`).join('')}</div>`;
  const view = `<button class="btn sm" data-act="rd-view">${nm}월 근무표 보기</button>`;
  let body = '';
  if (R.status === 'collect') body = `<p class="note" style="margin-top:0">제출 ${sub}/${staff.length}명${R.deadline ? ` · 마감 ${+R.deadline.slice(5, 7)}/${+R.deadline.slice(8)}` : ''} · 안 낸 직원은 매주 기본 근무로 계산해요</p><div class="chips">${staff.map(p => `<span class="pill ${av(p.id)?.submitted_at ? 'g' : ''}">${av(p.id)?.submitted_at ? '✓ ' : ''}${esc(p.nick)}${av(p.id)?.note ? ' 💬' : ''}</span>`).join('')}</div><button class="btn pri full" data-act="rd-draft" style="margin-top:10px">초안 만들기</button>`;
  else if (R.status === 'draft') body = `${shortList(R.short)}<div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">${view}<button class="btn sm" data-act="rd-draft">다시 만들기</button><button class="btn sm pri" data-act="rd-send">직원에게 확인 요청</button></div>`;
  else if (R.status === 'sent') body = `<p class="note" style="margin-top:0">확인 ${okN}/${staff.length}명${ch.length ? ` · <b class="down">변경 요청 ${ch.length}</b>` : ''}</p>${ch.map(p => `<div class="li"><b>${esc(p.nick)}</b><span class="mut">${esc(av(p.id).confirm_note || '변경 요청')}</span></div>`).join('')}${shortList(R.short)}<div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">${view}<button class="btn sm" data-act="rd-send">다시 확인 요청</button><button class="btn sm pri" data-act="rd-done">확정</button></div>`;
  else body = `<p class="note" style="margin-top:0">확정 완료 ✓ 직원들에게 알렸어요</p>${shortList(R.short)}${view}`;
  return `<div class="card" style="margin-top:10px"><div class="row between" style="gap:6px;flex-wrap:wrap"><b>${nm}월 스케줄 자동</b><span class="row" style="gap:4px">${rdMon()}<button class="btn sm" data-act="rd-reset">${S.rdArm === S.nmKey ? '한 번 더 누르면 초기화' : '초기화'}</button></span></div>${bar}${body}</div>`;
}
function availCard() {
  const R = S.round; if (!R) return '';
  const me = S.my[S.mi || 0], [y, m] = S.nmKey.split('-').map(Number), D = E.daysIn(y, m), A = S.myAvail;
  if (R.status === 'collect') {
    if (A?.submitted_at && !S.avEdit) return `<div class="card"><div class="row between"><div><b>${m}월 가능일 제출 완료 ✓</b><small class="mut" style="display:block">${A.days.length}일${A.note ? ' · ' + esc(A.note) : ''}</small></div><button class="btn sm" data-act="av-edit">고치기</button></div></div>`;
    if (!S.avSel) S.avSel = new Set(A?.days || Array.from({ length: D }, (_, i) => E.ymd(y, m, i + 1)).filter(k => S.tpl.some(t => t.member_id === me.id && t.weekday === E.wdOf(y, m, +k.slice(8)))));
    let cal = ''; for (let d = 1; d <= D; d++) { const k = E.ymd(y, m, d); cal += `<button type="button" class="dc ${S.avSel.has(k) ? 'on' : ''}" data-act="av-d" data-d="${k}"><b>${d}</b><small>${S.avSel.has(k) ? '가능' : ''}</small></button>`; }
    return `<div class="card"><h3>${m}월 근무 가능일 <small>${R.deadline ? `${+R.deadline.slice(5, 7)}/${+R.deadline.slice(8)}까지` : ''}</small></h3><p class="note" style="margin-top:0">일할 수 있는 날을 눌러 초록색으로 (${S.avSel.size}일)</p><div class="cal">${E.WD.map(w => `<div class="h">${w}</div>`).join('')}${'<div></div>'.repeat(E.wdOf(y, m, 1))}${cal}</div><label class="fl" style="margin-top:10px">조건 메모 <small class="mut">(선택) 예: 금요일은 9시 이후, 둘째 주 토요일 안 돼요</small><textarea id="av-note" rows="2">${esc(A?.note || '')}</textarea></label><button class="btn pri full" data-act="av-submit">제출</button></div>`;
  }
  if (R.status === 'draft') return `<div class="card"><b>${m}월 근무표 준비 중이에요</b><small class="mut" style="display:block">나오면 알림으로 알려드릴게요</small></div>`;
  const L = []; for (let d = 1; d <= D; d++) { const t = E.shiftOn(me.id, y, m, d, S.tpl, S.nextOv); if (t) L.push(`<span class="pill">${m}/${d}(${E.WD[E.wdOf(y, m, d)]}) ${t5(t.s)}–${t5(t.e)}</span>`); }
  return `<div class="card"><h3>${m}월 근무표 ${R.status === 'done' ? '<span class="pill g">확정</span>' : ''} <small>${L.length}일</small></h3><div class="chips">${L.join('') || '<span class="mut">배정된 근무가 없어요</span>'}</div>${R.status === 'sent' ? (A?.confirm ? `<p class="note">${A.confirm === 'ok' ? '확인 완료 ✓' : '변경 요청 보냄: ' + esc(A.confirm_note || '')}</p>` : `<div class="row" style="gap:6px;margin-top:10px"><button class="btn pri" data-act="cf-ok">확인했어요</button><button class="btn" data-act="cf-change">변경 요청</button></div>`) : ''}</div>`;
}
// ===== 결근·대타·휴무 (휴무 승인 → 쉬는 직원에게 대타 요청 → 먼저 수락한 1명 자동 배정) =====
const mdKr = k => { const [y, m, d] = k.split('-').map(Number); return `${m}/${d}(${E.WD[E.wdOf(y, m, d)]})`; };
// 주 근무시간: 최근 4주 실제 근무표 평균 (기본 근무만 보면 바뀐 직원이 틀려요)
const wkH = id => { let h = 0; for (let i = 1; i <= 28; i++) { const [y, m, d] = addDay(TODAY, -i).split('-').map(Number), t = E.shiftOn(id, y, m, d, S.tpl, S.ov); if (t) h += Math.max(0, hoursOf(t5(t.s), t5(t.e)) - (t.brk ?? 0) / 60); } return h / 4; };
const OFFER = { sent: ['', '대기'], ok: ['g', '수락'], no: ['', '거절'], closed: ['', '마감'] };
function swapCard() {
  const R = (S.reqs || []).filter(r => r.status === 'wait'), G = {}, F = S.fixes || []; (S.offers || []).forEach(o => (G[o.grp] = G[o.grp] || []).push(o));
  const nick = id => esc(S.members.find(p => p.id === id)?.nick || ''), groups = Object.values(G).sort((a, b) => a[0].work_date.localeCompare(b[0].work_date));
  const W = S.swaps || [];
  if (!R.length && !groups.length && !F.length && !W.length) return '';
  return `<div class="card" style="margin-top:10px">${W.length ? `<h3>근무 교대 <small>${W.length}건 · 두 사람 합의함</small></h3>${W.map(w => `<div class="li"><div><b>${nick(w.from_member)} → ${nick(w.to_member)}</b> <span class="mut">${mdKr(w.work_date)}</span>${w.note ? `<small class="mut" style="display:block">${esc(w.note)}</small>` : ''}</div><span class="row" style="gap:4px"><button class="btn sm" data-act="swap" data-v="${w.id}" data-ok="">거절</button><button class="btn sm pri" data-act="swap" data-v="${w.id}" data-ok="1">승인</button></span></div>`).join('')}<div style="height:10px"></div>` : ''}${F.length ? `<h3>출퇴근 정정 요청 <small>${F.length}건</small></h3>${F.map(f => `<div class="li"><div><b>${nick(f.member_id)}</b> <span class="mut">${f.kind === 'in' ? '출근' : '퇴근'} ${fmtDT(f.at)}</span>${f.note ? `<small class="mut" style="display:block">${esc(f.note)}</small>` : ''}</div><span class="row" style="gap:4px"><button class="btn sm" data-act="fix-dec" data-v="${f.id}" data-ok="">거절</button><button class="btn sm pri" data-act="fix-dec" data-v="${f.id}" data-ok="1">승인</button></span></div>`).join('')}<div style="height:10px"></div>` : ''}${R.length ? `<h3>휴무 신청 <small>${R.length}건</small></h3>${R.map(r => `<div class="li"><div><b>${nick(r.member_id)}</b> <span class="mut">${mdKr(r.work_date)}</span>${r.note ? `<small class="mut" style="display:block">${esc(r.note)}</small>` : ''}</div><span class="row" style="gap:4px"><button class="btn sm" data-act="req-no" data-v="${r.id}">거절</button><button class="btn sm pri" data-act="req-ok" data-v="${r.id}" data-m="${r.member_id}" data-d="${r.work_date}">승인 → 대타 찾기</button></span></div>`).join('')}` : ''}
  ${groups.length ? `<h3 style="margin-top:${R.length ? 12 : 0}px">대타 요청</h3>${groups.map(L => { const ok = L.find(o => o.status === 'ok'); return `<div class="li"><div><b>${mdKr(L[0].work_date)}</b> <small class="mut">${t5(L[0].start_t)}–${t5(L[0].end_t)}</small></div><span class="row" style="gap:4px;flex-wrap:wrap;justify-content:flex-end">${ok ? `<span class="pill g">✓ ${nick(ok.member_id)} 확정</span>` : `<button class="btn sm" data-act="sub-share" data-v="${mdKr(L[0].work_date)} ${t5(L[0].start_t)}–${t5(L[0].end_t)}">단톡 공유</button>` + L.map(o => `<span class="pill ${OFFER[o.status][0]}">${nick(o.member_id)} ${OFFER[o.status][1]}</span>`).join('')}</span></div>`; }).join('')}` : ''}</div>`;
}
async function subSheet(k, absent) {
  const [y, m, d] = k.split('-').map(Number), staff = S.members.filter(p => p.role !== 'owner');
  const ov = [...S.ov.filter(o => o.work_date !== k), ...(await q(sb.from('shift_overrides').select('*').in('member_id', staff.map(p => p.id)).eq('work_date', k)))];
  const on = id => E.shiftOn(id, y, m, d, S.tpl, ov), workers = staff.filter(p => on(p.id));
  const base = (absent && on(absent)) || (workers[0] && on(workers[0].id)) || { s: '20:00', e: '04:00', brk: 0 };
  const av = id => (S.avails || []).find(a => a.member_id === id && a.submitted_at)?.days?.includes(k);
  const wk = id => Array.from({ length: 7 }, (_, i) => addDay(k, i - E.wdOf(y, m, d))).filter(x => { const [a, b, c] = x.split('-').map(Number); return E.shiftOn(id, a, b, c, S.tpl, ov); }).length;
  const C = staff.filter(p => p.id !== absent && !on(p.id)).sort((a, b) => (+!!av(b.id) - +!!av(a.id)) || (+!!b.user_id - +!!a.user_id) || wk(a.id) - wk(b.id));
  const ab = absent && !on(absent) ? S.members.find(p => p.id === absent) : null;
  openSheet(`<h2>${mdKr(k)} 결근·대타</h2><p class="sub">그날 쉬는 우리 직원에게 먼저 물어봐요. 먼저 수락한 1명이 근무표에 자동으로 들어가요.</p>
  <form class="f" id="sub-form" data-d="${k}">
    <label class="fl">못 나오는 사람<select name="absent"><option value="">없음 (빈자리 채우기)</option>${workers.map(p => `<option value="${p.id}" ${p.id === absent ? 'selected' : ''}>${esc(p.nick)} ${t5(on(p.id).s)}–${t5(on(p.id).e)}</option>`).join('')}${ab ? `<option value="" selected>${esc(ab.nick)} (휴무 승인됨)</option>` : ''}</select></label>
    <div class="grid2"><label class="fl">시작<input type="time" name="s" value="${t5(base.s)}"></label><label class="fl">끝<input type="time" name="e" value="${t5(base.e)}"></label></div><input type="hidden" name="brk" value="${base.brk || 0}">
    <div class="fl"><span>물어볼 직원 <small class="mut">그날 쉬는 사람 · 가능일 낸 사람 먼저</small></span>${C.length ? C.map((p, i) => `<label class="tog"><span><b>${esc(p.nick)}</b><small>${av(p.id) ? '이날 가능하다고 했어요 · ' : ''}이번 주 ${wk(p.id)}일 근무${p.user_id ? '' : ' · 앱 미연결이라 알림을 못 받아요'}</small></span><input type="checkbox" name="c_${p.id}" ${i < 3 && p.user_id ? 'checked' : ''}></label>`).join('') : '<p class="note">그날 쉬는 직원이 없어요. 외부 공고로 구해 보세요</p>'}</div>
    <button class="btn pri full">${C.length ? '선택한 직원에게 대타 요청' : '못 나오는 사람만 휴무 처리'}</button>
    <button type="button" class="btn full" data-act="ext-post" data-d="${k}">외부 공고로 구하기</button></form>`);
}
// 연차 (근로기준법 60조, 5인 이상·주 15시간 이상): 1년 미만 월 1일(최대 11), 1년 이상 15일 + 2년마다 1일(최대 25)
function leaveOf(p) {
  if (!p.joined_on || wkH(p.id) < 15) return null; const [jy, jm, jd] = p.joined_on.split('-').map(Number), [y, m, d] = TODAY.split('-').map(Number);
  const mon = (y - jy) * 12 + (m - jm) - (d < jd ? 1 : 0), yrs = Math.floor(mon / 12);
  if (yrs < 1) return { n: Math.min(11, Math.max(0, mon)), txt: `입사 ${mon}개월 · 매달 1일씩`, next: `${12 - mon}개월 뒤 15일` };
  return { n: Math.min(25, 15 + Math.floor((yrs - 1) / 2)), txt: `근속 ${yrs}년차`, next: yrs % 2 ? `${yrs + 1}년차부터 +1일` : `${yrs + 2}년차부터 +1일` };
}
function myWeekCard(me) {
  const [y, m, d] = TODAY.split('-').map(Number), w0 = d - E.wdOf(y, m, d); let h = 0, n = 0;
  for (let i = 0; i < 7; i++) { const dt = new Date(y, m - 1, w0 + i), t = E.shiftOn(me.id, dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), S.tpl, S.ov); if (!t) continue; n++; h += Math.max(0, hoursOf(t5(t.s), t5(t.e)) - (t.brk ?? 0) / 60); }
  const L = leaveOf(me), pct = Math.min(100, h / 52 * 100);
  return `<div class="card mywk"><div><small>이번 주 근무</small><b class="num">${h.toFixed(1)}<i>시간</i></b><small>${n}일 · 주 52시간까지 ${Math.max(0, 52 - h).toFixed(1)}시간</small><div class="bar"><i style="width:${pct}%" class="${h > 52 ? 'over' : ''}"></i></div></div>${L ? `<div><small>내 연차</small><b class="num">${L.n}<i>일</i></b><small>${L.txt} · ${L.next}</small></div>` : ''}</div>`;
}
function staffSwapCard() {
  const O = (S.myOffers || []).filter(o => o.status === 'sent'), R = S.myReqs || [];
  return `${O.map(o => `<div class="card" style="border-color:var(--gold)"><b>대타 요청 · ${mdKr(o.work_date)} ${t5(o.start_t)}–${t5(o.end_t)}</b><small class="mut" style="display:block">먼저 수락한 1명이 근무표에 들어가요</small><div class="row" style="gap:6px;margin-top:8px"><button class="btn pri" data-act="offer-ok" data-v="${o.id}">수락</button><button class="btn" data-act="offer-no" data-v="${o.id}">어려워요</button></div></div>`).join('')}
  ${(() => { const me = S.my.map(m => m.id), L = S.mySwaps || [], inc = L.filter(w => me.includes(w.to_member) && w.status === 'peer'), mine = L.filter(w => me.includes(w.from_member)), ST = { peer: ['y', '상대 확인 중'], mgr: ['y', '대표 승인 대기'], ok: ['g', '확정'], no: ['', '거절'] };
    return `<div class="card"><div class="row between"><b>근무 바꾸기</b><button class="btn sm" data-act="swap-new">요청하기</button></div><small class="mut">동료와 하루 근무를 바꿔요 · 상대 수락 → 대표 승인</small>${inc.map(w => `<div class="li" style="border-color:var(--gold)"><span><b>${mdKr(w.work_date)}</b> 근무를 바꿔달래요${w.note ? ` <small class="mut">${esc(w.note)}</small>` : ''}</span><span class="row" style="gap:4px"><button class="btn sm" data-act="swap" data-v="${w.id}" data-ok="">거절</button><button class="btn sm pri" data-act="swap" data-v="${w.id}" data-ok="1">해줄게요</button></span></div>`).join('')}${mine.map(w => `<div class="li"><span>${mdKr(w.work_date)} 교대 요청</span><span class="pill ${ST[w.status][0]}">${ST[w.status][1]}</span></div>`).join('')}</div>`; })()}
  <div class="card"><div class="row between"><b>출퇴근 기록 고치기</b><button class="btn sm" data-act="fix-new">요청하기</button></div><small class="mut">QR을 깜빡했거나 잘못 찍었을 때</small>${(S.myFix || []).map(f => `<div class="li"><span>${f.kind === 'in' ? '출근' : '퇴근'} ${fmtDT(f.at)}</span><span class="pill ${{ wait: 'y', ok: 'g', no: '' }[f.status]}">${{ wait: '확인 중', ok: '반영됨', no: '거절' }[f.status]}</span></div>`).join('')}</div>
  <div class="card"><div class="row between"><b>휴무 신청</b><button class="btn sm" data-act="req-new">신청하기</button></div>${R.map(r => `<div class="li"><span>${mdKr(r.work_date)}${r.note ? ` <small class="mut">${esc(r.note)}</small>` : ''}</span><span class="pill ${{ wait: 'y', ok: 'g', no: '' }[r.status]}">${{ wait: '대기', ok: '승인', no: '거절' }[r.status]}</span></div>`).join('')}</div>`;
}
function coCard() {
  const L = S.coMonth; if (!L || L.length < 2) return '';
  const s = L.reduce((a, x) => a + Number(x.sales), 0), p = L.reduce((a, x) => a + Number(x.profit), 0);
  const mx = Math.max(1, ...L.map(x => Number(x.sales)));
  return `<div class="card"><h3>전체 매장 이번 달 <small>${L.length}곳 · 각 매장을 열 때 갱신</small></h3><div class="cmpst">${[...L].sort((a, b) => b.sales - a.sales).map(x => `<div class="cb"><span>${esc(x.name)}</span><div class="bar"><i style="width:${Number(x.sales) / mx * 100}%"></i></div><b class="num">₩${man(x.sales)}<small class="${Number(x.profit) >= 0 ? 'up' : 'down'}">${x.sales ? ` · ${Math.round(Number(x.profit) / Number(x.sales) * 100)}%` : ''}</small></b></div>`).join('')}</div><div class="li"><b>합계</b><span class="num">매출 ₩${man(s)} · 순이익 <b class="${p >= 0 ? 'up' : 'down'}">₩${man(p)}</b></span></div>${L.map(x => `<div class="li"><span>${esc(x.name)}</span><span class="num mut">₩${man(Number(x.sales))} · ₩${man(Number(x.profit))}</span></div>`).join('')}</div>`;
}
function wdCard() {
  const H = S.hist.filter(r => r.report_date >= addDay(TODAY, -56) && r.sales > 0); if (H.length < 7) return '';
  const by = Array.from({ length: 7 }, () => []); H.forEach(r => { const [a, b2, c] = r.report_date.split('-').map(Number); by[E.wdOf(a, b2, c)].push(r.sales); });
  const av = by.map(L => L.length ? L.reduce((a, v) => a + v, 0) / L.length : 0), mx = Math.max(1, ...av), best = av.indexOf(Math.max(...av));
  return `<div class="card"><h3>요일별 평균 매출 <small>최근 8주</small></h3><div class="wdbars">${av.map((v, i) => `<div><span class="num">${v ? man(v) : '-'}</span><i style="height:${Math.max(4, v / mx * 100)}%" class="${i === best ? 'best' : ''}"></i><b>${E.WD[i]}</b></div>`).join('')}</div><p class="note">${E.WD[best]}요일이 가장 잘 벌어요. 이 요일엔 사람을 넉넉히 두세요.</p></div>`;
}
function vatCard() {
  const q0 = Math.floor((S.m - 1) / 3) * 3 + 1, f0 = E.ymd(S.y, q0, 1), l0 = E.ymd(S.y, q0 + 2, E.daysIn(S.y, q0 + 2));
  const sales = S.hist.filter(r => r.report_date >= f0 && r.report_date <= l0).reduce((a, r) => a + r.sales, 0); if (!sales) return '';
  const cost = (S.expAll || []).filter(x => x.spent_on >= f0 && x.spent_on <= l0 && !['labor', 'card'].includes(x.category)).reduce((a, x) => a + x.amount, 0);
  const vat = Math.max(0, Math.round((sales - cost) / 11 / 1000) * 1000);
  return `<div class="card"><h3>${Math.ceil(q0 / 3)}분기 부가세 미리보기 <small>${q0}~${q0 + 2}월 입력분</small></h3><div class="li"><span class="mut">매출 ₩${man(sales)} − 비용 ₩${man(cost)}</span><b class="num">약 ₩${man(vat)}</b></div><p class="note">일반과세 기준 간단 추정이에요. 세금계산서·카드 영수증을 받은 비용만 공제돼서 실제와 다를 수 있어요. 신고 전 세무사와 확인하세요.</p></div>`;
}
function sevOf(p) {
  if (!p.joined_on || wkH(p.id) < 15) return null; const days = (Date.parse(TODAY) - Date.parse(p.joined_on)) / 864e5;
  if (days < 365) return days >= 300 ? { soon: Math.ceil(365 - days) } : null;
  let g = 0, dd = 0; for (let i = 1; i <= 3; i++) { const t = new Date(now.getFullYear(), now.getMonth() - i, 1), r = E.payroll(p, t.getFullYear(), t.getMonth() + 1, S.tpl, S.ov, 0, TODAY, night()); g += r.fullGross; dd += E.daysIn(t.getFullYear(), t.getMonth() + 1); }
  return g ? { amt: Math.round(g / dd * 30 * days / 365 / 10) * 10, yrs: (days / 365).toFixed(1) } : null;
}
function startCard() {
  if (!isOwner() || lsGet('ev_start_' + S.store.id) || !CFG().done) return ''; // 매장 준비(10단계)를 끝낸 뒤에만
  const staff = S.members.filter(p => p.role !== 'owner');
  const st = [['직원 초대 → 승인', staff.length > 0, 'act:invite'], ['직원 시급 입력', staff.length > 0 && staff.every(p => +p.hourly_rate > 0), 'tab:staff'], ['근무표 만들기', (S.tpl || []).length > 0 || (S.ov || []).length > 0, 'tab:sched'], ['QR 출근 1번 찍어보기', (S.attStore || []).length > 0, 'sub:qr'], ['첫 마감 입력', (S.hist || []).length > 0, 'tab:sales']];
  const n = st.filter(x => x[1]).length; if (n === st.length) { lsSet('ev_start_' + S.store.id, '1'); return ''; }
  return `<div class="card" style="border-color:var(--green)"><div class="row between"><h3 style="margin:0">시작하기 <small>${n}/5 · 다 하면 사라져요</small></h3><button class="btn sm" data-act="setup-help">대신 세팅해 주세요</button></div><div class="startbar"><i style="width:${n * 20}%"></i></div>${st.map(([l, ok, go], i) => `<div class="li"><span>${ok ? '✅' : `<b class="num">${i + 1}</b>`} ${l}</span>${ok ? '' : go.startsWith('tab:') ? `<button class="btn sm pri" data-tab="${go.slice(4)}">하기</button>` : go.startsWith('sub:') ? `<button class="btn sm pri" data-act="sub" data-v="${go.slice(4)}">하기</button>` : `<button class="btn sm pri" data-act="${go.slice(4)}">하기</button>`}</div>`).join('')}</div>`;
}
function todoCard() {
  const L = [], staff = S.members.filter(p => p.role !== 'owner'), [y, m, d] = TODAY.split('-').map(Number);
  if (S.hist.length && !S.hist.some(r => r.report_date === addDay(TODAY, -1))) L.push(['어제 마감이 아직이에요', '매출 입력', 'tab:sales']);
  if ((S.reqs || []).length) L.push([`휴무 신청 ${S.reqs.length}건 대기`, '확인', 'tab:sched']);
  if ((S.fixes || []).length) L.push([`출퇴근 정정 요청 ${S.fixes.length}건`, '확인', 'tab:sched']);
  if ((S.swaps || []).length) L.push([`근무 교대 승인 ${S.swaps.length}건`, '확인', 'tab:sched']);
  const nd = needOn(TODAY, S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2]), n = staff.filter(p => E.shiftOn(p.id, y, m, d, S.tpl, S.ov)).length;
  if (staff.length && n < nd) L.push([`오늘 ${nd - n}명 부족`, '대타 찾기', 'sub:' + TODAY]);
  const okG = new Set((S.offers || []).filter(o => o.status === 'ok').map(o => o.grp)), wait = new Set((S.offers || []).filter(o => !okG.has(o.grp)).map(o => o.grp)).size;
  if (wait) L.push([`대타 요청 ${wait}건 답 기다리는 중`, '보기', 'tab:sched']);
  const miss = staff.filter(p => !p.real_name || !p.bank_acct || !p.bank_holder).length; if (miss) L.push([`급여 정보 빠진 직원 ${miss}명`, '채우기', 'tab:staff']);
  if (S.round?.status === 'collect') L.push([`${+S.nmKey.slice(5, 7)}월 가능일 수집 중`, '보기', 'tab:sched']);
  if (!L.length) return '';
  return `<div class="card"><h3>오늘 할 일 <small>${L.length}개</small></h3>${L.slice(0, 3).map(([t, b, go]) => `<div class="li"><span>${t}</span>${go.startsWith('sub:') ? `<button class="btn sm pri" data-act="sub-day" data-d="${go.slice(4)}">${b}</button>` : `<button class="btn sm pri" data-tab="${go.slice(4)}">${b}</button>`}</div>`).join('')}</div>`;
}
// 지각·조퇴: 근무 시작 10분 넘어 출근 = 지각, 끝나기 10분 전 퇴근 = 조퇴 (출퇴근 기록이 있는 직원만)
function attOf(p) {
  const A = (S.attStore || []).filter(x => x.member_id === p.id); if (!A.length) return null;
  let late = 0, early = 0, miss = 0; const D = E.daysIn(S.y, S.m);
  for (let i = 1; i <= D; i++) { const k = E.ymd(S.y, S.m, i); if (k >= TODAY) break; const t = E.shiftOn(p.id, S.y, S.m, i, S.tpl, S.ov); if (!t) continue;
    const s0 = new Date(`${k}T${t5(t.s)}:00+09:00`); let e0 = new Date(`${k}T${t5(t.e)}:00+09:00`); if (e0 <= s0) e0 = new Date(+e0 + 864e5);
    const ins = A.filter(x => x.kind === 'in' && Math.abs(new Date(x.at) - s0) < 5 * 36e5), outs = A.filter(x => x.kind === 'out' && Math.abs(new Date(x.at) - e0) < 5 * 36e5);
    if (!ins.length) { miss++; continue; } if (Math.min(...ins.map(x => new Date(x.at))) - s0 > 6e5) late++; if (outs.length && e0 - Math.max(...outs.map(x => new Date(x.at))) > 6e5) early++; }
  return { late, early, miss };
}
function whtRows() { return S.members.filter(p => p.role !== 'owner' && p.contract !== '4대').map(p => { const r = payOf(p), it = Math.floor(r.gross * 0.03 / 10) * 10, lt = Math.floor(it * 0.1 / 10) * 10; return { p, gross: r.gross, it, lt, net: r.gross - it - lt }; }).filter(x => x.gross > 0); }
/* [이름, ...] 목록 → "블라인드 12일 · 에이스 3일" */
const whoDays = L => Object.entries(L.reduce((a, [n]) => (a[n] = (a[n] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${esc(n)} ${c}일`).join(' · ');
const hueOf = id => [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) * 47 % 360;
function vSched() {
  const need = S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2], D = E.daysIn(S.y, S.m), lead = E.wdOf(S.y, S.m, 1), staff = S.members.filter(p => p.role !== 'owner');
  if (!staff.length) return `${storeHead('스케줄')}<div class="card empty">먼저 직원을 등록해 주세요 <button class="btn sm pri" data-tab="staff">직원 등록</button> <button class="btn sm" data-act="helper-add">+ 헬퍼</button></div>`;
  const view = S.schedView || 'month';
  const head = `${storeHead('스케줄')}<div class="row between" style="margin-top:10px">${view === 'day' ? '<span></span>' : monthNav()}<div class="seg">${[['month', '월간'], ['day', '일간'], ['week', '기본']].map(([k, l]) => `<button data-act="sview" data-v="${k}" aria-pressed="${view === k}">${l}</button>`).join('')}</div></div>
  ${S.store.need_by_wd ? '' : '<div class="card" style="margin-top:10px;border-color:var(--gold)"><b>먼저 요일별 적정 인원을 정해 주세요</b><small class="mut" style="display:block">아래 달력 위 \'적정 인원\' 칸에 요일마다 필요한 사람 수를 넣으면 부족한 날을 정확히 알려드려요. 지금은 기본값이에요.</small></div>'}${streakCard()}<div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn sm" data-act="helper-add" title="가입 안 한 헬퍼도 근무·인건비 기록">+ 헬퍼</button><button class="btn sm" data-act="bulk-past" title="지난 날짜 근무를 표로 한 번에">지난 근무 한번에</button><details class="moreb"><summary class="btn sm">⋯ 더보기</summary><div class="moreb-in"><button class="btn sm" data-act="sched-img">${S.m}월 근무표 이미지</button><button class="btn sm" data-act="print">인쇄</button></div></details></div>${S.round?.status || +TODAY.slice(8) >= 15 ? roundCard() : `<details class="card"><summary><b>다음 달 스케줄 자동</b> <small class="mut">보통 20일쯤 시작 · 펼치기</small></summary>${roundCard()}</details>`}${swapCard()}<p class="note" style="margin:6px 0 0">직원 투표 없이 사장님이 바로 넣어도 돼요 · 칸 누르기 → + 또는 복사·붙이기</p>`;
  if (view === 'week') return `${head}<div class="card"><div class="row" style="justify-content:flex-end"><button class="btn sm" data-act="brk-all">휴게시간 한 번에</button><button class="btn sm" data-act="sched-import">고정 근무 가져오기</button></div><p class="note" style="margin-top:0">매주 반복되는 기본 근무예요. 칸을 눌러 고치세요. 날짜마다 다르면 '월간'에서 그날만 바꾸세요.</p><div class="tbl"><table><thead><tr><th>이름</th>${E.WD.map(w => `<th>${w}</th>`).join('')}</tr></thead><tbody>
    ${staff.map(p => `<tr><td><b>${esc(p.nick)}</b></td>${E.WD.map((_, i) => { const t = S.tpl.find(x => x.member_id === p.id && x.weekday === i); return `<td><button class="chip ${t ? '' : 'add'}" data-act="edit-w" data-m="${p.id}" data-w="${i}">${t ? `${t5(t.start_t)}–${t5(t.end_t)}` : '+'}</button></td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  if (view === 'day') { const k = S.schedDay || TODAY, [y, m, d] = k.split('-').map(Number), hol = isHoliday(k), n = staff.filter(p => E.shiftOn(p.id, y, m, d, S.tpl, S.ov)).length, nd = needOn(k, need);
    return `${head}<div class="card"><div class="row between"><button class="btn sm" data-act="day-go" data-v="-1">◀</button><div style="text-align:center"><b style="font-size:17px" class="${hol || E.wdOf(y, m, d) === 6 ? 'down' : ''}">${m}월 ${d}일 (${E.WD[E.wdOf(y, m, d)]})${hol ? ' · 공휴일' : ''}</b><small class="mut" style="display:block">${n}명 근무 · 적정 ${nd}명 ${n < nd ? `<b class="down">${nd - n}명 부족</b>` : ''}</small></div><button class="btn sm" data-act="day-go" data-v="1">▶</button></div>
      <div class="row" style="justify-content:center;margin:10px 0 4px"><button class="btn sm ${hol ? 'gold' : ''}" data-act="holiday" data-d="${k}">${hol ? '✓ 공휴일' : '공휴일로 지정'}</button><button class="btn sm" data-act="add-d" data-d="${k}">+ 근무 추가</button><button class="btn sm" data-act="sub-day" data-d="${k}">결근·대타</button>${k !== TODAY ? `<button class="btn sm" data-act="day-open" data-d="${TODAY}">오늘</button>` : ''}</div>
      ${k === TODAY && S.tls?.today?.tables_in_use ? `<p class="note">손님앱 기준 테이블 ${S.tls.today.tables_in_use}개 운영 중 → 딜러 교대 포함 ${Math.ceil(S.tls.today.tables_in_use * 1.3)}명 필요</p>` : ''}${dayTimeline(k)}</div>`; }
  let cells = '', short = 0;
  const wks = Math.ceil((lead + D) / 7), wk = S.wk > wks ? 0 : S.wk || 0, inWk = d => !wk || Math.floor((lead + d - 1) / 7) + 1 === wk;
  for (let d = 1; d <= D; d++) {
    const k = E.ymd(S.y, S.m, d), list = staff.map(p => ({ p, t: E.shiftOn(p.id, S.y, S.m, d, S.tpl, S.ov) })).filter(x => x.t), nd = needOn(k, need), hol = isHoliday(k);
    if (list.length < nd) short++;
    if (inWk(d)) cells += `<div class="cell ${list.length < nd ? 'short' : ''} ${k === TODAY ? 'today' : ''} ${S.selCell === k ? 'csel' : ''}" data-d="${k}" data-act="cellsel"><div class="ch"><button class="dn ${hol ? 'hol' : ''}" data-act="day-open" data-d="${k}" title="일간 근무표">${d}${hol ? '<small>휴</small>' : ''}</button><span class="pill ${list.length < nd ? (nd - list.length >= 2 ? 'r' : 'y') : 'g'}">${list.length}/${nd}</span></div>
      ${list.map(({ p, t }) => `<div role="button" tabindex="0" class="chip ${p.job_role === '딜러' ? '' : 'fl'} ${t.ov ? 'ov' : ''} ${selHas(p.id, k) ? 'sel' : ''}" draggable="true" data-act="chip" data-m="${p.id}" data-d="${k}" title="${esc(p.nick)}" style="--hc:${hueOf(p.id)}"><span class="nm">${esc([...p.nick].slice(0, 3).join(''))}</span><small>${t5(t.s).slice(0, 2)}-${t5(t.e).slice(0, 2)}</small></div>`).join('')}
      <button class="chip add" data-act="add-d" data-d="${k}">+</button></div>`;
  }
  const SL = S.sels || [], one = SL.length === 1 ? (() => { const x = SL[0], p = S.members.find(q => q.id === x.m), t = p && shiftOf(x.m, x.d), [, mm, dd] = x.d.split('-').map(Number); return t ? `<span><b>${esc(p.nick)} · ${mm}/${dd} ${t5(t.s)}–${t5(t.e)}</b></span><span class="row"><button class="btn sm" data-act="edit-d" data-m="${p.id}" data-d="${x.d}">수정</button><button class="btn sm" data-act="sel-copy">복사</button><button class="btn sm" data-act="sel-off">휴무</button><button class="btn sm" data-act="unsel">✕</button></span>` : ''; })() : '';
  const selbar = `<div class="clipbar sel ${SL.length || S.clip ? '' : 'idle'}">${S.clip ? `<span><b>${S.clip.items.length}개 복사됨</b> · ${S.selCell ? '' : '붙일 날짜 칸을 누르세요'}</span><span class="row">${S.selCell ? `<button class="btn sm pri" data-act="paste-here">${+S.selCell.slice(8)}일에 붙이기 (Ctrl+V)</button>` : ''}<button class="btn sm" data-act="clip-end">✕</button></span>`
    : SL.length > 1 ? `<span><b>${SL.length}개 선택</b> · 끌면 한꺼번에 옮겨요</span><span class="row"><button class="btn sm" data-act="sel-copy">복사</button><button class="btn sm" data-act="sel-off">휴무</button><button class="btn sm" data-act="unsel">✕</button></span>`
    : one || `<span class="mut">${matchMedia('(pointer:coarse)').matches ? '이름 누르기 → 복사 → 날짜 칸 → 붙이기 · 두 번 누르면 수정' : '누르면 선택 · Shift 누르고 더 누르면 여러 개 · 두 번 누르면 수정 · 끌어서 옮기기 · Ctrl+C/V · Delete 휴무'}</span>`}</div>`, clip = '';
  return `${head}${clip}<div class="card"><div class="row between" style="margin-bottom:8px"><div class="row needs"><span class="mut" style="font-size:12px">적정 인원</span>${[...E.WD, '공휴일'].map((w, i) => `<label class="row" style="gap:3px;font-size:12px">${w}<input type="number" min="0" max="20" value="${need[i] ?? need[6]}" data-need="${i}" style="width:48px;padding:5px"></label>`).join('')}</div>${short ? `<span class="pill r">인원 부족 ${short}일</span>` : '<span class="pill g">모든 날 충분</span>'}</div><div class="row" style="gap:6px;font-size:12px;margin:0 0 8px;flex-wrap:wrap;align-items:center"><span class="mut">피크 시간</span><input type="time" id="pk-f" value="${S.store.peak?.from || '22:00'}" style="width:auto;padding:4px"><span>~</span><input type="time" id="pk-t" value="${S.store.peak?.to || '02:00'}" style="width:auto;padding:4px"><span class="mut">에는</span><input type="number" id="pk-n" min="0" max="10" value="${S.store.peak?.extra ?? ''}" style="width:48px;padding:4px"><span class="mut">명 더</span><button class="btn sm" data-act="peak-save">저장</button></div>
    <div class="row" style="gap:4px;margin:0 0 8px;flex-wrap:wrap;align-items:center"><span class="mut" style="font-size:12px">주 단위</span><div class="seg">${[0, ...Array.from({ length: wks }, (_, i) => i + 1)].map(i => `<button data-act="wk" data-v="${i}" aria-pressed="${wk === i}">${i ? i + '주' : '한 달'}</button>`).join('')}</div>${wk ? `<button class="btn sm" data-act="wk-prev" data-v="${wk}">지난주 그대로 복사</button><button class="btn sm" data-act="wk-auto" data-v="${wk}">${wk}주차 자동 배정</button><button class="btn sm" data-act="sched-img">${wk}주차 이미지</button>` : ''}</div>
    ${short && isOwner() ? `<div class="row" style="justify-content:flex-end;margin-bottom:6px"><button class="btn sm pri" data-act="fill-sug">빈자리 자동 추천</button></div>` : ''}${selbar}<div class="cal">${E.WD.map(w => `<div class="h">${w}</div>`).join('')}${'<div></div>'.repeat(wk > 1 ? 0 : lead)}${cells}</div>
    ${S.selCell ? `<div class="daytl"><div class="row between"><b>${+S.selCell.slice(5, 7)}월 ${+S.selCell.slice(8)}일 (${E.WD[E.wdOf(...S.selCell.split('-').map(Number))]}) 타임라인</b><button class="btn sm" data-act="day-open" data-d="${S.selCell}">크게 보기</button></div>${dayTimeline(S.selCell, true)}</div>` : ''}
    <p class="note">${matchMedia('(pointer:coarse)').matches ? '이름 누르기 → 복사 → 붙일 날짜 칸 누르기 → 붙이기. 두 번 누르면 시간 수정, 날짜 숫자를 누르면 그날 타임라인이 나와요.' : `엑셀처럼 써요. 이름을 누르면 선택, Shift(또는 Ctrl)를 누른 채 더 누르면 여러 명·여러 날을 한꺼번에 골라요. 고른 걸 끌면 같이 옮겨지고(Ctrl 누르고 끌면 복사), Ctrl+C → 붙일 날짜 칸 누르기 → Ctrl+V, Delete는 휴무예요. 날짜 숫자를 누르면 그날 타임라인이 나와요.`}</p></div>`;
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
const POS = ['토스플레이스', '스마트로', '페이히어', '이지포스', 'OKPOS', '포스뱅크'], TOSS_CODE = '7YES2HMV';
const DMET = [['sales', '매출'], ['entries', '엔트리'], ['card', '카드'], ['cash', '현금'], ['cash_diff', '금고 차액'], ['all', '전체']];
function dailyCal() {
  const met = S.dmet || 'sales', D = E.daysIn(S.y, S.m), lead = E.wdOf(S.y, S.m, 1), by = Object.fromEntries(S.hist.map(r => [r.report_date, r])), rs = S.reports;
  const fmt = (r, k) => r[k] == null ? '-' : k === 'entries' ? r[k] + '명' : k === 'cash_diff' ? (r[k] ? (r[k] > 0 ? '+' : '−') + E.won(Math.abs(r[k])) : '0') : man(r[k]);
  const sum = k => rs.reduce((a, r) => a + (+r[k] || 0), 0), mx = Math.max(1, ...rs.map(r => r.sales));
  let cells = ''; for (let d = 1; d <= D; d++) { const k = E.ymd(S.y, S.m, d), r = by[k];
    cells += `<div class="dcell ${r ? 'has' : ''} ${k === TODAY ? 'today' : ''} ${r && met === 'cash_diff' && r.cash_diff ? (Math.abs(r.cash_diff) >= 10000 ? 'bad' : 'warn') : ''}" ${r ? `data-act="day-rep" data-d="${k}"` : ''}><span class="dn2 ${E.wdOf(S.y, S.m, d) === 6 || isHoliday(k) ? 'down' : ''}">${d}${r?.detail?.event ? '<i class="evd" title="이벤트">🎉</i>' : ''}</span>
      ${r ? (met === 'all' ? `<small class="num">${man(r.sales)}</small><small class="mut">${r.entries ?? '-'}명</small>` : `<small class="num">${fmt(r, met)}</small>`) + (met === 'sales' ? `<i style="height:${r.sales / mx * 100}%"></i>` : '') : ''}</div>`; }
  return `<div class="card"><div class="row between"><h3 style="margin:0">${S.m}월 일 매출 <small>${rs.length}일 마감</small>${(L => L.length >= 3 ? ` <span class="pill r" title="금고 차액 1천원 이상인 날">금고 차액 ${L.length}회 · ${L.reduce((a, r) => a + r.cash_diff, 0) < 0 ? '−' : '+'}₩${E.won(Math.abs(L.reduce((a, r) => a + r.cash_diff, 0)))}</span>` : '')(rs.filter(r => Math.abs(r.cash_diff || 0) >= 1000))}</h3><span class="row" style="gap:6px"><button class="btn sm" data-act="tax-csv">세무사용</button><button class="btn sm" data-act="backups">전체 백업</button><button class="btn sm" data-act="sales-csv">엑셀</button>${monthNav()}</span></div>
    <div class="chips" style="margin:10px 0">${DMET.map(([k, l]) => `<button class="fchip ${met === k ? 'on' : ''}" data-act="dmet" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="dsum">${[['매출', '₩' + man(sum('sales'))], ['엔트리', sum('entries') + '명'], ['카드', '₩' + man(sum('card'))], ['현금', '₩' + man(sum('cash'))], ['하루 평균', '₩' + man(rs.length ? sum('sales') / rs.length : 0)]].map(([l, v]) => `<div><small>${l}</small><b class="num">${v}</b></div>`).join('')}</div>
    <div class="cal dcal">${E.WD.map(w => `<div class="h">${w}</div>`).join('')}${'<div></div>'.repeat(lead)}${cells}</div>
    <p class="note">날짜를 누르면 그날 마감 내용이 나와요.</p></div>${wdCard()}${vatCard()}`;
}
function vDaily() { return `${storeHead('일 매출')}${dailyCal()}`; }
// ===== 토스 POS 연동 (Open API 웹훅 → pos_payments) =====
const bizDay = () => { const d = new Date(Date.now() - (CFG().cut ?? 6) * 36e5); return E.ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
async function tossLoad(force) {
  if (!isOwner() || S.tossBusy || (!force && S.tossAt && Date.now() - S.tossAt < 60000)) return; S.tossBusy = 1;
  try { const { data } = await sb.rpc('toss_my_merchants'); S.toss = data || []; const me = S.toss.find(x => x.store_id === S.store.id); S.tossSum = me ? (await sb.rpc('pos_day_summary', { p_store: S.store.id, p_date: bizDay() })).data : null; S.tossAt = Date.now(); } catch { S.toss = []; } finally { S.tossBusy = 0; }
  if (S.tab === 'sales' || S.tab === 'home') render();
}
function posCard() {
  const L = S.toss || [], me = L.find(x => x.store_id === S.store.id), free = L.filter(x => !x.store_id), t = S.tossSum, ask = S.posAsk;
  const chips = `<div class="pos-chips">${POS.filter(p => p === '토스플레이스' || ask === p).map(p => p === '토스플레이스' ? `<span class="pill ${me ? 'g' : ''}">${me ? '✓ ' : ''}토스플레이스</span>` : `<span class="pill off">${p}${ask === p ? ' · 신청됨' : ''}<i>준비 중</i></span>`).join('')}</div>`;
  const body = me ? `<small>토스플레이스 연결됨 · 오늘 영업일 매출 <b class="num">₩${E.won(t?.total || 0)}</b> · ${t?.n || 0}건${t?.last ? ` · 마지막 결제 ${String(t.last).slice(11, 16)}` : ''} · 새벽 6시 기준</small>`
    : free.length ? `<small>토스 POS가 설치됐어요 · 어느 매장 POS인지 골라주세요</small>${free.map(x => `<div class="row between" style="margin-top:8px"><span>${esc(x.name)} <small class="mut">${esc(x.address || '')}</small></span><button class="btn sm pri" data-act="toss-link" data-v="${x.merchant_id}">${esc(S.store.name)}에 연결</button></div>`).join('')}`
    : `<small>연동하면 매출·카드·현금이 마감 때 자동으로 채워져요. 숫자는 그대로 고칠 수 있어요.</small>`;
  return `<div class="card pos"><div class="pos-top"><div><b>통합 POS 연동 ${help('pos')} ${me ? '<span class="pill g">자동</span>' : ''}</b>${body}</div>${me ? '<button class="btn sm pri" data-act="pos-fill">마감에 채우기</button>' : free.length ? '' : '<button class="btn sm pri" data-act="pos">연동하기</button>'}</div>${chips}</div>`;
}
function vSales() {
  const r0 = S.reports.find(r => r.report_date === bizDay()) || {}, ask = S.posAsk;
  return `${storeHead('매출 마감')}
  ${posCard()}
  <p class="note" style="margin:-4px 0 10px"><button type="button" class="tlink" data-act="sales-csv">지난 매출 엑셀·CSV로 가져오기</button></p>
  ${S.open ? `<div class="card openbar"><span><b>${fmtDT(S.open.opened_at).split(' ').slice(-2).join(' ')} 오픈</b> · 시작 시재 ₩${E.won(S.open.start_cash)}</span><button class="btn sm" data-act="open-edit">수정</button></div>`
    : `<form class="f card openbar" id="open-form"><div><b>오늘 오픈</b><small class="mut" style="display:block">영업 전 금고에 있는 돈을 넣고 오픈하세요</small></div><div class="row" style="flex-wrap:nowrap"><input name="start_cash" aria-label="시작 현금" type="number" inputmode="numeric" value="${S.lastStart ?? (CFG().carry !== false ? carryCash()?.v : null) ?? CFG().cash0 ?? 300000}" style="width:140px"><button class="btn pri">오픈</button></div></form>`}
  <form class="f card" id="report-form"><div class="row between"><h3 style="margin:0">마감 <button type="button" class="btn sm" data-act="rcpt" title="포스 마감영수증 사진으로 자동 입력">📷 사진으로 입력</button><input type="file" accept="image/*" capture="environment" id="rcpt-file" hidden><label class="btn sm" style="cursor:pointer" title="POS 영수증·금고·장부 사진 여러 장">📸 여러 장 마감<input type="file" accept="image/*" multiple id="close-photos" hidden></label></h3><label class="fl" style="margin:0"><input type="date" name="date" value="${bizDay()}" max="${TODAY}" style="width:auto"></label></div>
    <div class="grid2 big"><label class="fl">총매출 (원)<input name="sales" type="number" inputmode="numeric" required value="${r0.sales ?? ''}" placeholder="0"></label><label class="fl">엔트리 수<input name="entries" type="number" inputmode="numeric" value="${r0.entries ?? ''}" placeholder="0"></label></div>
    <details class="more" ${r0.card ? 'open' : ''}><summary>결제수단 · 금고 정산 <small class="mut">금고 차액을 잡아줘요</small></summary>
      <div class="grid2"><label class="fl">카드<input name="card" type="number" inputmode="numeric" value="${r0.card ?? ''}"></label><label class="fl">계좌이체·간편결제<input name="transfer" type="number" inputmode="numeric" value="${r0.transfer ?? ''}"></label><label class="fl">손님 환불·카드 취소 <small class="mut">매출에서 빠진 돈</small><input name="dt_refund" type="number" inputmode="numeric" value="${r0.detail?.refund ?? ''}" placeholder="0"></label>
      <div class="fl"><span>현금으로 쓴 돈 <small class="mut">항목별로 넣으면 손익에 바로 잡혀요</small></span><div id="close-exp">${closeRows(r0)}</div><button type="button" class="btn sm" data-act="xrow-add" style="margin-top:6px">+ 지출 항목</button><input name="expense" type="hidden" value="${r0.expense ?? ''}"></div><label class="fl">시작 시재 ${S.open ? '<small class="mut">(오픈 때 넣은 금액)</small>' : ''}<input name="start" type="number" value="${S.open?.start_cash ?? S.lastStart ?? 300000}"></label></div>
      <small class="mut">금고 현금 세기 · 장수만 넣으세요</small><div class="bills">${BILLS.map(b => `<label class="fl">${E.won(b)}원<input name="b${b}" type="number" min="0" inputmode="numeric"></label>`).join('')}</div>
      <div id="close-out"></div></details>
    <details class="more" ${r0.detail || CFG().split ? 'open' : ''}><summary>토너먼트·음료 <small class="mut">(선택) 넣으면 무엇으로 벌었는지 보여요</small></summary><div class="grid2">${[['rebuy', '리바이 수'], ['addon', '애드온 수'], ['tourn', '토너먼트 수'], ['prize', '상금 지급 (원)'], ['fnb', '음료·식사 매출 (원)'], ['etc', '기타 매출 (원)']].map(([k, l]) => `<label class="fl">${l}<input name="dt_${k}" type="number" inputmode="numeric" value="${r0.detail?.[k] ?? ''}"></label>`).join('')}</div><label class="fl">오늘 한 이벤트 <small class="mut">넣으면 이벤트한 날과 평소 매출을 비교해줘요</small><input name="dt_event" value="${esc(r0.detail?.event || '')}" placeholder="예: 주말 GTD 토너, 생일 이벤트"></label></details>
    <label class="fl">메모<input name="memo" value="${esc(r0.memo || '')}" placeholder="특이사항·차액 이유"></label><button class="btn pri full">마감하기</button>
    <p class="note">임대료·전기세 같은 고정비는 <button type="button" class="btn sm" data-tab="home">홈</button>에서 넣어요.</p></form>
  ${cashWatchCard()}
  ${stockCard()}
  ${dailyCal()}
  ${eventCard()}`;
}
// 직원 정렬: 점장 → 정규(매니저·플로어·딜러 순) → 파트타임 → 대타
const rankOf = p => (p.role === 'owner' ? 0 : p.role === 'manager' ? 1 : 2) * 100 + ({ 정규: 0, 파트타임: 20, 대타: 40, 헬퍼: 50 }[p.emp_type || '파트타임'] ?? 20) + ({ 매니저: 0, 플로어: 5, 딜러: 10 }[p.job_role] ?? 15);
const EMP = ['정규', '파트타임', '대타', '헬퍼'], tenure = d => { if (!d) return ''; const [y, m] = d.split('-').map(Number), n = (now.getFullYear() - y) * 12 + now.getMonth() + 1 - m; return n >= 12 ? `${Math.floor(n / 12)}년 ${n % 12 ? n % 12 + '개월' : ''}` : `${Math.max(0, n)}개월`; };
function vStaff() {
  const all = S.members.filter(p => p.role !== 'owner'), f = S.empF || '전체', staff = f === '전체' ? all : all.filter(p => (p.emp_type || '파트타임') === f);
  const rows = all.map(p => ({ p, r: payOf(p) })), sum = k => rows.reduce((a, x) => a + x.r[k], 0), cnt = t => all.filter(p => (p.emp_type || '파트타임') === t).length;
  const kv = (k, v) => `<div><small>${k}</small><b>${v || '<span class="mut">-</span>'}</b></div>`;
  return `${storeHead('직원·급여')}
  ${S.joins.length ? `<div class="card" style="border-color:rgba(245,158,11,.5)"><h3>소속 신청 <small>${S.joins.length}건</small></h3>${S.joins.map(j => `<div class="li"><div><b>${esc(j.name)}</b><small>경력 ${j.career_months}개월 · ${esc(j.bio || '')}</small></div><button class="btn sm pri" data-act="join-open" data-r="${j.req_id}">승인</button></div>`).join('')}</div>` : ''}
  <div class="seg sub2" style="margin-top:12px">${[['list', '직원 현황'], ['pay', '급여 대장']].filter(([k]) => k !== 'pay' || !(S.myRole === 'manager' && S.me?.perms?.pay === false)).map(([k, l]) => `<button data-act="stab" data-v="${k}" aria-pressed="${(S.staffTab || 'list') === k}">${l}</button>`).join('')}</div>
  ${(S.staffTab || 'list') === 'list' ? `
  <div class="row between" style="margin:12px 0 10px"><div class="chips">${['전체', ...EMP].map(t => `<button class="fchip ${f === t ? 'on' : ''}" data-act="empf" data-v="${t}">${t} <b class="num">${t === '전체' ? all.length : cnt(t)}</b></button>`).join('')}</div><span class="row" style="gap:6px">${isOwner() ? '<button class="btn sm" data-act="rate-bulk">시급 일괄</button>' : ''}<button class="btn sm" data-act="audit">변경 기록</button><button class="btn pri sm" data-act="invite">+ 직원 초대</button></span></div>
  ${all.some(p => p.user_id && (!p.real_name || !p.bank_acct || !p.bank_holder)) ? `<div class="card lbud"><div><b>급여 정보 빠진 직원 ${all.filter(p => p.user_id && (!p.real_name || !p.bank_acct || !p.bank_holder)).length}명</b><small>직원 폰에 "실명·계좌 넣어주세요" 알림을 보내요</small></div><button class="btn sm pri" data-act="ask-payinfo">한 번에 요청</button></div>` : ''}
  ${all.some(p => ['대타', '헬퍼'].includes(p.emp_type)) ? '<p class="note" style="margin:0 0 8px">대타 = 다른 매장에서 파견 온 직원 · 헬퍼 = 앱 안 깐 근무자 (근무표·인건비만 기록)</p>' : ''}
  ${all.length ? `<div class="card tplbar"><div><b>표준 근로계약서</b><small>${S.store.contract_tpl ? `저장됨 · ${esc(tplOf().days)} · ${esc(tplOf().tf)}~${esc(tplOf().tt)} · 매월 ${tplOf().payday}일 지급` : '양식을 한 번 저장해 두면 직원마다 버튼 한 번으로 보내요'}</small></div><span class="row"><button class="btn sm" data-act="tpl-edit">${S.store.contract_tpl ? '양식 수정' : '양식 만들기'}</button>${needContract().length ? `<button class="btn sm pri" data-act="doc-bulk">미발송 ${needContract().length}명 한 번에 보내기</button>` : ''}</span></div>` : ''}
  ${staff.map(p => `<div class="card emp"><div class="row between"><div class="row" style="gap:6px"><b style="font-size:17px">${esc(p.nick)}</b><span class="pill">${esc(p.job_role || '-')}</span><span class="pill et ${{ 정규: 'g', 파트타임: '', 대타: 'y', 헬퍼: 'y' }[p.emp_type || '파트타임']}">${esc(p.emp_type || '파트타임')}</span>${p.role === 'manager' ? '<span class="pill y">점장</span>' : ''}${p.user_id ? '<span class="pill g">앱 연결</span>' : ''}${p.emp_type === '헬퍼' ? (p.bank_acct ? '' : '<span class="pill">현금 지급</span>') : !p.real_name || !p.bank_acct || !p.bank_holder ? `<span class="pill r" title="급여·계약서에 필요해요. 수정에서 넣어주세요">${[!p.real_name && '실명', !p.bank_acct && '계좌', p.bank_acct && !p.bank_holder && '예금주'].filter(Boolean).join('·')} 없음</span>` : ''}${p.contract !== '4대' && wkH(p.id) >= 15 ? '<span class="pill y" title="주 15시간 이상이면 4대보험 가입 대상일 수 있어요">주 15h↑ · 4대보험 확인</span>' : ''}${wkH(p.id) > 52 ? '<span class="pill r" title="매주 기본 근무가 주 52시간을 넘어요">주 52h 초과</span>' : ''}${(at => at && (at.late || at.early || at.miss) ? `<span class="pill y" title="${S.m}월 출퇴근 기록 기준">${[at.late && '지각 ' + at.late, at.early && '조퇴 ' + at.early, at.miss && '기록없음 ' + at.miss].filter(Boolean).join(' · ')}</span>` : '')(attOf(p))}</div>
      <span class="row">${isOwner() && p.user_id ? `<button class="btn sm" data-act="mgr" data-m="${p.id}" data-v="${p.role !== 'manager'}">${p.role === 'manager' ? '점장 해제' : '점장 권한'}</button>${p.role === 'manager' && isOwner() ? `<button class="btn sm" data-act="perm" data-m="${p.id}">볼 수 있는 것</button>` : ''}` : ''}${isOwner() || p.role === 'staff' ? `<button class="btn sm" data-act="staff-edit" data-m="${p.id}">수정</button>` : ''}</span></div>
    <details class="empd"><summary class="mut">시급 ₩${E.won(p.hourly_rate || 0)} · ${p.contract === '4대' ? '4대보험' : '3.3%'}${p.joined_on ? ' · ' + tenure(p.joined_on) : ''} · 자세히</summary><div class="kv">${kv('실명', esc(p.real_name || ''))}${kv('연락처', p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a> ${p.phone_verified_at ? '<span class="pill g">✓ 확인</span>' : `<button class="btn sm" data-act="phone-ok" data-m="${p.id}">번호 확인</button>`}` : '')}${kv('시급', p.hourly_rate ? `₩${E.won(p.hourly_rate)}` : '')}${kv('계약', p.contract === '4대' ? '4대보험' : '3.3% 프리랜서')}${kv('입사일', p.joined_on ? `${p.joined_on} <small class="mut">(${tenure(p.joined_on)})</small>` : '')}${(L => L ? kv('연차', `${L.n}일 <small class="mut">(${L.txt})</small>`) : '')(leaveOf(p))}${(s => s ? kv('퇴직금', s.amt ? `약 ₩${E.won(s.amt)} <small class="mut">(${s.yrs}년 근속 · 최근 3개월 기준)</small>` : `<small class="mut">${s.soon}일 뒤 1년 → 퇴직금 대상</small>`) : '')(sevOf(p))}${kv('수당', [p.night_pay ? '야간' : '', (p.labor_law ?? p.contract === '4대') ? '연장·주휴' : ''].filter(Boolean).join(' · ') || '없음')}</div>
    <div class="acct">${p.bank_name ? `<b>${esc(p.bank_name)}</b> <span class="num">${esc(String(p.bank_acct || '').length > 4 ? '•••• ' + String(p.bank_acct).slice(-4) : p.bank_acct || '')}</span> <small class="mut">예금주 ${esc(p.bank_holder || '-')}</small>${p.bank_acct ? `<button class="btn sm" data-act="copy" data-v="${esc(p.bank_acct)}">계좌 복사</button>` : ''}` : '<span class="mut">계좌 미등록</span>'}</div></details>${docRow(p)}</div>`).join('') || `<div class="card empty">${all.length ? '해당하는 직원이 없어요' : '아직 직원이 없어요'}</div>`}
  <div class="card"><h3>매장 가입코드 <small>직원·딜러가 앱에서 이 코드로 소속 신청해요</small></h3><div class="row between"><b class="num" style="font-size:24px;letter-spacing:.12em">${esc(S.store.join_code)}</b><span class="row" style="gap:6px"><button class="btn sm" data-act="copy" data-v="${esc(S.store.join_code)}">복사</button>${isOwner() ? '<button class="btn sm" data-act="code-new">새 코드</button>' : ''}<button class="btn sm pri" data-act="invite">초대 링크 보내기</button></span></div>
    <p class="note">점장 권한은 앱에 가입해 소속된 직원에게만 줄 수 있어요. 점장은 자기 매장의 스케줄·매출·구인을 관리해요.</p></div>${contribCard()}` : `
  <div class="row between" style="margin:12px 0 8px">${monthNav()}<span class="row"><button class="btn sm" data-act="pay-copy">이체 목록 복사</button><button class="btn sm" data-act="slip-bulk">명세서 한 번에</button><button class="btn sm" data-act="inc-rule">인센티브 규칙</button><button class="btn sm" data-act="paynote">급여 안내문</button><button class="btn sm" data-act="bulk-xfer">대량이체 파일</button><button class="btn sm" data-act="wht">원천세</button><button class="btn sm" data-act="print" title="A4로 인쇄">인쇄</button><button class="btn sm pri" data-act="csv">엑셀</button></span></div>
  ${(() => { const cur = S.y === now.getFullYear() && S.m === now.getMonth() + 1; return S.lock ? `<div class="card lockbar"><span>🔒 <b>${S.m}월 급여 마감됨</b> <small class="mut">${fmtDT(S.lock.locked_at)} · 근무표·인센티브·가불을 못 고쳐요</small></span>${isOwner() ? '<button class="btn sm" data-act="paylock" data-v="">마감 풀기</button>' : ''}</div>` : isOwner() && rows.length && (!cur || now.getDate() >= 25) ? `<div class="card lockbar"><span><b>${S.m}월 급여 마감하기</b> <small class="mut">이체 끝나면 잠가서 숫자가 안 바뀌게</small></span><button class="btn sm pri" data-act="paylock" data-v="1">🔒 마감</button></div>` : ''; })()}
  ${rows.length ? `<div class="card paysum"><div><small>${S.m}월 실지급 합계 <span class="mut">(어제까지)</span></small><b class="num">₩${E.won(sum('net'))}</b></div><div class="ps3"><div><small>지급총액</small><b class="num">₩${man(sum('gross'))}</b></div><div><small>공제</small><b class="num down">−₩${man(sum('ded'))}</b></div><div><small>월말 예상</small><b class="num">₩${man(sum('fullGross'))}</b></div></div></div>
  <p class="legend">${[['기본급', '#8FE3C4'], ['야간', '#6366F1'], ['연장', '#F59E0B'], ['주휴', '#3B82C4'], ['인센티브', '#EC4899']].map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')} <span class="mut">· 이름을 누르면 자세히</span></p>
  ${rows.sort((a, b) => b.r.net - a.r.net).map(({ p, r }) => { const parts = [['기본급', r.base, '#8FE3C4'], ['야간', r.np, '#6366F1'], ['연장', r.otp, '#F59E0B'], ['주휴', r.juhu, '#3B82C4'], ['인센티브', r.inc, '#EC4899']], tot = Math.max(1, r.gross);
    return `<details class="card payrow"><summary><div><b>${esc(p.nick)}</b> <small class="mut">${esc(p.job_role || '')} · ${esc(p.emp_type || '파트타임')} · ${r.days}일 ${r.hours.toFixed(0)}시간</small><div class="pbar">${parts.map(([, v, c]) => v > 0 ? `<i style="width:${v / tot * 100}%;background:${c}"></i>` : '').join('')}</div></div><div class="pr-r"><small>${(mk => mk?.paid_at ? `<span class="pill g">✓ 지급${mk.seen_at ? '·확인' : ''}</span>` : r.adv ? '이체할 돈' : '실지급')(markOf(p.id))}</small><b class="num up">₩${E.won(r.adv ? r.xfer : r.net)}</b></div></summary>
      <div class="pd">${parts.map(([n, v, c]) => `<div class="li"><span><i class="dot" style="background:${c}"></i>${n}</span>${n === '인센티브' ? `<input type="number" step="1000" value="${r.inc}" data-inc="${p.id}" style="width:120px;padding:6px;text-align:right">` : `<span class="num">₩${E.won(v)}</span>`}</div>`).join('')}
        <div class="li"><b>지급총액</b><b class="num">₩${E.won(r.gross)}</b></div><div class="li"><span class="mut">공제 (${p.contract === '4대' ? '4대보험 근로자분' : '3.3%'})</span><span class="num down">−₩${E.won(r.ded)}</span></div>${r.meal ? `<div class="li"><span class="mut">식대 (비과세)</span><span class="num">₩${E.won(r.meal)}</span></div>` : ''}<div class="li"><b>실지급</b><b class="num up" style="font-size:18px">₩${E.won(r.net)}</b></div>${(S.adv || []).filter(x => x.member_id === p.id).map(x => `<div class="li"><span class="mut">− 가불 ${x.given_on.slice(5).replace('-', '/')}${x.memo ? ` · ${esc(x.memo)}` : ''}</span><span class="num down">−₩${E.won(x.amount)} <button class="btn sm" data-act="adv-del" data-v="${x.id}" aria-label="가불 기록 지우기">×</button></span></div>`).join('')}${r.adv ? `<div class="li"><b>이체할 돈</b><b class="num up" style="font-size:18px">₩${E.won(r.xfer)}</b></div>` : ''}
        <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" data-act="adv-new" data-m="${p.id}">+ 가불 기록</button>${markOf(p.id)?.paid_at ? `<button class="btn sm" data-act="paid" data-m="${p.id}" data-v="">지급 취소</button>` : `<button class="btn sm pri" data-act="paid" data-m="${p.id}" data-v="1">이체했어요 ✓</button>`}</div>
        <p class="note" style="margin:6px 0 0">${p.bank_name ? `입금: ${esc(p.bank_name)} ${esc(p.bank_acct || '')} (${esc(p.bank_holder || '')})` : '계좌가 없어요 — 직원 현황에서 넣어주세요'} · 월말까지 스케줄대로면 ₩${E.won(r.fullGross)}</p>${slipRow(p)}</div></details>`; }).join('')}
  <details class="more"><summary>계산 방법 보기</summary><p class="note" style="margin:0">어제까지 근무 기준 · 근무시간 = 스케줄 − 휴게 · 야간 = 22~06시 × 시급 × 0.5 · 연장 = 하루 8시간 넘는 시간 × 0.5 · 주휴 = 주 15시간 이상인 주. 연장·주휴는 '연장·주휴 적용' 직원만. 4대보험은 근로자 부담분이고 소득세는 따로 떼요.</p></details>` : '<div class="card empty">직원이 초대 링크로 가입하고 승인되면 급여가 자동으로 계산돼요</div>'}`}`;
}
const BANKS = ['KB국민', '신한', '우리', '하나', 'NH농협', 'IBK기업', '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일', '새마을금고', '우체국', '부산', '대구'];
// 7일 넘게 쉬는 날 없는 직원 (지난달 말 이어서 계산)
function streakCard() {
  const y = S.y, m = S.m, D = E.daysIn(y, m), bad = [];
  S.members.filter(p => p.role !== 'owner' && p.active !== false).forEach(p => { let run = 0, best = 0, from = 0, bf = 0; for (let i = -6; i <= D; i++) { const dt = new Date(y, m - 1, i), on = E.shiftOn(p.id, dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), S.tpl, S.ov); if (on) { if (!run) from = i; run++; if (run > best && i >= 1) { best = run; bf = from; } } else run = 0; } if (best >= 7) bad.push([p.nick, best, Math.max(1, bf)]); });
  // 근로기준법: 4시간 이상 30분, 8시간 이상 1시간 휴게 / 퇴근~다음 출근 11시간 (권고)
  const mn = t => { const [h, mi] = String(t).split(':').map(Number); return h * 60 + (mi || 0); }, brk = [], rest = [];
  S.members.filter(p => p.role !== 'owner' && p.active !== false).forEach(p => { let prevEnd = null; for (let i = 1; i <= D; i++) { const t = E.shiftOn(p.id, y, m, i, S.tpl, S.ov), base = (i - 1) * 1440;
    if (!t) { prevEnd = null; continue; } const s0 = base + mn(t.s); let e0 = base + mn(t.e); if (e0 <= s0) e0 += 1440; const len = e0 - s0, need = len >= 480 ? 60 : len >= 240 ? 30 : 0;
    if (t.brk != null && +t.brk < need && brk.length < 12) brk.push([p.nick, i, `${Math.round(len / 6) / 10}시간에 휴게 ${+t.brk}분`]);
    if (prevEnd != null && s0 - prevEnd < 660 && rest.length < 12) rest.push([p.nick, i, `${Math.floor((s0 - prevEnd) / 60)}시간만 쉼`]); prevEnd = e0; } });
  const law = (brk.length ? `<details class="card warnc"><summary><b>⚠️ 휴게시간이 법정 기준보다 짧아요</b> <small class="mut">${whoDays(brk)} · 눌러서 날짜 보기</small></summary><div class="sktags" style="margin-top:6px">${brk.map(([n, d, t]) => `<i>${esc(n)} · ${m}/${d} ${t}</i>`).join('')}</div><small class="mut">4시간 이상 일하면 30분, 8시간 이상이면 1시간 이상 쉬어야 해요.</small></details>` : '') + (rest.length ? `<div class="card warnc"><b>⚠️ 퇴근하고 11시간 안에 다시 출근</b><div class="sktags" style="margin-top:6px">${rest.map(([n, d, t]) => `<i>${esc(n)} · ${m}/${d} ${t}</i>`).join('')}</div><small class="mut">마감 다음 날 오픈 근무는 피로 사고가 잦아요. 11시간 이상 쉬게 해주세요.</small></div>` : '');
  return law + (bad.length ? `<div class="card warnc"><b>⚠️ 쉬는 날 없이 7일 넘게 잡힌 직원</b><div class="sktags" style="margin-top:6px">${bad.map(([n, k, f]) => `<i>${esc(n)} · ${m}/${f}부터 ${k}일 연속</i>`).join('')}</div><small class="mut">주 1회 이상 쉬는 날(주휴일)을 넣어주세요.</small></div>` : '');
}
async function memoBox(id) { const box = document.createElement('div'); box.className = 'memo'; box.innerHTML = `<h3>대표 메모 <small>대표만 봐요 · 직원에게 안 보여요</small></h3><textarea id="mmemo" rows="3" placeholder="예: 토요일 마감 선호, 3월에 시급 올려주기로 약속"></textarea><button class="btn sm" data-act="memo-save" data-m="${id}">메모 저장</button>`; $('#sheet .in')?.appendChild(box); const { data } = await sb.from('member_notes').select('memo').eq('member_id', id).maybeSingle(); if (data && $('#mmemo')) $('#mmemo').value = data.memo || ''; }
const DOCS_IN = [['contract', '근로계약서'], ['health', '보건증'], ['bankcopy', '통장 사본'], ['idcopy', '신분증 사본'], ['consent', '개인정보 동의서']];
const DOCS_OUT = [['pay', '마지막 급여 정산'], ['sev', '퇴직금 (1년 이상 · 14일 안에)'], ['ret', '유니폼·키·출입카드 반납'], ['ins', '4대보험 상실신고 (다음 달 15일까지)'], ['cert', '경력증명서 요청 시 발급'], ['notice30', '해고라면 30일 전 서면 예고 (안 했으면 30일분 통상임금 · 3개월 미만 근무는 예외)']];
// 다가오는 일: 급여일·원천세·4대보험 신고·보건증·생일·근속 기념일·최저임금
function upcomingCard() {
  if (!isOwner() && S.myRole !== 'manager') return ''; const [y, m, d] = TODAY.split('-').map(Number), L = [], dd = k => Math.round((Date.parse(k) - Date.parse(TODAY)) / 864e5), staff = S.members.filter(p => p.role !== 'owner');
  const pd = +tplOf().payday || 10, payK = E.ymd(y, m, Math.min(pd, E.daysIn(y, m))), pdd = dd(payK);
  if (staff.length && pdd >= 0 && pdd <= 2) { const pm = new Date(y, m - 2, 1), t = staff.reduce((a, p) => a + E.payroll(p, pm.getFullYear(), pm.getMonth() + 1, S.tpl, S.ov, 0, TODAY, night()).net, 0); L.push([pdd ? `${pdd === 1 ? '내일' : '모레'}` : '오늘', `급여일 · 이체할 돈 약 ₩${man(t)}`, 'pay']); }
  const wk = dd(E.ymd(y, m, 10)); if (wk >= 0 && wk <= 5 && staff.length) L.push([wk ? `D-${wk}` : '오늘', '원천세 신고·납부 (홈택스)', 'wht']);
  staff.filter(p => p.contract === '4대' && p.joined_on && !p.checks?.ins_in).forEach(p => { const [jy, jm] = p.joined_on.split('-').map(Number), dl = E.ymd(jm === 12 ? jy + 1 : jy, jm === 12 ? 1 : jm + 1, 15), k = dd(dl); if (k >= -30 && k <= 20) L.push([k >= 0 ? `D-${k}` : '지남', `${esc(p.nick)} 4대보험 취득신고 (${dl.slice(5).replace('-', '/')}까지)`, 'ins:' + p.id]); });
  staff.filter(p => p.health_exp).forEach(p => { const k = dd(p.health_exp); if (k <= 30) L.push([k >= 0 ? `D-${k}` : '만료', `${esc(p.nick)} 보건증 ${k >= 0 ? '만료 예정' : '만료됨'}`, 'staff']); });
  const ann = (k0, lab) => { if (!k0) return; const [, mm, dd0] = k0.split('-').map(Number); let k = E.ymd(y, mm, dd0); if (dd(k) < 0) k = E.ymd(y + 1, mm, dd0); const n = dd(k); return n <= 7 ? [n ? `D-${n}` : '오늘', lab(k)] : null; };
  staff.forEach(p => { const b = ann(p.birth, () => `${esc(p.nick)} 생일 🎂`); if (b) L.push([...b, 'staff']); const j = p.joined_on && ann(p.joined_on, k => `${esc(p.nick)} 입사 ${+k.slice(0, 4) - +p.joined_on.slice(0, 4)}주년`); if (j && +j[1].match(/(\d+)주년/)?.[1] > 0) L.push([...j, 'staff']); });
  (S.expiry || []).forEach(n => { const k = dd(n.data?.date || TODAY); if (k <= 3) L.push([k >= 0 ? `D-${k}` : '지남', `${esc(n.title || '품목')} 유통기한`, 'ops']); });
  const low = staff.filter(p => +p.hourly_rate && +p.hourly_rate < minWage()); if (low.length) L.unshift(['⚠️', `${low.map(p => esc(p.nick)).join('·')} 시급이 ${y}년 최저임금(₩${E.won(minWage())})보다 낮아요`, 'rate']);
  upcoming68().forEach(x => L.push([...x, 'ops']));
  if (!L.length) return '';
  return `<div class="card upc"><h3>다가오는 일 ${help('upc')} <small>${L.length}개</small></h3>${L.slice(0, 8).map(([t, b, go]) => `<div class="li"><span><span class="pill ${/오늘|지남|만료|⚠️/.test(t) ? 'r' : 'y'}">${t}</span> ${b}</span>${go.startsWith('ins:') ? `<button class="btn sm" data-act="ins-done" data-m="${go.slice(4)}">신고함</button>` : go === 'rate' ? '<button class="btn sm pri" data-act="rate-bulk">맞추기</button>' : go === 'wht' ? '<button class="btn sm" data-act="wht">금액 보기</button>' : go === 'ops' ? '<button class="btn sm" data-act="ops-open">보기</button>' : `<button class="btn sm" data-tab="staff">보기</button>`}</div>`).join('')}</div>`;
}
function myPaidCard(me) {
  const mk = (S.marks || []).filter(x => x.member_id === me.id && x.paid_at).sort((a, b) => b.month.localeCompare(a.month))[0]; if (!mk) return '';
  const mo = +mk.month.slice(5, 7), adv = (S.adv || []).filter(x => x.member_id === me.id);
  return `<div class="card paid"><div><b>${mo}월 급여가 지급됐어요 ✓</b><small>${fmtDT(mk.paid_at)}${adv.length ? ` · 가불 ₩${E.won(adv.reduce((a, x) => a + x.amount, 0))} 빼고 이체` : ''}</small></div>${mk.seen_at ? '<span class="pill g">확인함</span>' : `<button class="btn sm pri" data-act="pay-seen" data-m="${me.id}" data-v="${mk.month}">받았어요</button>`}</div>`;
}
function staffSheet(id) {
  setTimeout(() => { if (id && isOwner()) memoBox(id); }, 0); if (id && S.mode === 'store') sb.rpc('log_view', { p_member: id }).then(() => { }, () => { });
  const p = S.members.find(x => x.id === id) || { contract: '3.3', night_pay: true, job_role: '딜러', hourly_rate: 13000 };
  openSheet(`<h2>${id ? `${esc(p.nick)} 수정` : '직원 등록'}</h2><form class="f" id="staff-form" data-m="${id || ''}">
    <div class="grid2"><label class="fl">닉네임<input name="nick" required value="${esc(p.nick || '')}"></label><label class="fl">실명<input name="real_name" value="${esc(p.real_name || '')}"></label>
    <label class="fl">직책<select name="job_role">${['딜러', '플로어', '매니저'].map(r => `<option ${p.job_role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <label class="fl">계약<select name="contract"><option value="3.3" ${p.contract === '3.3' ? 'selected' : ''}>3.3% (프리랜서)</option><option value="4대" ${p.contract === '4대' ? 'selected' : ''}>4대보험</option></select></label>
    <label class="fl">시급 (원)<input name="rate" type="number" step="100" required value="${p.hourly_rate || ''}"></label><label class="fl">입사일<input name="joined" type="date" value="${p.joined_on || TODAY}"></label>
    <label class="fl">연락처<input name="phone" type="tel" inputmode="numeric" placeholder="010-0000-0000" value="${esc(p.phone || '')}"></label><label class="fl">생년월일<input name="birth" type="date" value="${p.birth || ''}"></label>
    <label class="fl">보건증 만료일<input name="health" type="date" value="${p.health_exp || ''}"></label><label class="fl">식대 (비과세, 월) <small class="mut">4대보험만</small><input name="meal" type="number" step="10000" max="200000" value="${+p.checks?.meal || ''}" placeholder="0"></label><label class="fl">퇴사 예정일 <small class="mut">(선택)</small><input name="leave" type="date" value="${p.checks?.leave || ''}"></label></div>
    <label class="tog"><span><b>수습 3개월</b><small>1년 이상 계약이면 수습 중 최저임금의 90%까지 줄 수 있어요 (단순노무직은 안 돼요)</small></span><input type="checkbox" name="prob" ${p.checks?.prob ? 'checked' : ''}></label>${id ? `<div class="row" style="gap:8px;align-items:center">${faceOf(p)}<button type="button" class="btn sm" data-act="face" data-m="${id}">📷 직원 사진</button></div>` : ''}
    ${id ? `<div class="fl"><span>신입 교육 <small class="mut">누르면 체크 · 바로 저장</small></span><div class="sktags edu">${EDU.map(([k, l]) => `<i role="button" tabindex="0" class="${(p.checks?.edu || []).includes(k) ? 'on' : ''}" data-act="edu" data-m="${id}" data-v="${k}">${l}</i>`).join('')}</div></div>` : ''}
    <div class="fl"><span>받은 서류 <small class="mut">입사 서류 체크</small></span><div class="chks">${DOCS_IN.map(([k, l]) => `<label><input type="checkbox" name="doc_${k}" ${p.checks?.[k] ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
    <div class="fl"><span>고용 형태</span><div class="seg brk">${EMP.map(t => `<label><input type="radio" name="emp" value="${t}" ${(p.emp_type || '파트타임') === t ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
    <label class="tog"><span><b>야간수당</b><small>22~06시 근무는 시급의 1.5배</small></span><input type="checkbox" name="night" ${p.night_pay ? 'checked' : ''}></label>
    <label class="tog"><span><b>연장·주휴수당</b><small>4대보험은 기본으로 켜져요. 3.3%도 실제로는 근로자로 볼 수 있어 켜두는 게 안전해요.</small></span><input type="checkbox" name="law" ${(p.labor_law ?? p.contract === '4대') ? 'checked' : ''}></label>
    <div class="grid2"><label class="fl">은행<select name="bank"><option value="">선택</option>${BANKS.map(b => `<option ${p.bank_name === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label><label class="fl">계좌번호<input name="acct" inputmode="numeric" value="${esc(p.bank_acct || '')}"></label></div>
    <label class="fl">예금주<input name="holder" value="${esc(p.bank_holder || p.real_name || '')}"></label>
    ${id || typeof contractSheet !== 'function' ? '' : '<label class="tog"><span><b>근로계약서 바로 보내기</b><small>저장하면 계약서 작성 창이 열려요 (대표 서명 → 직원 폰으로 발송)</small></span><input type="checkbox" name="autodoc" checked></label>'}
    <button class="btn pri full">저장</button>${id ? '<button class="btn red full" type="button" data-act="staff-del">퇴사 처리</button>' : ''}<button class="btn full" type="button" data-act="close">취소</button></form>`);
}
function joinSheet(reqId) {
  const j = S.joins.find(x => x.req_id === reqId), free = S.members.filter(p => p.role === 'staff' && !p.user_id);
  openSheet(`<h2>${esc(j.name)} 님 소속 승인</h2><p class="sub">경력 ${j.career_months}개월 · ${esc(j.phone || '')}</p><form class="f" id="join-form" data-r="${reqId}">
    <label class="fl">어떻게 등록할까요?<select name="member"><option value="">새 직원으로 등록</option>${free.map(p => `<option value="${p.id}" ${p.phone && j.phone && p.phone.replace(/\D/g, '') === String(j.phone).replace(/\D/g, '') ? 'selected' : ''}>이미 등록된 '${esc(p.nick)}'와 연결${p.emp_type === '헬퍼' ? ' (헬퍼)' : ''}</option>`).join('')}</select></label>
    <div class="grid2"><label class="fl">직책 (새 직원)<select name="role"><option>딜러</option><option>플로어</option><option>매니저</option></select></label><label class="fl">계약<select name="contract"><option value="3.3">3.3%</option><option value="4대">4대보험</option></select></label></div>
    <label class="fl">시급 (새 직원)<input name="rate" type="number" step="100" value="13000"></label>
    <button class="btn pri full">승인하기</button><button class="btn full" type="button" data-act="close">취소</button></form>`);
}
const dueText = at => { const t = new Date(at), ms = t - Date.now(), h = Math.floor(ms / 36e5), mi = Math.floor(ms % 36e5 / 6e4); return `${t.getMonth() + 1}/${t.getDate()}(${E.WD[(t.getDay() + 6) % 7]}) ${E.pad(t.getHours())}:${E.pad(t.getMinutes())} 마감 · ${ms <= 0 ? '마감됨' : h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간 남음` : h ? `${h}시간 ${mi}분 남음` : `${mi}분 남음`}`; };
const PREFER = ['경력자', '토너먼트 경험', '장기 근무 가능', '주말 가능', '인근 거주'], mapUrl = a => `https://map.naver.com/p/search/${encodeURIComponent(a)}`;
function vJobs() {
  const k = S.postKind || 'urgent', urg = k === 'urgent';
  return `${storeHead('구인')}<div class="card"><div class="seg" style="margin-bottom:12px"><button data-act="pkind" data-v="urgent" aria-pressed="${urg}">긴급 (24시간)</button><button data-act="pkind" data-v="hire" aria-pressed="${!urg}">상시 아르바이트</button></div>
  <form class="f" id="post-form">${urg && S.dc ? `<p class="note" style="margin-top:0"><b>+EV 가입 딜러 ${E.won(S.dc.total)}명</b> · 긴급 대타 알림 받는 딜러 ${E.won(S.dc.open_n)}명</p>` : ''}
    <div class="grid2"><label class="fl">직책<select name="role">${(urg ? ['딜러', '플로어'] : ['딜러', '플로어', '매니저', '동업자']).map(r => `<option>${r}</option>`).join('')}</select></label><label class="fl">몇 명<input name="heads" type="number" min="1" max="10" value="${S.pre?.heads || 1}"></label></div>
    <label class="fl">제목<input name="title" required value="${esc(S.pre?.title || (urg ? '오늘 밤 딜러 급구' : '주말 고정 딜러 모집'))}"></label>
    ${urg ? '' : `<div class="fl"><span>근무 요일</span><div class="days">${E.WD.map((w, i) => `<label><input type="checkbox" name="wd" value="${w}" ${(S.pre ? i === S.pre.wd : i >= 4 && i <= 5) ? 'checked' : ''}><span>${w}</span></label>`).join('')}</div></div>`}
    <div class="grid2"><label class="fl">시작 시간<input type="time" name="s" value="${S.pre?.s || '20:00'}" required></label><label class="fl">마감 시간<input type="time" name="e" value="${S.pre?.e || '04:00'}" required></label>
      ${urg ? '<label class="fl">일당 (원)<input name="pay" type="number" inputmode="numeric" step="5000" value="130000" required></label>' : `<label class="fl">급여<span class="row" style="gap:6px"><select name="ptype" style="width:auto">${['시급', '일급', '월급', '협의'].map(x => `<option>${x}</option>`).join('')}</select><input name="pamt" type="number" inputmode="numeric" value="15000" placeholder="협의면 비워도 돼요"></span></label>`}
      <label class="fl">택시비 지원 (원)<input name="taxi" type="number" inputmode="numeric" value="0"></label></div>
    ${urg ? '' : '<label class="tog"><span><b>급여 협의 가능</b><small>공고에 "협의 가능"이 같이 나가요</small></span><input type="checkbox" name="nego"></label>'}
    <div class="fl incbox"><span>인센티브</span><div class="seg brk"><label><input type="radio" name="inc_on" value="0" checked><span>없음</span></label><label><input type="radio" name="inc_on" value="1"><span>있음</span></label></div><input name="inc" class="incin" placeholder="예: 토너먼트 1회당 1만 원, 월 개근 5만 원"></div>
    <div class="fl"><span>우대 조건 <small class="mut">(선택)</small></span><div class="days wrap">${PREFER.map(x => `<label><input type="checkbox" name="pf" value="${x}"><span>${x}</span></label>`).join('')}</div><input name="pf_etc" placeholder="직접 입력 (예: 영어 가능)"></div>
    <div class="grid2"><label class="fl">주차<input name="park" placeholder="예) 건물 지하 2시간 무료"></label><label class="fl">복장<input name="dress" placeholder="예) 흰 셔츠·검은 바지"></label></div><label class="fl">하우스룰<input name="rule" placeholder="예) 근무 중 휴대폰 금지"></label><label class="fl">내용<textarea name="body" rows="3" placeholder="게임 종류, 분위기">${esc(S.pre?.body || '')}</textarea><button type="button" class="btn sm" data-act="ai-post" style="margin-top:6px">AI로 내용 쓰기</button></label>
    ${urg ? '' : `<label class="fl">게시 기간<select name="days">${[1, 3, 5, 14, 30].map(d => `<option value="${d}" ${d === 3 ? 'selected' : ''}>${d}일 · ${E.won(E.postBase(d))}원${E.FEES.DISC[d] ? ` (옵션 ${E.FEES.DISC[d] * 100}% 할인)` : ''}</option>`).join('')}</select></label>
    <div class="fl"><span>노출 방식</span><div class="expo">${[['0', '기본', '올린 순서대로'], ['2', '끌올 2회', `하루 ${E.won(E.FEES.JUMP[2])}원`], ['5', '끌올 5회', `하루 ${E.won(E.FEES.JUMP[5])}원`], ['8', '끌올 8회', `하루 ${E.won(E.FEES.JUMP[8])}원`], ['top', '상단 고정', `하루 ${E.won(E.FEES.TOP_DAY)}원 · 끌올 포함`]].map(([v, t, d]) => `<label><input type="radio" name="expo" value="${v}" ${v === '5' ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}</div>
      <small class="mut">끌올은 정해진 간격마다 목록 맨 위로 올라가요. 상단 고정은 기간 내내 끌올 공고보다 항상 위에 있어요.</small></div>`}
    <label class="tog"><span><b>반짝 강조</b><small>${urg ? '3,300원' : '하루 3,300원'} · 공고 옆 표시가 깜빡여요</small></span><input type="checkbox" name="flash"></label>
    ${S.store.address ? `<p class="note">공고에 매장 주소와 네이버 지도가 같이 나가요: ${esc(S.store.address)}</p>` : `<p class="note warn">매장 주소가 없어요. 넣으면 공고에 지도가 같이 나가요. <button type="button" class="btn sm" data-act="goto" data-t="more" data-s="settings">주소 넣기</button></p>`}
    <button type="button" class="btn full" data-act="post-preview">미리보기 · 딜러 화면</button>
    <div id="fee-box"></div>
    ${urg ? '<p class="note">급여는 미리 맡겨 두고(매출 아님), 근무가 끝나면 딜러에게 지급돼요. 못 구한 자리는 급여와 매칭 수수료를 돌려드려요.</p>' : ''}${payNote()}
    <button class="btn gold full" id="post-btn">공고 올리기</button></form></div>
  <details class="card dset"><summary><b>딜러 안내 설정</b> <small class="mut">채용 안내 문구 · 출입 안내</small></summary><form class="f" id="dset-form"><label class="fl">채용되면 같이 보낼 말<input name="hire_msg" maxlength="80" value="${esc(S.store.hire_msg || '')}" placeholder="예: 10분 전까지 와서 카운터에 이름 말해주세요"></label><label class="fl">매장 출입 안내 <small class="mut">채용된 딜러에게만 보여요</small><input name="entry_note" maxlength="120" value="${esc(S.store.entry_note || '')}" placeholder="예: 건물 뒤 엘리베이터 3층, 벨 누르기"></label><div class="row between"><button type="button" class="btn sm" data-act="blk-list">차단한 딜러</button><button class="btn sm pri">저장</button></div></form></details>
  <div class="card"><h3>우리 매장 공고 <small>${S.posts.length}건</small></h3>${S.posts.map(p => `<div class="job ${p.kind === 'urgent' ? 'urgent' : ''}"><div class="row between"><div><span class="pill ${p.status === 'open' ? 'g' : p.status === 'unpaid' ? 'y' : ''}">${{ open: '모집 중', unpaid: '결제 전' }[p.status] || '마감'}</span> <small class="mut">${p.kind === 'urgent' ? '긴급' : '상시'} · ${esc(p.job_role)} · ${fmtDT(p.created_at)} 올림</small><h4>${esc(p.title)}${p.status === 'open' ? ` <button class="btn sm" data-act="post-share" data-p="${p.id}">카톡 공유</button>` : ''} <button class="btn sm" data-act="post-copy" data-p="${p.id}">복사해서 새로</button></h4>${p.status === 'open' ? `<small class="${new Date(p.expires_at) - Date.now() < 864e5 ? 'warn' : 'mut'}">${dueText(p.expires_at)}</small>` : ''}</div>
    ${p.status === 'unpaid' ? `<button class="btn sm gold" data-act="paypost" data-p="${p.id}">₩${E.won(p.paid_amount)} 결제</button>` : `<button class="btn sm pri" data-act="manage" data-p="${p.id}" data-k="${p.kind}">관리</button>`}</div><div id="mg-${p.id}"></div></div>`).join('') || '<div class="empty">올린 공고가 없어요</div>'}</div>`;
}
const postVals = f => { const fd = new FormData(f), v = formVals(f); return { ...v, wd: fd.getAll('wd'), pf: [...fd.getAll('pf'), ...(v.pf_etc ? [v.pf_etc.trim()] : [])].filter(Boolean), heads: +v.heads || 1, top: v.expo === 'top', jump: v.expo === 'top' ? 0 : +v.expo || 0 }; };
function feeBox() {
  const f = $('#post-form'), box = $('#fee-box'); if (!f || !box) return; const v = postVals(f), urg = (S.postKind || 'urgent') === 'urgent';
  const L = E.feeLines(urg ? 'urgent' : 'hire', { pay: +v.pay || 0, heads: v.heads, flash: !!v.flash, top: v.top, jump: v.jump, days: +v.days || 3 }), tot = L.reduce((a, x) => a + x[1], 0);
  box.innerHTML = `<div class="receipt"><div class="rh">결제 계산서</div>${L.map(([n, a]) => `<div class="rl"><span>${esc(n)}</span><span class="num ${a <= 0 ? 'up' : ''}">${a === 0 ? '무료' : `${a < 0 ? '−' : ''}₩${E.won(Math.abs(a))}`}</span></div>`).join('')}<div class="rl tot"><b>합계</b><b class="num">₩${E.won(tot)}</b></div>
    ${urg ? `<small class="mut">딜러 급여 ₩${E.won((+v.pay || 0) * v.heads)}는 근무 후 딜러에게 가요 (3.3% 원천세는 매장에 돌려드려요 · 사장님이 홈택스 신고). 매칭 수수료 6%는 사람을 구했을 때만 받아요.</small>` : `<small class="mut">알바몬 기준: 즉시등록 8,800원 · 유료 공고 14일 · 끌올(점프) 하루 27,500~29,700원. +EV는 등록 ${E.won(E.postBase(+v.days || 14))}원에 끌올 하루 ${E.won(E.FEES.JUMP[v.jump] || 0)}원이에요. 올린 뒤에도 관리에서 기간·노출을 늘릴 수 있어요.</small>`}</div>`;
  const b = $('#post-btn'); if (b) b.textContent = tot ? `₩${E.won(tot)} 결제하고 공고 올리기` : '무료로 공고 올리기';
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
    <div class="grid2"><label class="fl">기간 추가<select name="days"><option value="0">늘리지 않음</option>${[1, 3, 5, 14, 30].map(d => `<option value="${d}">+${d}일 · ${E.won(E.postBase(d))}원</option>`).join('')}</select></label>
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
  const box = $('#mg-' + postId); if (!box) return; const apps = await q(sb.rpc('post_applicants', { p_post: postId })), favs = new Set(await q(sb.rpc('fav_apps', { p_post: postId })) || []), slots = kind === 'urgent' ? await q(sb.rpc('post_slots', { p_post: postId })) : [];
  const btn = s => ({ MATCHED: `<button class="btn sm" data-act="slot" data-s="${s.slot_id}" data-v="start">출근 확인</button><button class="btn sm red" data-act="slot" data-s="${s.slot_id}" data-v="noshow">안 왔어요</button>`,
    WORKING: `<button class="btn sm" data-act="slot" data-s="${s.slot_id}" data-v="extra">+1시간 연장</button>`,
    DONE: `<button class="btn sm pri" data-act="slot" data-s="${s.slot_id}" data-v="ok">근무 완료 확인·지급</button><button class="btn sm red" data-act="slot" data-s="${s.slot_id}" data-v="dispute">문제 신고</button>` }[s.status] || '');
  apps.sort((x, y2) => (+favs.has(y2.app_id) - +favs.has(x.app_id)) || ((y2.rep?.done || 0) - (x.rep?.done || 0)) || ((y2.rep?.recall_pct || 0) - (x.rep?.recall_pct || 0)) || ((x.rep?.noshow || 0) - (y2.rep?.noshow || 0)));
  const P = S.posts.find(x => x.id === postId); S.mgApps = { ...(S.mgApps || {}), [postId]: apps };
  box.innerHTML = `${slots.map(s => `<div class="slot"><span><b class="num">${t5(s.start_t)}–${t5(s.end_t)}</b> · ₩${E.won(s.pay)}${s.extra ? ` <span class="up">+₩${E.won(s.extra)}</span>` : ''}<br><small class="mut">${s.dealer_name ? esc(s.dealer_name) : '아직 채용 전'}</small></span><span class="row"><span class="pill ${SLOT[s.status][0]}">${SLOT[s.status][1]}</span>${btn(s)}${s.dealer_name && ['DONE', 'PAID', 'WORKING', 'MATCHED'].includes(s.status) ? `<button class="btn sm" data-act="snote" data-s="${s.slot_id}" data-p="${postId}" data-k="${kind}">한마디</button>` : ''}</span></div>`).join('')}
  <div class="row between" style="margin-top:8px"><span style="font-size:12px;color:var(--muted)">지원자 ${apps.length}명</span>${apps.filter(x => x.status === 'applied').length >= 2 ? `<button class="btn sm" data-act="cmp" data-p="${postId}" data-k="${kind}">고른 지원자 비교</button>` : ''}</div>
  ${apps.map(x => `<div class="slot"><div><b>${esc(x.name)}</b>${x.rep?.edu ? ' <span class="pill g">교육 수료</span>' : ''}${x.rep?.done >= 5 && !x.rep?.noshow ? ' <span class="pill g">믿을 만해요</span>' : ''} <button class="btn sm" data-act="fav" data-a="${x.app_id}" title="단골로 등록하면 긴급 공고 때 먼저 알림이 가요" aria-label="단골 딜러">${favs.has(x.app_id) ? '★ 단골' : '☆ 단골'}</button> ${skillTags(x.rep?.skills)}<small class="mut">경력 ${x.career_months}개월${x.rep?.done != null ? ` · 근무 ${x.rep.done}건 · 재호출 ${x.rep.recall_pct == null ? '-' : x.rep.recall_pct + '%'} · 노쇼 ${x.rep.noshow}` : ''}</small><div style="font-size:13px">${esc(x.bio)}</div>${x.rep?.msg ? `<div class="amsg">💬 ${esc(x.rep.msg)}</div>` : ''}${Object.keys(x.rep?.tags || {}).length ? `<div class="sktags">${Object.entries(x.rep.tags).map(([t, n]) => `<i class="on">${esc(t)} ${n}</i>`).join('')}</div>` : ''}${x.rep?.video ? `<a class="btn sm" href="${esc(x.rep.video)}" target="_blank" rel="noopener">🎬 딜링 영상</a>` : ''}</div>
    ${x.status === 'applied' ? `<span class="row" style="gap:4px"><label class="cmpck"><input type="checkbox" data-cmp="${x.app_id}"><span>비교</span></label><button class="btn sm" data-act="reject" data-a="${x.app_id}" data-p="${postId}" data-k="${kind}">불채용</button><button class="btn sm" data-act="blk-app" data-a="${x.app_id}" data-p="${postId}" data-k="${kind}" title="이 딜러는 우리 공고를 못 보고 지원도 못 해요">차단</button><button class="btn sm pri" data-act="hire" data-a="${x.app_id}" data-p="${postId}" data-k="${kind}">채용하기</button></span>` : x.status === 'hired' ? `<span class="row"><button class="btn sm" data-act="contact" data-a="${x.app_id}">연락처</button><button class="btn sm red" data-act="cancel-hire" data-a="${x.app_id}" data-p="${postId}" data-k="${kind}">채용 취소</button></span>` : `<span class="pill">${{ rejected: '불채용', cancelled: '취소', expired: '마감' }[x.status] || x.status}</span>`}</div>`).join('') || '<p class="note">아직 지원자가 없어요. 연락처는 채용하기를 누른 뒤에만 보여요.</p>'}${P ? `<div class="row" style="gap:6px;margin-top:10px">${P.status === 'closed' ? (new Date(P.expires_at) > Date.now() ? `<button class="btn sm" data-act="post-reopen" data-p="${P.id}">공고 다시 열기</button>` : '') : `<button class="btn sm red" data-act="post-close" data-p="${P.id}">공고 내리기 · 사람 구했어요</button>`}</div>` + postEdit(P) : ''}`;
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
  if (sub === 'qr') return `${storeHead('출퇴근 코드')}${back}${mgrCard()}<div class="card" style="text-align:center"><p class="sub">직원은 앱의 <b>출퇴근</b> 탭에서 이 번호를 넣으면 기록돼요. 30초마다 바뀌어서 캡처해 보내도 못 써요.</p>
    <div id="qr-code" class="num" style="font-size:56px;font-weight:800;letter-spacing:.18em;color:#A6EDD2">······</div><div class="mut" id="qr-left">불러오는 중</div><div id="qr-img" style="display:flex;justify-content:center;margin:14px 0 6px;background:#fff;padding:10px;border-radius:12px;width:max-content;margin-inline:auto"></div><p class="note">직원은 폰 카메라로 QR을 찍어도 출퇴근돼요</p><button class="btn pri full no-kiosk" data-act="kiosk">📟 태블릿 출퇴근 모드</button><button class="btn full only-kiosk" data-act="kiosk-off">태블릿 모드 끝내기 (대표 확인)</button></div><div class="card"><h3>📍 위치 확인 ${S.store.geo_lat != null ? '<span class="pill g">켜짐</span>' : ''}</h3><p class="sub">켜두면 매장 ${S.store.geo_m || 150}m 안에서만 출퇴근돼요. 직원 위치 좌표는 저장하지 않고 거리만 남겨요.</p><button class="btn full" data-act="geo-set">${S.store.geo_lat != null ? '매장 위치 다시 저장 (지금 여기)' : '지금 여기를 매장 위치로 저장'}</button>${S.store.geo_lat != null ? '<button class="btn full" data-act="geo-off" style="margin-top:6px">위치 확인 끄기</button>' : ''}</div>${attLogCard()}`;
  if (sub === 'pricing') {
    const c = S.company || {}, paid = (c.plan === 'pro' || c.plan === 'basic') && c.paid_until && new Date(c.paid_until) > now, own = isOwner();
    const st = paid ? `<b>${c.plan === 'pro' ? '프로' : '베이직'} 이용 중</b> · ${new Date(c.paid_until).toLocaleDateString('ko-KR')}까지` : S.active ? `<b>무료 체험 D-${trialLeft(c)}</b> · 끝나도 데이터는 그대로예요` : '<b class="warn">체험이 끝났어요</b> · 요금제를 고르면 바로 이어서 써요';
    const P = [['basic', '베이직', PRICE.basic, ['QR 출퇴근 · 근무표 · 근로계약서', '급여 자동 계산 · 명세서 발송 · 송금', 'POS 연동 매출 · 일 마감 · 월 예상 손익', '전국 최저가 발주 · 재고 알림', '딜러 모집 공고 무료']],
      ['pro', '프로', PRICE.pro, ['베이직의 모든 기능', '빅데이터 컨설팅 · 주변 매장 비교 · 경고등', '매장 전체 목표 매출 · 직원 가이드북', '비용 줄이기 · 매출 늘리기 처방', '인터넷 · 세무사 · 노무사 업체 연결']]];
    const btn = (k, n) => !own ? `<button class="btn full" data-act="ask-owner" data-v="${n} 요금제">대표님께 요청</button>` : paid && c.plan === k ? `<button class="btn full" data-act="plan" data-v="${k}">30일 연장 결제</button>` : paid && c.plan === 'pro' && k === 'basic' ? '<button class="btn full" disabled>프로 이용 중</button>' : `<button class="btn full ${k === 'pro' ? 'pri' : ''}" data-act="plan" data-v="${k}">${n} 결제하고 시작</button>`;
    return `${storeHead('요금제')}${back}
    <div class="prHero"><span class="prEy">오픈 프로모션</span><h2>처음 한 달은<br><em>무료로.</em></h2><p>${st}</p></div>
    <div class="prRep"><div><s>단톡방 · 수기 출근부</s><b>QR 출퇴근</b></div><div><s>급여 엑셀 · 계산기</s><b>급여 자동 계산</b></div><div><s>거래처 전화 · 장부 앱</s><b>발주 · 손익</b></div><div><s>구인 사이트 · 지인 연락</s><b>딜러 구인</b></div></div>
    <div class="prGrid">${P.map(([k, n, amt, f]) => `<div class="prCard ${k === 'pro' ? 'pro' : ''} ${c.plan === k && paid ? 'cur' : ''}">${k === 'pro' ? '<span class="pill y">추천</span>' : ''}<h3>${n}</h3><div class="prAmt"><b class="num">₩${E.won(amt)}</b><span>회사당 / 월</span></div><ul>${f.map(x => `<li>${x}</li>`).join('')}</ul>${btn(k, n)}</div>`).join('')}</div>
    <p class="note">카드 · 카카오페이 · 네이버페이 · 토스페이 · 계좌이체로 30일씩 결제해요. 매장이 몇 곳이든 요금은 같아요. 구인 · 장터 · 가맹은 건별 결제예요. <a href="legal.html#refund" target="_blank" rel="noopener">환불 규정</a> · <a href="legal.html#terms" target="_blank" rel="noopener">이용약관</a></p>${payNote()}`;
  }
  if (sub === 'settings') {
    const c = S.company || {}, pro = c.plan === 'pro', paid = (c.plan === 'pro' || c.plan === 'basic') && c.paid_until && new Date(c.paid_until) > now;
    return `${storeHead('매장 설정')}${back}
    <div class="card"><h3>요금제 <small>한 달 무료 체험 후 베이직 ₩${E.won(PRICE.basic)} · 프로 ₩${E.won(PRICE.pro)} (회사당 월 · 매장 수 무관)</small></h3>
      ${paid ? `<div class="li"><div><b>${pro ? '프로' : '베이직'} 이용 중</b><small>${new Date(c.paid_until).toLocaleDateString('ko-KR')}까지 결제돼 있어요${pro ? '' : ' · 매장 비교·경고등·처방은 프로에서'}</small></div>${isOwner() ? `<span class="row">${pro ? '' : `<button class="btn sm gold" data-act="plan" data-v="pro">프로로 올리기</button>`}<button class="btn sm" data-act="plan" data-v="${c.plan}">30일 연장</button></span>` : ''}</div>`
      : S.active ? `<div class="li"><div><b>무료 체험 중 · D-${trialLeft(c)}</b><small>${new Date(c.trial_ends).toLocaleDateString('ko-KR')}까지 프로 기능 전부 (AI 비서 제외). 그 뒤엔 보기만 돼요</small></div></div>`
      : `<div class="li"><div><b class="warn">체험이 끝났어요</b><small>보기만 돼요. 아래에서 요금제를 고르면 바로 이어서 입력할 수 있어요</small></div></div>`}
      ${!paid || !pro ? `<div class="plans" style="margin-top:10px"><div class="plan"><b>베이직</b><b class="num">월 ₩${E.won(PRICE.basic)}</b><small>매출 마감 · 손익 계산서 · 직원 · 스케줄 · 급여 · 출퇴근 · 발주 · 구인 게시</small>${isOwner() && !paid ? `<button class="btn sm" data-act="plan" data-v="basic">베이직 시작</button>` : ''}</div>
      <div class="plan cur"><span class="pill y">추천</span><b>프로</b><b class="num">월 ₩${E.won(PRICE.pro)}</b><small>베이직 전부 + 주변 매장 비교(순위·경고등) · 매달 처방·꼭 할 일 · 3개월 예측 · 월간 리포트 · <b>AI 비서</b> (영수증·고지서 읽기, 공지·홍보글, 이번 달 총평, 스케줄 메모 해석)</small>${isOwner() ? `<button class="btn sm gold" data-act="plan" data-v="pro">프로 시작</button>` : '<button class="btn sm" data-act="ask-owner" data-v="프로 요금제">대표님께 요청</button>'}</div></div>` : ''}
      <button class="btn full" data-act="sub" data-v="pricing" style="margin-top:10px">요금표 전체 보기</button><p class="note">카드로 30일씩 결제해요. 매장이 몇 곳이든 요금은 같아요 (매장 추가 무료). 결제가 끊겨도 7일 동안은 그대로 쓸 수 있어요. 구인·장터·가맹은 요금제와 별개로 건별 결제예요. <a href="legal.html#refund" target="_blank" rel="noopener">환불 규정</a> · <a href="legal.html#terms" target="_blank" rel="noopener">이용약관</a></p>${payNote()}</div>
    ${pushRow() ? `<div class="card">${pushRow()}</div>` : ''}
    <form class="f card" id="store-form"><h3>매장 정보</h3><label class="fl">매장 이름<input name="name" value="${esc(S.store.name)}" ${isOwner() ? '' : 'disabled'}></label><label class="fl">지역<input name="area" value="${esc(S.store.area || '')}" ${isOwner() ? '' : 'disabled'}></label><label class="fl">주소 <small class="mut">구인 공고에 지도로 나가요</small><input name="address" value="${esc(S.store.address || '')}" placeholder="예: 서울 강남구 테헤란로 8길 21, 3층" ${isOwner() ? '' : 'disabled'}></label>
      <div class="grid2"><label class="fl">평수<input type="number" name="py" min="1" step="0.1" value="${S.store.pyeong ?? ''}" placeholder="예: 32" ${isOwner() ? '' : 'disabled'}></label><label class="fl">테이블 수<input type="number" name="tables" min="1" value="${S.store.tables ?? ''}" placeholder="예: 7" ${isOwner() ? '' : 'disabled'}></label></div>
      <div class="grid2"><label class="fl">야간 시작<input type="time" name="ns" value="${t5(S.store.night_start)}" ${isOwner() ? '' : 'disabled'}></label><label class="fl">야간 끝<input type="time" name="ne" value="${t5(S.store.night_end)}" ${isOwner() ? '' : 'disabled'}></label></div>
      ${isOwner() ? '<button class="btn pri full">저장</button>' : '<p class="note">매장 정보는 대표님만 바꿀 수 있어요.</p>'}</form>
    ${isOwner() ? `<form class="f card" id="addstore-form"><h3>매장 추가</h3><div class="grid2"><label class="fl">매장 이름<input name="name" required placeholder="예: 홍대 2호점"></label><label class="fl">지역<input name="area"></label></div>
      <div class="promo"><span>매장 추가는 <b>무료</b>예요. 요금은 회사당 하나.</span></div><button class="btn pri full">매장 추가</button></form>
    <div class="card"><h3>사업자 정보</h3><div class="li"><span>사업자등록번호</span><span class="num">${esc((c.biz_no || '').replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3'))}</span></div><div class="li"><span>확인 상태</span><span class="row"><span class="pill ${c.biz_verified ? 'g' : 'y'}">${c.biz_verified ? '✓ 확인됨' : '미확인'}</span><button class="btn sm" data-act="biz-check">국세청 조회</button></span></div><p class="note">국세청 사업자등록 상태(계속·휴업·폐업)를 바로 조회해요.</p></div>` : ''}`;
  }
  if (sub === 'inq') return `${storeHead('운영사 문의')}${back}${inqBlock()}`;
  if (sub === 'rot') return S.rot ? vRot() : `${storeHead('테이블 로테이션')}<div class="boot">불러오는 중…</div>`;
  if (sub === 'order') return vOrder();
  if (sub === 'edu') return vEdu();
  if (sub === 'used') return `${storeHead('중고 장터')}${back}${usedBlock()}`;
  if (sub === 'board') return `${storeHead('전체 구인 공고')}${boardList(true)}`;
  if (sub === 'ops') return vOps();
  if (sub === 'notice') return `${storeHead('운영사 공지')}${back}${(S.notices || []).map(n => `<div class="card notice"><div class="row between"><b>${esc(n.title)}</b><small class="mut">${fmtDT(n.created_at)}</small></div><div class="nb">${esc(n.body).replace(/\n/g, '<br>')}</div></div>`).join('') || '<div class="card empty">아직 공지가 없어요</div>'}`;
  if (sub === 'franchise') return `${storeHead('가맹 모집')}${back}${frBlock()}`;
  if (sub === 'transfer') return `${storeHead('점포 양도양수')}${back}${transferBlock()}`;
  return '';
}
async function startQR() {
  const tick = async () => { try { const r = (await q(sb.rpc('attend_code', { p_store: S.store.id })))[0], el = $('#qr-code'); if (!el) return clearInterval(S.qrTimer); el.textContent = r.code; qrDraw(r.code); S.qrLeft = r.secs_left; $('#qr-left').textContent = `${r.secs_left}초 뒤 바뀌어요`; } catch (e) { } };
  await tick(); S.qrTimer = setInterval(() => { S.qrLeft--; const el = $('#qr-left'); if (!el) return clearInterval(S.qrTimer); if (S.qrLeft <= 0) tick(); else el.textContent = `${S.qrLeft}초 뒤 바뀌어요`; }, 1000);
}
function inqBlock() {
  return `<form class="f card" id="inq-form"><h3>운영사에 문의하기 <small>평일 10~19시 · 보통 하루 안에 답해요</small></h3><textarea name="body" rows="3" required placeholder="궁금한 점이나 불편한 점을 적어주세요"></textarea><button class="btn pri full">보내기</button></form>
  <div class="card"><h3>내 문의</h3>${(S.inq || []).map(x => `<div class="li" style="display:block"><b>${esc(x.body)}</b><small>${fmtDT(x.created_at)}</small>${x.reply ? `<div class="up" style="margin-top:4px">↳ ${esc(x.reply)}</div>` : '<small class="mut">답변 기다리는 중</small>'}</div>`).join('') || '<div class="empty">아직 문의가 없어요</div>'}</div>`;
}
function siseTag(u) {
  const kw = u.category; if (!kw) return '';
  const ago = Date.now() - 90 * 864e5, ps = S.used.filter(x => x.category === kw && new Date(x.created_at) > ago && x.price > 0).map(x => x.price).sort((a, b) => a - b);
  if (ps.length < 3) return ''; const qt = f => ps[Math.floor((ps.length - 1) * f)], lo = qt(.25), hi = qt(.75), tag = u.price < lo ? ['g', '시세보다 쌈'] : u.price > hi ? ['r', '시세보다 비쌈'] : ['', '시세 안'];
  return `<small class="mut" style="display:block">${kw} 시세 ₩${E.won(lo)}~${E.won(hi)} <span class="pill ${tag[0]}">${tag[1]}</span></small>`;
}
function usedSise() {
  const f = document.getElementById('used-form'); if (!f) return; const kw = f.category.value, price = +f.price.value || 0;
  const ago = Date.now() - 90 * 864e5, ps = S.used.filter(x => x.category === kw && new Date(x.created_at) > ago && x.price > 0).map(x => x.price);
  const el = document.getElementById('used-sise'); if (!el) return;
  if (ps.length < 3) { el.innerHTML = `<small class="mut">${kw} 시세 자료가 아직 적어요 · 비슷한 글 가격을 참고해 보세요</small>`; return; }
  const avg = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length / 1000) * 1000, rec = Math.round(avg * 0.9 / 1000) * 1000, d = price ? Math.round((price - avg) / avg * 100) : null;
  el.innerHTML = `<small class="mut">최근 90일 ${kw} 평균 ₩${E.won(avg)} · 추천 <b data-act="used-rec" data-v="${rec}" style="cursor:pointer">₩${E.won(rec)}</b>(평균보다 10% 싸게)</small>${d === null ? '' : d <= -10 ? `<small class="up">평균보다 ${-d}% 싸요 · 보통 이런 글이 먼저 나가요</small>` : d >= 10 ? `<small class="warn">평균보다 ${d}% 비싸요 · 오래 남을 수 있어요</small>` : '<small class="mut">평균 가격대예요</small>'}`;
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
    <div class="grid2"><label class="fl">판매 가격 (원)<input name="price" type="number" inputmode="numeric" required></label><label class="fl">수량 <small class="mut">(선택)</small><input name="qty" type="number" min="1" value="1"></label></div><div id="used-sise"></div>
    <label class="fl">지역<span class="row" style="flex-wrap:nowrap;gap:6px"><select name="sido" style="width:auto">${SIDO.map(x => `<option ${(S.store?.area || '').startsWith(x) ? 'selected' : ''}>${x}</option>`).join('')}</select><input name="area2" required placeholder="구·동 (예: 강남구 역삼동)"></span></label>
    <label class="fl">상세 설명<textarea name="body" rows="3" required placeholder="사용 기간, 하자, 포함 구성품"></textarea></label>
    <label class="fl">연락 방법<input name="contact" required placeholder="010-0000-0000 또는 카카오톡 오픈채팅 링크"></label>
    <details class="more"><summary>선택 입력 (구매 시기·배송·네고)</summary><div class="f" style="margin-top:8px"><label class="fl">구매 시기<input name="bought" placeholder="예: 2025년 3월"></label>
      <div class="days wrap"><label><input type="checkbox" name="ship"><span>배송 가능</span></label><label><input type="checkbox" name="direct" checked><span>직거래 가능</span></label><label><input type="checkbox" name="nego"><span>네고 가능</span></label></div></div></details>
    <button class="btn pri full">무료로 올리기</button></form>` : ''}
  <div class="filters"><div class="chips">${['전체', ...USED_CAT].map(c => chip('c', c, c)).join('')}</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px"><select data-uf="r" aria-label="지역" style="width:auto"><option ${F.r === '전체' ? 'selected' : ''}>전체</option>${SIDO.map(x => `<option ${F.r === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select data-uf="st" aria-label="판매 상태" style="width:auto">${['판매중', '예약중', '판매완료', '전체'].map(x => `<option ${F.st === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
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
  const tab = S.mode === 'dealer' ? 'list' : (S.trTab || 'list');
  const head = S.mode === 'dealer' ? '' : `<div class="seg sub2" style="margin-top:12px">${[['list', '매물 보기'], ['sell', '내 매장 내놓기'], ['fee', '요금']].map(([k, l]) => `<button data-act="trtab" data-v="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>`;
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
  if (S.sub === 'ops') return vOps();
  const me = S.my[S.mi || 0], r = payOf(me), [y, m, d] = TODAY.split('-').map(Number), wk0 = d - E.wdOf(y, m, d), D = E.daysIn(S.y, S.m);
  let cal = ''; for (let i = 1; i <= D; i++) { const t = E.shiftOn(me.id, S.y, S.m, i, S.tpl, S.ov), k = E.ymd(S.y, S.m, i); cal += `<div class="dc ${t ? 'on' : ''} ${S.my.some(m => m.id !== me.id && E.shiftOn(m.id, S.y, S.m, i, S.tpl, S.ov)) ? 'oth' : ''} ${k === TODAY ? 'today' : ''}"><b>${i}</b><small>${t ? `${t5(t.s).slice(0, 2)}–${t5(t.e).slice(0, 2)}` : ''}</small></div>`; }
  return `<h1>내 근무</h1>${S.my.length > 1 ? `<select id="mi-sel" aria-label="매장 선택" style="width:auto;margin-bottom:6px">${S.my.map((m, i) => `<option value="${i}" ${i === (S.mi || 0) ? 'selected' : ''}>${esc(S.myStores?.[m.store_id] || '매장 ' + (i + 1))}</option>`).join('')}</select>` : ''}<p class="sub">${esc(S.store.name || '')} · ${esc(me.nick)}${S.my.length > 1 ? ' · <span class="mut">달력의 노란 줄은 다른 매장 근무</span>' : ''}</p>
  ${iosCard()}${myPaidCard(me)}<div class="row" style="gap:8px;margin:8px 0">${opsEntry()}<button class="card sosent" data-act="sos" aria-label="비상 연락">🚨<small>비상</small></button></div>${myWeekCard(me)}${payInfoCard(me)}${availCard()}${staffSwapCard()}${myDocsCard(true)}${eduCard(me)}
  ${S.academy ? `<button class="card rankbar" data-tab="learn" style="width:100%;text-align:left;cursor:pointer;color:var(--text)"><div><b>딜러 교육이 열렸어요</b><small class="mut" style="display:block">${(S.lessons || []).length}/5 강의 완료${S.quizRes ? ` · 시험 ${S.quizRes.score}/5` : ''}</small></div><span class="btn sm pri">들으러 가기 →</span></button>` : ''}
  <div class="card dsum"><div><small>어제까지 번 돈 (세전)</small><b class="num up">₩${E.won(r.gross)}</b></div><div><small>월말 예상 실수령</small><b class="num">₩${E.won(r.fullNet)}</b></div><div><small>근무</small><b class="num">${r.shifts.length}일 · ${r.shifts.reduce((a, x) => a + x.hours, 0).toFixed(0)}h</b></div></div>
  ${S.slots.length ? `<div class="card"><h3>긴급 근무</h3>${S.slots.map(s => `<div class="slot"><span><b>${esc(s.title)}</b><br><small class="mut">${esc(s.store_name)} · ${t5(s.start_t)}–${t5(s.end_t)}</small></span><span class="row"><span class="pill ${SLOT[s.status][0]}">${SLOT[s.status][1]}</span>${s.status === 'WORKING' ? `<button class="btn sm pri" data-act="dslot" data-s="${s.slot_id}">근무 완료</button>` : ''}</span></div>`).join('')}</div>` : ''}
  <div class="card"><h3>이번 주</h3>${E.WD.map((w, i) => { const k = addDay(TODAY, i - E.wdOf(y, m, d)), [yy, mm, dd] = k.split('-').map(Number), t = E.shiftOn(me.id, yy, mm, dd, S.tpl, S.ov); return `<div class="li ${k === TODAY ? 'today' : ''}"><div><b>${w}</b><small>${mm}/${dd}</small></div>${t ? `<span class="num"><b>${t5(t.s)} – ${t5(t.e)}</b></span>` : '<span class="mut">휴무</span>'}</div>`; }).join('')}</div>
  <div class="card"><h3>${S.m}월 달력 ${monthNav()}</h3><div class="cal">${E.WD.map(w => `<div class="h">${w}</div>`).join('')}${'<div></div>'.repeat(E.wdOf(S.y, S.m, 1))}${cal}</div></div>
  <div class="card"><h3>${S.m}월 급여 <small>어제까지 · 월말 예상 세전 ₩${E.won(r.fullGross)}</small></h3>${[['기본급', r.base], ['야간수당', r.np], ['연장수당', r.otp], [r.juhu ? '주휴수당 <small>(주 15시간 넘게 일한 주)</small>' : (me.labor_law ?? me.contract === '4대') ? '주휴수당' : '주휴수당 <small>(3.3% 계약은 대상 아님)</small>', r.juhu], ['인센티브', r.inc]].map(([n, v]) => `<div class="li"><span class="mut">${n}</span><span class="num">₩${E.won(v)}</span></div>`).join('')}<div class="li"><span class="mut">공제 (${me.contract === '4대' ? '4대보험' : '3.3%'})</span><span class="num down">−₩${E.won(r.ded)}</span></div><div class="li"><b>지금까지 실수령</b><b class="num up" style="font-size:18px">₩${E.won(r.net)}</b></div></div>`;
}
function vAttend() {
  const last = S.att?.[0], stale = last?.kind === 'in' && Date.now() - new Date(last.at) > 16 * 3600e3;
  return `<h1>출퇴근</h1><p class="sub">매장 화면에 뜬 6자리 번호를 넣어주세요.</p>${stale ? `<div class="card warnc"><b>${new Date(last.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 퇴근이 안 찍혀 있어요</b><small class="mut" style="display:block">먼저 고치기 요청을 보내고, 오늘은 출근을 찍어주세요</small><button class="btn sm pri" data-act="fix-new" style="margin-top:6px">퇴근 기록 고치기</button></div>` : ''}
  <form class="f card" id="attend-form"><input name="code" inputmode="numeric" maxlength="6" required placeholder="000000" style="font-size:32px;text-align:center;letter-spacing:.3em"><button class="btn pri full">${last?.kind === 'in' && !stale ? '퇴근하기' : last?.kind === 'in' ? '출근·퇴근 찍기' : '출근하기'}</button></form>
  <div class="card"><h3>최근 기록</h3>${(S.att || []).map(a => `<div class="li"><span>${a.kind === 'in' ? '🟢 출근' : '⚪ 퇴근'}</span><span class="num">${fmtDT(a.at)}</span></div>`).join('') || '<div class="empty">아직 기록이 없어요</div>'}</div>`;
}

// ===== 딜러 =====
const hoursOf = (s, e) => { const a = E.toMin(s); let b = E.toMin(e); if (b <= a) b += 1440; return (b - a) / 60; };
function jobCard(j, view) {
  const applied = !view && (S.apps || []).some(a => a.post_id === j.id), slots = j.slots || [], pays = slots.map(s => s.pay), open = slots.filter(s => s.status === 'OPEN').length;
  const s0 = slots[0], hrs = s0 ? hoursOf(s0.start, s0.end) : 0, same = slots.every(s => s.start === s0?.start && s.end === s0?.end);
  return `<div class="job ${j.kind === 'urgent' ? 'urgent' : ''} ${S.hlPost === j.id ? 'hl' : ''}" id="job-${j.id}">${view ? '' : jobTools(j)}<div class="row between"><div class="row">${nearOf(j) === 2 ? '<span class="pill g">📍 가까워요</span>' : ''}${j.kind === 'urgent' ? `<span class="pill r urgpill">긴급 대타 · ${Math.max(0, Math.ceil((new Date(j.expires_at) - Date.now()) / 36e5))}시간 남음</span>` : ''}${j.flash ? '<span class="spark">반짝</span>' : ''}${j.top ? '<span class="pill y"></span>' : ''}<small class="mut">${esc(j.job_role)}</small></div>
    <span class="pay">${pays.length ? `일당 ₩${E.won(Math.min(...pays))}${pays.length > 1 && Math.max(...pays) !== Math.min(...pays) ? '~' + E.won(Math.max(...pays)) : ''}` : esc(j.pay_text || '')}</span></div>
  <h4>${esc(j.title)}</h4>${j.body ? `<div style="font-size:14px">${esc(j.body)}</div>` : ''}
  ${j.incentive || j.prefer ? `<div class="jx">${j.incentive ? `<span>인센티브 · ${esc(j.incentive)}</span>` : ''}${j.prefer ? `<span>우대 · ${esc(j.prefer)}</span>` : ''}</div>` : ''}
  <div class="meta"><span>${esc(j.store_name)} · ${esc(j.area || '')}</span><span>${slots.length ? (same ? `${t5(s0.start)}–${t5(s0.end)} · ${hrs}시간` : slots.map(s => `${t5(s.start)}–${t5(s.end)}`).join(' / ')) : esc(j.work_time || '')}</span>
    ${slots.length && hrs ? `<span class="up">시급으로 약 ₩${E.won(Math.round(Math.min(...pays) / hrs / 10) * 10)}</span>` : ''}${slots.length > 1 ? `<span>${open}/${slots.length}자리 남음</span>` : ''}${j.taxi_amt ? `<span class="up">택시비 ₩${E.won(j.taxi_amt)}</span>` : ''}</div>
  ${j.address ? `<a class="jaddr" href="${mapUrl(j.address)}" target="_blank" rel="noopener">${esc(j.address)} <b>네이버 지도 ›</b></a>` : ''}
  ${view ? '' : applied ? '<span class="pill g">지원 완료 · 매장 확인 중</span>' : `<button class="btn ${j.kind === 'urgent' ? 'gold' : 'pri'}" data-act="apply" data-p="${j.id}">지원하기</button>`}</div>`;
}
// ===== 족보 룰렛 · 라운지(익명 게시판·양도양수·가맹) =====
const P_CAT = { 원페어: 1, 투페어: 2, 트리플: 3, 스트레이트: 4, 플러시: 5, 풀하우스: 6, 포카드: 7, 로티플: 9 };
function handCat(cs) { const rc = {}, sc = [[], [], [], []]; cs.forEach(([r, s]) => { rc[r] = (rc[r] || 0) + 1; sc[s].push(r); }); const str = rs => { const u = new Set(rs); if (u.has(14)) u.add(1); for (let h = 14; h >= 5; h--) { let k = 0; while (k < 5 && u.has(h - k)) k++; if (k === 5) return h; } return 0; }; const fs = sc.find(x => x.length >= 5); if (fs) { const h = str(fs); if (h === 14) return 9; if (h) return 8; } const n = Object.values(rc).sort((a, b) => b - a); if (n[0] === 4) return 7; if (n[0] === 3 && n[1] >= 2) return 6; if (fs) return 5; if (str(cs.map(c => c[0]))) return 4; if (n[0] === 3) return 3; if (n[0] === 2 && n[1] === 2) return 2; if (n[0] === 2) return 1; return 0; }
// 결과(족보)는 서버가 정하고, 카드는 그 족보가 나오게 섞어서 보여줌
function dealHand(name) { const want = P_CAT[name] ?? 1, deck = []; for (let r = 2; r <= 14; r++) for (let s = 0; s < 4; s++) deck.push([r, s]); const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }; let cs; if (want === 9) { const s = Math.random() * 4 | 0; cs = shuf([...[10, 11, 12, 13, 14].map(r => [r, s]), ...shuf(deck.filter(c => !(c[1] === s && c[0] >= 10))).slice(0, 2)]); } else for (let i = 0; i < 300000; i++) { shuf(deck); cs = deck.slice(0, 7); if (handCat(cs) === want) break; } const rc = {}, sc = [0, 0, 0, 0]; cs.forEach(([r, s]) => { rc[r] = (rc[r] || 0) + 1; sc[s]++; }); const fsu = sc.findIndex(x => x >= 5), key = c => want === 5 || want === 9 ? c[1] === fsu : rc[c[0]] >= 2, K = shuf(cs.filter(key)), N = shuf(cs.filter(c => !key(c))); if (K.length && want !== 4) { const h = [K.shift(), N.length ? N.shift() : K.shift()]; cs = [...h, ...shuf([...K, ...N])]; }
  return cs.map(([r, s]) => ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' }[r] || r) + '♠♥♦♣'[s]); }
const myRef = () => (S.user?.id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
const spinBanner = () => S.mode === 'dealer' && S.spinN > 0 ? `<button class="card" data-act="spin-open" style="display:flex;justify-content:space-between;align-items:center;width:100%;border:1px solid #d4a017;text-align:left"><span><b>🎰 족보 룰렛 ${S.spinN}회</b><small class="mut" style="display:block">카드 받고 족보대로 포인트 받기</small></span><span class="btn sm gold">돌리기</span></button>` : '';
function spinCard() {
  return `<div class="card"><h3>🎰 족보 룰렛 <small>${S.spinN || 0}회 남음</small></h3><p class="mut" style="margin:0 0 10px">가입하면 1번, 초대한 친구가 첫 근무를 하면 1번씩 더 돌릴 수 있어요. 포인트는 첫 근무 정산 뒤 출금돼요.</p>
  <button class="btn gold full" data-act="spin-open" ${S.spinN > 0 ? '' : 'disabled'}>룰렛 돌리기</button>
  ${(S.spins || []).map(x => `<div class="li"><span>${esc(x.hand)}</span><span class="num">+${E.won(x.points)}P <small class="mut">${fmtDT(x.created_at)}</small></span></div>`).join('')}
  <div class="li" style="margin-top:8px"><div><b>내 초대 코드 ${myRef()}</b><small>친구가 이 코드로 가입하고 첫 근무를 하면 룰렛 +1</small></div><button class="btn sm" data-act="ref-share">초대 링크 보내기</button></div>
  ${S.prof?.ref_by ? '' : `<div class="row" style="gap:6px;margin-top:8px"><input id="ref-in" placeholder="추천인 코드 6자리" maxlength="6" style="flex:1;text-transform:uppercase"><button class="btn sm" data-act="ref-set">등록</button></div>`}</div>`;
}
// ===== 족보 룰렛 v2: 풀스크린 테이블 · 실제 딜 · 뒤집기 · 족보표 =====
const RL_IMG = 'https://hkcmsjwuwopxritafreg.supabase.co/storage/v1/object/public/assets/roulette/';
const RL_PAY = [['로티플', 100000], ['포카드', 50000], ['풀하우스', 20000], ['플러시', 10000], ['스트레이트', 5000], ['트리플', 3000], ['투페어', 2000], ['원페어', 1000]];
// 족보를 만드는 카드 위치 (하이라이트용)
function rlWin(cs, cat) {
  const P = cs.map(x => { const r = x.slice(0, -1); return [{ A: 14, K: 13, Q: 12, J: 11 }[r] || +r, '♠♥♦♣'.indexOf(x.slice(-1))]; });
  const rc = {}, sc = [0, 0, 0, 0]; P.forEach(([r, s]) => { rc[r] = (rc[r] || 0) + 1; sc[s]++; }); const fs = sc.findIndex(n => n >= 5);
  if (cat === 9) return P.map(([r, s], i) => s === fs && r >= 10 ? i : -1).filter(i => i >= 0);
  if (cat === 5) return P.map(([r, s], i) => [r, s, i]).filter(x => x[1] === fs).sort((a, b) => b[0] - a[0]).slice(0, 5).map(x => x[2]);
  if (cat === 4) { const has = r => P.findIndex(p => p[0] === (r === 1 ? 14 : r)); for (let h = 14; h >= 5; h--) { const ix = [0, 1, 2, 3, 4].map(k => has(h - k)); if (ix.every(i => i >= 0)) return ix; } return []; }
  return P.map(([r], i) => rc[r] >= 2 ? i : -1).filter(i => i >= 0);
}
const rlCard = (x, i) => { const r = x.slice(0, -1), s = x.slice(-1), red = /[♥♦]/.test(s); return `<div class="rl-c" data-i="${i}"><div class="rl-f ${red ? 'red' : ''}"><b>${r}<i>${s}</i></b><em>${s}</em><b class="br">${r}<i>${s}</i></b></div><div class="rl-b"></div></div>`; };
function spinOpen() {
  closeSheet(); $('#roul')?.remove();
  const el = document.createElement('div'); el.id = 'roul'; el.className = 'rl';
  el.innerHTML = `<div class="rl-bg"></div>
  <header class="rl-top"><button class="rl-x" data-act="spin-close" aria-label="닫기">✕</button><span class="rl-left"><i class="rl-chip"></i>남은 기회 <b id="rl-n">${S.spinN || 0}</b></span></header>
  <div class="rl-title">족보 룰렛</div>
  <div class="rl-res" id="rl-res"><img class="rl-burst" src="${RL_IMG}burst.webp" alt=""><span id="rl-pt" class="rl-pt">카드 7장 중 가장 좋은 5장</span><b id="rl-hand"></b></div>
  <div class="rl-street" id="rl-st"></div>
  <div class="rl-table"><div class="rl-felt"><i class="rl-chips l"></i><i class="rl-chips r"></i>
    <div class="rl-row rl-board" id="rl-bd">${'<span class="rl-slot"></span>'.repeat(5)}</div>
    <div class="rl-row rl-me" id="rl-me">${'<span class="rl-slot"></span>'.repeat(2)}</div>
  </div></div>
  <section class="rl-paybox"><small>족보표</small><ol class="rl-pay">${RL_PAY.map(([h, p]) => `<li data-h="${h}"><span>${h}</span><b>${E.won(p)}P</b></li>`).join('')}</ol></section>
  <div class="rl-foot"><button class="rl-go" data-act="spin-go" ${S.spinN > 0 ? '' : 'disabled'}>${S.spinN > 0 ? '카드 받기' : '남은 룰렛이 없어요'}</button><small>포인트는 첫 근무 정산 뒤 출금돼요 · 친구가 첫 근무하면 +1회</small></div>`;
  el.style.setProperty('--back', `url(${RL_IMG}back.webp)`); document.body.appendChild(el); document.body.classList.add('rl-open');
}
async function spinPlay() {
  const go = $('.rl-go'); if (!go || go.disabled) return; go.disabled = true; go.textContent = '딜링 중…';
  const R = $('#roul'); R.classList.remove('done', 'big', 'small'); delete R.dataset.tier; R.querySelectorAll('.rl-pay li').forEach(l => l.classList.remove('hit')); $('#rl-hand').textContent = ''; $('#rl-pt').textContent = '';
  const w = ms => new Promise(f => setTimeout(f, matchMedia('(prefers-reduced-motion: reduce)').matches ? ms / 4 : ms)), bz = n => { try { navigator.vibrate?.(n); } catch { } };
  const req = sb.rpc('spin_hand');
  const bd = $('#rl-bd'), me = $('#rl-me'); bd.innerHTML = '<span class="rl-slot"></span>'.repeat(5); me.innerHTML = '<span class="rl-slot"></span>'.repeat(2);
  const { data, error } = await req; if (error) { toast(error.message); go.textContent = '닫기'; go.dataset.act = 'spin-close'; go.disabled = false; return; }
  const r = data[0], c = dealHand(r.hand), cat = P_CAT[r.hand] ?? 1, win = new Set(rlWin(c, cat));
  const put = (box, k, i) => { const s = box.querySelectorAll('.rl-slot')[k]; s.outerHTML = rlCard(c[i], i); const e = box.querySelector(`[data-i="${i}"]`); requestAnimationFrame(() => e.classList.add('in')); return e; };
  const flip = e => { e.classList.add('up'); bz(12); };
  const st = t => { const x = $('#rl-st'); x.textContent = t; x.classList.remove('pop'); void x.offsetWidth; x.classList.add('pop'); };
  st('내 카드'); const h0 = put(me, 0, 0); await w(220); const h1 = put(me, 0, 1); await w(500); flip(h0); await w(260); flip(h1); await w(900);
  st('플랍'); const f = [put(bd, 0, 2), put(bd, 0, 3), put(bd, 0, 4)]; await w(450); for (const e of f) { flip(e); await w(230); } await w(800);
  st('턴'); const t = put(bd, 0, 5); await w(450); flip(t); await w(900);
  st('리버'); const rv = put(bd, 0, 6); await w(350); rv.classList.add('tease'); await w(1100); rv.classList.remove('tease'); flip(rv); await w(550);
  R.querySelectorAll('.rl-c').forEach(e => e.classList.add(win.has(+e.dataset.i) ? 'win' : 'dim'));
  R.querySelector(`.rl-pay li[data-h="${r.hand}"]`)?.classList.add('hit');
  R.classList.add('done', cat >= 3 ? 'big' : 'small'); R.dataset.tier = cat;
  if (cat >= 3) { const cf = document.createElement('div'); cf.className = 'rl-conf'; cf.innerHTML = Array.from({ length: cat >= 5 ? 44 : 26 }, (_, i) => `<i style="--x:${Math.round((Math.random() * 2 - 1) * 190)}px;--y:${Math.round(-90 - Math.random() * 190)}px;--r:${Math.round(Math.random() * 900 - 450)}deg;--d:${(i % 7) * .035}s"></i>`).join(''); $('#rl-res').appendChild(cf); setTimeout(() => cf.remove(), 2600); }
  if (cat >= 4) { const fl = document.createElement('div'); fl.className = 'rl-flash'; R.appendChild(fl); setTimeout(() => fl.remove(), 1200); } $('#rl-hand').textContent = r.hand; st(cat >= 4 ? '🎉 대박!' : '나온 족보'); bz(cat >= 4 ? [60, 40, 120] : 40);
  const pt = $('#rl-pt'), t0 = performance.now(); const tick = n => { const k = Math.min(1, (n - t0) / 900); pt.textContent = `+${E.won(Math.round(r.points * k))}P`; if (k < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  S.spinN = r.left_n; $('#rl-n').textContent = r.left_n;
  go.disabled = false; if (r.left_n > 0) { go.textContent = `한 번 더 (${r.left_n}회)`; go.dataset.act = 'spin-go'; } else { go.textContent = '지갑에서 보기'; go.dataset.act = 'spin-wallet'; }
  S.noPop = 1; loadDealer().then(render).catch(() => { });
}
async function loungeLoad(force) {
  if (S.lgBusy || (!force && S.lgAt && Date.now() - S.lgAt < 60000)) return; S.lgBusy = 1;
  try { const [b, l, f] = await Promise.all([sb.rpc('board_list'), sb.from('transfer_listings').select('*').order('premium_ad', { ascending: false }).order('created_at', { ascending: false }), sb.from('franchise_public').select('*').order('created_at', { ascending: false })]); S.bposts = b.data || []; S.listings = l.data || []; S.frList = f.data || []; S.lgAt = Date.now(); } finally { S.lgBusy = 0; }
  render();
}
function vLounge() {
  const t = S.lgTab || 'board', P = S.bposts || [];
  const seg = `<div class="lg-tabs">${[['board', '익명 게시판'], ['transfer', '점포 양도양수'], ['fr', '가맹 모집']].map(([k, l]) => `<button data-act="lg-tab" data-v="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>`, H = `<header class="dv-h"><h1>라운지</h1></header>${seg}`;
  if (t === 'transfer') return `${H}${transferBlock()}`;
  if (t === 'fr') return `${H}${frBlock()}`;
  return `${H}<div class="lg-new"><textarea id="bd-new" rows="3" maxlength="1000" placeholder="이름 없이 익명으로 올라가요. 오늘 근무 어땠어요?"></textarea><div class="row between"><small>욕설·성희롱·구인 홍보는 AI가 걸러요</small><button class="btn pri sm" data-act="bd-post">익명으로 올리기</button></div></div>
  <div class="lg-feed">${P.map(p => `<button class="lg-post" data-act="bd-open" data-v="${p.id}"><div class="row between"><b class="num">${esc(p.alias)}</b><small>${fmtDT(p.created_at)}</small></div><p>${esc(p.body)}</p><small>💬 댓글 ${p.replies}</small></button>`).join('') || '<div class="dv-empty"><i aria-hidden="true">💬</i><b>첫 글을 남겨 보세요</b><small>이름 없이 올라가요</small></div>'}</div>`;
}
async function bdSheet(id) {
  const p = (S.bposts || []).find(x => x.id == id), r = await q(sb.rpc('board_list', { p_parent: +id }));
  openSheet(`<div class="row between"><b>${esc(p?.alias || '')}</b>${p?.mine ? `<button class="btn sm" data-act="bd-del" data-v="${id}">삭제</button>` : `<button class="btn sm" data-act="bd-report" data-v="${id}">신고</button>`}</div><p style="white-space:pre-wrap">${esc(p?.body || '')}</p>
  ${r.map(c => `<div class="li"><div><b>${esc(c.alias)}</b><small style="white-space:pre-wrap">${esc(c.body)}</small></div>${c.mine ? `<button class="btn sm" data-act="bd-del" data-v="${c.id}" data-p="${id}">삭제</button>` : `<span class="row" style="gap:4px"><small class="mut">${fmtDT(c.created_at)}</small><button class="btn sm" data-act="bd-report" data-v="${c.id}" aria-label="댓글 신고">신고</button></span>`}</div>`).join('')}
  <textarea id="bd-re" rows="2" maxlength="1000" placeholder="익명 댓글" style="width:100%;margin-top:8px"></textarea><div class="row" style="gap:6px;margin-top:8px"><button class="btn full" data-act="close">닫기</button><button class="btn pri full" data-act="bd-reply" data-v="${id}">댓글 달기</button></div>`);
}
const bdWrite = async (body, parent) => { const { data, error } = await sb.functions.invoke('board-write', { body: { body, parent } }); if (error || !data?.ok) { toast(data?.msg || '못 올렸어요. 잠시 후 다시 해주세요'); return false; } return true; };
function vBoard() { return `${spinBanner()}<header class="dv-h"><div><h1>구인</h1><p class="sub">원하는 공고에 바로 지원하세요. 채용되면 매장 연락처가 열려요.</p></div><span class="pill g">지원 무료</span></header>${boardList(false)}`; }
function boardList(view) {
  const F = S.jf || { k: '전체', r: '전체', a: '전체' }; S.board = S.board || [];
  const areas = [...new Set(S.board.map(j => (j.area || '').split(' ').slice(0, 2).join(' ')).filter(Boolean))];
  const list = S.board.filter(j => (!S.savedOnly || saved('post', j.id) || saved('store', j.store_id)) && (F.k === '전체' || (F.k === '긴급') === (j.kind === 'urgent')) && (F.r === '전체' || j.job_role === F.r) && (F.a === '전체' || (j.area || '').startsWith(F.a))).sort((a, b) => (b.kind === 'urgent') - (a.kind === 'urgent') || nearOf(b) - nearOf(a));
  const chip = (key, v) => `<button class="fchip ${F[key] === v ? 'on' : ''}" data-act="jf" data-k="${key}" data-v="${v}">${v === '긴급' ? '긴급' : v}</button>`;
  return `${view ? '<p class="sub">딜러들이 보는 것과 같은 화면이에요. 다른 매장 시급·조건을 보고 우리 공고를 정해 보세요.</p>' : ''}<div class="filters"><div class="chips">${['전체', '긴급', '상시'].map(v => chip('k', v)).join('')}</div><div class="chips">${['전체', '딜러', '플로어', '매니저'].map(v => chip('r', v)).join('')}</div>${areas.length > 1 ? `<div class="chips">${['전체', ...areas].map(v => chip('a', v)).join('')}</div>` : ''}</div>
  <div class="row between" style="margin:8px 2px"><p class="mut" style="font-size:13px;margin:0">${list.length}개 공고${S.mode === 'dealer' && list.length <= 2 ? ' · <button class="tlink" data-act="alert-set">새 공고 알림 받기 ›</button>' : ''}</p>${view ? '' : `<button class="fchip ${S.savedOnly ? 'on' : ''}" data-act="savedonly">♥ 찜·알림 매장만 ${(S.saves || []).length ? `<b class="num">${(S.saves || []).length}</b>` : ''}</button>`}</div>
  ${list.map(j => jobCard(j, view)).join('') || `<div class="card empty">${S.board.length ? '조건에 맞는 공고가 없어요' : '지금 올라온 공고가 없어요'}</div>`}`;
}
// ===== 딜러: 찜·매장 알림·차단·신고 · 확인서·정산서·평가 · 수입 목표·연간 합계·근무시간 · 경력증명서·이력서 링크·내 데이터 =====
const saved = (k, id) => (S.saves || []).some(x => x.kind === k && x.ref === id);
function jobTools(j) { return S.mode === 'store' ? '' : `<span class="jt"><button class="jt-b ${saved('post', j.id) ? 'on' : ''}" data-act="save" data-k="post" data-v="${j.id}" aria-label="공고 찜">${saved('post', j.id) ? '♥' : '♡'}</button><button class="jt-b ${saved('store', j.store_id) ? 'on' : ''}" data-act="save" data-k="store" data-v="${j.store_id}" title="이 매장 새 공고 알림" aria-label="매장 알림">${saved('store', j.store_id) ? '★' : '☆'}</button><button class="jt-b" data-act="jmore" data-p="${j.id}" data-s="${j.store_id}" aria-label="더 보기">⋯</button></span>`; }
const slotHours = s => { const [a, b] = [t5(s.start_t), t5(s.end_t)].map(x => { const [h, m] = x.split(':').map(Number); return h * 60 + m; }); return ((b - a + 1440) % 1440 || 1440) / 60; };
function slotExtra(s) {
  const dd = s.work_day ? `${+s.work_day.slice(5, 7)}/${+s.work_day.slice(8, 10)} ` : '', out = [];
  if (['MATCHED', 'WORKING'].includes(s.status)) { if (s.address) out.push(`<div class="mw-info"><small>주소</small><span>${esc(s.address)}</span><button class="btn sm" data-act="copy" data-v="${esc(s.address)}">복사</button></div>`); if (s.entry_note) out.push(`<div class="mw-info"><small>출입 안내</small><span>${esc(s.entry_note)}</span></div>`); out.push(`<button class="btn sm ${s.ack_at ? '' : 'pri'}" data-act="cond" data-s="${s.slot_id}">${s.ack_at ? '✓ 근무 조건 확인함' : '근무 조건 확인서 보기'}</button>`); }
  if (s.store_note) out.push(`<div class="mw-info note2"><small>매장 한마디</small><span>${esc(s.store_note)}</span></div>`);
  if (s.status === 'DISPUTED') out.push(`<ol class="dsp"><li class="on">문제 신고 접수</li><li class="on">운영사 확인 중 <small>보통 1~2일</small></li><li>결과 알림 → 지갑 반영</li></ol>`);
  if (['DONE', 'PAID'].includes(s.status)) out.push(`<span class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="slip" data-s="${s.slot_id}">정산서</button>${s.rated ? '<span class="pill">평가함</span>' : `<button class="btn sm" data-act="rate" data-s="${s.slot_id}" data-st="${s.store_id}">매장 평가 (비공개)</button>`}</span>`);
  return `<small class="mut mw-day">${dd}${slotHours(s)}시간</small>${out.length ? `<div class="mw-x">${out.join('')}</div>` : ''}`;
}
function earnCard() {
  const y = now.getFullYear(), ym = d => (d || '').slice(0, 7), done = (S.slots || []).filter(s => s.result && s.done_at), yr = done.filter(s => s.done_at.startsWith(String(y))).reduce((a, s) => a + (s.result.net || 0), 0), tax = done.filter(s => s.done_at.startsWith(String(y))).reduce((a, s) => a + (s.result.tax || 0), 0);
  const goal = +lsGet('ev_egoal') || 0, cm = TODAY.slice(0, 7), cur = done.filter(s => ym(s.done_at) === cm).reduce((a, s) => a + (s.result.net || 0), 0);
  const M = Array.from({ length: 6 }, (_, i) => { const d = new Date(y, now.getMonth() - 5 + i, 1), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; return [d.getMonth() + 1, done.filter(s => ym(s.done_at) === k).reduce((a, s) => a + slotHours(s), 0)]; }), mx = Math.max(1, ...M.map(x => x[1]));
  return `<section class="dv-sec earn"><div class="eg"><div><small>이번 달 목표</small>${goal ? `<b class="num">₩${man(cur)} <i>/ ₩${man(goal)}</i></b><div class="bar"><i style="width:${Math.min(100, cur / goal * 100)}%"></i></div><small>${cur >= goal ? '🎉 목표 달성!' : `₩${man(goal - cur)} 남았어요`}</small>` : '<b class="mut" style="font-size:15px">아직 안 정했어요</b>'}<button class="btn sm" data-act="egoal">${goal ? '바꾸기' : '목표 정하기'}</button></div>
  <div><small>${y}년 받은 돈 <span class="mut">(3.3% 뗀 금액)</span></small><b class="num">₩${E.won(yr)}</b><small>낸 원천세 ₩${E.won(tax)} · 5월 종합소득세 때 참고</small></div></div>
  <h3 style="margin:14px 0 6px">월별 근무시간</h3><div class="hbars">${M.map(([m, h]) => `<div><i style="height:${Math.max(3, h / mx * 100)}%"></i><b class="num">${h ? Math.round(h) : ''}</b><small>${m}월</small></div>`).join('')}</div></section>`;
}
function certSheet() {
  const p = S.prof, done = (S.slots || []).filter(s => ['DONE', 'PAID'].includes(s.status)), by = {}; done.forEach(s => { const b = by[s.store_name] = by[s.store_name] || { n: 0, h: 0, f: s.work_day, l: s.work_day }; b.n++; b.h += slotHours(s); if (s.work_day < b.f) b.f = s.work_day; if (s.work_day > b.l) b.l = s.work_day; });
  openSheet(`<div class="cert print-area"><h2 style="text-align:center;letter-spacing:.3em">경 력 증 명 서</h2><table class="ct"><tr><th>성명</th><td>${esc(p.name || '')}</td><th>연락처</th><td>${esc(p.phone || '')}</td></tr><tr><th>직무</th><td colspan="3">홀덤 딜러 (+EV 긴급 대타 근무)</td></tr></table>
  <table class="ct"><thead><tr><th>매장</th><th>기간</th><th>근무</th><th>시간</th></tr></thead><tbody>${Object.entries(by).map(([k, b]) => `<tr><td>${esc(k)}</td><td>${b.f || ''} ~ ${b.l || ''}</td><td>${b.n}회</td><td>${Math.round(b.h)}시간</td></tr>`).join('') || '<tr><td colspan="4">완료된 근무가 없어요</td></tr>'}</tbody></table>
  <p style="font-size:13px;line-height:1.7">위 내용은 +EV 플랫폼에 기록된 근무 완료 내역이며, 매장의 근무 완료 확인을 거친 사실을 증명합니다.</p><p style="text-align:right">${TODAY.replace(/-/g, '. ')}<br><b>+EV (plusevapp.kr)</b></p></div>
  <button class="btn pri full no-print" data-act="print">인쇄 · PDF로 저장</button><p class="note no-print">PDF로 받으려면 인쇄 화면에서 'PDF로 저장'을 고르세요. 매장 직인이 필요하면 매장에 따로 요청하세요.</p>`);
}
async function cvView(id) {
  const { data } = await sb.rpc('dealer_cv', { p_user: id }), c = data?.[0]; if (!c) return toast('이력서를 찾을 수 없어요'); const r = c.rep || {};
  openSheet(`<div class="cvv"><span class="me-av">${esc((c.name || '?').slice(0, 1))}</span><h2>${esc(c.name || '')} ${c.verified ? '<span class="pill g">✓ 본인 인증</span>' : ''}</h2><p class="mut">홀덤 딜러 · 경력 ${c.career_months || 0}개월 · ${String(c.since).slice(0, 7)}부터 +EV</p>${skillTags(c.skills)}${c.bio ? `<p>${esc(c.bio)}</p>` : ''}
  <div class="s1-g"><div><small>근무 완료</small><b class="num">${r.done || 0}회</b></div><div><small>일한 매장</small><b class="num">${r.stores || 0}곳</b></div><div><small>노쇼</small><b class="num ${r.noshow ? 'down' : 'up'}">${r.noshow || 0}회</b></div></div>${Object.keys(r.tags || {}).length ? `<div class="sktags">${Object.entries(r.tags).map(([t, n]) => `<i class="on">${esc(t)} ${n}</i>`).join('')}</div>` : ''}${r.video ? `<a class="btn sm" href="${esc(r.video)}" target="_blank" rel="noopener">🎬 딜링 영상</a>` : ''}<p class="note">+EV에 기록된 근무 이력이에요. 연락처는 채용하면 열려요.</p></div>`);
}
function vMyWork() {
  const L = { applied: ['', '매장 확인 중'], hired: ['g', '채용됐어요'], rejected: ['', '아쉽게 안 됐어요'], cancelled: ['', '취소됨'], expired: ['', '마감'] };
  const empty = (ic, t, s) => `<div class="dv-empty"><i aria-hidden="true">${ic}</i><b>${t}</b><small>${s}</small><button class="btn sm pri" data-tab="jobs">공고 보러 가기</button></div>`;
  return `<header class="dv-h"><h1>내 근무</h1></header>
  <section class="dv-sec"><h2>긴급 근무</h2>${S.slots.map(s => `<div class="mw-slot ${s.status === 'WORKING' ? 'on' : ''}"><div class="row between"><span class="pill ${SLOT[s.status][0]}">${SLOT[s.status][1]}</span><b class="num mw-pay">₩${E.won(s.pay + s.extra)}</b></div>
    <h4>${esc(s.title)}</h4><small class="mut">${esc(s.store_name)} · ${t5(s.start_t)}–${t5(s.end_t)}</small>${slotExtra(s)}
    ${s.result ? `<div class="mw-net">받는 돈 <b class="num">₩${E.won(s.result.net)}</b><small>3.3% 원천세 −${E.won(s.result.tax)}</small></div>` : ''}
    ${s.status === 'WORKING' ? `<button class="btn pri full mw-done" data-act="dslot" data-s="${s.slot_id}">퇴근했어요 · 근무 완료</button>` : ''}</div>`).join('') || empty('🃏', '채용된 긴급 근무가 없어요', '긴급 대타에 지원하고 채용되면 여기에 떠요')}</section>
  <section class="mw-steps"><b>근무가 끝나면 이렇게 돼요</b><ol><li><i>1</i><div><b>퇴근할 때 '근무 완료' 누르기</b></div></li><li><i>2</i><div><b>매장이 확인</b><small>확인이 없어도 3시간 지나면 자동으로 넘어가요</small></div></li><li><i>3</i><div><b>지갑에 들어와요</b><small>3.3% 원천세를 뺀 금액</small></div></li></ol></section>
  ${workCal()}
  <section class="dv-sec"><h2>내 지원</h2>${S.apps.length ? (() => { const live = x => ['applied', 'hired'].includes(x.status), row = a => `<div class="li"><div><b>${esc(a.title)}</b><small>${esc(a.store_name)} · ${new Date(a.created_at).toLocaleDateString('ko-KR')}</small></div><span class="row" style="gap:6px"><span class="pill ${L[a.status][0]}">${L[a.status][1]}</span>${a.status === 'applied' ? `<button class="btn sm" data-act="amsg-edit" data-p="${a.post_id}">한마디</button><button class="btn sm" data-act="app-cancel" data-a="${a.app_id}">취소</button>` : ''}</span></div>`, A = S.apps.filter(live), B = S.apps.filter(x => !live(x));
    return `<div class="dv-list">${A.map(row).join('')}</div>${B.length ? `<details><summary class="mut">지난 지원 ${B.length}건 보기</summary><div class="dv-list">${B.map(row).join('')}</div></details>` : ''}`; })() : empty('📝', '아직 지원한 공고가 없어요', '지원은 무료예요. 채용되면 매장 연락처가 열려요')}</section>`;
}
function monthSums() {
  const ym = d => d ? ymdOf(new Date(d)).slice(0, 7) : '', c = TODAY.slice(0, 7), pd = new Date(now.getFullYear(), now.getMonth() - 1, 1), p = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
  const inc = k => (S.slots || []).filter(s => s.result && ym(s.done_at) === k).reduce((a, s) => a + (s.result.net || 0), 0), out = k => (S.wds || []).filter(x => ym(x.created_at) === k).reduce((a, x) => a + (+x.amount || 0), 0);
  const ci = inc(c), pi = inc(p), co = out(c), po = out(p); if (!ci && !pi && !co && !po) return '';
  return `<section class="msum"><div><small>이번 달 번 돈</small><b class="num up">₩${E.won(ci)}</b><small>지난달 ₩${E.won(pi)}</small></div><div><small>이번 달 출금</small><b class="num">₩${E.won(co)}</b><small>지난달 ₩${E.won(po)}</small></div></section>`;
}
function workCal() {
  const y = S.wy || now.getFullYear(), m = S.wm || now.getMonth() + 1, D = E.daysIn(y, m), off = (new Date(y, m - 1, 1).getDay() + 6) % 7, days = {}, key = d => E.ymd(y, m, d);
  (S.slotDays || []).forEach(x => { const sl = S.slots.find(s => s.slot_id === x.slot_id); if (sl) (days[x.day] = days[x.day] || []).push(sl); });
  const st = L => L.some(s => s.status === 'PAID' || s.status === 'DONE') ? 'done' : L.some(s => s.status === 'WORKING' || s.status === 'MATCHED') ? 'plan' : 'etc';
  const sum = Object.entries(days).filter(([k]) => k.startsWith(`${y}-${String(m).padStart(2, '0')}`)).flatMap(([, L]) => L).reduce((a, s) => a + (s.result?.net || 0), 0);
  return `<section class="dv-sec"><div class="row between"><h2 style="margin:0">근무 달력</h2><span class="row" style="gap:4px"><button class="btn sm" data-act="wmon" data-v="-1" aria-label="이전 달">◀</button><b class="num" style="min-width:76px;text-align:center">${y}.${String(m).padStart(2, '0')}</b><button class="btn sm" data-act="wmon" data-v="1" aria-label="다음 달">▶</button></span></div>
  <div class="wcal">${['월', '화', '수', '목', '금', '토', '일'].map(w => `<i class="h">${w}</i>`).join('')}${'<i></i>'.repeat(off)}${Array.from({ length: D }, (_, i) => { const k = key(i + 1), L = days[k]; return `<i class="${L ? st(L) : ''} ${k === TODAY ? 'today' : ''}" title="${L ? L.map(s => esc(s.store_name)).join(', ') : ''}">${i + 1}</i>`; }).join('')}</div>
  <div class="wleg"><span><i class="done"></i>근무 끝</span><span><i class="plan"></i>예정·근무 중</span>${sum ? `<b class="num">이달 받은 돈 ₩${E.won(sum)}</b>` : ''}</div></section>`;
}
const TICKET_PACKS = [1, 5, 10].map(n => [n, PRICING.dealer.tickets[n]]), PRO_PRICE = PRICING.dealer.pro, INSTANT_FEE = PRICING.dealer.instantFee;
const isPro = () => S.prof?.pro_until && new Date(S.prof.pro_until) > now;
const SKILLS = ['홀덤', '오마하', '토너먼트 진행', '캐시게임', '칩 정리 빠름', '영어 가능', '야간 가능', '매니저 경험'];
const skillPick = cur => `<fieldset class="skills"><legend>할 수 있는 것 <small class="mut">매장이 지원자 목록에서 봐요</small></legend>${SKILLS.map(k => `<label><input type="checkbox" name="sk" value="${k}" ${cur.includes(k) ? 'checked' : ''}><span>${k}</span></label>`).join('')}</fieldset>`;
const availPick = av => { const a = av || {}, dd = a.d || []; return `<div class="fl"><span>일할 수 있는 시간 <small class="mut">맞는 긴급 대타만 알림이 와요 · 비우면 전부</small></span><div class="days">${E.WD.map((w, i) => `<label><input type="checkbox" name="av" value="${i}" ${dd.includes(i) ? 'checked' : ''}><span>${w}</span></label>`).join('')}</div><div class="grid2" style="margin-top:6px"><label class="fl">부터<input type="time" name="av_f" value="${a.f || ''}"></label><label class="fl">까지<input type="time" name="av_t" value="${a.t || ''}"></label></div></div>`; };
const skillTags = L => (L || []).length ? `<span class="sktags">${L.map(k => `<i>${esc(k)}</i>`).join('')}</span>` : '';
function vWallet() {
  const w = S.wallet, pro = isPro(), hasBank = S.prof?.bank_acct && S.prof?.bank_holder, soon = Math.max(0, (+w.balance || 0) - (+w.available || 0));
  return `<header class="dv-h"><h1>지갑</h1>${pro ? '<span class="pill y">PRO · 번개 출금 0원</span>' : ''}</header>
  <section class="wl-hero"><small>지금 출금할 수 있는 돈</small><div class="wl-big num">${E.won(w.available)}<span>원</span></div>
    <div class="wl-sub"><span>지갑 잔액 <b class="num">₩${E.won(w.balance)}</b></span>${soon ? `<span>곧 출금 가능 <b class="num">₩${E.won(soon)}</b></span>` : ''}</div>
    ${hasBank ? `<div class="wl-bank"><i aria-hidden="true">🏦</i>${esc(S.prof.bank_name || '')} ${esc(S.prof.bank_acct)} · ${esc(S.prof.bank_holder)}</div>` : ''}</section>
  ${hasBank ? `<div class="wl-act"><button class="wl-btn go" data-act="withdraw" data-v="1" ${w.available < 1000 + (pro ? 0 : INSTANT_FEE) ? 'disabled' : ''}><b>⚡ 번개 출금</b><small>${pro ? '수수료 0원' : `수수료 ${E.won(INSTANT_FEE)}원`}</small></button><button class="wl-btn" data-act="withdraw" data-v="0" ${w.available < 1000 ? 'disabled' : ''}><b>일반 출금</b><small>무료 · 다음 영업일</small></button></div>`
    : `<div class="card wl-nobank"><h3>받을 계좌 넣기 <small>한 번만 넣으면 바로 출금돼요</small></h3><form class="f" id="bank-form"><div class="grid2"><label class="fl">은행<input name="bank" placeholder="예: 카카오뱅크"></label><label class="fl">예금주<input name="holder"></label></div><label class="fl">계좌번호<input name="acct" inputmode="numeric"></label><button class="btn pri full">계좌 저장</button></form></div>`}
  ${monthSums()}
  ${earnCard()}
  <p class="wl-note">긴급 근무 급여는 매장 확인 후 5시간 뒤부터 출금할 수 있어요. 출금 가능한 돈 전부가 한 번에 나가요.</p>
  ${S.wds?.length ? `<section class="dv-sec"><h2>출금 내역</h2><div class="dv-list">${S.wds.map(x => `<div class="li"><div><b class="num">₩${E.won(x.amount)}</b><small>${x.instant ? '번개' : '일반'} · ${fmtDT(x.created_at)}${x.fee ? ` · 수수료 ${E.won(x.fee)}` : ''}</small></div><span class="pill ${x.status === '송금 완료' ? 'g' : 'y'}">${esc(x.status)}</span></div>`).join('')}</div></section>` : ''}
  ${S.mode === 'dealer' ? spinCard() : ''}<div class="card" hidden><h3>지원권 <small>지금 ${S.tickets}장</small></h3><div class="plans">${TICKET_PACKS.map(([n, p], i) => `<div class="plan ${i === 1 ? 'cur' : ''}">${i === 1 ? '<span class="pill y">인기</span>' : ''}<b>${n}장</b><b class="num">₩${E.won(p)}</b><small>장당 ₩${E.won(p / n)}</small><button class="btn sm ${i === 1 ? 'pri' : ''}" data-act="tickets" data-v="${i + 1}">받기</button></div>`).join('')}</div>
    <p class="note">지원하면 1장이 잠기고, 채용돼야 쓰여요. 안 뽑히면 돌아와요.</p>${payNote()}</div>`;
}
function meTools() { return S.mode === 'dealer' ? `<section class="dv-sec"><h2>내 기록</h2><div class="mn-list metools"><button data-act="cert">📄 경력증명서 <small class="mut">인쇄·PDF</small><i>›</i></button><button data-act="cv-link">🔗 이력서 링크 복사 <small class="mut">매장에 보내기</small><i>›</i></button><button data-act="my-data">⬇️ 내 데이터 내려받기<i>›</i></button>${(S.myBlocks || []).length ? `<button data-act="my-blocks">🚫 안 보는 매장 ${S.myBlocks.length}곳<i>›</i></button>` : ''}${S.rep?.noshow ? `<button data-act="ns-appeal">⚖️ 노쇼 기록 이의 신청 <small class="mut">${S.rep.noshow}회</small><i>›</i></button>` : ''}</div></section>` : ''; }
function vMe() {
  const p = S.prof;
  const R = S.rep, nm = (p.name || '?').trim();
  return `<header class="me-h"><span class="me-av" aria-hidden="true">${esc(nm.slice(0, 1))}</span><div><b>${esc(nm)}</b><small>${S.mode === 'staff' ? '직원' : '딜러'}${p.career_months ? ` · 경력 ${p.career_months}개월` : ''}${p.area ? ` · ${esc(p.area)}${p.area2 ? ' ' + esc(p.area2) : ''}` : ''}</small></div>${p.phone_verified_at ? '<span class="pill g">✓ 인증</span>' : ''}</header>${skillTags(p.skills)}
  ${R ? `<section class="me-rep"><div class="row between"><b>매장이 보는 내 평판</b><small>지원할 때 같이 보여요</small></div><div class="me-big">${[['완료 근무', R.done, ''], ['재호출률', R.recall_pct == null ? '-' : R.recall_pct, R.recall_pct == null ? '' : '%'], ['노쇼', R.noshow, '']].map(([l, v, u], i) => `<div><b class="num${i === 1 ? ' up' : ''}">${v}${u}</b><small>${l}</small></div>`).join('')}</div><div class="me-sm"><span>근무 매장 <b class="num">${R.stores}곳</b></span><span>교육 수료 <b class="num">${R.edu}개</b></span></div><p class="note">재호출률 = 두 번 이상 불러준 매장 비율. 이 숫자가 대타 매칭 순서를 정해요.</p></section>` : ''}
  ${meTools()}${S.mode === 'staff' ? myDocsCard(false) : ''}<h2 class="me-lb">프로필</h2><form class="f card" id="dealer-form"><label class="fl">이름(닉네임)<input name="name" value="${esc(p.name)}"></label><label class="fl">휴대폰 ${p.phone_verified_at ? '<span class="pill g">✓ 인증됨</span>' : '<span class="pill y">미인증</span>'}<span style="display:flex;gap:6px"><input name="phone" value="${esc(p.phone || '')}" style="flex:1"><button type="button" class="btn sm" data-act="otp-send">문자 인증</button></span></label>
  ${S.mode === 'staff' ? '<details class="more"><summary>다른 매장 대타도 하려면 <small class="mut">경력·지역·게임</small></summary>' : ''}<label class="fl">경력 (개월)<input name="career" type="number" value="${p.career_months || 0}"></label>${p.birth_year ? '' : `<label class="fl">태어난 해<select name="birth"><option value="">선택</option>${Array.from({ length: 60 }, (_, i) => now.getFullYear() - 19 - i).map(y => `<option>${y}</option>`).join('')}<option value="minor">${now.getFullYear() - 18}년 이후</option></select></label>`}${skillPick(p.skills || [])}<label class="fl">자기소개<textarea name="bio" rows="3">${esc(p.bio || '')}</textarea></label>
  <div class="grid2"><label class="fl">활동 지역 (시·도)<select name="area"><option value="">전국</option>${SIDO.map(a => `<option ${p.area === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label><label class="fl">가능 게임<input name="games" value="${esc(p.games || '')}" placeholder="예: 홀덤, 오마하"></label></div><label class="fl">자주 가는 구·시 <small class="mut">최대 3곳 · 쉼표로 구분 · 가까운 공고가 먼저 보여요</small><input name="area2" value="${esc(p.area2 || '')}" placeholder="예: 강남구, 마포구, 수원시"></label>
  ${availPick(p.avail)}
  <label class="tog"><span><b>다른 매장 긴급 대타 받기</b><small>같은 지역 긴급 대타가 뜨면 알림을 드려요. 지원해서 근무하면 지갑으로 바로 지급</small></span><input type="checkbox" name="open_to_sub" ${p.open_to_sub ? 'checked' : ''}></label>${S.mode === 'staff' ? '</details>' : ''}
  <button class="btn pri full">저장</button></form>
  ${pushRow() ? `<div class="card">${pushRow()}</div>` : ''}
  <form class="f card" id="bank-form"><h3>받을 계좌 <small>출금할 때 이 계좌로 보내드려요</small></h3><div class="grid2"><label class="fl">은행<input name="bank" value="${esc(p.bank_name || '')}" placeholder="예: 카카오뱅크"></label><label class="fl">예금주<input name="holder" value="${esc(p.bank_holder || '')}"></label></div><label class="fl">계좌번호<input name="acct" inputmode="numeric" value="${esc(p.bank_acct || '')}"></label><button class="btn full">계좌 저장</button></form>
  <form class="f card" id="join-code-form"><h3>매장 소속 신청 <small>점장님께 받은 가입코드</small></h3><input name="code" required placeholder="D-XXXXXX" value="${esc(lsGet('ev_join'))}" style="text-transform:uppercase;letter-spacing:.15em"><button class="btn full">소속 신청</button></form>
  ${inqBlock()}
  <div class="card"><h3>알림</h3>${S.notis.map(x => `<div class="li"><span>${esc(x.body)}</span><small>${fmtDT(x.created_at)}</small></div>`).join('') || '<div class="empty">알림이 없어요</div>'}</div>`;
}

// ===== 운영사 =====
function trafficCard() {
  const T = S.traffic; if (!T) return ''; const D = T.daily || [], mx = Math.max(1, ...D.map(x => x.visitors)), MN = { guest: '비로그인', store: '대표·점장', staff: '직원', dealer: '딜러', hq: '운영사', onboard: '가입 중' }, UA = { pc: 'PC', mobile: '모바일 웹', app: '설치 앱' };
  return `<div class="card"><h3>방문자 <small>최근 30일 · 같은 기기는 하루 1번만 셈</small></h3><div class="grid2" style="gap:8px"><div class="kpi"><div class="l">오늘</div><div class="v num">${T.today}</div></div><div class="kpi"><div class="l">최근 7일</div><div class="v num">${T.w7}</div></div><div class="kpi"><div class="l">최근 30일</div><div class="v num">${T.m30}</div></div><div class="kpi"><div class="l">로그인 사용자 DAU · MAU</div><div class="v num">${T.dau} · ${T.mau}</div></div></div>
  <div class="tbars">${D.map(x => `<i title="${x.d} 방문 ${x.visitors} · 로그인 ${x.users} · 가입 ${x.signups}" style="height:${Math.max(2, x.visitors / mx * 100)}%">${x.signups ? '<b></b>' : ''}</i>`).join('')}</div><div class="row between mut" style="font-size:11px"><span>${(D[0]?.d || '').slice(5)}</span><span>● 표시 = 그날 가입자 있음</span><span>오늘</span></div>
  <div class="li"><span>누가 왔나</span><small>${Object.entries(T.by_mode || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${MN[k] || k} ${n}`).join(' · ') || '-'}</small></div><div class="li"><span>어디서 왔나</span><small>${(T.by_ref || []).map(r => `${esc(r.ref)} ${r.n}`).join(' · ') || '-'}</small></div><div class="li"><span>기기</span><small>${Object.entries(T.by_ua || {}).map(([k, n]) => `${UA[k] || k} ${n}`).join(' · ') || '-'}</small></div><div class="li"><span>전체 가입자</span><b class="num">${T.users}명</b></div></div>`;
}
function vHqDash() {
  const st = S.stats || [], sales = st.reduce((a, x) => a + +x.sales, 0), open = (S.inq || []).filter(x => !x.reply).length;
  const T = S.hqToday || {}, R = S.hqRev || {}, KN = { subscription: '구독', jobs: '구인', boost: '중고 부스팅', franchise_post: '가맹 게시', franchise_lead: '가맹 리드', academy: '교육', dealer: '딜러', post: '구인', post_extra: '구인', store: '구독', plan: '구독', used_boost: '중고 부스팅', franchise: '가맹 게시', franchise_leads: '가맹 리드', fr_bill: '가맹 리드', tickets: '딜러', pro: '딜러' };
  const todo = [['biz', '사업자 확인 대기', 'stores'], ['inq', '답변 대기 문의', 'inq'], ['disputes', '긴급 근무 분쟁', 'dash'], ['pay_fail', '결제 미완료 (1시간+)', 'dash'], ['fr_disputes', '가맹 리드 이의제기', 'fr'], ['withdrawals', '출금 요청', 'dash'], ['trial_ending', '체험 종료 3일 전', 'stores'], ['expired', '체험 끝난 매장', 'stores']].filter(([k]) => +T[k] > 0);
  const months = [...new Set((R.by_kind || []).map(x => x.month))].sort(), kinds = [...new Set((R.by_kind || []).map(x => x.kind))], amt = (m, k) => (R.by_kind || []).filter(x => x.month === m && x.kind === k).reduce((a, x) => a + x.amount, 0);
  const A = R.activation || {}, DA = R.dealer_activation || {}, RT = R.retention || {};
  return `<h1>운영사</h1><p class="sub">${S.y}년 ${S.m}월</p>
  <div class="card"><h3>오늘 처리할 것 <small>${todo.length ? `${todo.reduce((a, [k]) => a + +T[k], 0)}건` : '없어요'}</small></h3>${todo.map(([k, l, t]) => `<div class="li"><span>${l}</span><span class="row"><b class="num ${['pay_fail', 'disputes', 'fr_disputes'].includes(k) ? 'down' : ''}">${T[k]}</b><button class="btn sm" data-tab="${t}">보기</button></span></div>`).join('') || '<div class="empty">처리할 일이 없어요</div>'}</div>
  <div class="grid2"><div class="card kpi"><div class="l">입점 매장</div><div class="v num">${st.length}곳</div><small class="mut">체험 ${R.plans?.trial ?? 0} · 베이직 ${R.plans?.basic ?? 0} · 프로 ${R.plans?.pro ?? 0} · 종료 ${R.plans?.expired ?? 0}</small></div><div class="card kpi"><div class="l">MRR (구독)</div><div class="v num up">₩${man(R.mrr || 0)}</div><small class="mut">이번 달 매장 매출 합계 ₩${man(sales)}</small></div></div>
  ${trafficCard()}<div class="card"><h3>매출 (결제 완료 기준) <small>최근 6개월</small></h3>${months.length ? `<div class="tbl"><table style="min-width:0"><thead><tr><th></th>${months.map(m => `<th class="r">${+m.slice(5)}월</th>`).join('')}</tr></thead><tbody>${kinds.map(k => `<tr><td>${KN[k] || k}</td>${months.map(m => `<td class="r num">${amt(m, k) ? '₩' + E.won(amt(m, k)) : '-'}</td>`).join('')}</tr>`).join('')}<tr><td><b>합계</b></td>${months.map(m => `<td class="r num"><b>₩${E.won(kinds.reduce((a, k) => a + amt(m, k), 0))}</b></td>`).join('')}</tr></tbody></table></div>` : '<div class="empty">아직 결제가 없어요</div>'}</div>
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
const refCard = () => (S.refRep || []).length ? `<div class="card"><h3>추천 매장 <small>파트너 몫 10%</small></h3>${S.refRep.map(r => `<div class="li"><div><b>${esc(r.ref)}</b> · ${esc(r.company)}<small>${{ trial: '무료 체험', basic: '베이직', pro: '프로' }[r.plan] || esc(r.plan || '')} · 결제 누적 ₩${E.won(r.paid)}</small></div><b class="num">₩${E.won(r.share)}</b></div>`).join('')}</div>` : '';
function vHqStores() {
  return `<h1>입점 매장</h1>${refCard()}<div class="card"><h3>가맹본사 권한 <small>켜면 가맹 모집 공고를 올릴 수 있어요</small></h3>${(S.hqProfiles || []).filter(p => p.kind === 'owner').map(p => `<div class="li"><span>${esc(p.name || '이름 없음')} <small class="mut">${p.id.slice(0, 8)}</small></span><button class="btn sm ${p.can_post_franchise ? 'pri' : ''}" data-act="fr-perm" data-u="${p.id}" data-v="${p.can_post_franchise ? 'false' : 'true'}">${p.can_post_franchise ? '✓ 가맹본사' : '권한 주기'}</button></div>`).join('') || '<div class="empty">대표 계정이 없어요</div>'}</div><div class="card">${(S.companies || []).map(c => `<div class="li"><div><b>${esc(c.name)}</b>${c.brand ? ` <small class="mut">${esc(c.brand)}</small>` : ''}<small>사업자 ${esc(c.biz_no || '')} · ${{ trial: '무료 체험', basic: '베이직', pro: '프로' }[c.plan]} · ${new Date(c.created_at).toLocaleDateString('ko-KR')}</small></div>${c.biz_verified ? '<span class="pill g">확인 완료</span>' : `<button class="btn sm pri" data-act="verify" data-c="${c.id}">사업자 확인</button>`}</div>`).join('') || '<div class="empty">아직 매장이 없어요</div>'}</div>`;
}
function vHqData() {
  const st = S.stats || [];
  return `<h1>데이터 자산</h1><p class="sub">매장별 ${S.m}월 매출·지출 (엑시트용 데이터 모음)</p><div class="row">${monthNav()}<button class="btn sm pri" data-act="hq-csv">엑셀</button></div>
  <div class="card"><div class="tbl"><table><thead><tr><th>회사</th><th>매장</th><th>지역</th><th class="r">매출</th><th class="r">보고일</th><th class="r">지출</th><th class="r">직원</th></tr></thead><tbody>${st.map(x => `<tr><td>${esc(x.company)}</td><td>${esc(x.store)}</td><td>${esc(x.area || '')}</td><td class="r num">${E.won(x.sales)}</td><td class="r num">${x.days}</td><td class="r num">${E.won(x.expenses)}</td><td class="r num">${x.staff}</td></tr>`).join('')}</tbody></table></div></div>`;
}
// 업데이트할 때마다 고객에게 보낼 공지를 미리 써 둔 초안 — 운영사는 고르고 보내기만
const NOTICE_DRAFTS = [
  ['v0.16', '더 편해진 +EV — 이번 업데이트 소식', `사장님, 안녕하세요. +EV 운영팀이에요.\n이번 업데이트로 이렇게 바뀌었어요.\n\n· 스케줄: 엑셀처럼 여러 칸을 한꺼번에 골라 옮기고, Ctrl+C / Ctrl+V로 붙여요. 공휴일은 자동으로 들어가요.\n· 비용 점검: 에어컨·인터넷·CCTV를 한 번만 입력하면 항목별로 줄일 수 있는 금액을 알려드려요.\n· 발주: 도착 예정일과 송장번호로 배송을 바로 확인해요.\n· 결제·세금계산서 자동 발행: 준비중이에요.\n· 테이블 로테이션: 입구·화장실·바를 배치도에 넣을 수 있어요.\n\n불편한 점은 앱의 문의로 편하게 알려주세요. 늘 고맙습니다.`],
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
  <div class="card"><div class="row between"><h3 style="margin:0">자주 묻는 질문 <small>앱 메뉴에 떠요</small></h3><button class="btn sm pri" data-act="faq-edit">+ 추가</button></div><div id="faq-hq"><button class="btn sm" data-act="faq-load">불러오기</button></div></div>
  <div class="card"><h3>보낸 공지</h3>${(S.notices || []).map(n => `<div class="li"><div><b>${esc(n.title)}</b><small>${fmtDT(n.created_at)}</small></div></div>`).join('') || '<div class="empty">아직 보낸 공지가 없어요</div>'}</div>`;
}
async function hqRepLoad(force) {
  if (S.repBusy || (!force && S.repAt && Date.now() - S.repAt < 60000)) return; S.repBusy = 1;
  try { const [r, e] = await Promise.all([sb.rpc('hq_reports'), sb.from('app_errors').select('*').order('created_at', { ascending: false }).limit(200)]); S.reps = r.data || { board: [], post: [], noshow: [] }; S.errs = e.data || []; S.repAt = Date.now(); } finally { S.repBusy = 0; }
  render();
}
function vHqRep() {
  const R = S.reps || { board: [], post: [], noshow: [] }, rs = L => (L || []).filter(Boolean).map(x => `<i>${esc(x)}</i>`).join('');
  const eg = {}; (S.errs || []).forEach(x => { const k = (x.msg || '').slice(0, 120); (eg[k] = eg[k] || { n: 0, last: x.created_at, mode: new Set(), src: x.src, ua: x.ua }).n++; eg[k].mode.add(x.mode); });
  const users = S.hqUsers || [];
  return `<h1>신고·정지</h1><p class="sub">신고 처리 · 계정 정지 · 앱 오류를 한 곳에서</p>
  <div class="card"><h3>라운지 글 신고 <small>${R.board.length}건</small></h3>${R.board.map(b => `<div class="li"><div style="min-width:0"><b>${esc(b.body)}</b><small>신고 ${b.n}명 · ${fmtDT(b.last)}${b.hidden ? ' · <span class="down">가려짐</span>' : ''}</small><span class="sktags">${rs(b.reasons)}</span></div><span class="row" style="gap:4px">${b.hidden ? `<button class="btn sm" data-act="rep-act" data-k="board" data-id="${b.id}" data-v="show">다시 보이기</button>` : `<button class="btn sm red" data-act="rep-act" data-k="board" data-id="${b.id}" data-v="hide">가리기</button>`}<button class="btn sm" data-act="rep-act" data-k="board" data-id="${b.id}" data-v="done">처리 끝</button></span></div>`).join('') || '<div class="empty">새 신고가 없어요</div>'}</div>
  <div class="card"><h3>공고 신고 <small>${R.post.length}건</small></h3>${R.post.map(p => `<div class="li"><div style="min-width:0"><b>${esc(p.title)}</b><small>${esc(p.store)} · 신고 ${p.n}명 · ${p.status === 'open' ? '게시 중' : '내려감'}</small><span class="sktags">${rs(p.reasons)}</span></div><span class="row" style="gap:4px">${p.status === 'open' ? `<button class="btn sm red" data-act="rep-act" data-k="post" data-id="${p.id}" data-v="close">공고 내리기</button>` : ''}<button class="btn sm" data-act="rep-act" data-k="post" data-id="${p.id}" data-v="done">처리 끝</button></span></div>`).join('') || '<div class="empty">새 신고가 없어요</div>'}</div>
  <div class="card"><h3>노쇼 이의 신청 <small>${R.noshow.length}건 · 문의함에서 답해요</small></h3>${R.noshow.map(n => `<div class="li"><span>${esc(n.body)}</span><small>${fmtDT(n.at)}</small></div>`).join('') || '<div class="empty">없어요</div>'}</div>
  <div class="card"><h3>계정 찾기 · 정지</h3><div class="row" style="gap:6px"><input id="hq-uq" placeholder="이메일·이름·휴대폰" style="flex:1;min-width:0"><button class="btn sm pri" data-act="hq-find">찾기</button></div>
    ${users.map(u => { const ban = u.banned_until && new Date(u.banned_until) > Date.now(); return `<div class="li"><div style="min-width:0"><b>${esc(u.name || '-')}</b><small>${esc(u.email || '')} · ${esc(u.phone || '')} · ${esc(u.kind || '')}${ban ? ` · <span class="down">정지 ~${new Date(u.banned_until).toLocaleDateString('ko-KR')} (${esc(u.ban_reason || '')})</span>` : ''}</small></div><span class="row" style="gap:4px">${ban ? `<button class="btn sm" data-act="ban" data-u="${u.id}" data-d="0">해제</button>` : `<button class="btn sm red" data-act="ban" data-u="${u.id}" data-d="7">7일 정지</button><button class="btn sm red" data-act="ban" data-u="${u.id}" data-d="3650">영구</button>`}</span></div>`; }).join('')}</div>
  <div class="card"><h3>앱 오류 <small>최근 ${(S.errs || []).length}건 · 같은 오류끼리 묶음</small></h3>${Object.entries(eg).sort((a, b) => b[1].n - a[1].n).map(([m, x]) => `<details class="err"><summary><b class="num">${x.n}회</b> ${esc(m || '(메시지 없음)')} <small class="mut">${fmtDT(x.last)} · ${[...x.mode].join(', ')}</small></summary><pre>${esc((x.src || '').slice(0, 600))}</pre><small class="mut">${esc(x.ua || '')}</small></details>`).join('') || '<div class="empty">기록된 오류가 없어요</div>'}</div>`;
}
function vHqInq() {
  const nm = id => (S.hqProfiles || []).find(p => p.id === id)?.name || '회원';
  return `<h1>문의함</h1>${(S.inq || []).map(x => `<div class="card"><div class="row between"><b>${esc(nm(x.from_user))}</b><small class="mut">${fmtDT(x.created_at)}</small></div><p style="margin:6px 0;white-space:pre-wrap">${esc(x.body.replace(/\s*\[img:[^\]]+\]/g, ''))}</p>${(x.body.match(/\[img:([^\]]+)\]/g) || []).map(t => `<button class="btn sm" data-act="fb-img" data-v="${esc(t.slice(5, -1))}">첨부 사진 보기</button>`).join('')}
    ${x.reply ? `<div class="up">↳ ${esc(x.reply)}</div>` : `<form class="row" data-inq="${x.id}"><input name="reply" required placeholder="답변 쓰기" style="flex:1"><button class="btn sm pri">보내기</button></form>`}</div>`).join('') || '<div class="card empty">문의가 없어요</div>'}`;
}

// ===== 시트 =====
function openSheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="in">${html}</div>`; if (s.hidden && !history.state?.sheet) history.pushState({ sheet: 1 }, ''); s.hidden = false; enhanceInputs(s); }
// 금액: 쉼표 + "13만 5,900원" 읽기 / 휴대폰: 010-0000-0000 / 사업자번호: 000-00-00000 (10자리)
const MONEY = /^(invest|fee|edu_fee|interior_est|lead_limit_amt|start_cash|net_fee|cctv_fee|pos_fee|rent_etc|sales|card|transfer|expense|start|pay|taxi|pamt|price|amount|goal|rent|mgmt|elec|water|net|rate|xa|dt_prize|dt_fnb|dt_etc|dt_refund|sale|per_shift|full_attend|goal_bonus)$/;
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
    else if (i.type === 'date' && !navigator.language?.startsWith('ko')) { i.dataset.fx = 'date'; i.insertAdjacentHTML('afterend', `<small class="won">${koDate(i.value)}</small>`); } /* 폰 언어가 한국어가 아니면 날짜 옆에 한국식 표시 */
  });
}
document.addEventListener('input', e => { const i = e.target, fx = i.dataset?.fx; if (!fx) return;
  if (fx === 'money') { i.value = fmtMoney(i.value); const w = i.nextElementSibling; if (w?.classList.contains('won')) w.textContent = readWon(+digits(i.value)); }
  if (fx === 'phone') i.value = fmtPhone(i.value); if (fx === 'biz') i.value = fmtBiz(i.value); if (fx === 'date' && i.nextElementSibling?.classList.contains('won')) i.nextElementSibling.textContent = koDate(i.value); }, true);
const koDate = v => { if (!v) return ''; const [y, m, d] = v.split('-').map(Number); return `${y}년 ${m}월 ${d}일 (${E.WD[E.wdOf(y, m, d)]})`; };
const formVals = f => { const v = Object.fromEntries(new FormData(f)); f.querySelectorAll('[data-fx=money]').forEach(i => v[i.name] = digits(i.value)); return v; };
function closeSheet() { $('#sheet').hidden = true; if (history.state?.sheet) history.back(); }
addEventListener('popstate', () => { if (!$('#sheet').hidden) $('#sheet').hidden = true; });
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
document.addEventListener('mouseover', e => { const el = e.target.closest?.('[data-d]'); S.hover = el ? { m: el.dataset.m, d: el.dataset.d } : null; });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) return closeSheet();
  if (S.tab !== 'sched' || e.target.closest?.('input,textarea,select') || !$('#sheet').hidden) return;
  if (e.key === 'Escape') { S.sels = []; S.clip = null; S.selCell = null; return render(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sels?.length) { e.preventDefault(); return selOff(); }
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.code === 'KeyC' ? 'c' : e.code === 'KeyV' ? 'v' : e.key.toLowerCase(); // 한글 입력 상태(ㅊ·ㅍ)에서도 Ctrl+C/V 되게
  if (key === 'c' && !String(getSelection())) { const L = S.sels?.length ? S.sels : S.hover?.m ? [S.hover] : []; if (L.length) { e.preventDefault(); copySel(L); } }
  if (key === 'v' && S.clip) { const dst = S.selCell || S.hover?.d; if (dst) { e.preventDefault(); pasteTo(dst); } }
});
// ===== 동작 =====
let working = false;
// ===== 색 테마 (화면만) =====
const THEMES = {
  mint: { name: '그래파이트 민트', sub: '기본 · 차분한 회색', v: { bg: '#111417', s1: '#171B1F', s2: '#1A1F23', s3: '#22282D', tx: '#ECEFF1', t2: '#B3BAC0', mu: '#8B949C', br: '#8FE3C4', b2: '#A6EDD2', on: '#0B2A20', go: '#E8C27A', dn: '#F08C7A' } },
  felt: { name: '딥 펠트', sub: '짙은 옥색 + 금', v: { bg: '#0B1412', s1: '#101B18', s2: '#13201C', s3: '#1B2A25', tx: '#EEF4F1', t2: '#B5C4BE', mu: '#8FA39B', br: '#4CC08F', b2: '#6FD3A8', on: '#04140D', go: '#D9B45A', dn: '#E07A5F' } },
  gold: { name: '미드나잇 샴페인', sub: '남색 + 샴페인 금', v: { bg: '#0D1117', s1: '#12171F', s2: '#161C25', s3: '#1D2430', tx: '#F1EEE6', t2: '#BDB8AC', mu: '#9097A3', br: '#D8B76A', b2: '#E6C987', on: '#1A1406', go: '#D8B76A', dn: '#E3876F' } },
  classic: { name: '클래식', sub: '예전 남색 + 에메랄드', v: { bg: '#0B0F19', s1: '#121826', s2: '#171F30', s3: '#1E2739', tx: '#EEF2F8', t2: '#A3AEC2', mu: '#8C9AB3', br: '#10B981', b2: '#34D399', on: '#04130D', go: '#F59E0B', dn: '#EF4444' } },
  light: { name: '밝은 화면', sub: '낮·밖에서 보기 좋게', v: { bg: '#F4F6F5', s1: '#FFFFFF', s2: '#FFFFFF', s3: '#EBEFED', tx: '#14181B', t2: '#3E474D', mu: '#69737A', br: '#0E8F6A', b2: '#12A57B', on: '#FFFFFF', go: '#A8740F', dn: '#C8462F', ln: '20,24,27' } }
};
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
function applyTheme(k) {
  const t = THEMES[k] || THEMES.mint, v = t.v, r = document.documentElement.style;
  [['--bg', v.bg], ['--surface-1', v.s1], ['--surface-2', v.s2], ['--surface-3', v.s3], ['--text-primary', v.tx], ['--text-secondary', v.t2], ['--text-muted', v.mu], ['--brand', v.br], ['--positive', v.br], ['--brand-2', v.b2], ['--on-brand', v.on], ['--warning', v.go], ['--danger', v.dn], ['--brand-rgb', rgb(v.br)], ['--gold-rgb', rgb(v.go)], ['--danger-rgb', rgb(v.dn)], ['--bg-rgb', rgb(v.bg)]].forEach(([n, x]) => r.setProperty(n, x));
  const ln = v.ln || '236,239,241', lt = !!v.ln; r.setProperty('--border-subtle', `rgba(${ln},${lt ? .09 : .06})`); r.setProperty('--border', `rgba(${ln},${lt ? .16 : .11})`);
  document.documentElement.classList.toggle('light', lt);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', v.bg);
}
document.documentElement.classList.toggle('big', lsGet('ev_big') === '1');
const themeNow = () => { const k = lsGet('ev_theme'); return k === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'mint') : k; };
applyTheme(themeNow()); matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (lsGet('ev_theme') === 'auto') applyTheme(themeNow()); });
function menuSheet() {
  const cur = lsGet('ev_theme') || 'mint', ck = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const tile = (k, t) => { const v = t.v; return `<button class="thm-t${k === cur ? ' on' : ''}" data-act="theme" data-v="${k}" aria-pressed="${k === cur}" style="--tb:${v.bg};--ts:${v.s2};--tx:${v.tx};--tm:${v.mu};--tr:${v.br};--tg:${v.go};--to:${v.on}">
    <span class="thm-p" aria-hidden="true"><span class="thm-h"><i></i><i></i></span><span class="thm-c"><em></em><em></em><u></u></span><span class="thm-r"><i></i><i></i><i></i></span><span class="thm-ck">${ck}</span></span>
    <b>${t.name}</b><small>${t.sub}</small></button>`; };
  openSheet(`<div class="mn"><div class="mn-hd"><b>설정</b><button class="mn-x" data-act="close" aria-label="닫기"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  ${S.user ? `<label class="mn-srch"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="srch" type="search" placeholder="메뉴·직원·공고 찾기" autocomplete="off" aria-label="앱 안 검색"></label><div id="srch-out" class="srch-out"></div>` : ''}
  ${S.mode === 'store' && isOwner() ? `<div class="mn-lb">매장</div><div class="mn-list"><button data-act="wz" data-v="2"><span class="mn-ic">🏪</span>매장 준비·기능 켜기/끄기<i>›</i></button><button data-act="share-open"><span class="mn-ic">👀</span>동업자·투자자 보기 전용 링크<i>›</i></button></div>` : ''}<div class="mn-lb">화면 색 <span>이 폰에만 저장돼요</span></div>
  <div class="thm2">${Object.entries(THEMES).map(([k, t]) => tile(k, t)).join('')}</div>
  <label class="mn-tog"><span><b>폰 설정 따라 밝게·어둡게</b><small>낮엔 밝은 화면, 밤엔 어두운 화면 자동</small></span><input type="checkbox" data-act="theme" data-v="${lsGet('ev_theme') === 'auto' ? 'mint' : 'auto'}" ${lsGet('ev_theme') === 'auto' ? 'checked' : ''}></label>
  ${S.user ? `<div class="mn-lb">알림·보안</div><div class="mn-list"><button data-act="dnd"><span class="mn-ic">🌙</span>방해 금지 시간 <small class="mut" style="margin-left:4px">${S.prof?.dnd?.f ? `${S.prof.dnd.f}~${S.prof.dnd.t}` : '꺼짐'}</small><i>›</i></button><button data-act="pin-set"><span class="mn-ic">🔒</span>앱 잠금 (PIN) <small class="mut" style="margin-left:4px">${lsGet('ev_pin') ? '켜짐 · 이 폰' : '꺼짐'}</small><i>›</i></button><button data-act="logout-all"><span class="mn-ic">📱</span>모든 기기에서 로그아웃<i>›</i></button></div>` : ''}
  <label class="mn-tog"><span><b>글자 크게</b><small>모든 화면 글자를 조금 크게</small></span><input type="checkbox" data-act="big" ${lsGet('ev_big') === '1' ? 'checked' : ''}></label>
  <div class="mn-lb">기타 <small class="mut" style="font-weight:400">v0.86 · 포스터 스튜디오·사진 마감·매장 공지·지난 주문·보기 전용 링크 · 한 번에 세팅 · 매장 키우기 퀘스트 · 매장 준비 10단계 · 기능 켜기/끄기 · 근무 일괄 확정 · 가져오기 · 화면 정리: 홈 접기 · 경고 요약 · 직원 카드 접기 · 출퇴근 고치기 안내</small></div>
  <div class="mn-list"><a href="guide.html#${S.mode === 'store' ? 'owner' : S.mode}" target="_blank" rel="noopener"><span class="mn-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7"/></svg></span>사용법 보기<i>›</i></a>
  ${S.user && (S.user.app_metadata?.provider || 'email') === 'email' ? `<button data-act="pw-change"><span class="mn-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>비밀번호 바꾸기<i>›</i></button>` : ''}
  ${S.user ? '<button data-act="myset"><span class="mn-ic">🧩</span>내 화면 · 기기 · 단축키<i>›</i></button>' : ''}
  <button data-act="faq"><span class="mn-ic">❓</span>자주 묻는 질문<i>›</i></button>
  ${S.user ? `<button data-act="fb-open"><span class="mn-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg></span>의견 보내기 <small class="mut" style="margin-left:4px">사진 첨부</small><i>›</i></button>` : ''}
  <button class="danger" data-act="logout"><span class="mn-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg></span>로그아웃<i>›</i></button></div>${S.user ? '<button class="mn-del" data-act="acct-del">회원 탈퇴</button>' : ''}</div>`);
}
// ===== 기본기: 검색 · 새 버전 · 끊김 · 오류 기록 · 동의 · 되돌리기 =====
function srchIndex() {
  const L = [], add = (k, l, t, s, h) => L.push({ k, l, t, s, h });
  (TABS[S.mode] || []).filter(([k]) => !hideTab(k)).forEach(([k, , l]) => add('메뉴', l, k === 'market' ? null : k, k === 'market' ? 'used' : null));
  if (S.mode === 'store') Object.values(SUBNAV).flat().forEach(([t, sb2, l]) => add('메뉴', l, t === 'more' ? null : t, t === 'more' ? sb2 : null));
  if (S.mode === 'store') (S.members || []).filter(p => p.role !== 'owner').forEach(p => add('직원', p.nick, 'staff', null, [p.real_name, p.job_role].filter(Boolean).join(' · ')));
  (S.board || []).forEach(j => add('공고', j.title, 'jobs', null, j.store_name));
  if (S.mode === 'dealer') add('메뉴', '룰렛 · 친구 초대', 'wallet'), add('메뉴', '받을 계좌', 'me'), add('메뉴', '익명 게시판', 'lounge');
  return L;
}
function srchRender(qv) {
  const o = $('#srch-out'); if (!o) return; const w = (qv || '').trim().toLowerCase(); if (!w) { o.innerHTML = ''; return; }
  const seen = new Set(), R = srchIndex().filter(x => (x.l + ' ' + (x.h || '')).toLowerCase().includes(w)).filter(x => { const key = x.k + x.l; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 12);
  o.innerHTML = R.map(x => `<button data-act="srch-go" data-t="${x.t || ''}" data-s="${x.s || ''}"><small>${x.k}</small><b>${esc(x.l)}</b>${x.h ? `<i>${esc(x.h)}</i>` : ''}</button>`).join('') || '<p class="note" style="margin:6px 2px">찾는 게 없어요</p>';
}
function bar(id, html, cls) { let b = $('#' + id); if (!html) { b?.remove(); return; } if (!b) { b = document.createElement('div'); b.id = id; document.body.appendChild(b); } b.className = 'topbar-msg ' + (cls || ''); b.innerHTML = html; }
// 새 버전: index의 app.css?v= 번호가 바뀌면 새로고침 안내
async function verCheck() { try { const cur = document.querySelector('link[href*="app.css"]')?.getAttribute('href'); if (!cur || !navigator.onLine) return; const h = await fetch(location.pathname + '?vc=' + Date.now(), { cache: 'no-store' }).then(r => r.text()); if (h.includes('app.css') && !h.includes(cur)) bar('verbar', '<b>새 버전이 나왔어요</b><button data-act="ver-go">새로고침</button>', 'go'); } catch { } }
setInterval(verCheck, 5 * 60e3); document.addEventListener('visibilitychange', () => { if (!document.hidden) verCheck(); });
// 인터넷 끊김
addEventListener('offline', () => bar('netbar', '<b>인터넷이 끊겼어요</b><span>연결되면 자동으로 다시 불러와요</span>', 'warn'));
addEventListener('online', () => { bar('netbar', ''); if (S.user && !working) reload().then(() => toast('다시 연결됐어요')).catch(() => { }); });
if (!navigator.onLine) setTimeout(() => bar('netbar', '<b>인터넷이 끊겼어요</b><span>연결되면 자동으로 다시 불러와요</span>', 'warn'), 0);
// 앱 오류 자동 기록 (한 번 켤 때 최대 5건)
{ let n = 0; const log = (msg, src) => { if (n++ >= 5 || location.pathname.includes('/demo')) return; try { sb.from('app_errors').insert({ mode: S.mode || 'guest', msg: String(msg || '').slice(0, 1900), src: String(src || '').slice(0, 1900), ua: navigator.userAgent.slice(0, 390) }).then(() => { }, () => { }); } catch { } };
  addEventListener('error', e => log(e.message, `${e.filename || ''}:${e.lineno || ''}:${e.colno || ''} ${e.error?.stack || ''}`));
  addEventListener('unhandledrejection', e => log(e.reason?.message || e.reason, e.reason?.stack || '')); }
// 약관 동의 · 탈퇴 계정 · 로그인 풀림
function basicsCheck() {
  if (!S.user || !S.prof) return;
  if (S.prof.deleted_at) { S.prof = null; sb.auth.signOut(); return toast('탈퇴한 계정이에요'); }
  if (S.prof.banned_until && new Date(S.prof.banned_until) > Date.now()) { const p = S.prof; S.prof = null; S.byMe = 1; sb.auth.signOut(); return setTimeout(() => openSheet(`<h2>이용이 정지된 계정이에요</h2><p class="sub">${new Date(p.banned_until).getFullYear() > now.getFullYear() + 5 ? '영구 정지' : `${new Date(p.banned_until).toLocaleDateString('ko-KR')}까지`}${p.ban_reason ? ` · 사유: ${esc(p.ban_reason)}` : ''}</p><p class="note">잘못된 정지라면 운영사로 연락해 주세요.</p><button class="btn full" data-act="close">닫기</button>`), 400); }
  if (!S.prof.terms_at && !S.termsAsked && !location.pathname.includes('/demo')) { S.termsAsked = 1; if (lsGet('ev_terms')) { const t = lsGet('ev_terms'); sb.from('profiles').update({ terms_at: t }).eq('id', S.user.id).then(() => { S.prof.terms_at = t; }); } else setTimeout(() => { if ($('#sheet').hidden) openSheet(`<h2>약관 동의</h2><p class="sub">계속 쓰시려면 한 번만 동의해 주세요.</p><form class="f" id="terms-form"><label class="tog"><span><b>이용약관 · 개인정보 처리방침 동의 (필수)</b><small><a href="legal.html" target="_blank" rel="noopener">전문 보기</a></small></span><input type="checkbox" name="ok" required></label><button class="btn pri full">동의하고 계속</button></form>`); }, 600); }
}
// 마감 입력 임시저장: 같은 날짜면 적던 숫자를 다시 채워요
function draftRestore() {
  const f = $('#report-form'); if (!f || !S.store) return; let o; try { o = JSON.parse(lsGet('ev_draft_' + S.store.id) || 'null'); } catch { } if (!o || (o.date && f.elements.date && o.date !== f.elements.date.value)) return;
  let n = 0; Object.entries(o).forEach(([k, v]) => { const el = f.elements[k]; if (el && !el.length && v !== '' && el.value !== v) { el.value = v; n++; } }); if (n && !S.draftTold) { S.draftTold = 1; toast('적던 숫자를 불러왔어요'); }
}
// 되돌리기 토스트 (5초)
function undoToast(msg, undo) { let u = $('#undo'); if (!u) { u = document.createElement('div'); u.id = 'undo'; document.body.appendChild(u); } u.innerHTML = `<span>${msg}</span><button>되돌리기</button>`; u.classList.add('on'); clearTimeout(undoToast.h); u.querySelector('button').onclick = async () => { u.classList.remove('on'); await undo(); }; undoToast.h = setTimeout(() => u.classList.remove('on'), 5000); }
async function refreshNow(btn) { if (working) return; btn?.classList.add('spin'); working = true; try { await reload(); if (S.mode === 'dealer' && S.tab === 'lounge') await loungeLoad(1); toast('새로 고쳤어요'); } catch { toast('새로 고치지 못했어요. 잠시 후 다시 해주세요'); } finally { working = false; document.querySelector('[data-act=refresh]')?.classList.remove('spin'); } }
// 당겨서 새로고침 (화면 맨 위에서 아래로 끌기)
{ let y0 = null, d = 0; const ind = document.createElement('div'); ind.className = 'ptr'; ind.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>'; document.addEventListener('DOMContentLoaded', () => document.body.appendChild(ind)); if (document.body) document.body.appendChild(ind);
  addEventListener('touchstart', e => { y0 = scrollY <= 0 && $('#sheet')?.hidden !== false && !$('#roul') && !$('#mpop') ? e.touches[0].clientY : null; d = 0; }, { passive: true });
  addEventListener('touchmove', e => { if (y0 == null) return; d = Math.max(0, e.touches[0].clientY - y0); if (d > 10) { ind.classList.add('on'); ind.style.transform = `translateY(${Math.min(d, 90) * .7 - 20}px) rotate(${d * 3}deg)`; } }, { passive: true });
  addEventListener('touchend', async () => { if (y0 == null) return; y0 = null; if (d > 80 && S.user && !working) { ind.classList.add('go'); ind.style.transform = 'translateY(40px)'; working = true; try { await reload(); toast('새로 고쳤어요'); } catch { } finally { working = false; } } ind.classList.remove('on', 'go'); ind.style.transform = ''; d = 0; }); }
const busy = async fn => { if (working) return; working = true; document.body.classList.add('busy'); try { await fn(); } catch (e) { console.error(e); } finally { working = false; document.body.classList.remove('busy'); } };
// 입금 축하: 지갑 잔액이 늘면 한 번 터뜨림 (기능 변경 없음 · 화면만)
function moneyPop() {
  if (S.mode !== 'dealer' || !S.wallet || !S.user) return; const b = +S.wallet.balance || 0, k = 'ev_bal_' + S.user.id, prev = lsGet(k); lsSet(k, String(b || '0'));
  if (S.noPop) { S.noPop = 0; return; } if (prev === '' || b - +prev < 1000 || $('#mpop')) return;
  const d = b - +prev, el = document.createElement('div'); el.id = 'mpop'; el.className = 'mp';
  el.innerHTML = `<div class="mp-card"><img class="mp-burst" src="${RL_IMG}burst.webp" alt=""><div class="mp-conf">${'<i></i>'.repeat(18)}</div><div class="mp-ic">₩</div><small>입금 완료</small><b class="mp-amt">+${E.won(d)}원</b><p>지갑에 저장됐어요</p><div class="mp-row"><button class="mp-go" data-act="mp-wallet">지갑 보기</button><button class="mp-x" data-act="mp-close">닫기</button></div></div>`;
  document.body.appendChild(el); try { navigator.vibrate?.([40, 30, 80]); } catch { }
}
const reload = async () => { if (S.mode === 'store') await loadStore(); else if (S.mode === 'staff') await loadStaff(); else if (S.mode === 'dealer') await loadDealer(); else if (S.mode === 'hq') await loadHQ(); render(); };
// ===== v0.68 5차: 매장 장부(store_items) · 매출 지표 · 근무 · 급여 · 운영 · 딜러 · 다매장 · 사용성 · 운영사 =====
// 장부 종류: [이름, 직원도 봄, 직원도 씀, 필드]  필드 = [name, label, type]
const IK = {
  deposit: ['입금 기록', 0, 0, [['date', '날짜', 'date'], ['type', '종류', ['카드 입금', '은행 입금']], ['amount', '금액', 'money'], ['body', '메모']]],
  contract: ['계약', 0, 0, [['title', '계약 이름 (임대차·렌탈·통신·직원 근로계약)'], ['due', '만료일', 'date'], ['target', '직원 (근로계약이면)', 'member'], ['body', '메모']]],
  bill: ['공과금', 0, 0, [['title', '항목 (전기·수도·관리비·통신)'], ['day', '매달 납부일', 'number'], ['amount', '보통 금액', 'money']]],
  equip: ['장비 점검', 1, 1, [['title', '장비 (셔플러·에어컨 필터·소화기)'], ['cycle', '점검 주기 (일)', 'number'], ['last', '마지막 점검일', 'date']]],
  deck: ['카드 덱', 1, 1, [['title', '테이블·덱 이름'], ['cycle', '교체 주기 (일)', 'number'], ['last', '새 덱 꺼낸 날', 'date']]],
  chips: ['칩·카드 소모', 1, 1, [['date', '날짜', 'date'], ['type', '종류', ['칩 분실', '칩 파손', '카드 파손', '카드 분실']], ['qty', '수량', 'number'], ['body', '메모']]],
  clean: ['청소 구역', 1, 0, [['title', '구역 (홀·화장실·바·흡연실)']]],
  manual: ['매뉴얼', 1, 0, [['title', '제목'], ['body', '내용 (순서·규칙)', 'text']]],
  quiz: ['우리 매장 퀴즈', 1, 0, [['title', '문제'], ['opts', '보기 (쉼표로)'], ['ans', '정답 번호 (1부터)', 'number']]],
  recipe: ['음료 원가', 0, 0, [['title', '메뉴'], ['price', '판매가', 'money'], ['ings', '재료 (이름:원가, 쉼표로)', 'text']]],
  talk: ['면담 기록', 0, 0, [['target', '직원', 'member'], ['date', '날짜', 'date'], ['body', '내용', 'text']]],
  warn: ['경고 기록', 0, 0, [['target', '직원', 'member'], ['date', '날짜', 'date'], ['type', '종류', ['구두', '서면']], ['body', '사유', 'text']]],
  expense_req: ['직원 지출', 1, 1, [['title', '어디에 썼나요'], ['date', '쓴 날', 'date'], ['amount', '금액', 'money'], ['cat', '항목', 'cat']]]
};
const LEDGER = ['contract', 'bill', 'deposit', 'equip', 'deck', 'chips', 'clean', 'manual', 'quiz', 'recipe', 'expense_req'];
const itemsOf = k => (S.items || []).filter(x => x.kind === k && x.status !== 'hidden'), itStore = () => S.mode === 'staff' ? opsStore() : S.store?.id;
const dDay = k => Math.round((Date.parse(k) - Date.parse(TODAY)) / 864e5);
async function itemsLoad() { const st = itStore(); if (!st) return; S.items = (await sb.from('store_items').select('*').eq('store_id', st).order('created_at', { ascending: false }).limit(500)).data || []; }
function itemLine(x) {
  const k = x.kind, D = x.data || {}, mgr = isMgr(), btn = (act, l, s = '') => `<button class="btn sm ${s}" data-act="${act}" data-v="${x.id}">${l}</button>`;
  let main = esc(x.title || ''), sub = '', tail = '';
  if (k === 'deposit') { main = `${esc(D.type || '')} ₩${E.won(D.amount)}`; sub = `${esc(D.date || '')} ${esc(x.body || '')}`; }
  if (k === 'contract') { const n = x.due ? dDay(x.due) : null; sub = `${x.target ? esc(nickOf(x.target)) + ' · ' : ''}${x.due ? `${x.due} 만료` : ''} ${esc(x.body || '')}`; if (n != null) tail = `<span class="pill ${n <= 30 ? 'r' : ''}">${n >= 0 ? 'D-' + n : '지남'}</span>`; }
  if (k === 'bill') sub = `매달 ${D.day || '-'}일 · 보통 ₩${E.won(D.amount)}`;
  if (k === 'equip' || k === 'deck') { const due = D.last ? addDay(D.last, +D.cycle || 30) : TODAY, n = dDay(due); sub = `${k === 'deck' ? '사용' : '마지막 점검'} ${D.last ? `${-dDay(D.last)}일 전` : '기록 없음'} · ${D.cycle || 30}일마다`; tail = `<span class="pill ${n <= 0 ? 'r' : n <= 3 ? 'y' : 'g'}">${n <= 0 ? (k === 'deck' ? '교체할 때' : '점검할 때') : 'D-' + n}</span>${btn('it-reset', k === 'deck' ? '새 덱' : '점검함')}`; }
  if (k === 'chips') { main = `${esc(D.type || '')} ${D.qty || 0}개`; sub = `${esc(D.date || '')} ${esc(x.body || '')}`; }
  if (k === 'manual') { sub = ''; main = `<details><summary><b>${esc(x.title)}</b></summary><p style="white-space:pre-wrap;margin:6px 0 0">${esc(x.body || '')}</p></details>`; }
  if (k === 'quiz') sub = (D.opts || []).map((o, i) => `${i + 1}) ${esc(o)}${mgr && i === D.ans ? ' ✓' : ''}`).join(' · ');
  if (k === 'recipe') { const c = (D.ings || []).reduce((a, [, v]) => a + (+v || 0), 0); sub = `원가 ₩${E.won(c)} · 판매가 ₩${E.won(D.price)} · ${(D.ings || []).map(([n, v]) => `${esc(n)} ${E.won(v)}`).join(', ')}`; tail = `<span class="pill ${D.price && c / D.price > .35 ? 'r' : 'g'}">원가율 ${D.price ? Math.round(c / D.price * 100) : '-'}%</span>`; }
  if (k === 'talk' || k === 'warn') { main = `${esc(nickOf(x.target))} · ${esc(D.date || '')}${D.type ? ` · ${esc(D.type)}` : ''}`; sub = esc(x.body || ''); }
  if (k === 'expense_req') { main = `${esc(x.title)} ₩${E.won(D.amount)}`; sub = `${esc(D.by || '')} · ${esc(D.date || '')} · ${CAT[D.cat] || esc(D.cat || '')}`; tail = x.status === 'ok' ? '<span class="pill g">승인됨</span>' : x.status === 'no' ? '<span class="pill">반려</span>' : mgr ? `${btn('xr-ok', '승인', 'pri')}${btn('xr-no', '반려')}` : '<span class="pill y">확인 중</span>'; }
  const del = (mgr || x.created_by === S.user?.id) && (k !== 'expense_req' || !x.status) ? `<button class="btn sm" data-act="it-hide" data-v="${x.id}" aria-label="지우기">✕</button>` : '';
  return `<div class="li"><div style="min-width:0">${k === 'manual' ? main : `<b>${main}</b>`}${sub ? `<small class="mut" style="display:block">${sub}</small>` : ''}</div><span class="row" style="gap:4px;flex-wrap:nowrap">${tail}${del}</span></div>`;
}
function ledgerCard() {
  const mgr = isMgr(), K = LEDGER.filter(k => mgr || IK[k][1]), f = K.includes(S.ledF) ? S.ledF : K[0], L = itemsOf(f);
  let extra = '';
  if (f === 'deposit') { const [a, b] = monthRange(), card = S.reports?.reduce((s, r) => s + (+r.card || 0), 0) || 0, dep = L.filter(x => x.data?.date >= a && x.data?.date <= b), ci = dep.filter(x => x.data.type === '카드 입금').reduce((s, x) => s + +x.data.amount, 0), bi = dep.filter(x => x.data.type === '은행 입금').reduce((s, x) => s + +x.data.amount, 0);
    extra = `<div class="evc"><div><small>${S.m}월 카드 매출</small><b class="num">₩${man(card)}</b></div><div><small>통장에 들어온 카드값</small><b class="num">₩${man(ci)}</b></div><div><small>차이 (수수료·미입금)</small><b class="num ${card - ci > card * .03 ? 'down' : ''}">₩${man(card - ci)}${card ? ` · ${((card - ci) / card * 100).toFixed(1)}%` : ''}</b></div></div><small class="mut">카드 수수료는 보통 0.5~1.5%예요. 3% 넘게 비면 카드사 입금 내역을 확인해 보세요 · 금고 → 은행 입금 ₩${man(bi)}</small>`; }
  if (f === 'chips') { const [a] = monthRange(), m = L.filter(x => (x.data?.date || '') >= a); extra = `<small class="mut">${S.m}월 ${['칩', '카드'].map(t => `${t} ${m.filter(x => (x.data.type || '').startsWith(t)).reduce((s, x) => s + (+x.data.qty || 0), 0)}개`).join(' · ')}</small>`; }
  if (f === 'clean') extra = cleanToday() + cleanToday(1);
  if (f === 'manual' && L.length && S.mode === 'staff') lsSet('ev_fw_man', '1');
  if (f === 'quiz' && S.mode === 'staff') { const mine = itemsOf('quiz_res').find(x => x.created_by === S.user.id); if (mine) extra = `<small class="mut">내 최근 점수 ${mine.data?.score}/${mine.data?.total} · ${fmtDT(mine.created_at)}</small> `; }
  if (f === 'quiz' && L.length) extra = `<button class="btn sm pri" data-act="iquiz">퀴즈 풀기 (${L.length}문제)</button>${mgr ? ` ${quizRes()}` : ''}`;
  const canAdd = mgr || IK[f][2];
  return `<div class="card ledger"><div class="row between"><h3 style="margin:0">매장 장부</h3>${canAdd ? `<button class="btn sm pri" data-act="it-new" data-v="${f}">+ ${IK[f][0]}</button>` : ''}</div>
  <div class="chips" style="margin:8px 0">${K.map(k => `<button class="fchip ${k === f ? 'on' : ''}" data-act="ledf" data-v="${k}">${IK[k][0]}${k === 'expense_req' && itemsOf(k).filter(x => !x.status).length ? ` <b class="num">${itemsOf(k).filter(x => !x.status).length}</b>` : ''}</button>`).join('')}</div>
  ${extra}${L.slice(0, 40).map(itemLine).join('') || `<div class="empty">아직 없어요</div>`}</div>`;
}
function itemSheet(k) {
  const [lab, , , F] = IK[k], mem = (S.members || []).filter(p => p.role !== 'owner');
  const inp = ([n, l, t]) => t === 'text' ? `<label class="fl">${l}<textarea name="${n}" rows="4"></textarea></label>` : Array.isArray(t) ? `<label class="fl">${l}<select name="${n}">${t.map(o => `<option>${o}</option>`).join('')}</select></label>`
    : t === 'member' ? `<label class="fl">${l}<select name="${n}"><option value="">-</option>${mem.map(p => `<option value="${p.id}">${esc(p.nick)}</option>`).join('')}</select></label>`
    : t === 'cat' ? `<label class="fl">${l}<select name="${n}">${Object.entries(CAT).filter(([c]) => c !== 'card').map(([c, x]) => `<option value="${c}">${x}</option>`).join('')}</select></label>`
    : `<label class="fl">${l}<input name="${n}" ${t === 'date' ? `type="date" value="${TODAY}"` : t === 'number' || t === 'money' ? 'type="number" inputmode="numeric"' : ''} ${n === 'title' ? 'required maxlength="80"' : ''}></label>`;
  openSheet(`<h2>${lab} 추가</h2><form class="f" id="it-form" data-k="${k}">${F.map(inp).join('')}<button class="btn pri full">저장</button><button type="button" class="btn full" data-act="close">취소</button></form>`);
}
function cleanToday(next) {
  const A = itemsOf('clean'); if (!A.length) return ''; const day = next ? addDay(bizDay(), 1) : bizDay();
  const [y, m, d] = day.split('-').map(Number), on = (S.members || []).filter(p => p.role !== 'owner' && E.shiftOn(p.id, y, m, d, S.tpl || [], S.ov || []));
  if (!on.length) return `<small class="mut">${next ? '내일' : '오늘'} 근무자가 없어요</small>`;
  const n0 = Math.floor(Date.parse(day) / 864e5); // 날마다 한 칸씩 돌아가며 배정
  return `<div class="sktags" style="margin:4px 0 8px"><small class="mut">${next ? '내일' : '오늘'}</small>${A.map((a, i) => `<i class="${next ? '' : 'on'}">${esc(a.title)} · ${esc(on[(n0 + i) % on.length].nick)}</i>`).join('')}</div>`;
}
function quizRes() { const R = itemsOf('quiz_res'); return R.length ? `<small class="mut">최근 결과: ${R.slice(0, 6).map(x => `${esc(x.data?.by || '')} ${x.data?.score}/${x.data?.total}`).join(' · ')}</small>` : ''; }
function quizSheet() {
  const L = itemsOf('quiz');
  openSheet(`<h2>우리 매장 퀴즈</h2><form class="f" id="iquiz-form">${L.map((x, i) => `<div class="fl"><b>${i + 1}. ${esc(x.title)}</b><div class="seg brk" style="flex-wrap:wrap">${(x.data?.opts || []).map((o, j) => `<label style="flex:1 1 40%"><input type="radio" name="q${i}" value="${j}" required><span>${esc(o)}</span></label>`).join('')}</div></div>`).join('')}<button class="btn pri full">채점하기</button></form>`);
}
// 다가오는 일에 장부 항목 더하기: 계약 만료 30일·공과금 3일·장비 점검·덱 교체·수습 종료·퇴사 예정
function upcoming68() {
  const L = [], [y, m, d] = TODAY.split('-').map(Number);
  itemsOf('contract').filter(x => x.due).forEach(x => { const n = dDay(x.due), w = x.target ? 14 : 30; if (n <= w && n >= -7) L.push([n >= 0 ? `D-${n}` : '지남', `${x.target ? esc(nickOf(x.target)) + ' 근로계약 갱신' : esc(x.title) + ' 계약 만료'}`]); });
  itemsOf('bill').forEach(x => { const dd = Math.min(+x.data?.day || 0, E.daysIn(y, m)); if (!dd) return; const n = dd - d; if (n >= 0 && n <= 3) L.push([n ? `D-${n}` : '오늘', `${esc(x.title)} 납부 ₩${man(x.data?.amount)}`]); });
  ['equip', 'deck'].forEach(k => itemsOf(k).forEach(x => { const n = dDay(addDay(x.data?.last || TODAY, +x.data?.cycle || 30)); if (n <= 1) L.push([n <= 0 ? '오늘' : 'D-1', `${esc(x.title)} ${k === 'deck' ? '덱 교체' : '점검'}`]); }));
  (S.members || []).filter(p => p.role !== 'owner').forEach(p => {
    if (p.checks?.prob && p.joined_on) { const n = dDay(addDay(p.joined_on, 91)); if (n >= -3 && n <= 7) L.push([n >= 0 ? `D-${n}` : '지남', `${esc(p.nick)} 수습 3개월 끝 · 시급 확인`]); }
    if (p.checks?.leave) { const n = dDay(p.checks.leave); if (n >= 0 && n <= 30) L.push([`D-${n}`, `${esc(p.nick)} 퇴사 예정 · 근무표·정산 정리`]); }
  });
  return L;
}
// ===== A 매출·손익 =====
function carryCash() { const r = (S.hist || []).find(x => x.detail?.end_cash != null); if (!r) return null; const dep = itemsOf('deposit').filter(x => x.data?.type === '은행 입금' && (x.data?.date || '') >= r.report_date).reduce((a, x) => a + +x.data.amount, 0); return { v: Math.max(0, r.detail.end_cash - dep), from: r.report_date, dep }; }
function kpiCard() {
  const [f, l] = monthRange(), pm = new Date(S.y, S.m - 2, 1), [pf, pl] = monthRange(pm.getFullYear(), pm.getMonth() + 1), rs = (a, b) => (S.hist || []).filter(r => r.report_date >= a && r.report_date <= b && r.sales);
  const calc = R => { const s = k => R.reduce((a, r) => a + (+(k in r ? r[k] : r.detail?.[k]) || 0), 0), ent = s('entries'), tn = s('tourn'), lab = R.reduce((a, r) => a + dayLaborOf(r.report_date), 0) * (tn ? 1 : 0);
    const hrs = R.map(r => { const o = (S.opens || []).find(x => x.day === r.report_date); if (!o || !r.created_at) return 0; const h = (Date.parse(r.detail?.closed_at || r.created_at) - Date.parse(o.opened_at)) / 36e5; return h > 2 && h < 20 ? h : 0; }), hs = hrs.reduce((a, h) => a + h, 0), hsSales = R.filter((r, i) => hrs[i]).reduce((a, r) => a + r.sales, 0);
    return { per: ent ? s('sales') / ent : null, tour: tn ? (s('sales') - s('fnb') - s('etc') - s('prize') - lab) / tn : null, rebuy: ent ? s('rebuy') / ent * 100 : null, fnb: s('sales') ? s('fnb') / s('sales') * 100 : null, hour: hs ? hsSales / hs : null }; };
  const A = calc(rs(f, l)), B = calc(rs(pf, pl)); if (!rs(f, l).length) return '';
  const cell = (lab, k, fmt, tip) => { const a = A[k], b = B[k], dl = a != null && b ? (a - b) / Math.abs(b) * 100 : null; return `<div><small>${lab}</small><b class="num">${a == null ? '<span class="mut">-</span>' : fmt(a)}</b><small class="${dl == null ? 'mut' : dl >= 0 ? 'up' : 'down'}">${dl == null ? tip : `지난달보다 ${dl >= 0 ? '+' : ''}${dl.toFixed(0)}%`}</small></div>`; };
  return `<div class="card"><h3>게임·매출 지표 <small>${S.m}월 · 지난달과 비교</small></h3><div class="kpi5">${cell('객단가', 'per', v => `₩${man(v)}`, '엔트리 수를 넣어주세요')}${cell('토너 1회 남는 돈', 'tour', v => `₩${man(v)}`, '토너먼트 수·상금을 넣어주세요')}${cell('리바이율', 'rebuy', v => `${v.toFixed(0)}%`, '리바이 수를 넣어주세요')}${cell('음료 비중', 'fnb', v => `${v.toFixed(1)}%`, '음료 매출을 넣어주세요')}${cell('영업시간당 매출', 'hour', v => `₩${man(v)}`, '오픈을 누르면 계산돼요')}</div>
  <small class="mut">토너 1회 = (매출 − 음료·기타 − 상금 − 그날 인건비) ÷ 토너 수 · 영업시간 = 오픈 ~ 마감 입력</small></div>`;
}
function missCard() {
  const [y, m, d] = TODAY.split('-').map(Number); if (S.y !== y || S.m !== m) return '';
  const start = (S.hist || []).length ? (S.hist[S.hist.length - 1].report_date > E.ymd(y, m, 1) ? S.hist[S.hist.length - 1].report_date : E.ymd(y, m, 1)) : null; if (!start) return '';
  const offW = E.WD.map((_, w) => !(S.hist || []).some(r => r.report_date >= addDay(TODAY, -56) && E.wdOf(...r.report_date.split('-').map(Number)) === w)), L = []; for (let i = +start.slice(8); i < d; i++) { const k = E.ymd(y, m, i); if (!S.reports.some(r => r.report_date === k) && !(S.store.holidays || []).includes(k) && !offW[E.wdOf(y, m, i)] && !(CFG().offwd || []).includes(E.wdOf(y, m, i))) L.push(k); }
  if (!L.length) return '';
  return `<div class="card warnc"><b>마감 안 한 날 ${L.length}일</b><small class="mut" style="display:block">쉬는 날이면 스케줄에서 휴무일로 지정하세요</small>${(b => `<div class="chips" style="margin-top:6px">${L.slice(0, 3).map(b).join('')}</div>${L.length > 3 ? `<details><summary class="mut">나머지 ${L.length - 3}일</summary><div class="chips">${L.slice(3).map(b).join('')}</div></details>` : ''}`)(k => `<button class="fchip" data-act="fill-day" data-v="${k}">${+k.slice(5, 7)}/${+k.slice(8)}(${E.WD[E.wdOf(...k.split('-').map(Number))]}) 채우기</button>`)}</div>`;
}
function costSurge() {
  if (!isOwner()) return ''; const [y, m, d] = TODAY.split('-').map(Number); if (S.y !== y || S.m !== m || d < 3) return '';
  const pm = new Date(y, m - 2, 1), pk = `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, '0')}`, by = (L, key) => L.reduce((a, x) => (a[x.category] = (a[x.category] || 0) + x.amount, a), {});
  const fixedC = ['rent', 'mgmt', 'net'], cur = by(S.expenses || []), prev = by((S.expAll || []).filter(x => x.spent_on.startsWith(pk))), k = E.daysIn(y, m) / d, big = c => Math.max(0, ...(S.expenses || []).filter(x => x.category === c).map(x => x.amount));
  // 한 번에 크게 쓴 건 하루치로 늘리지 않고 그대로 더함 (월세·관리비 같은 고정비는 늘리지 않음)
  const L = Object.entries(cur).map(([c, v]) => [c, fixedC.includes(c) ? v : (v - big(c)) * k + big(c), prev[c] || 0]).filter(([, p, b]) => b >= 50000 && p > b * 1.3);
  return L.length ? `<div class="card warnc"><b>⚠️ 지난달보다 30% 넘게 오를 비용</b>${L.map(([c, p, b]) => `<div class="li"><span>${CAT[c] || esc(c)}</span><span class="num down">₩${man(b)} → 약 ₩${man(p)} (+${Math.round((p / b - 1) * 100)}%)</span></div>`).join('')}<small class="mut">지금 속도로 월말까지 쓴다고 본 예상이에요</small></div>` : '';
}
const VAT_CHK = ['카드 매출 (여신금융협회 조회)', '현금영수증 매출 (홈택스)', '계좌이체·현금 매출 (마감 장부)', '매입 세금계산서 (홈택스 조회)', '카드로 산 사업용 지출', '인테리어·장비 등 고정자산', '부가세 신고·납부 (홈택스)'];
function vatChk() {
  if (!isOwner()) return ''; const [y, m] = TODAY.split('-').map(Number), vt = S.store.equip?.vat_type || '일반', sel = `<select data-act="vat-type" aria-label="과세 유형">${['일반', '간이'].map(t => `<option value="${t}" ${t === vt ? 'selected' : ''}>${t}과세자</option>`).join('')}</select>`;
  if (vt === '간이' ? ![12, 1].includes(m) : ![12, 1, 6, 7].includes(m)) return [3, 4, 9, 10].includes(m) && vt === '일반' ? `<div class="card lbud"><div><b>부가세 예정고지</b><small>개인 일반과세자는 ${m <= 4 ? 4 : 10}월에 세무서 고지서대로 내요 (신고 없음) · 유형 ${sel}</small></div></div>` : '';
  const key = m === 12 || m === 1 ? `${m === 12 ? y : y - 1}-2` : `${y}-1`, row = itemsOf('vat').find(x => x.title === key), done = row?.data?.done || [];
  return `<div class="card"><h3>부가세 신고 준비 <small>${m === 12 || m === 6 ? '다음 달 25일까지' : '이번 달 25일까지'} · ${done.length}/${VAT_CHK.length}</small></h3><div class="chks col">${VAT_CHK.map((t, i) => `<label><input type="checkbox" data-act="vat" data-k="${key}" data-i="${i}" ${done.includes(i) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div><small class="mut">과세 유형 ${sel} · ${vt === '간이' ? '간이과세자는 1월에 한 번 신고해요' : '개인 일반과세자: 1월·7월 확정신고 (4월·10월은 예정고지)'} · 세무사와 확인하세요</small></div>`;
}
async function yearSheet() {
  const y = S.y, [r, x, mt] = await Promise.all([sb.from('daily_reports').select('report_date,sales,card,cash,transfer,expense').eq('store_id', S.store.id).gte('report_date', `${y}-01-01`).lte('report_date', `${y}-12-31`), sb.from('expenses').select('spent_on,category,amount').eq('store_id', S.store.id).gte('spent_on', `${y}-01-01`).lte('spent_on', `${y}-12-31`), sb.from('store_metrics').select('month,labor').eq('store_id', S.store.id).gte('month', `${y}-01-01`).lte('month', `${y}-12-01`)]);
  const R = r.data || [], X = x.data || [], Mt = mt.data || [], rows = Array.from({ length: 12 }, (_, i) => { const k = `${y}-${String(i + 1).padStart(2, '0')}`, rr = R.filter(z => z.report_date.startsWith(k)), xx = X.filter(z => z.spent_on.startsWith(k)), s = f => rr.reduce((a, z) => a + (+z[f] || 0), 0);
    return [i + 1, s('sales'), s('card'), s('cash'), s('transfer'), xx.reduce((a, z) => a + z.amount, 0), +(Mt.find(z => z.month.startsWith(k))?.labor || 0), rr.length]; });
  S.yearRows = rows; const T = i => rows.reduce((a, z) => a + z[i], 0);
  openSheet(`<h2>${y}년 손익 요약</h2><p class="sub">종합소득세 때 세무사에게 넘길 1년 요약이에요. 인건비는 앱에서 계산한 예상치예요.</p><div class="tbl"><table style="min-width:0"><thead><tr><th>월</th><th>매출</th><th>카드</th><th>지출</th><th>인건비</th><th>마감일</th></tr></thead><tbody>${rows.map(z => `<tr><td>${z[0]}월</td><td class="num">${man(z[1])}</td><td class="num">${man(z[2])}</td><td class="num">${man(z[5])}</td><td class="num">${man(z[6])}</td><td class="num">${z[7]}</td></tr>`).join('')}<tr><th>합계</th><th class="num">${man(T(1))}</th><th class="num">${man(T(2))}</th><th class="num">${man(T(5))}</th><th class="num">${man(T(6))}</th><th class="num">${T(7)}</th></tr></tbody></table></div><button class="btn pri full" data-act="year-csv">엑셀(CSV)로 받기</button>`);
}
function salesExtra() {
  const c = carryCash();
  return `${missCard()}${kpiCard()}${ledgerQuick('deposit')}${vatChk()}${isOwner() ? `<div class="card lbud"><div><b>${S.y}년 손익 요약표</b><small>세무사에게 넘길 1년 요약 · 엑셀</small></div><button class="btn sm" data-act="year">보기</button></div>` : ''}${c && !S.open ? `<p class="note">시작 시재는 ${+c.from.slice(5, 7)}/${+c.from.slice(8)} 마감 금고 ₩${E.won(c.v + c.dep)}${c.dep ? ` − 은행 입금 ₩${E.won(c.dep)}` : ''}에서 이어 왔어요.</p>` : ''}`;
}
function ledgerQuick(k) { const L = itemsOf(k).slice(0, 3); return isMgr() ? `<div class="card"><div class="row between"><h3 style="margin:0">${IK[k][0]} <small>카드 입금 대조 · 금고→은행</small></h3><span class="row"><button class="btn sm" data-act="ledgo" data-v="${k}">전체</button><button class="btn sm pri" data-act="it-new" data-v="${k}">+ 기록</button></span></div>${L.map(itemLine).join('')}</div>` : ''; }
// 한국어 숫자 읽기: "백이십만 삼천 원" → 1203000
function koNum(t) {
  t = String(t).replace(/[,\s원]/g, ''); if (/^\d+$/.test(t)) return +t;
  const D = { 영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 }, U = { 십: 10, 백: 100, 천: 1000 }, B = { 만: 1e4, 억: 1e8 };
  let tot = 0, sec = 0, num = null, dig = '';
  for (const ch of t) { if (/\d/.test(ch)) { dig += ch; continue; } if (dig) { num = +dig; dig = ''; }
    if (ch in D) num = D[ch]; else if (ch in U) { sec += (num ?? 1) * U[ch]; num = null; } else if (ch in B) { tot += (sec + (num ?? 0) || 1) * B[ch]; sec = 0; num = null; } }
  if (dig) num = +dig; return tot + sec + (num ?? 0);
}
function voiceIn(name) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return toast('이 폰 브라우저는 음성 입력을 지원하지 않아요');
  const r = new R(); r.lang = 'ko-KR'; r.onresult = e => { const t = e.results[0][0].transcript, n = koNum(t.replace(/^.*?(매출|카드|이체)/, '')), el = $(`#report-form [name=${name}]`); if (!n || !el) return toast(`"${t}" — 숫자를 못 알아들었어요`); el.value = n; el.dispatchEvent(new Event('input', { bubbles: true })); closeCalc(); toast(`₩${E.won(n)} 넣었어요`); };
  r.onerror = () => toast('마이크를 쓸 수 없어요. 권한을 확인해 주세요'); r.start(); toast('말해 주세요: "백이십만 원"');
}
// ===== B 근무 =====
const isNight = t => E.splitMinutes(t5(t.s), t5(t.e), night()).night >= 120; // 매장 야간 시간대(기본 22~06시)에 2시간 이상
function nightStreak() {
  const y = S.y, m = S.m, D = E.daysIn(y, m), L = [];
  S.members.filter(p => p.role !== 'owner').forEach(p => { let run = 0; for (let i = 1; i <= D; i++) { const t = E.shiftOn(p.id, y, m, i, S.tpl, S.ov); run = t && isNight(t) ? run + 1 : 0; if (run === 3) L.push([p.nick, i]); } });
  return L.length ? `<details class="card warnc"><summary><b>🌙 야간 3일 연속</b> <small class="mut">${whoDays(L)}번 · 눌러서 보기</small></summary><small class="mut">(야간 ${night().join('~')} 2시간 이상)</small><div class="sktags" style="margin-top:6px">${L.map(([n, d]) => `<i>${esc(n)} · ${m}/${d - 2}~${m}/${d}</i>`).join('')}</div><small class="mut">밤샘 근무가 이어지면 실수·결근이 늘어요. 사이에 낮 근무나 휴무를 끼워 주세요</small></details>` : '';
}
function heatCard() {
  const staff = S.members.filter(p => p.role !== 'owner'), H = Array.from({ length: 7 }, () => Array(24).fill(0)), N = Array(7).fill(0), D = E.daysIn(S.y, S.m);
  for (let i = 1; i <= D; i++) { const w = E.wdOf(S.y, S.m, i); N[w]++; staff.forEach(p => { const t = E.shiftOn(p.id, S.y, S.m, i, S.tpl, S.ov); if (!t) return; let a = E.toMin(t5(t.s)), b = E.toMin(t5(t.e)); if (b <= a) b += 1440; for (let h = Math.floor(a / 60); h < Math.ceil(b / 60); h++) H[(w + Math.floor(h / 24)) % 7][h % 24] += (Math.min(b, h * 60 + 60) - Math.max(a, h * 60)) / 60; }); }
  const hrs = [...Array(24).keys()].map(h => (h + 12) % 24).filter(h => H.some(r => r[h])); if (!hrs.length) return '';
  const need = S.store.need_by_wd || [], avg = (w, h) => H[w][h] / (N[w] || 1);
  return `<div class="card"><h3>요일 × 시간 인원 <small>${S.m}월 평균 · 빨강 = 적정 인원보다 적음</small></h3><div class="tbl"><table class="heat"><thead><tr><th></th>${hrs.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${E.WD.map((w, i) => `<tr><th>${w}</th>${hrs.map(h => { const v = avg(i, h), nd = +need[i] || 0; return `<td class="${!v ? '' : nd && v < nd ? 'lo' : 'ok'}" style="--a:${Math.min(1, v / Math.max(1, nd || 4))}">${v ? v.toFixed(v % 1 ? 1 : 0) : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}
function weekHours(id, k0) { let h = 0; for (let i = 0; i < 7; i++) { const [y, m, d] = addDay(k0, i).split('-').map(Number), t = E.shiftOn(id, y, m, d, S.tpl, S.ov); if (t) h += Math.max(0, hoursOf(t5(t.s), t5(t.e)) - (t.brk ?? 0) / 60); } return h; }
function edgeCard() {
  const [y, m, d] = TODAY.split('-').map(Number), nx = S.edgeNext, k0 = addDay(TODAY, -E.wdOf(y, m, d) + (nx ? 7 : 0)), L = S.members.filter(p => p.role !== 'owner' && (p.labor_law ?? p.contract === '4대')).map(p => [p, weekHours(p.id, k0)]).filter(([, h]) => h >= 12 && h < 18);
  return `<div class="card"><div class="row between"><h3 style="margin:0">주휴수당 경계 <small>${nx ? '다음' : '이번'} 주 15시간 언저리</small></h3><button class="btn sm" data-act="edge-wk">${nx ? '이번 주' : '다음 주'} 보기</button></div>${L.length ? '' : '<small class="mut">경계에 걸린 직원이 없어요</small>'}${L.map(([p, h]) => `<div class="li"><span>${esc(p.nick)}</span><span class="pill ${h >= 15 ? 'y' : ''}">${h.toFixed(1)}시간 · ${h >= 15 ? '주휴 생김' : `${(15 - h).toFixed(1)}시간 더하면 주휴 생김`}</span></div>`).join('')}<small class="mut">주 15시간 이상이면 주휴수당(하루치)을 줘야 해요</small></div>`;
}
function holCard() {
  const staff = S.members.filter(p => p.role !== 'owner'), D = E.daysIn(S.y, S.m), L = [];
  for (let i = 1; i <= D; i++) { const k = E.ymd(S.y, S.m, i); if (!isHoliday(k)) continue; const on = staff.filter(p => E.shiftOn(p.id, S.y, S.m, i, S.tpl, S.ov)); if (on.length) L.push([k, on]); }
  if (!L.length) return '';
  return `<div class="card"><h3>공휴일 근무 <small>${L.length}일</small></h3>${L.map(([k, on]) => `<div class="li"><span>${+k.slice(5, 7)}/${+k.slice(8)}</span><small>${on.map(p => esc(p.nick)).join(', ')}</small></div>`).join('')}<small class="mut">${staff.length >= 5 ? '상시 5명 이상 매장은 공휴일에 일하면 1.5배(8시간 넘으면 2배) 가산이에요. 급여에 인센티브로 더해 주세요' : '상시 5명 미만이면 공휴일 가산 의무는 없어요 (주면 좋아요)'}</small></div>`;
}
function reqCard() {
  const L = [...itemsOf('early'), ...itemsOf('ot')].filter(x => !x.status), P = itemsOf('pref'); if (!L.length && !P.length) return '';
  return `<div class="card">${L.length ? `<h3>근무 요청 <small>${L.length}건</small></h3>${L.map(x => `<div class="li"><div><b>${esc(nickOf(x.target))} · ${x.kind === 'early' ? '조기 퇴근' : '연장 근무'}</b><small class="mut" style="display:block">${esc(x.data?.date || '')} ${esc(x.data?.time || '')} · ${esc(x.title || '')}</small></div><span class="row"><button class="btn sm pri" data-act="rq-ok" data-v="${x.id}">승인</button><button class="btn sm" data-act="rq-no" data-v="${x.id}">반려</button></span></div>`).join('')}` : ''}
  ${P.length ? `<h3 ${L.length ? 'style="margin-top:12px"' : ''}>직원 선호 시간</h3>${[...new Map(P.map(x => [x.target, x])).values()].map(x => `<div class="li"><b>${esc(nickOf(x.target))}</b><small>${(x.data?.wd || []).map(i => E.WD[i]).join('')} ${esc(x.data?.f || '')}~${esc(x.data?.t || '')} ${esc(x.title || '')}</small></div>`).join('')}` : ''}</div>`;
}
async function logSheet() {
  const { data } = await sb.from('shift_log').select('*').eq('store_id', S.store.id).order('at', { ascending: false }).limit(60), who = id => S.members.find(p => p.user_id === id)?.nick || (id === S.user.id ? '나' : '대표');
  openSheet(`<h2>근무표 변경 이력</h2><p class="sub">최근 60건 · 날짜별 근무를 바꾼 기록</p>${(data || []).map(x => `<div class="li"><div><b>${esc(S.members.find(p => p.id === x.member_id)?.nick || '퇴사자')} ${+x.work_date.slice(5, 7)}/${+x.work_date.slice(8)}</b><small class="mut" style="display:block">${esc(x.what)}</small></div><small>${esc(who(x.by_user))} · ${fmtDT(x.at)}</small></div>`).join('') || '<div class="empty">아직 기록이 없어요 (이번 버전부터 쌓여요)</div>'}`);
}
async function subRate() {
  const ids = S.members.map(p => p.id); if (!ids.length) return; const { data } = await sb.from('shift_offers').select('member_id,status,grp').in('member_id', ids).gte('work_date', addDay(TODAY, -90));
  const by = {}; (data || []).forEach(o => { const b = by[o.member_id] = by[o.member_id] || { n: 0, ok: 0, ans: 0 }; b.n++; if (o.status === 'ok') b.ok++; if (o.status && o.status !== 'wait') b.ans++; });
  S.subStat = by; render();
}
function subRateCard() {
  if (!S.subStat) return `<div class="card lbud"><div><b>대타 응답률</b><small>최근 90일 누가 대타를 잘 받아주는지</small></div><button class="btn sm" data-act="subrate">보기</button></div>`;
  const L = Object.entries(S.subStat).map(([id, b]) => [S.members.find(p => p.id === id)?.nick, b]).filter(([n]) => n).sort((a, b) => b[1].ok - a[1].ok);
  return `<div class="card"><h3>대타 응답률 <small>최근 90일</small></h3>${L.map(([n, b]) => `<div class="cb"><span>${esc(n)}</span><div class="bar"><i style="width:${b.n ? b.ok / b.n * 100 : 0}%"></i></div><b class="num">${b.ok}/${b.n}<small> 수락 · 응답 ${b.n ? Math.round(b.ans / b.n * 100) : 0}%</small></b></div>`).join('') || '<div class="empty">아직 대타 요청 기록이 없어요</div>'}</div>`;
}
function lateCard() {
  const L = S.members.filter(p => p.role !== 'owner').map(p => [p, attOf(p)]).filter(([, a]) => a && a.late >= 3); if (!L.length) return '';
  return `<div class="card warnc"><b>⏰ 이번 달 지각 3번 넘은 직원</b>${L.map(([p, a]) => `<div class="li"><span>${esc(p.nick)}</span><span class="num down">지각 ${a.late} · 조퇴 ${a.early} · 결근 ${a.miss}</span></div>`).join('')}<small class="mut">출퇴근 기록 기준 (10분 넘게 늦으면 지각) · 면담 기록을 남겨 두세요</small></div>`;
}
function leaveFix() {
  const L = []; S.members.filter(p => p.checks?.leave).forEach(p => { for (let i = 1; i <= 120; i++) { const k = addDay(p.checks.leave, i), [y, m, d] = k.split('-').map(Number); if (E.shiftOn(p.id, y, m, d, S.tpl, S.ov)) L.push([p, k]); } });
  return L.length ? `<div class="card warnc"><b>퇴사 예정일 뒤에 잡힌 근무 ${L.length}개</b><small class="mut" style="display:block">${[...new Set(L.map(([p]) => esc(p.nick)))].join(', ')}</small><button class="btn sm pri" data-act="leave-fix">모두 휴무로 바꾸기</button></div>` : '';
}
function schedImg() {
  const [y, m, d] = TODAY.split('-').map(Number), k0 = addDay(TODAY, -E.wdOf(y, m, d)), staff = S.members.filter(p => p.role !== 'owner'), W = 7, cw = 120, nw = 110, rh = 44, top = 90;
  const c = document.createElement('canvas'); c.width = nw + cw * W + 20; c.height = top + rh * (staff.length + 1) + 30; const g = c.getContext('2d'), cs = getComputedStyle(document.body);
  g.fillStyle = '#111417'; g.fillRect(0, 0, c.width, c.height); const ff = getComputedStyle(document.body).fontFamily || 'sans-serif'; g.fillStyle = '#ECEFF1'; g.font = `bold 28px ${ff}`; g.fillText(`${S.store.name} 이번 주 근무표`, 20, 46); g.font = `16px ${ff}`; g.fillStyle = '#8B949C'; g.fillText(`${+k0.slice(5, 7)}/${+k0.slice(8)} ~ ${+addDay(k0, 6).slice(5, 7)}/${+addDay(k0, 6).slice(8)}`, 20, 72);
  for (let i = 0; i < W; i++) { const k = addDay(k0, i); g.fillStyle = k === TODAY ? '#8FE3C4' : '#B3BAC0'; g.font = `bold 16px ${ff}`; g.fillText(`${E.WD[i]} ${+k.slice(8)}`, nw + cw * i + 10, top + 26); }
  staff.forEach((p, r) => { const yy = top + rh * (r + 1); g.fillStyle = r % 2 ? '#171B1F' : '#1D2227'; g.fillRect(10, yy, c.width - 20, rh); g.fillStyle = '#ECEFF1'; g.font = `bold 16px ${ff}`; g.fillText(p.nick.slice(0, 7), 20, yy + 28);
    for (let i = 0; i < W; i++) { const [a, b, e] = addDay(k0, i).split('-').map(Number), t = E.shiftOn(p.id, a, b, e, S.tpl, S.ov); if (!t) continue; g.fillStyle = '#8FE3C4'; g.font = `15px ${ff}`; g.fillText(`${t5(t.s)}–${t5(t.e)}`, nw + cw * i + 10, yy + 28); } });
  void cs; c.toBlob(async b => { const file = new File([b], `근무표_${k0}.png`, { type: 'image/png' }); try { if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: '이번 주 근무표' }); } catch { } const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; a.click(); toast('사진으로 저장했어요. 단톡방에 올려주세요'); });
}
function schedExtra() {
  return `<div class="row" style="gap:6px;flex-wrap:wrap;margin:10px 0"><button class="btn sm" data-act="week-img">📷 이번 주 근무표 사진</button><button class="btn sm" data-act="shift-log">변경 이력</button></div>${reqCard()}${leaveFix()}${nightStreak()}${edgeCard()}${holCard()}${heatCard()}${subRateCard()}`;
}
function icsOf(me) {
  const L = [], st = S.store?.name || '+EV', z = (k, t) => k.replace(/-/g, '') + 'T' + t5(t).replace(':', '') + '00';
  for (let i = -3; i <= 45; i++) { const k = addDay(TODAY, i), [y, m, d] = k.split('-').map(Number), t = E.shiftOn(me.id, y, m, d, S.tpl, S.ov); if (!t) continue; const end = E.toMin(t5(t.e)) <= E.toMin(t5(t.s)) ? addDay(k, 1) : k;
    L.push(`BEGIN:VEVENT\r\nUID:${me.id}-${k}@plusevapp.kr\r\nDTSTAMP:${z(TODAY, '00:00')}\r\nDTSTART;TZID=Asia/Seoul:${z(k, t.s)}\r\nDTEND;TZID=Asia/Seoul:${z(end, t.e)}\r\nSUMMARY:${st} 근무\r\nEND:VEVENT`); }
  const b = new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//plusev//ko\r\nBEGIN:VTIMEZONE\r\nTZID:Asia/Seoul\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0900\r\nTZOFFSETTO:+0900\r\nTZNAME:KST\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n${L.join('\r\n')}\r\nEND:VCALENDAR`], { type: 'text/calendar' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'my-shifts.ics'; a.click(); toast(`근무 ${L.length}개를 캘린더 파일로 받았어요. 열면 폰 캘린더에 들어가요`);
}
// ===== C 급여 =====
function rateCard() {
  const W = S.members.filter(p => p.contract === '4대' && p.role !== 'owner'); if (!W.length) return '';
  const f10 = n => Math.floor(n / 10) * 10, rows = W.map(p => { const g = payOf(p).fullGross, hp = f10(g * .03595); return { p, g, np: f10(g * .0475), hp, lt: f10(hp * .1314), ei: f10(g * .009), eiB: f10(g * .0115) }; }), T = k => rows.reduce((a, r) => a + r[k], 0);
  return `<details class="card more"><summary><b>4대보험 상세 <small class="mut">${S.m}월 예상 · ${W.length}명</small></b></summary><div class="tbl"><table style="min-width:0"><thead><tr><th>항목</th><th>근로자</th><th>사업주</th></tr></thead><tbody>
    <tr><td>국민연금 4.75%</td><td class="num">₩${E.won(T('np'))}</td><td class="num">₩${E.won(T('np'))}</td></tr><tr><td>건강보험 3.595%</td><td class="num">₩${E.won(T('hp'))}</td><td class="num">₩${E.won(T('hp'))}</td></tr>
    <tr><td>장기요양 (건보의 13.14%)</td><td class="num">₩${E.won(T('lt'))}</td><td class="num">₩${E.won(T('lt'))}</td></tr><tr><td>고용보험 0.9% · 1.15%</td><td class="num">₩${E.won(T('ei'))}</td><td class="num">₩${E.won(T('eiB'))}</td></tr>
    <tr><td>산재보험 <button class="btn sm" data-act="sanjae">${S.store.equip?.sanjae ? S.store.equip.sanjae + '%' : '요율 넣기'}</button></td><td class="num">-</td><td class="num">${S.store.equip?.sanjae ? '₩' + E.won(Math.floor(rows.reduce((a, r) => a + r.g, 0) * S.store.equip.sanjae / 1000) * 10) : '<span class="mut">업종별 고지</span>'}</td></tr><tr><th>합계</th><th class="num">₩${E.won(T('np') + T('hp') + T('lt') + T('ei'))}</th><th class="num">₩${E.won(T('np') + T('hp') + T('lt') + T('eiB'))}+산재</th></tr></tbody></table></div>
    ${rows.map(r => `<div class="li"><span>${esc(r.p.nick)} <small class="mut">세전 ₩${man(r.g)}</small>${duru(r.g) ? ' <span class="pill g">두루누리 대상 가능</span>' : ''}</span><span class="num">근로자 ₩${E.won(r.np + r.hp + r.lt + r.ei)} · 사업주 ₩${E.won(r.np + r.hp + r.lt + r.eiB)}</span></div>`).join('')}<small class="mut">${TODAY.slice(0, 4)}년 요율 · 두루누리: 10명 미만 매장 · 월 보수 270만 원 미만 신규 가입자는 국민연금·고용보험 80% 지원 (최대 36개월, 근로복지공단 신청) · 실제 고지액은 보수월액에 따라 달라요</small></details>`;
}
function allowCard() {
  const ck = `${S.y}-${S.m}-${S.ov.length}-${S.tpl.length}-${S.members.length}`; if (S._allow?.k === ck) return S._allow.h;
  const h = allowCard0(); S._allow = { k: ck, h }; return h;
}
function allowCard0() {
  const staff = S.members.filter(p => p.role !== 'owner'); if (!staff.length) return '';
  const M = Array.from({ length: 6 }, (_, i) => { const t = new Date(S.y, S.m - 6 + i, 1); return [t.getFullYear(), t.getMonth() + 1]; });
  const rows = staff.map(p => [p, M.map(([y, m]) => { const r = E.payroll(p, y, m, S.tpl, S.ov, 0, TODAY, night()); return r.np + r.otp; })]).filter(([, v]) => v.some(Boolean)), mx = Math.max(1, ...rows.flatMap(([, v]) => v));
  return rows.length ? `<details class="card more"><summary><b>야간·연장 수당 추이 <small class="mut">최근 6개월</small></b></summary>${rows.map(([p, v]) => `<div class="li"><span>${esc(p.nick)}</span><span class="spark">${v.map((x, i) => `<i title="${M[i][1]}월 ₩${E.won(x)}" style="height:${Math.max(2, x / mx * 28)}px"></i>`).join('')}</span><b class="num">₩${man(v[5])}</b></div>`).join('')}<small class="mut">막대 = 월별 야간+연장 수당 · 갑자기 늘면 스케줄을 확인하세요</small></details>` : '';
}
async function yearPaySheet() {
  const y = S.y, ids = S.members.map(p => p.id), { data } = await sb.from('shift_overrides').select('*').in('member_id', ids).gte('work_date', `${y}-01-01`).lte('work_date', `${y}-12-31`), ov = data || [];
  const I = (await sb.from('incentives').select('member_id,amount,month').in('member_id', ids).gte('month', `${y}-01-01`).lte('month', `${y}-12-01`)).data || [];
  const rows = S.members.filter(p => p.role !== 'owner').map(p => { let g = 0, dd = 0; for (let m = 1; m <= 12; m++) { if (`${y}-${String(m).padStart(2, '0')}` > TODAY.slice(0, 7)) break; const inc = I.filter(x => x.member_id === p.id && x.month.startsWith(`${y}-${String(m).padStart(2, '0')}`)).reduce((a, x) => a + x.amount, 0), r = E.payroll(p, y, m, S.tpl, ov, inc, TODAY, night()); g += r.gross; dd += r.ded; } return [p.nick, p.real_name || '', p.contract, g, dd, g - dd]; });
  S.yearPay = rows;
  openSheet(`<h2>${y}년 근로소득 요약</h2><p class="sub">연말정산·지급명세서용 직원별 1년 합계 (앱 계산 기준, 오늘까지)</p><div class="tbl"><table style="min-width:0"><thead><tr><th>직원</th><th>계약</th><th>지급</th><th>공제</th><th>실지급</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[2])}</td><td class="num">${man(r[3])}</td><td class="num">${man(r[4])}</td><td class="num">${man(r[5])}</td></tr>`).join('')}</tbody></table></div><button class="btn pri full" data-act="yearpay-csv">엑셀(CSV)로 받기</button><p class="note">날짜별 근무(근무표에서 바꾼 날)는 정확해요. 매주 기본 근무를 중간에 바꾼 직원은 지금 기본 근무로 계산돼요 — 실제 신고는 홈택스 지급명세서·세무사 자료와 맞춰 보세요.</p>`);
}
function payExtra() {
  const unpaid = S.members.filter(p => p.role !== 'owner' && !markOf(p.id)?.paid_at && payOf(p).net > 0);
  return `<div class="row" style="gap:6px;flex-wrap:wrap;margin:10px 0">${unpaid.length && isOwner() ? `<button class="btn sm pri" data-act="paid-all">이체 끝 · ${unpaid.length}명 한 번에 지급 완료</button>` : ''}<button class="btn sm" data-act="yearpay">${S.y}년 근로소득 요약</button>${S.stores?.length > 1 && isOwner() ? '<button class="btn sm" data-act="allpay">전 매장 급여 대장</button>' : ''}</div>${(S.inc || []).filter(i => i.amount).map(i => `<div class="li"><span>${esc(nickOf(i.member_id))} 인센티브 ₩${E.won(i.amount)} <small class="mut">${esc(i.reason || '이유 없음')}</small></span><button class="btn sm" data-act="inc-why" data-m="${i.member_id}">이유</button></div>`).join('')}${rateCard()}${allowCard()}`;
}
// 직원에게 보이는 계산 근거: 기본·야간·연장·주휴 식
function payWhy(me) {
  const r = payOf(me), rt = +me.hourly_rate || 0, sh = r.shifts.filter(x => x.done), h = sh.reduce((a, x) => a + x.hours, 0), nh = sh.reduce((a, x) => a + x.nightH, 0), ot = sh.reduce((a, x) => a + x.ot, 0);
  const inc = (S.inc || []).filter(i => i.member_id === me.id);
  return `<details class="card more"><summary><b>내 급여 계산 근거</b> <small class="mut">어제까지</small></summary>
    <div class="li"><span>기본급</span><span class="num">${h.toFixed(1)}시간 × ₩${E.won(rt)} = ₩${E.won(r.base)}</span></div>
    ${me.night_pay ? `<div class="li"><span>야간수당</span><span class="num">${nh.toFixed(1)}시간 × ₩${E.won(rt)} × 0.5 = ₩${E.won(r.np)}</span></div>` : ''}
    ${ot ? `<div class="li"><span>연장수당</span><span class="num">${ot.toFixed(1)}시간 × ₩${E.won(rt)} × 0.5 = ₩${E.won(r.otp)}</span></div>` : ''}
    <div class="li"><span>주휴수당</span><span class="num">${r.juhu ? `주 15시간 넘은 주마다 (주 시간 ÷ 40 × 8) × ₩${E.won(rt)} = ₩${E.won(r.juhu)}` : '주 15시간 넘은 주가 없어요'}</span></div>
    ${inc.map(i => `<div class="li"><span>인센티브</span><span class="num">₩${E.won(i.amount)}${i.memo || i.reason || i.note ? ` · ${esc(i.memo || i.reason || i.note)}` : ''}</span></div>`).join('')}
    <div class="li"><span>공제</span><span class="num">${me.contract === '4대' ? '4대보험 근로자분 (연금 4.75% · 건강 3.595% · 요양 · 고용 0.9%)' : '3.3% (소득세 3% + 지방세 0.3%)'} = ₩${E.won(r.ded)}</span></div></details>`;
}
// ===== D 운영·직원 =====
const GRADE = ['수습', '정규', '시니어'];
function gradeOf(p) { const g = p.checks?.grade || (p.checks?.prob ? '수습' : '정규'), mon = p.joined_on ? -dDay(p.joined_on) / 30.4 : 0, edu = (p.checks?.edu || []).length >= EDU.length, pr = (S.praise || []).filter(n => n.target === p.id).length;
  const R = gradeRule(), up = g === '수습' ? mon >= R.m1 && edu : g === '정규' ? mon >= R.m2 && pr >= R.pr : false; return { g, up, rule: g === '수습' ? `${R.m1}개월 + 교육 완료 → 정규` : g === '정규' ? `${R.m2}개월 + 칭찬 ${R.pr}번 → 시니어` : '최고 단계' }; }
function praiseRank() {
  const by = {}; (S.praise || []).forEach(n => { if (n.target) by[n.target] = (by[n.target] || 0) + 1; }); const L = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5); if (!L.length) return '';
  return `<div class="card"><h3>이번 달 칭찬 랭킹 👏</h3>${L.map(([id, n], i) => `<div class="li"><span>${['🥇', '🥈', '🥉', '4', '5'][i]} ${esc(nickOf(id))}</span><b class="num">${n}번</b></div>`).join('')}</div>`;
}
function hrCard() {
  if (!isOwner()) return ''; const staff = S.members.filter(p => p.role !== 'owner'); if (!staff.length) return '';
  const T = itemsOf('talk'), W = itemsOf('warn');
  return `<details class="card more"><summary><b>등급 · 면담 · 경고 <small class="mut">대표만 봐요</small></b></summary><button class="btn sm" data-act="grade-set" style="margin:6px 0">승급 조건 바꾸기</button>${staff.map(p => { const G = gradeOf(p), t = T.filter(x => x.target === p.id), w = W.filter(x => x.target === p.id);
    return `<div class="li"><div style="min-width:0"><b>${esc(p.nick)}</b> <span class="pill ${G.g === '시니어' ? 'g' : G.g === '수습' ? 'y' : ''}">${G.g}</span>${G.up ? ' <span class="pill g">승급 가능</span>' : ''}<small class="mut" style="display:block">${G.rule} · 면담 ${t.length} · 경고 ${w.length}${t[0] ? ` · 최근 면담 ${esc(t[0].data?.date || '')}` : ''}</small></div><span class="row" style="gap:4px"><select data-act="grade" data-m="${p.id}" aria-label="등급">${GRADE.map(g => `<option ${g === G.g ? 'selected' : ''}>${g}</option>`).join('')}</select><button class="btn sm" data-act="it-new" data-v="talk" data-m="${p.id}">면담</button><button class="btn sm" data-act="it-new" data-v="warn" data-m="${p.id}">경고</button></span></div>`; }).join('')}
    ${[...T, ...W].slice(0, 10).map(itemLine).join('')}</details>`;
}
function dispatchCard() {
  if (!isOwner() || (S.stores || []).length < 2) return ''; const others = S.stores.filter(s => s.id !== S.store.id), staff = S.members.filter(p => p.role !== 'owner' && p.user_id);
  return staff.length ? `<details class="card more"><summary><b>다른 매장에 직원 보내기 <small class="mut">파견</small></b></summary><p class="note" style="margin-top:0">보내면 그 매장 직원 목록에 '대타'로 들어가요. 시급·계약은 그대로 복사돼요.</p>${staff.map(p => `<div class="li"><span>${esc(p.nick)}</span><span class="row"><select id="dsp-${p.id}" aria-label="보낼 매장">${others.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><input id="dsr-${p.id}" type="number" step="100" inputmode="numeric" placeholder="시급 ${p.hourly_rate || ''}" aria-label="그 매장 시급" style="width:96px"><button class="btn sm pri" data-act="dispatch" data-m="${p.id}">보내기</button></span></div>`).join('')}</details>` : '';
}
function dispBack() { const L = S.members.filter(p => p.checks?.disp); return L.length && isOwner() ? `<div class="card"><h3>파견 온 직원 <small>${L.length}명</small></h3>${L.map(p => `<div class="li"><span>${esc(p.nick)} <small class="mut">${esc(S.stores?.find(s => s.id === p.checks.disp)?.name || '다른 매장')}에서</small></span><button class="btn sm" data-act="disp-back" data-m="${p.id}">파견 끝내기</button></div>`).join('')}</div>` : ''; }
function staffExtra() { return `${lateCard()}${praiseRank()}${hrCard()}${dispatchCard()}${dispBack()}`; }
// 마감 사진: store-media/{store}/close/{날짜}-{시각}.jpg
async function photoUp(file, kind, target) {
  const st = itStore(), path = `${st}/${kind}/${kind === 'staff' ? target : bizDay() + '-' + Date.now()}.jpg`;
  const { error } = await sb.storage.from('store-media').upload(path, await shrink(file), { contentType: 'image/jpeg', upsert: true }); if (error) return toast('사진을 올리지 못했어요');
  if (kind === 'staff') { const p = S.members.find(x => x.id === target); const checks = { ...(p.checks || {}), photo: path }; await q(sb.from('members').update({ checks }).eq('id', target)); p.checks = checks; }
  else await q(sb.from('store_items').insert({ store_id: st, kind: 'photo', title: '마감 사진', data: { path, day: bizDay(), by: myNick() } }));
  S.urls = null; await itemsLoad(); await signUrls(); render(); toast('사진을 올렸어요');
}
async function signUrls() {
  const P = [...itemsOf('photo').filter(x => x.data?.day >= addDay(bizDay(), -2)).map(x => x.data.path), ...(S.members || []).map(p => p.checks?.photo).filter(Boolean)]; if (!P.length) { S.urls = {}; return; }
  const { data } = await sb.storage.from('store-media').createSignedUrls(P, 43200); S.urls = Object.fromEntries((data || []).filter(x => x.signedUrl).map(x => [x.path, x.signedUrl]));
}
const faceOf = p => p?.checks?.photo && S.urls?.[p.checks.photo] ? `<img class="face" src="${esc(S.urls[p.checks.photo])}" alt="">` : '';
function photoCard() {
  const L = itemsOf('photo').filter(x => x.data?.day >= addDay(bizDay(), -2));
  return `<div class="card"><div class="row between"><h3 style="margin:0">마감 사진 <small>홀·금고·테이블</small></h3><label class="btn sm pri">📷 올리기<input type="file" accept="image/*" capture="environment" id="close-photo" hidden></label></div>${L.length ? `<div class="phs">${L.map(x => `<figure>${S.urls?.[x.data.path] ? `<img src="${esc(S.urls[x.data.path])}" alt="마감 사진" loading="lazy">` : '<i></i>'}<figcaption>${+x.data.day.slice(5, 7)}/${+x.data.day.slice(8)} ${esc(x.data.by || '')}</figcaption></figure>`).join('')}</div>` : '<small class="mut">마감하고 홀·금고 사진을 남겨 두면 다음 날 확인이 쉬워요</small>'}</div>`;
}
function stockCount() {
  const L = SHOP.filter(p => p.active !== false).map(p => ({ p, s: S.stock.find(s => s.item_id === p.id) })).filter(x => x.s);
  if (!L.length) return toast('재고 관리 중인 품목이 없어요');
  openSheet(`<h2>재고 실사</h2><p class="sub">실제로 센 수량을 넣으세요. 장부(앱 수량)와 다르면 차이가 기록되고, 앱 수량이 센 숫자로 바뀌어요.</p><form class="f" id="count-form">${L.map(({ p, s }) => `<label class="fl">${esc(p.n)} <small class="mut">장부 ${s.qty}</small><input name="c${p.id}" type="number" inputmode="numeric" min="0" value="${s.qty}"></label>`).join('')}<button class="btn pri full">실사 저장</button></form>`);
}
function countCard() {
  const L = itemsOf('count'); if (!isMgr()) return '';
  return `<div class="card"><div class="row between"><div><b>재고 실사</b><small class="mut" style="display:block">${L[0] ? `최근 ${fmtDT(L[0].created_at)} · 차이 ${(L[0].data?.diff || []).length}품목` : '월말에 수량을 세서 장부와 맞춰요'}</small></div><button class="btn sm" data-act="count">세기</button></div>${L.length ? `<details class="more"><summary>지난 실사 ${L.length}번</summary>${L.slice(0, 6).map(x => `<div class="li"><span>${fmtDT(x.created_at)}</span><small>${(x.data?.diff || []).map(([id, a, b]) => `${esc(item(id)?.n || id)} ${a}→${b}`).join(', ') || '차이 없음'}</small></div>`).join('')}</details>` : ''}</div>`;
}
function orderReqCard() {
  const L = itemsOf('order_req').filter(x => !x.status); if (!L.length || !isOwner()) return '';
  return `<div class="card warnc"><b>발주 승인 요청 ${L.length}건</b>${L.map(x => `<div class="li"><div><b>${esc(x.title)}</b><small class="mut" style="display:block">${esc(x.data?.by || '')} · ₩${E.won(x.data?.total)} · ${fmtDT(x.created_at)}</small></div><span class="row"><button class="btn sm pri" data-act="or-ok" data-v="${x.id}">장바구니에 담기</button><button class="btn sm" data-act="rq-no" data-v="${x.id}">반려</button></span></div>`).join('')}</div>`;
}
function sosOrder() {
  const L = S.members.filter(p => p.phone || p.role !== 'staff'), ord = S.store.equip?.sos || [];
  openSheet(`<h2>비상 연락 순서</h2><p class="sub">급할 때 위에서부터 연락해요. 화살표로 순서를 바꾸세요.</p><div id="sos-ord">${[...L].sort((a, b) => ((ord.indexOf(`${a.nick}|${a.phone || ''}`) + 1) || (ord.indexOf(a.nick) + 1) || 99) - ((ord.indexOf(`${b.nick}|${b.phone || ''}`) + 1) || (ord.indexOf(b.nick) + 1) || 99)).map(p => `<div class="li" data-n="${esc(p.nick)}|${esc(p.phone || '')}"><span>${esc(p.nick)} <small class="mut">${p.role === 'owner' ? '대표' : p.role === 'manager' ? '점장' : esc(p.job_role || '')}</small></span><span class="row"><button class="btn sm" data-act="sos-mv" data-v="-1">▲</button><button class="btn sm" data-act="sos-mv" data-v="1">▼</button></span></div>`).join('')}</div><button class="btn pri full" data-act="sos-save">저장</button>`);
}
function opsExtra() {
  return `${S.mode === 'store' ? orderReqCard() : ''}${photoCard()}${ledgerCard()}${S.mode === 'store' ? countCard() : ''}${isOwner() ? '<button class="btn sm" data-act="sos-ord" style="margin:6px 0">비상 연락 순서 정하기</button>' : ''}${praiseRank()}`;
}
// 직원 앱: 선호 시간 · 조기 퇴근/연장 요청 · 신입 첫 주 · 캘린더 · 청소 당번 · 계산 근거
function firstWeek(me) {
  if (!me.joined_on || dDay(me.joined_on) < -7) return ''; const ed = me.checks?.edu || [], man0 = itemsOf('manual').length;
  const T = [['신입 교육 7가지 받기', ed.length >= EDU.length, `${ed.length}/${EDU.length}`], ['매장 매뉴얼 읽기', !!lsGet('ev_fw_man'), man0 ? `${man0}개 · 매장 노트 → 장부` : '아직 없어요'], ['계좌·서류 등록', !!me.bank_acct, '내 정보'], ['비상 연락 확인', !!lsGet('ev_fw_sos'), '🚨 버튼'], ['첫 출근 체크', (S.att || []).some(a => a.kind === 'in'), '출퇴근 탭']];
  return `<div class="card fw"><h3>첫 주 할 일 👋 <small>입사 ${-dDay(me.joined_on) + 1}일째</small></h3>${T.map(([t, ok, s]) => `<div class="li"><span>${ok ? '✅' : '⬜'} ${t}</span><small class="mut">${s}</small></div>`).join('')}</div>`;
}
function workExtra(me) {
  const mine = [...itemsOf('early'), ...itemsOf('ot')].filter(x => x.created_by === S.user.id).slice(0, 3), pref = itemsOf('pref').find(x => x.created_by === S.user.id);
  return `${firstWeek(me)}${itemsOf('clean').length ? `<div class="card"><h3>청소 당번</h3>${cleanToday()}${cleanToday(1)}</div>` : ''}
  <div class="card"><h3>요청 · 선호 시간</h3><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="rq-new" data-v="early">일찍 퇴근해도 될까요?</button><button class="btn sm" data-act="rq-new" data-v="ot">연장 근무 미리 승인</button><button class="btn sm" data-act="pref-new">선호 시간 ${pref ? '바꾸기' : '알리기'}</button><button class="btn sm" data-act="ics">📅 폰 캘린더에 넣기</button></div>
  ${pref ? `<small class="mut">내 선호: ${(pref.data?.wd || []).map(i => E.WD[i]).join('')} ${esc(pref.data?.f || '')}~${esc(pref.data?.t || '')}</small>` : ''}${mine.map(x => `<div class="li"><span>${x.kind === 'early' ? '조기 퇴근' : '연장'} ${esc(x.data?.date || '')} ${esc(x.data?.time || '')}</span><span class="pill ${x.status === 'ok' ? 'g' : x.status === 'no' ? '' : 'y'}">${x.status === 'ok' ? '승인' : x.status === 'no' ? '반려' : '확인 중'}</span></div>`).join('')}</div>${payWhy(me)}`;
}
function rqSheet(k) {
  openSheet(`<h2>${k === 'early' ? '조기 퇴근 요청' : '연장 근무 사전 승인'}</h2><form class="f" id="rq-form" data-k="${k}"><div class="grid2"><label class="fl">날짜<input name="date" type="date" value="${bizDay()}" required></label><label class="fl">${k === 'early' ? '나가고 싶은 시각' : '몇 시까지'}<input name="time" type="time" required></label></div><label class="fl">이유<input name="title" maxlength="60" placeholder="${k === 'early' ? '예: 손님 없음 / 병원' : '예: 토너먼트 늦게 끝남'}"></label><button class="btn pri full">요청 보내기</button></form>`);
}
function prefSheet() {
  const p = itemsOf('pref').find(x => x.created_by === S.user.id)?.data || {};
  openSheet(`<h2>선호 근무 시간</h2><p class="sub">근무표 짤 때 대표님 화면에 보여요. 꼭 맞춰지는 건 아니에요.</p><form class="f" id="pref-form"><div class="days wrap">${E.WD.map((w, i) => `<label><input type="checkbox" name="wd" value="${i}" ${(p.wd || []).includes(i) ? 'checked' : ''}><span>${w}</span></label>`).join('')}</div><div class="grid2"><label class="fl">부터<input name="f" type="time" value="${esc(p.f || '18:00')}"></label><label class="fl">까지<input name="t" type="time" value="${esc(p.t || '02:00')}"></label></div><label class="fl">메모<input name="title" maxlength="60" placeholder="예: 화요일은 수업 있어요"></label><button class="btn pri full">저장</button></form>`);
}
// 인수인계 필수: 마감 무렵(밤 10시~아침 8시) 퇴근이면 인수인계를 남겨야 퇴근 처리
const closingNow = () => { const h = new Date().getHours(); return h >= 22 || h < 8; };
function hoSheet(code) {
  S.pendCode = code;
  openSheet(`<h2>퇴근 전 인수인계</h2><p class="sub">마감조는 인수인계를 남겨야 퇴근돼요. 다음 사람이 바로 봐요.</p><form class="f" id="ho-form"><label class="fl">남길 말<textarea name="body" rows="4" required placeholder="예: 금고 시재 정상 / 3번 셔플러 소리 / 음료 냉장고 콜라 2박스 남음"></textarea></label><button class="btn pri full">남기고 퇴근하기</button></form>`);
}
// ===== E 딜러 =====
const BADGES = [['📘', '입문', r => (S.lessons || []).length >= 1], ['🎓', '교육 수료', r => (r?.edu || 0) >= 1], ['🃏', '첫 근무', r => (r?.done || 0) >= 1], ['💪', '숙련 10회', r => (r?.done || 0) >= 10], ['🏆', '베테랑 50회', r => (r?.done || 0) >= 50], ['🤝', '노쇼 0', r => (r?.done || 0) >= 5 && !r?.noshow]];
function dealerExtra() {
  const p = S.prof || {}, R = S.rep, on = p.now_until && new Date(p.now_until) > Date.now(), T = R?.tags || {}, A = p.alert || {};
  const tm = (S.taxi || []).filter(x => String(x.d).startsWith(TODAY.slice(0, 7))).reduce((a, x) => a + x.a, 0);
  const PF = [['폰 인증', !!p.phone_verified_at], ['경력', +p.career_months > 0], ['사진', !!p.photo_url], ['소개', !!p.bio], ['활동 지역', !!p.area], ['가능 게임', (p.games || []).length > 0], ['딜링 영상', !!p.video_url]], pf = Math.round(PF.filter(x => x[1]).length / PF.length * 100);
  return `${pf < 100 ? `<section class="dv-sec"><div class="card"><div class="row between"><b>프로필 완성도 ${pf}%</b><small class="mut">채울수록 매장이 먼저 봐요</small></div><div class="pbar" style="margin:8px 0"><i style="width:${pf}%;background:var(--brand)"></i></div><small class="mut">빠진 것: ${PF.filter(x => !x[1]).map(x => x[0]).join(' · ')}</small></div></section>` : ''}<section class="dv-sec"><h2>지금 바로 일할 수 있어요</h2><div class="tog"><span><b>${on ? `🙋 켜짐 · ${new Date(p.now_until).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지` : '꺼짐'}</b><small>켜면 긴급 대타가 뜨자마자 알림이 오고, 매장도 나를 먼저 볼 수 있어요</small></span><select data-act="now-h" aria-label="지금 가능 시간">${[[0, '끄기'], [2, '2시간'], [4, '4시간'], [6, '6시간'], [12, '12시간']].map(([h, l]) => `<option value="${h}" ${!on && !h ? 'selected' : ''}>${l}</option>`).join('')}</select></div></section>
  <section class="dv-sec"><h2>배지 · 매장이 남긴 태그</h2><div class="sktags">${BADGES.map(([i, n, f]) => `<i class="${f(R) ? 'on' : ''}">${i} ${n}</i>`).join('')}</div>${Object.keys(T).length ? `<div class="sktags" style="margin-top:6px">${Object.entries(T).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<i class="on">${esc(t)} ${n}</i>`).join('')}</div>` : '<small class="mut">근무 확인 때 매장이 친절·정확·빠름 태그를 남겨요</small>'}</section>
  <section class="dv-sec"><div class="mn-list metools"><button data-act="video">🎬 딜링 영상 링크 <small class="mut">${p.video_url ? '등록됨' : '이력서에 보여요'}</small><i>›</i></button><button data-act="alert-set">🔔 공고 알림 조건 <small class="mut">${A.off ? '꺼짐' : [A.min ? `일당 ₩${man(A.min)} 이상` : '', A.f && A.t ? `${A.f}~${A.t} 시작` : ''].filter(Boolean).join(' · ') || '전체'}</small><i>›</i></button><button data-act="refs">🎁 추천 현황 <small class="mut">내 코드 ${myRef()}</small><i>›</i></button><button data-act="taxi">🚕 교통비 기록 <small class="mut">${S.m || now.getMonth() + 1}월 ₩${E.won(tm)}</small><i>›</i></button><button data-act="refund33">💸 3.3% 환급 받는 법<i>›</i></button></div></section>`;
}
function clashCard() {
  const by = {}; (S.slotDays || []).forEach(x => { const sl = (S.slots || []).find(s => s.slot_id === x.slot_id); if (sl && ['MATCHED', 'WORKING'].includes(sl.status) && x.day >= TODAY) (by[x.day] = by[x.day] || []).push(sl); });
  const L = Object.entries(by).filter(([, v]) => v.length > 1 && v.some((a, i) => v.some((b, j) => i < j && E.toMin(t5(a.start_t)) < E.toMin(t5(b.end_t)) + (b.end_t <= b.start_t ? 1440 : 0) && E.toMin(t5(b.start_t)) < E.toMin(t5(a.end_t)) + (a.end_t <= a.start_t ? 1440 : 0))));
  return L.length ? `<div class="card warnc"><b>⚠️ 시간이 겹치는 근무</b>${L.map(([k, v]) => `<div class="li"><span>${+k.slice(5, 7)}/${+k.slice(8)}</span><small>${v.map(s => `${esc(s.store_name)} ${t5(s.start_t)}–${t5(s.end_t)}`).join(' · ')}</small></div>`).join('')}<small class="mut">한 곳은 미리 매장에 말하고 취소하세요</small></div>` : '';
}
function nowDealersCard() {
  const L = S.nowD || []; if (!L.length) return '';
  return `<div class="card"><h3>🙋 지금 바로 가능한 딜러 <small>${L.length}명</small></h3>${L.slice(0, 8).map(x => `<div class="li"><span><b>${esc(x.name || '딜러')}</b> <small class="mut">${esc(x.area || '')} · 경력 ${x.career_months || 0}개월</small></span><small>${new Date(x.until).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지</small></div>`).join('')}<small class="mut">긴급 대타 공고를 올리면 이 분들께 먼저 알림이 가요</small></div>`;
}
// ===== F 다매장 =====
function kpiRank() {
  const L = S.kpi || []; if (L.length < 2) return '';
  const lr = x => x.sales ? x.labor / x.sales * 100 : null, pct = x => x.staff ? Math.round(x.notice_reads / x.notice_staff * 100) : null, nowT = new Date().toTimeString().slice(0, 5);
  const late = L.filter(x => !x.open_today && x.open_avg && nowT > addMin(x.open_avg, 60) && nowT < '23:59');
  const rk = (k, asc) => [...L].filter(x => x.closes).sort((a, b) => asc ? (a[k] ?? 1e15) - (b[k] ?? 1e15) : (b[k] ?? -1e15) - (a[k] ?? -1e15)).map(x => x.store_id), rn = (R, x) => x.closes ? `${R.indexOf(x.store_id) + 1}위` : '마감 없음';
  const R = { s: rk('sales'), l: [...L].filter(x => x.closes).sort((a, b) => (lr(a) ?? 999) - (lr(b) ?? 999)).map(x => x.store_id), d: rk('diff_abs', true) };
  return `${late.length ? `<div class="card warnc"><b>⏰ 아직 오픈 안 한 매장</b>${late.map(x => `<div class="li"><span>${esc(x.name)}</span><small>평소 ${t5(x.open_avg)} 오픈</small></div>`).join('')}</div>` : ''}
  <div class="card"><div class="row between"><h3 style="margin:0">매장 순위 · 점장 성적 <small>${S.m}월</small></h3><span class="row"><button class="btn sm" data-act="goal-all">목표 한 번에</button><button class="btn sm" data-act="notice-all">전 매장 공지</button></span></div>
  <div class="tbl"><table class="rkt" style="min-width:0"><thead><tr><th>매장 · 점장</th><th>매출</th><th>인건비율</th><th>금고 차액</th><th>마감</th><th>공지 읽음</th></tr></thead><tbody>${L.map(x => `<tr><td><b>${esc(x.name)}</b><small class="mut" style="display:block">${x.mgr ? `점장 ${esc(x.mgr)}${x.mgr.includes('·') ? ` (${x.mgr.split('·').length}명 공동)` : ''}` : '점장 없음'}</small></td><td class="num">₩${man(x.sales)} <small class="mut">${rn(R.s, x)}</small></td><td class="num ${lr(x) > 35 ? 'down' : ''}">${lr(x) == null ? '-' : lr(x).toFixed(0) + '%'} <small class="mut">${rn(R.l, x)}</small></td><td class="num">₩${man(x.diff_abs)}</td><td class="num">${x.closes}/${x.days || x.closes}</td><td class="num">${pct(x) == null ? '-' : pct(x) + '%'}</td></tr>`).join('')}</tbody></table></div>
  <small class="mut">금고 차액 = 이번 달 차액 절댓값 합 (작을수록 좋아요) · 공지 읽음 = 각 매장 최근 공지 3건 평균</small></div>`;
}
const addMin = (t, n) => { const m = E.toMin(t5(t)) + n; return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
async function kpiLoad() { if (!isOwner() || (S.stores || []).length < 2) return; S.kpi = ((await sb.rpc('company_kpi', { p_month: monthRange()[0] })).data || []).map(x => ({ ...x, staff: x.notice_staff })); }
async function allPaySheet() {
  const [f, l] = monthRange(), out = [];
  await Promise.all(S.stores.map(async st => { const M = (await sb.from('members').select('*').eq('store_id', st.id).eq('active', true)).data || [], ids = M.map(p => p.id); if (!ids.length) return;
    const [t, o, i] = await Promise.all([sb.from('shift_templates').select('*').in('member_id', ids), sb.from('shift_overrides').select('*').in('member_id', ids).gte('work_date', f).lte('work_date', l), sb.from('incentives').select('*').in('member_id', ids).eq('month', f)]);
    M.filter(p => p.role !== 'owner').forEach(p => { const r = E.payroll(p, S.y, S.m, t.data || [], o.data || [], (i.data || []).filter(x => x.member_id === p.id).reduce((a, x) => a + x.amount, 0), TODAY, [t5(st.night_start || '22:00'), t5(st.night_end || '06:00')]); out.push([st.name, p.nick, p.real_name || '', p.contract, r.days, Math.round(r.hours), r.gross, r.ded, r.net, p.bank_name || '', p.bank_acct || '']); }); }));
  out.sort((a, b) => a[0].localeCompare(b[0])); S.allPay = out; const T = out.reduce((a, r) => a + r[8], 0);
  openSheet(`<h2>${S.m}월 전 매장 급여 대장</h2><p class="sub">${S.stores.length}개 매장 · ${out.length}명 · 실지급 ₩${E.won(T)} (어제까지)</p><div class="tbl"><table style="min-width:0"><thead><tr><th>매장</th><th>직원</th><th>일</th><th>지급</th><th>실지급</th></tr></thead><tbody>${out.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="num">${r[4]}</td><td class="num">${man(r[6])}</td><td class="num">${man(r[8])}</td></tr>`).join('')}</tbody></table></div><button class="btn pri full" data-act="allpay-csv">엑셀(CSV)로 받기</button>`);
}
function goalAll() {
  const L = S.kpi || S.stores.map(s => ({ store_id: s.id, name: s.name, sales: 0 }));
  openSheet(`<h2>${S.m}월 매장 목표 한 번에</h2><form class="f" id="goalall-form">${L.map(x => `<label class="fl">${esc(x.name)} <small class="mut">지금 ₩${man(x.sales)}</small><input name="g_${x.store_id}" type="number" step="100000" inputmode="numeric" placeholder="목표 매출 (원)"></label>`).join('')}<p class="note">빈칸은 지금 목표 그대로 둬요</p><button class="btn pri full">저장</button></form>`);
}
function reportSheet() {
  const pm = new Date(S.y, S.m - 2, 1), y = pm.getFullYear(), m = pm.getMonth() + 1, M = monthSummary(y, m), [f, l] = monthRange(y, m), R = S.hist.filter(r => r.report_date >= f && r.report_date <= l), best = [...R].sort((a, b) => b.sales - a.sales)[0];
  openSheet(`<div class="mrep"><h2>${S.store.name} ${m}월 리포트</h2><p class="sub">${y}년 ${m}월 · 마감 ${R.length}일</p><div class="evc"><div><small>매출</small><b class="num">₩${man(M.sales)}</b></div><div><small>인건비</small><b class="num">₩${man(M.labor)}</b></div><div><small>남은 돈</small><b class="num ${M.left >= 0 ? 'up' : 'down'}">₩${man(M.left)}</b></div></div>
  ${Object.entries(M.exp).map(([k, v]) => `<div class="li"><span>${CAT[k] || k}</span><span class="num">₩${E.won(v)}</span></div>`).join('')}<div class="li"><span>엔트리</span><span class="num">${R.reduce((a, r) => a + (r.entries || 0), 0)}명</span></div>${best ? `<div class="li"><span>최고 매출일</span><span class="num">${+best.report_date.slice(8)}일 ₩${man(best.sales)}</span></div>` : ''}<div class="li"><span>금고 차액 합</span><span class="num">₩${E.won(R.reduce((a, r) => a + Math.abs(r.cash_diff || 0), 0))}</span></div></div>
  <button class="btn pri full" data-act="print">PDF로 저장 · 인쇄</button><button class="btn full" data-act="rep-copy" style="margin-top:6px">글로 복사 (인쇄창이 안 뜨면)</button>`);
}
// ===== 사용성: 오프라인 마감 · 홈 꾸미기 · 즐겨찾기 · 색약 · 첫 화면 · 단축키 · 기기 목록 · 지난해 =====
const FAVS = [['sales', '마감', 'tab'], ['sched', '스케줄', 'tab'], ['staff', '직원·급여', 'tab'], ['jobs', '구인', 'tab'], ['ops', '매장 노트', 'ops-open'], ['order', '발주', 'sub'], ['qr', '출퇴근 QR', 'sub'], ['daily', '일 매출', 'sub']];
const favs = () => (lsGet('ev_favs') || 'sales,sched,ops').split(',').filter(Boolean);
function favBar() { if (S.mode !== 'store') return ''; const F = FAVS.filter(([k]) => favs().includes(k)); return `<div class="favbar">${F.map(([k, l, t]) => t === 'tab' ? `<button class="fchip" data-tab="${k}">${l}</button>` : t === 'sub' ? `<button class="fchip" data-act="sub" data-v="${k}">${l}</button>` : `<button class="fchip" data-act="${t}">${l}</button>`).join('')}<button class="fchip" data-act="fav-set" aria-label="바로가기 고르기">＋</button><button class="fchip" data-act="home-edit">${S.homeEdit ? '✓ 다 꾸몄어요' : '홈 꾸미기'}</button>${new Date().getDate() <= 7 ? '<button class="fchip" data-act="mrep">지난달 리포트</button>' : ''}</div>`; }
const hideL = () => (lsGet('ev_hide') || '').split('|').filter(Boolean), pinL = () => (lsGet('ev_pin2') || '').split('|').filter(Boolean);
const cardKey = c => (c.querySelector('h3,b')?.firstChild?.textContent || c.querySelector('h3,b')?.textContent || '').replace(/[\d,.₩%()·:/~+−-]|월|일|개|명|건|원|만/g, '').replace(/\s+/g, '').slice(0, 12);
function homeTune() {
  const H = $('.home'); if (!H) return; const hide = hideL(), pins = pinL();
  H.querySelectorAll('.hmain > .card, .hside > .card').forEach(c => { const k = cardKey(c); if (!k) return; c.dataset.ck = k;
    if (pins.includes(k)) c.parentElement.prepend(c);
    if (S.homeEdit) { c.classList.toggle('dim', hide.includes(k)); c.insertAdjacentHTML('beforebegin', `<span class="ced"><button data-act="ced-hide" data-v="${esc(k)}">${hide.includes(k) ? '보이기' : '숨기기'}</button><button data-act="ced-pin" data-v="${esc(k)}">${pins.includes(k) ? '고정 해제' : '맨 위로'}</button></span>`); }
    else if (hide.includes(k)) c.hidden = true; });
}
function after68() {
  document.documentElement.classList.toggle('cvd', lsGet('ev_cvd') === '1');
  if (S.mode === 'store' && S.tab === 'home') { homeTune(); const v = $('#view'); if (v && !v.querySelector('.favbar')) v.querySelector('.home')?.insertAdjacentHTML('afterbegin', favBar()); }
  if (S.mode === 'store' && S.tab === 'sales') { const i = $('#report-form [name=sales]'); if (i && !$('#mic')) i.insertAdjacentHTML('afterend', '<button type="button" id="mic" class="btn sm" data-act="mic" data-v="sales" aria-label="말로 입력">🎤 말로</button>'); }
  if (S.mode === 'hq' && S.tab === 'inq') document.querySelectorAll('form[data-inq]').forEach(f => { if (f.previousElementSibling?.classList.contains('tplrow')) return; const T = S.tpls || []; if (T.length) f.insertAdjacentHTML('beforebegin', `<div class="chips tplrow">${T.map(t => `<button class="fchip" data-act="tpl-use" data-v="${t.id}">${esc(t.t.slice(0, 14))}</button>`).join('')}</div>`); });
}
function devSheet() {
  openSheet(`<h2>로그인한 기기</h2><div id="dev-l"><div class="empty">불러오는 중…</div></div><button class="btn red full" data-act="logout-all">모든 기기에서 로그아웃</button>`);
  sb.from('user_devices').select('*').order('last_at', { ascending: false }).then(({ data }) => { const me = lsGet('ev_vid'), el = $('#dev-l'); if (el) el.innerHTML = (data || []).map(x => `<div class="li"><div><b>${esc(devName(x.ua))}${x.dev === me ? ' <span class="pill g">이 기기</span>' : ''}</b><small class="mut" style="display:block">마지막 사용 ${fmtDT(x.last_at)}</small></div></div>`).join('') || '<div class="empty">기록이 없어요</div>'; });
}
const devName = ua => { ua = ua || ''; const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : '기기'; const br = /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : ''; return `${os} ${br}`.trim(); };
function setSheet() {
  const OPT = { store: [['home', '홈'], ['sales', '매출'], ['sched', '스케줄'], ['staff', '직원']], staff: [['work', '내 근무'], ['attend', '출퇴근'], ['jobs', '구인'], ['me', '내 정보']], dealer: [['jobs', '구인'], ['mywork', '내 근무'], ['wallet', '지갑'], ['me', '내 정보']] }[S.mode] || [], st = lsGet('ev_start_' + S.mode) || (S.mode === 'store' ? lsGet('ev_start') : '') || OPT[0]?.[0];
  openSheet(`<h2>내 화면 설정</h2><div class="fl"><span>앱 열면 첫 화면</span><div class="seg brk">${OPT.map(([k, l]) => `<label><input type="radio" name="st" value="${k}" data-act="start-set" ${st === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
  <label class="tog"><span><b>색약 모드</b><small>빨강·초록 대신 파랑·주황으로 구분</small></span><input type="checkbox" data-act="cvd" ${lsGet('ev_cvd') === '1' ? 'checked' : ''}></label>
  <div class="mn-list"><button data-act="fav-set">⭐ 바로가기 고르기<i>›</i></button><button data-act="devices">📱 로그인한 기기<i>›</i></button><button data-act="lastyear">🗂 지난해 보관함<i>›</i></button><button data-act="keys">⌨️ PC 단축키<i>›</i></button></div>`);
}
const KEYS = [['1~6', '아래 탭 이동'], ['/', '검색'], ['N', '매장 노트 쓰기'], ['M', '마감 화면'], ['Esc', '창 닫기'], ['?', '단축키 보기']];
addEventListener('keydown', e => {
  const t = e.target; if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable || !S.user) return;
  if (e.key === 'Escape') return closeSheet(); if (e.key === '?') return openSheet(`<h2>PC 단축키</h2>${KEYS.map(([k, l]) => `<div class="li"><kbd>${k}</kbd><span>${l}</span></div>`).join('')}`);
  if (/^[1-6]$/.test(e.key)) { const b = document.querySelectorAll('#tabs button')[+e.key - 1]; if (b) { e.preventDefault(); b.click(); } return; }
  if (e.key === '/') { e.preventDefault(); menuSheet(); setTimeout(() => $('#srch')?.focus(), 50); return; }
  if ((e.key === 'n' || e.key === 'N') && (S.mode === 'store' || S.mode === 'staff')) { e.preventDefault(); noteSheet(); }
  if ((e.key === 'm' || e.key === 'M') && S.mode === 'store') { S.tab = 'sales'; render(); }
});
// 오프라인 마감: 끊겼을 때 누르면 기억해 두고 연결되면 자동 저장
addEventListener('online', () => { if (!S.store || !lsGet('ev_pend_' + S.store.id)) return; setTimeout(() => { const go = () => { const f = $('#report-form'); if (!f) return; lsSet('ev_pend_' + S.store.id, ''); f.requestSubmit(); }; if (S.tab !== 'sales') { S.tab = 'sales'; render(); } setTimeout(go, 400); }, 1500); });
// ===== 운영사: 매장 건강도 · 기능 사용 · 딜러 수급 · 이상 출금 · 공지 대상 · 답변 템플릿 =====
const tpls = () => (S.tpls || []).map(t => t.t);
function hqOpsCard() {
  const O = S.hqOps; if (!O) return `<div class="card lbud"><div><b>매장 건강도 · 기능 사용 · 딜러 수급 · 이상 출금</b><small>운영 지표 한 번에</small></div><button class="btn sm pri" data-act="hqops">불러오기</button></div>`;
  const H = O.health || [], risk = H.filter(x => !x.last || dDay(x.last) < -7 || x.n30 < 8), U = Object.entries(O.usage || {}).sort((a, b) => b[1] - a[1]), um = Math.max(1, ...U.map(x => x[1])), SP = O.supply || [];
  return `<div class="card"><h3>매장 건강도 <small>이탈 위험 ${risk.length}곳 · 마감 7일 넘게 없음 또는 30일 8회 미만</small></h3>${risk.slice(0, 15).map(x => `<div class="li"><span>${esc(x.name)} <small class="mut">${esc(x.area || '')} · 직원 ${x.staff}</small></span><span class="pill ${!x.last || dDay(x.last) < -14 ? 'r' : 'y'}">${x.last ? `마지막 마감 ${-dDay(x.last)}일 전` : '마감 없음'} · 30일 ${x.n30}회</span></div>`).join('') || '<div class="empty">위험 매장이 없어요</div>'}</div>
  <div class="card"><h3>기능 사용 <small>최근 30일 이벤트</small></h3>${U.slice(0, 15).map(([k, n]) => `<div class="cb"><span>${esc(EVK[k] || k)}</span><div class="bar"><i style="width:${n / um * 100}%"></i></div><b class="num">${n}</b></div>`).join('') || '<div class="empty">기록 없음</div>'}</div>
  <div class="card"><h3>딜러 수급 <small>지역별 30일 공고 vs 딜러</small></h3>${(() => { const mx = Math.max(1, ...SP.map(x => Math.max(+x.posts, +x.dealers))); return SP.map(x => `<div class="sup"><span>${esc(x.area)}</span><div><i class="p" style="width:${x.posts / mx * 100}%"></i><i class="d" style="width:${x.dealers / mx * 100}%"></i></div><b class="num ${+x.posts > +x.dealers ? 'down' : ''}">${x.posts} / ${x.dealers}</b></div>`).join(''); })()}<small class="mut">위 막대 = 30일 공고 · 아래 막대 = 딜러 · 공고가 더 많으면 딜러 부족</small></div>
  <div class="card ${(O.odd || []).length ? 'warnc' : ''}"><h3>이상 출금 <small>24시간 3회+ · 계좌 여러 개 · 평소의 3배+</small></h3>${(O.odd || []).map(x => `<div class="li"><span>${esc(x.name || '-')}</span><span class="num down">${x.n}회 · ₩${E.won(x.amt)} · 계좌 ${x.banks}개${x.avg60 ? ` · 평소 ₩${man(x.avg60)}` : ''}</span></div>`).join('') || '<div class="empty">이상 없음</div>'}</div>`;
}
function tplCard() { const T = S.tpls || []; return `<div class="card"><div class="row between"><h3 style="margin:0">답변 템플릿 <small>운영사 공용</small></h3><button class="btn sm pri" data-act="tpl-new">+ 추가</button></div>${T.map(t => `<div class="li"><span style="white-space:pre-wrap">${esc(t.t)}</span><button class="btn sm" data-act="tpl-del" data-v="${t.id}" aria-label="지우기">✕</button></div>`).join('') || '<small class="mut">자주 쓰는 답을 저장하면 문의마다 버튼으로 넣을 수 있어요</small>'}</div>`; }
const noticeTgt = `<div class="grid2"><label class="fl">보낼 지역<select name="t_area"><option value="">전체</option>${['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'].map(a => `<option>${a}</option>`).join('')}</select></label><label class="fl">매장 규모<select name="t_size"><option value="">전체</option><option value="big">직원 5명 이상</option><option value="small">5명 미만</option></select></label></div><label class="fl">구·시 <small class="mut">(선택 · 예: 강남구)</small><input name="t_area2" maxlength="20"></label>`;
const noticeOk = t => !t || ((!t.area || (S.store?.area || '').startsWith(t.area)) && (!t.area2 || (S.store?.area || '').includes(t.area2)) && (!t.size || (S.members.filter(p => p.role !== 'owner').length >= 5) === (t.size === 'big')));
// ===== v0.68 화면 연결: 기존 화면 끝에 새 카드 붙이기 =====
{ const o = vSales; vSales = () => o() + salesExtra(); }
{ const o = vSched; vSched = () => { const h = o(); return (S.schedView || 'month') === 'month' && S.members.some(p => p.role !== 'owner') ? h + schedExtra() : h; }; }
{ const o = streakCard; streakCard = () => o() + nightStreak(); }
{ const o = vStaff; vStaff = () => { const h = o(); return (S.staffTab || 'list') === 'list' ? h + staffExtra() : h + payExtra(); }; }
{ const o = vOps; vOps = () => { const h = o(); return S.notes ? h + opsExtra() : h; }; }
{ const o = vWork; vWork = () => { const h = o(); return S.sub === 'ops' ? h : h + workExtra(S.my[S.mi || 0]); }; }
{ const o = vHome; vHome = () => { const h = o(), cur = S.y === now.getFullYear() && S.m === now.getMonth() + 1; return cur ? h.replace('<div class="hmain">', `<div class="hmain">${kpiRank()}${costSurge()}${orderReqCard()}`) : h; }; }
{ const o = vMyWork; vMyWork = () => o().replace('<section class="dv-sec"><h2>내 지원</h2>', `${clashCard()}<section class="dv-sec"><h2>내 지원</h2>`); }
{ const o = vMe; vMe = () => S.mode === 'dealer' ? o().replace('<h2 class="me-lb">프로필</h2>', `${dealerExtra()}<h2 class="me-lb">프로필</h2>`) : o(); }
{ const o = vJobs; vJobs = () => o() + nowDealersCard(); }
{ const o = vHqDash; vHqDash = () => o() + hqOpsCard(); }
{ const o = vHqInq; vHqInq = () => tplCard() + o(); }
{ const o = vHqNotice; vHqNotice = () => o().replace('<button class="btn pri full">', noticeTgt + '<button class="btn pri full">'); }
{ const o = render; render = function () { if (!S.start68 && ['store', 'staff', 'dealer'].includes(S.mode) && S.user) { S.start68 = 1; const st = lsGet('ev_start_' + S.mode) || (S.mode === 'store' ? lsGet('ev_start') : ''); if (st && !/go=/.test(location.search)) S.tab = st; } o(); after68(); }; }
{ const o = loadStore; loadStore = async () => { await o(); const [f, l] = monthRange(); const [, op, pr] = await Promise.all([itemsLoad(), sb.from('day_opens').select('day,opened_at,start_cash').eq('store_id', S.store.id).gte('day', addDay(f, -31)).lte('day', l), sb.from('store_notes').select('id,target,created_at').eq('store_id', S.store.id).eq('kind', 'praise').gte('created_at', f), kpiLoad()]); S.opens = op.data || []; S.praise = pr.data || [];
  if (S.noticeTop) { const t = (await sb.from('notices').select('target').eq('id', S.noticeTop.id).maybeSingle()).data?.target; if (!noticeOk(t)) S.noticeTop = null; }
  if (S.lastStart == null) { const c = carryCash(); if (c) S.lastStart = c.v; } await signUrls(); dev68(); }; }
{ const o = loadStaff; loadStaff = async () => { await o(); await itemsLoad(); dev68(); }; }
{ const o = loadDealer; loadDealer = async () => { await o(); if (S.mode === 'dealer') dev68(); }; }
function dev68() { if (S.devAt || !S.user || location.pathname.includes('/demo')) return; S.devAt = 1; let v = lsGet('ev_vid'); if (!v) { v = Math.random().toString(36).slice(2); lsSet('ev_vid', v); } sb.from('user_devices').upsert({ user_id: S.user.id, dev: v, ua: navigator.userAgent.slice(0, 200), last_at: new Date().toISOString() }).then(() => { }, () => { }); }
document.addEventListener('change', e => { const t = e.target;
  if (t.id === 'close-photo' && t.files[0]) { const fl = t.files[0]; t.value = ''; busy(() => photoUp(fl, 'close')); }
  if (t.dataset?.act === 'grade') busy(async () => { const p = S.members.find(x => x.id === t.dataset.m), checks = { ...(p.checks || {}), grade: t.value, prob: t.value === '수습' }; await q(sb.from('members').update({ checks }).eq('id', p.id)); p.checks = checks; toast(`${p.nick} → ${t.value}`); render(); });
  if (t.id?.startsWith('face-') && t.files[0]) { const fl = t.files[0]; t.value = ''; busy(() => photoUp(fl, 'staff', t.id.slice(5))); }
});
const csvDl = (n, head, rows) => download(n, [head, ...rows]);
// 클릭: true 반환이면 기존 처리 안 함
const A68 = {
  'ask-payinfo': () => busy(async () => { const n = await q(sb.rpc('ask_pay_info', { p_store: S.store.id })); toast(n ? `${n}명에게 요청 알림을 보냈어요` : '오늘 이미 보냈어요 · 내일 다시 보낼 수 있어요'); }),
  'it-new': (b, d) => { itemSheet(d.v); if (d.m) setTimeout(() => { const s = $('#it-form [name=target]'); if (s) s.value = d.m; }, 0); },
  ledf: (b, d) => { S.ledF = d.v; render(); },
  ledgo: (b, d) => { S.ledF = d.v; S.tab = 'more'; S.sub = 'ops'; S.notes = null; render(); scrollTo(0, 0); },
  'it-hide': (b, d) => busy(async () => { const old = S.items.find(i => String(i.id) === d.v)?.status ?? null; await q(sb.from('store_items').update({ status: 'hidden' }).eq('id', d.v)); await itemsLoad(); render(); undoToast('지웠어요', async () => { await q(sb.from('store_items').update({ status: old }).eq('id', d.v)); await itemsLoad(); render(); }); }),
  'it-reset': (b, d) => busy(async () => { const x = S.items.find(i => String(i.id) === d.v); await q(sb.from('store_items').update({ data: { ...x.data, last: TODAY } }).eq('id', d.v)); await itemsLoad(); render(); toast('오늘로 기록했어요'); }),
  'xr-ok': (b, d) => busy(async () => { const x = S.items.find(i => String(i.id) === d.v); await q(sb.from('expenses').insert({ store_id: x.store_id, spent_on: x.data?.date || TODAY, category: x.data?.cat || 'etc', amount: +x.data?.amount || 0, source: 'req' })); await q(sb.from('store_items').update({ status: 'ok' }).eq('id', d.v)); await reload(); toast('승인했어요. 비용에 들어갔어요'); }),
  'xr-no': (b, d) => A68['rq-no'](b, d),
  'rq-ok': (b, d) => busy(async () => { await q(sb.from('store_items').update({ status: 'ok' }).eq('id', d.v)); await itemsLoad(); render(); toast('승인했어요. 직원에게 알림이 가요'); }),
  'rq-no': (b, d) => busy(async () => { await q(sb.from('store_items').update({ status: 'no' }).eq('id', d.v)); await itemsLoad(); render(); toast('반려했어요'); }),
  'or-ok': (b, d) => { const x = S.items.find(i => String(i.id) === d.v); S.cart = Object.fromEntries((x.data?.items || []).map(i => [i.id, i.q])); busy(async () => { await q(sb.from('store_items').update({ status: 'ok' }).eq('id', d.v)); await itemsLoad(); S.tab = 'more'; S.sub = 'order'; render(); toast('장바구니에 담았어요. 확인하고 주문하세요'); }); },
  iquiz: () => quizSheet(),
  vat: (b, d) => busy(async () => { const row = itemsOf('vat').find(x => x.title === d.k), done = new Set(row?.data?.done || []); b.checked ? done.add(+d.i) : done.delete(+d.i); const data = { done: [...done] };
    if (row) await q(sb.from('store_items').update({ data }).eq('id', row.id)); else await q(sb.from('store_items').insert({ store_id: S.store.id, kind: 'vat', title: d.k, data })); await itemsLoad(); render(); }),
  year: () => busy(yearSheet), 'year-csv': () => csvDl(`손익요약_${S.y}.csv`, ['월', '매출', '카드', '현금', '이체', '지출', '인건비(예상)', '마감일수'], S.yearRows || []),
  'fill-day': (b, d) => { const f = $('#report-form'); if (!f) return; f.elements.date.value = d.v; f.elements.date.dispatchEvent(new Event('change', { bubbles: true })); f.scrollIntoView({ behavior: 'smooth' }); setTimeout(() => f.elements.sales?.focus(), 300); toast(`${+d.v.slice(5, 7)}/${+d.v.slice(8)} 마감을 넣어주세요`); },
  mic: (b, d) => voiceIn(d.v),
  'week-img': () => schedImg(), 'shift-log': () => busy(logSheet), subrate: () => busy(subRate),
  'leave-fix': () => busy(async () => { const rows = []; S.members.filter(p => p.checks?.leave).forEach(p => { for (let i = 1; i <= 120; i++) { const k = addDay(p.checks.leave, i), [y, m, dd] = k.split('-').map(Number); if (E.shiftOn(p.id, y, m, dd, S.tpl, S.ov)) rows.push({ member_id: p.id, work_date: k, off: true, start_t: null, end_t: null, break_min: null }); } }); if (rows.length) await q(sb.from('shift_overrides').upsert(rows)); await reload(); toast(`${rows.length}개 근무를 휴무로 바꿨어요`); }),
  ics: () => icsOf(S.my[S.mi || 0]),
  'rq-new': (b, d) => rqSheet(d.v), 'pref-new': () => prefSheet(),
  'paid-all': () => busy(async () => { const L = S.members.filter(p => p.role !== 'owner' && !markOf(p.id)?.paid_at && payOf(p).net > 0); await q(sb.from('pay_marks').upsert(L.map(p => ({ member_id: p.id, month: monFirst(), paid_at: new Date().toISOString() })))); await reload(); toast(`${L.length}명 지급 완료로 표시했어요`); }),
  yearpay: () => busy(yearPaySheet), 'yearpay-csv': () => csvDl(`근로소득_${S.y}.csv`, ['닉네임', '실명', '계약', '지급총액', '공제', '실지급'], S.yearPay || []),
  allpay: () => busy(allPaySheet), 'allpay-csv': () => csvDl(`전매장급여_${S.y}-${S.m}.csv`, ['매장', '닉네임', '실명', '계약', '근무일', '시간', '지급', '공제', '실지급', '은행', '계좌'], S.allPay || []),
  'inc-why': (b, d) => { const r = (S.inc || []).find(i => i.member_id === d.m); openSheet(`<h2>인센티브 이유</h2><p class="sub">직원 명세서에 같이 보여요</p><form class="f" id="incwhy-form" data-m="${d.m}"><input name="reason" maxlength="80" value="${esc(r?.reason || '')}" placeholder="예: 토너먼트 진행 · 매출 목표 달성"><button class="btn pri full">저장</button></form>`); },
  dispatch: (b, d) => busy(async () => { const st = $('#dsp-' + d.m)?.value; await q(sb.rpc('dispatch_member', { p_member: d.m, p_store: st })); toast(`${S.stores.find(s => s.id === st)?.name}에 대타로 등록했어요. 그 매장 스케줄에 넣을 수 있어요`); }),
  count: () => stockCount(),
  'sos-ord': () => sosOrder(),
  'sos-mv': (b, d) => { const li = b.closest('.li'), sib = +d.v < 0 ? li.previousElementSibling : li.nextElementSibling; if (sib) +d.v < 0 ? sib.before(li) : sib.after(li); },
  'sos-save': () => busy(async () => { const sos = [...document.querySelectorAll('#sos-ord .li')].map(x => x.dataset.n), equip = { ...(S.store.equip || {}), sos }; await q(sb.from('stores').update({ equip }).eq('id', S.store.id)); S.store.equip = equip; closeSheet(); toast('비상 연락 순서를 저장했어요'); }),
  face: (b, d) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.id = 'face-' + d.m; i.hidden = true; document.body.appendChild(i); i.click(); },
  'now-on': (b) => busy(async () => { const v = b.checked ? new Date(Date.now() + 6 * 36e5).toISOString() : null; await q(sb.from('profiles').update({ now_until: v }).eq('id', S.user.id)); S.prof.now_until = v; render(); toast(v ? '6시간 동안 "지금 가능"이에요. 긴급 대타가 뜨면 바로 알려드려요' : '껐어요'); }),
  video: () => openSheet(`<h2>딜링 영상 링크</h2><p class="sub">유튜브·인스타 링크. 매장이 이력서에서 봐요.</p><form class="f" id="video-form"><input name="url" type="url" placeholder="https://youtu.be/..." value="${esc(S.prof?.video_url || '')}"><button class="btn pri full">저장</button></form>`),
  'alert-set': () => { const A = S.prof?.alert || {}; openSheet(`<h2>공고 알림 조건</h2><form class="f" id="alert-form"><label class="fl">일당 이 금액 이상만<input name="min" type="number" step="10000" inputmode="numeric" value="${A.min || ''}" placeholder="0 = 전부"></label><div class="grid2"><label class="fl">시작 시각 부터<input name="af" type="time" value="${esc(A.f || '')}"></label><label class="fl">까지<input name="at" type="time" value="${esc(A.t || '')}"></label></div><label class="tog"><span><b>긴급 대타 알림 끄기</b><small>단골 매장 알림은 계속 와요</small></span><input type="checkbox" name="off" ${A.off ? 'checked' : ''}></label><p class="note">비워 두면 프로필의 '가능 시간'을 따라가요 · 지역도 프로필 기준</p><button class="btn pri full">저장</button></form>`); },
  refs: () => busy(async () => { const r = (await sb.rpc('my_refs')).data || { n: 0, worked: 0, list: [] }; openSheet(`<h2>추천 현황</h2><div class="evc"><div><small>가입한 친구</small><b class="num">${r.n}명</b></div><div><small>첫 근무까지</small><b class="num">${r.worked}명</b></div></div><div class="li"><span>내 추천 코드</span><button class="btn sm" data-act="copy" data-v="${myRef()}">${myRef()} 복사</button></div>${(r.list || []).map(x => `<div class="li"><span>${esc(x.name)}</span><small>${new Date(x.at).toLocaleDateString('ko-KR')}</small></div>`).join('')}<p class="note">${PRICING.dealer.refReward ? `친구가 첫 근무를 마치면 ₩${E.won(PRICING.dealer.refReward)} 지급` : '보상 기준이 정해지면 여기와 공지로 알려드려요'}</p>`); }),
  taxi: () => { const T = (() => { try { return JSON.parse(lsGet('ev_taxi') || '[]'); } catch { return []; } })(); openSheet(`<h2>교통비 기록 <small class="mut">이 폰에만 저장</small></h2><form class="f" id="taxi-form"><div class="grid2"><label class="fl">날짜<input name="d" type="date" value="${TODAY}"></label><label class="fl">금액<input name="a" type="number" inputmode="numeric" required></label></div><label class="fl">메모<input name="m" placeholder="예: 강남점 퇴근 택시"></label><button class="btn pri full">기록</button></form>${T.slice(-20).reverse().map(x => `<div class="li"><span>${x.d} ${esc(x.m || '')}</span><span class="num">₩${E.won(x.a)}</span></div>`).join('')}<p class="note">종합소득세 신고 때 경비 자료로 쓸 수 있어요 (영수증은 따로 보관)</p>`); },
  refund33: () => openSheet(`<h2>3.3% 환급 받는 법</h2>${(() => { const ly = String(now.getFullYear() - 1), t = (S.slots || []).filter(s => s.result && (s.done_at || '').startsWith(ly)).reduce((a, s) => a + (s.result.tax || 0), 0); return `<div class="evc"><div><small>${ly}년에 뗀 3.3%</small><b class="num">₩${E.won(t)}</b></div></div><p class="note">이 금액 안에서 돌려받을 수 있어요 (소득·경비에 따라 달라요)</p>`; })()}<div class="li"><b>1</b><span>매년 5월 종합소득세 신고 (홈택스·손택스)</span></div><div class="li"><b>2</b><span>'신고도움 서비스'에서 작년 3.3% 낸 내역 확인</span></div><div class="li"><b>3</b><span>소득이 적으면 단순경비율로 계산돼 낸 세금 일부를 돌려받는 경우가 많아요</span></div><div class="li"><b>4</b><span>환급금은 보통 6월 말쯤 계좌로 들어와요</span></div><p class="note">개인 상황마다 달라요. 정확한 금액은 홈택스나 세무사에게 확인하세요. 앱의 '연간 합계'로 작년 원천세를 볼 수 있어요.</p>`),
  'goal-all': () => goalAll(),
  'notice-all': () => openSheet(`<h2>전 매장 공지</h2><p class="sub">${S.stores.length}개 매장 노트에 공지로 올라가요. 읽음은 매장 순위표에서 봐요.</p><form class="f" id="nall-form"><label class="fl">제목<input name="title" required maxlength="60"></label><label class="fl">내용<textarea name="body" rows="4"></textarea></label><button class="btn pri full">보내기</button></form>`),
  mrep: () => reportSheet(), print: () => { document.body.classList.add('printing'); print(); setTimeout(() => document.body.classList.remove('printing'), 500); },
  'fav-set': () => openSheet(`<h2>바로가기 고르기</h2><div class="chks col">${FAVS.map(([k, l]) => `<label><input type="checkbox" data-act="favk" data-v="${k}" ${favs().includes(k) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`),
  favk: (b, d) => { const s = new Set(favs()); b.checked ? s.add(d.v) : s.delete(d.v); lsSet('ev_favs', [...s].join(',') || ','); render(); },
  'home-edit': () => { S.homeEdit = !S.homeEdit; render(); },
  'ced-hide': (b, d) => { const L = new Set(hideL()); L.has(d.v) ? L.delete(d.v) : L.add(d.v); lsSet('ev_hide', [...L].join('|')); render(); },
  'ced-pin': (b, d) => { let L = pinL(); L = L.includes(d.v) ? L.filter(x => x !== d.v) : [d.v, ...L]; lsSet('ev_pin2', L.join('|')); render(); },
  myset: () => setSheet(), 'start-set': (b) => { lsSet('ev_start_' + S.mode, b.value); toast('다음에 앱을 열면 이 화면부터 보여요'); },
  cvd: (b) => { lsSet('ev_cvd', b.checked ? '1' : ''); render(); }, devices: () => devSheet(),
  keys: () => openSheet(`<h2>PC 단축키</h2>${KEYS.map(([k, l]) => `<div class="li"><kbd>${k}</kbd><span>${l}</span></div>`).join('')}`),
  lastyear: () => { const y = now.getFullYear() - 1; openSheet(`<h2>${y}년 보관함</h2><div class="chips">${Array.from({ length: 12 }, (_, i) => `<button class="fchip" data-act="goym" data-y="${y}" data-m="${i + 1}">${i + 1}월</button>`).join('')}</div><p class="note">고른 달의 손익·급여·스케줄을 볼 수 있어요</p>`); },
  goym: (b, d) => busy(async () => { S.y = +d.y; S.m = +d.m; closeSheet(); await reload(); S.tab = 'home'; render(); }),
  hqops: () => busy(async () => { S.hqOps = (await sb.rpc('hq_ops')).data; render(); }),
  'tpl-new': () => openSheet(`<h2>답변 템플릿</h2><form class="f" id="tpl-form"><textarea name="t" rows="4" required></textarea><button class="btn pri full">저장</button></form>`),
  'tpl-del': (b, d) => { const T = tpls(); T.splice(+d.v, 1); lsSet('ev_tpls', JSON.stringify(T)); render(); },
  'tpl-use': (b, d) => { const i = b.closest('.tplrow')?.nextElementSibling?.querySelector('[name=reply]'); if (i) { i.value = tpls()[+d.v]; i.focus(); } },
  // 근무 완료 확인 뒤 칭찬 태그 남기기
  slot: (b, d) => { if (d.v !== 'ok') return false; busy(async () => { await q(sb.rpc('slot_act', { p_slot: d.s, p_act: 'ok' })); toast('확인했어요. 딜러에게 지급돼요'); await reload(); openSheet(`<h2>딜러 어땠나요?</h2><p class="sub">태그는 딜러 이력서에 모여서 보여요 (선택)</p><form class="f" id="tag-form" data-s="${d.s}"><div class="days wrap">${['친절', '정확', '빠름', '분위기', '시간 약속', '룰 숙지'].map(t => `<label><input type="checkbox" name="tg" value="${t}"><span>${t}</span></label>`).join('')}</div><button class="btn pri full">남기기</button><button type="button" class="btn full" data-act="close">건너뛰기</button></form>`); }); },
  apply: (b, d) => { busy(async () => { track('job_applied'); await q(sb.rpc('apply_job', { p_post: d.p })); await reload(); const j = (S.board || []).find(x => x.id === d.p); openSheet(`<h2>지원했어요 ✓</h2><p class="sub">${esc(j?.store_name || '매장')}에 한마디 남길까요? (선택)</p><form class="f" id="amsg-form" data-p="${d.p}"><input name="msg" maxlength="80" placeholder="예: 토너먼트 딜링 2년, 20시부터 가능해요"><button class="btn pri full">보내기</button><button type="button" class="btn full" data-act="close">괜찮아요</button></form>`); }); }
};
// 폼 제출: 처리했으면 true
const F68 = {
  'it-form': async (f, v) => { const k = f.dataset.k, st = itStore(), data = {}; let title = v.title || null, target = v.target || null, due = v.due || null;
    if (k === 'quiz') { const o = (v.opts || '').split(',').map(s => s.trim()).filter(Boolean); if (o.length < 2) return toast('보기를 2개 이상 넣어주세요'); if (!(+v.ans >= 1 && +v.ans <= o.length)) return toast(`정답 번호는 1~${o.length} 사이로 넣어주세요`); Object.assign(data, { opts: o, ans: +v.ans - 1 }); }
    else if (k === 'recipe') { const bad = (v.ings || '').split(',').map(s => s.trim()).filter(Boolean).find(s => !/^[^:]+:\s*[\d,]+$/.test(s)); if (bad) return toast(`"${bad}" — 재료는 이름:원가 로 넣어주세요 (예: 원두:450, 우유:300)`); } if (k === 'recipe') Object.assign(data, { price: +v.price || 0, ings: (v.ings || '').split(',').map(s => s.split(':').map(z => z.trim())).filter(x => x[0]).map(([n, c]) => [n, +digits(c || '0') || 0]) });
    else ['date', 'type', 'amount', 'qty', 'day', 'cycle', 'last', 'cat'].forEach(n => { if (v[n] != null && v[n] !== '') data[n] = /amount|qty|day|cycle/.test(n) ? +digits(v[n]) || 0 : v[n]; });
    if (k === 'expense_req') data.by = myNick(); if ((k === 'equip' || k === 'deck') && !data.last) data.last = TODAY; if (!data.cycle && (k === 'equip' || k === 'deck')) data.cycle = k === 'deck' ? 14 : 30;
    await q(sb.from('store_items').insert({ store_id: st, kind: k, title, body: v.body || null, data, target, due })); closeSheet(); await itemsLoad(); render(); toast(k === 'expense_req' && !isMgr() ? '올렸어요. 대표님이 확인하면 비용에 들어가요' : '저장했어요'); },
  'iquiz-form': async (f, v) => { const L = itemsOf('quiz'), sc = L.filter((x, i) => +v['q' + i] === x.data?.ans).length; closeSheet(); toast(`${sc}/${L.length} 맞았어요${sc === L.length ? ' 🎉' : ''}`); await q(sb.from('store_items').insert({ store_id: itStore(), kind: 'quiz_res', title: '퀴즈', data: { score: sc, total: L.length, by: myNick() } })); },
  'rq-form': async (f, v) => { const me = S.my[S.mi || 0]; await q(sb.from('store_items').insert({ store_id: me.store_id, kind: f.dataset.k, title: v.title || null, target: me.id, data: { date: v.date, time: v.time } })); closeSheet(); await itemsLoad(); render(); toast('요청했어요. 대표님께 알림이 갔어요'); },
  'pref-form': async (f, v) => { const me = S.my[S.mi || 0], wd = [...f.querySelectorAll('[name=wd]:checked')].map(x => +x.value), old = itemsOf('pref').find(x => x.created_by === S.user.id), row = { title: v.title || null, data: { wd, f: v.f, t: v.t } };
    if (old) await q(sb.from('store_items').update(row).eq('id', old.id)); else await q(sb.from('store_items').insert({ store_id: me.store_id, kind: 'pref', target: me.id, ...row })); closeSheet(); await itemsLoad(); render(); toast('선호 시간을 알렸어요'); },
  'attend-form': async (f, v) => { if (S.att?.[0]?.kind !== 'in' || !closingNow() || S.hoOk) return false; const me = S.my[S.mi || 0], { data } = await sb.from('store_notes').select('id').eq('store_id', me.store_id).eq('kind', 'handover').eq('created_by', S.user.id).gte('created_at', new Date(Date.now() - 12 * 36e5).toISOString()).limit(1); if (data?.length) return false; hoSheet(v.code.trim()); },
  'ho-form': async (f, v) => { const me = S.my[S.mi || 0]; await q(sb.from('store_notes').insert({ store_id: me.store_id, kind: 'handover', body: v.body, data: { by: me.nick }, created_by: S.user.id })); closeSheet(); const k = await q(attendGeo(S.pendCode)); toast(k === 'out' ? '인수인계 남기고 퇴근했어요. 수고하셨어요' : '인수인계를 남겼어요'); await reload(); },
  'count-form': async (f, v) => { const diff = []; for (const s of S.stock) { const n = v['c' + s.item_id]; if (n == null || n === '' || +n === +s.qty) continue; diff.push([s.item_id, +s.qty, +n]); await q(sb.from('stock').update({ qty: +n }).match({ store_id: S.store.id, item_id: s.item_id })); }
    await q(sb.from('store_items').insert({ store_id: S.store.id, kind: 'count', title: `${TODAY} 실사`, data: { diff } })); closeSheet(); await reload(); toast(diff.length ? `${diff.length}품목 차이를 기록하고 수량을 맞췄어요` : '장부와 딱 맞아요 👍'); },
  'incwhy-form': async (f, v) => { await q(sb.from('incentives').update({ reason: v.reason || null }).match({ member_id: f.dataset.m, month: monFirst() })); closeSheet(); await reload(); toast('이유를 저장했어요. 직원 명세서에 보여요'); },
  'video-form': async (f, v) => { const u = (v.url || '').trim(); if (u && !/^https:\/\//.test(u)) return toast('https:// 로 시작하는 링크를 넣어주세요'); await q(sb.from('profiles').update({ video_url: u || null }).eq('id', S.user.id)); S.prof.video_url = u || null; closeSheet(); render(); toast('저장했어요'); },
  'alert-form': async (f, v) => { const alert = { min: +v.min || 0, off: !!v.off }; await q(sb.from('profiles').update({ alert }).eq('id', S.user.id)); S.prof.alert = alert; closeSheet(); render(); toast('알림 조건을 저장했어요'); },
  'taxi-form': async (f, v) => { const T = (() => { try { return JSON.parse(lsGet('ev_taxi') || '[]'); } catch { return []; } })(); T.push({ d: v.d, a: +v.a || 0, m: v.m || '' }); lsSet('ev_taxi', JSON.stringify(T.slice(-300))); closeSheet(); render(); toast('기록했어요'); },
  'tag-form': async (f, v) => { const tags = [...f.querySelectorAll('[name=tg]:checked')].map(x => x.value); if (tags.length) await q(sb.rpc('tag_dealer', { p_slot: f.dataset.s, p_tags: tags })); closeSheet(); toast('고마워요. 딜러에게 힘이 돼요'); },
  'amsg-form': async (f, v) => { if ((v.msg || '').trim()) await q(sb.rpc('app_msg', { p_post: f.dataset.p, p_msg: v.msg })); closeSheet(); toast('매장에 전했어요. 채용되면 알림이 와요'); },
  'goalall-form': async (f, v) => { const rows = Object.entries(v).filter(([k, x]) => k.startsWith('g_') && +x).map(([k, x]) => ({ store_id: k.slice(2), month: monthRange()[0], goal: +x })); if (rows.length) await q(sb.from('store_goals').upsert(rows)); closeSheet(); await reload(); toast(`${rows.length}개 매장 목표를 정했어요`); },
  'nall-form': async (f, v) => { await q(sb.from('store_notes').insert(S.stores.map(s => ({ store_id: s.id, kind: 'notice', title: v.title, body: v.body || null, data: { by: '대표' }, created_by: S.user.id })))); closeSheet(); await reload(); toast(`${S.stores.length}개 매장에 공지했어요`); },
  'notice-form': async (f, v) => { const target = v.t_area || v.t_size || (v.t_area2 || '').trim() ? { area: v.t_area || '', size: v.t_size || '', area2: (v.t_area2 || '').trim() } : null; await q(sb.from('notices').insert({ title: v.title.trim(), body: v.body.trim(), target })); S.notices = await q(sb.from('notices').select('*').order('created_at', { ascending: false }).limit(30)); render(); toast(target ? `${[v.t_area, v.t_size === 'big' ? '5명 이상' : v.t_size ? '5명 미만' : ''].filter(Boolean).join(' · ')} 매장에 공지를 보냈어요` : '모든 매장에 공지를 보냈어요'); },
  'tpl-form': async (f, v) => { const T = tpls(); T.push(v.t.trim()); lsSet('ev_tpls', JSON.stringify(T)); closeSheet(); render(); }
};

// ===== v0.69 점검 100 고침 =====
// 브라우저 기본 입력창(prompt) 대신 앱 안 입력창
function askText(title, ph, val = '') {
  return new Promise(res => { openSheet(`<h2>${esc(title)}</h2><div class="f"><input id="ask-in" placeholder="${esc(ph || '')}" value="${esc(val)}"><button type="button" class="btn pri full" id="ask-ok">확인</button><button type="button" class="btn full" id="ask-no">취소</button></div>`);
    const i = $('#ask-in'); setTimeout(() => i?.focus(), 50); $('#ask-ok').onclick = () => { const v = i.value.trim(); closeSheet(); res(v || null); }; $('#ask-no').onclick = () => { closeSheet(); res(null); }; });
}
// 공휴일 가산 (상시 5명 이상 · 연장·주휴 적용 직원): 8시간까지 0.5배, 넘는 시간 1.0배 더
function holPay(p, y = S.y, m = S.m) {
  if (!(p.labor_law ?? p.contract === '4대') || !S.store?.equip?.five) return { done: 0, full: 0 };
  let done = 0, full = 0; const rt = +p.hourly_rate || 0;
  E.shiftsOf(p, y, m, S.tpl, S.ov, TODAY, night()).forEach(x => { if (!isHoliday(x.date)) return; const v = Math.round(Math.min(8, x.hours) * rt * 0.5 + Math.max(0, x.hours - 8) * rt); full += v; if (x.done) done += v; });
  return { done, full };
}
// 조기 퇴근·연장 승인 → 그날 근무표 끝나는 시간을 바꿔 급여에 바로 반영
async function applyReq(x) {
  const dd = x.data?.date, tm = x.data?.time; if (!dd || !tm || !x.target) return false;
  const [y, m, d] = dd.split('-').map(Number), t = E.shiftOn(x.target, y, m, d, S.tpl, S.ov); if (!t) return false;
  await q(sb.from('shift_overrides').upsert({ member_id: x.target, work_date: dd, off: false, start_t: t5(t.s), end_t: tm, break_min: t.brk ?? null })); return true;
}
// 선호 시간: 근무 고치는 창에도 표시
{ const o = shiftSheet; shiftSheet = a => { o(a); const pr = itemsOf('pref').find(x => x.target === a?.memberId)?.data; if (pr) $('#sheet .in h2')?.insertAdjacentHTML('afterend', `<p class="note">선호: ${(pr.wd || []).map(i => E.WD[i]).join('')} ${esc(pr.f || '')}~${esc(pr.t || '')}</p>`); }; }
{ const o = sosSheet; sosSheet = (...a) => { lsSet('ev_fw_sos', '1'); return o(...a); }; }
// 퇴사 처리 창: 해고 예고수당(30일분 통상임금) 계산
function noticePay(p) { const h = wkH(p.id), rt = +p.hourly_rate || 0, day = h / 5 || 8; return Math.round(rt * Math.min(8, day) * 30 / 10) * 10; }
// 등급 승급 조건 (대표가 바꿈)
const gradeRule = () => ({ m1: 3, m2: 12, pr: 3, ...(S.store?.equip?.grade_rule || {}) });
function gradeSheet() { const g = gradeRule(); openSheet(`<h2>등급 조건</h2><form class="f" id="grade-form"><label class="fl">수습 → 정규 (개월)<input name="m1" type="number" min="0" value="${g.m1}"></label><label class="fl">정규 → 시니어 (개월)<input name="m2" type="number" min="0" value="${g.m2}"></label><label class="fl">시니어 칭찬 횟수<input name="pr" type="number" min="0" value="${g.pr}"></label><p class="note">수습 → 정규는 신입 교육 완료도 필요해요</p><button class="btn pri full">저장</button></form>`); }
// 두루누리: 10명 미만 · 월 보수 270만 원 미만 · 국민연금·고용보험 80% (신규 가입 최대 36개월)
const duru = g => (S.members || []).filter(x => x.role !== 'owner').length < 10 && g > 0 && g < 2700000;
// 지난달 리포트 카드 (1~7일)
function mrepCard() { const d = +TODAY.slice(8); if (!isOwner() || d > 7 || lsGet('ev_mrep') === TODAY.slice(0, 7) || (S.store?.created_at || '') >= TODAY.slice(0, 8) + '01') return ''; /* 이번 달에 만든 매장은 지난달 리포트 없음 */ const pm = new Date(S.y, S.m - 2, 1); return `<div class="card lbud"><div><b>📊 ${pm.getMonth() + 1}월 리포트가 나왔어요</b><small>매출·비용·남은 돈 한 장 · PDF 저장</small></div><span class="row"><button class="btn sm pri" data-act="mrep">보기</button><button class="btn sm" data-act="mrep-x" aria-label="닫기">✕</button></span></div>`; }
// 직원 앱 바로가기
function staffFav() { return `<div class="favbar">${[['attend', '출퇴근', 'tab'], ['ops-open', '매장 노트', 'act'], ['ics', '📅 캘린더', 'act'], ['rq-new', '조기 퇴근', 'act', 'early']].map(([k, l, t, v]) => t === 'tab' ? `<button class="fchip" data-tab="${k}">${l}</button>` : `<button class="fchip" data-act="${k}" ${v ? `data-v="${v}"` : ''}>${l}</button>`).join('')}</div>`; }
const EVK = { sales_entry: '마감 입력', schedule_created: '스케줄 저장', job_applied: '딜러 지원', store_created: '매장 생성', dealer_signup: '딜러 가입', staff_added: '직원 등록', order: '발주', contract_sent: '계약서 발송' };
async function taxiLoad() { S.taxi = (await sb.from('dealer_taxi').select('*').order('d', { ascending: false }).limit(200)).data || []; }
async function tplLoad() { S.tpls = (await sb.from('hq_tpl').select('*').eq('on_', true).order('id')).data || []; }
// 화면 연결
{ const o = vHome; vHome = () => { const h = o(); return h.replace('<div class="hmain">', `<div class="hmain">${mrepCard()}`); }; }
{ const o = vWork; vWork = () => { const h = o(); return S.sub === 'ops' ? h : h.replace('<h1>내 근무</h1>', `<h1>내 근무</h1>${staffFav()}`); }; }
{ const o = vHqDash; vHqDash = () => { if (!S.hqOps && !S.hqOpsBusy) { S.hqOpsBusy = 1; sb.rpc('hq_ops').then(({ data }) => { S.hqOps = data || {}; S.hqOpsBusy = 0; if (S.tab === 'dash') render(); }); } return o(); }; }
{ const o = vHqInq; vHqInq = () => { if (!S.tpls) { S.tpls = []; tplLoad().then(render); } return o(); }; }
{ const o = loadStore; loadStore = async () => { await o();
  const five = S.members.filter(p => p.role !== 'owner').length >= 5; if (isOwner() && !!S.store.equip?.five !== five) { const equip = { ...(S.store.equip || {}), five }; await sb.from('stores').update({ equip }).eq('id', S.store.id); S.store.equip = equip; }
  if (isMgr()) S.nowD = (await sb.rpc('now_dealers')).data || [];
  if (lsGet('ev_pend_' + S.store.id) && navigator.onLine && !S.pendTried) { S.pendTried = 1; setTimeout(() => { if (S.tab !== 'sales') { S.tab = 'sales'; render(); } setTimeout(() => { const f = $('#report-form'); if (f) { lsSet('ev_pend_' + S.store.id, ''); toast('끊겼을 때 누른 마감을 지금 저장해요'); f.requestSubmit(); } }, 500); }, 800); } }; }
{ const o = loadStaff; loadStaff = async () => { await o(); const st = S.my[S.mi || 0]?.store_id; if (st) S.praise = (await sb.from('store_notes').select('id,target,created_at').eq('store_id', st).eq('kind', 'praise').gte('created_at', monthRange()[0])).data || []; }; }
{ const o = loadDealer; loadDealer = async () => { await o(); if (S.mode === 'dealer') { S.lessons = (await sb.from('lesson_progress').select('lesson')).data || []; await taxiLoad(); } }; }
document.addEventListener('visibilitychange', () => { if (document.hidden || !S.user || Date.now() - (S.devTouch || 0) < 36e5 || location.pathname.includes('/demo')) return; S.devTouch = Date.now(); sb.from('user_devices').upsert({ user_id: S.user.id, dev: lsGet('ev_vid'), ua: navigator.userAgent.slice(0, 200), last_at: new Date().toISOString() }).then(() => { }, () => { }); });
// 버튼·입력칸 이름 자동으로 (화면낭독)
const ACT_KR = { menu: '메뉴', close: '닫기', mon: '달 바꾸기', copy: '복사', help: '도움말', edit: '수정', del: '지우기', 'it-hide': '지우기', refresh: '새로고침' };
function a11yFix() {
  document.querySelectorAll('#view button:not([aria-label]),#view [role=button]:not([aria-label])').forEach(b => { if (b.innerText.trim()) return; const l = b.title || ACT_KR[b.dataset.act] || (b.dataset.v === '-1' ? '이전' : b.dataset.v === '1' ? '다음' : b.dataset.act); if (l) b.setAttribute('aria-label', l); });
  document.querySelectorAll('#view input:not([type=hidden]):not([aria-label]),#view select:not([aria-label]),#view textarea:not([aria-label])').forEach(i => { if (i.closest('label') || i.placeholder) return; const t = (i.previousElementSibling?.innerText || i.parentElement?.innerText || i.name || '').trim().split('\n')[0].slice(0, 20); if (t) i.setAttribute('aria-label', t); });
}
{ const o = after68; after68 = () => { o(); a11yFix(); if (S.mode === 'store' && S.tab === 'sales') { const R = window.SpeechRecognition || window.webkitSpeechRecognition; document.querySelectorAll('#mic').forEach(m => { if (!R) m.remove(); }); if (R) ['card', 'transfer'].forEach(n => { const i = $(`#report-form [name=${n}]`); if (i && !i.nextElementSibling?.classList?.contains('mic2')) i.insertAdjacentHTML('afterend', `<button type="button" class="btn sm mic2" data-act="mic" data-v="${n}" aria-label="말로 입력">🎤</button>`); }); } }; }
Object.assign(A68, {
  order: () => { if (isOwner() || !isMgr()) return false; const items = Object.entries(S.cart).filter(([, n]) => n > 0).map(([id, n]) => ({ id: +id, q: n, price: item(id).sp })); if (!items.length) return toast('담은 상품이 없어요'); busy(async () => { const total = items.reduce((a, i) => a + i.price * i.q, 0); await q(sb.from('store_items').insert({ store_id: S.store.id, kind: 'order_req', title: items.map(i => `${item(i.id)?.n}×${i.q}`).join(', ').slice(0, 80), data: { items, total, by: myNick() } })); S.cart = {}; await reload(); toast('대표님께 발주 승인을 요청했어요'); }); },
  'rq-ok': (b, d) => busy(async () => { const x = S.items.find(i => String(i.id) === d.v); await q(sb.from('store_items').update({ status: 'ok' }).eq('id', d.v)); const ch = x && await applyReq(x); await reload(); toast(ch ? '승인했어요. 근무표 끝나는 시간을 바꿔 급여에 반영했어요' : '승인했어요. 직원에게 알림이 가요'); }),
  'edge-wk': () => { S.edgeNext = !S.edgeNext; render(); },
  'mrep-x': () => { lsSet('ev_mrep', TODAY.slice(0, 7)); render(); },
  'amsg-edit': (b, d) => openSheet(`<h2>지원 한마디</h2><form class="f" id="amsg-form" data-p="${d.p}"><input name="msg" maxlength="80" placeholder="예: 토너먼트 딜링 2년, 20시부터 가능해요"><button class="btn pri full">보내기</button></form>`),
  'grade-set': () => gradeSheet(),
  dispatch: (b, d) => busy(async () => { const st = $('#dsp-' + d.m)?.value, rt = +$('#dsr-' + d.m)?.value || null; await q(sb.rpc('dispatch_member', { p_member: d.m, p_store: st, p_rate: rt })); toast(`${S.stores.find(s => s.id === st)?.name}에 대타로 등록했어요${rt ? ` (시급 ₩${E.won(rt)})` : ''}`); }),
  'disp-back': (b, d) => busy(async () => { await q(sb.from('members').update({ active: false }).eq('id', d.m)); await reload(); toast('파견을 끝냈어요. 원래 매장 소속은 그대로예요'); }),
  'now-h': (b) => busy(async () => { const h = +b.value; const v = h ? new Date(Date.now() + h * 36e5).toISOString() : null; await q(sb.from('profiles').update({ now_until: v }).eq('id', S.user.id)); S.prof.now_until = v; render(); toast(v ? `${h}시간 동안 "지금 가능"이에요` : '껐어요'); }),
  taxi: () => openSheet(`<h2>교통비 기록</h2><form class="f" id="taxi-form"><div class="grid2"><label class="fl">날짜<input name="d" type="date" value="${TODAY}"></label><label class="fl">금액<input name="a" type="number" inputmode="numeric" required></label></div><label class="fl">메모<input name="m" placeholder="예: 강남점 퇴근 택시"></label><button class="btn pri full">기록</button></form>${(S.taxi || []).slice(0, 20).map(x => `<div class="li"><span>${x.d} ${esc(x.m || '')}</span><span class="num">₩${E.won(x.a)}</span></div>`).join('')}<p class="note">계정에 저장돼요 · 종합소득세 신고 때 경비 자료로 쓸 수 있어요 (영수증은 따로 보관)</p>`),
  'tpl-del': (b, d) => busy(async () => { await q(sb.from('hq_tpl').update({ on_: false }).eq('id', d.v)); await tplLoad(); render(); }),
  'tpl-use': (b, d) => { const i = b.closest('.tplrow')?.nextElementSibling?.querySelector('[name=reply]'); if (i) { i.value = (S.tpls || []).find(t => String(t.id) === d.v)?.t || ''; i.focus(); } },
  'vat-type': (b) => busy(async () => { const equip = { ...(S.store.equip || {}), vat_type: b.value }; await q(sb.from('stores').update({ equip }).eq('id', S.store.id)); S.store.equip = equip; render(); }),
  sanjae: () => askText('산재보험 요율 (%)', '근로복지공단 고지서 요율 · 예: 0.9', S.store.equip?.sanjae || '').then(v => { if (v == null) return; busy(async () => { const equip = { ...(S.store.equip || {}), sanjae: +v || 0 }; await q(sb.from('stores').update({ equip }).eq('id', S.store.id)); S.store.equip = equip; render(); }); }),
  'rep-copy': () => { const t = $('.mrep')?.innerText || ''; navigator.clipboard?.writeText(t).then(() => toast('리포트 내용을 복사했어요'), () => toast('복사하지 못했어요')); },
  'staff-del': () => { let n = 0; const tm = setInterval(() => { const f = $('#out-form'); if (f || ++n > 40) { clearInterval(tm); if (!f || $('#np30')) return; const p = S.members.find(x => x.id === f.dataset.m); if (!p) return; const mon = p.joined_on ? -dDay(p.joined_on) / 30.4 : 0; f.insertAdjacentHTML('afterbegin', `<p class="note" id="np30">해고라면 예고수당 약 <b>₩${E.won(noticePay(p))}</b> (30일분 통상임금 · 시급 × 하루 평균 시간 × 30)${mon < 3 ? ' — 근무 3개월 미만이라 예고 의무 예외예요' : ''}</p>`); } }, 250); return false; }
});
{ const o = A68.apply; A68.apply = (b, d) => { const j = (S.board || []).find(x => x.id === d.p), mine = (S.slots || []).filter(s => ['MATCHED', 'WORKING'].includes(s.status));
  if (j?.kind === 'urgent' && j.slots?.length && !S.clashOk?.[d.p]) { const dd = ymdOf(new Date(j.created_at || Date.now())), w = j.slots[0], mn = t => E.toMin(t5(t)), ov = (a1, a2, b1, b2) => { if (a2 <= a1) a2 += 1440; if (b2 <= b1) b2 += 1440; return a1 < b2 && b1 < a2; };
    const c = mine.find(s => (S.slotDays || []).some(x => x.slot_id === s.slot_id && x.day === dd) && ov(mn(s.start_t), mn(s.end_t), mn(w.start), mn(w.end)));
    if (c) { S.clashOk = { ...(S.clashOk || {}), [d.p]: 1 }; return toast(`⚠️ ${c.store_name} ${t5(c.start_t)}–${t5(c.end_t)} 근무와 겹쳐요. 그래도 지원하려면 한 번 더 눌러주세요`); } }
  return o(b, d); }; }
Object.assign(F68, {
  'taxi-form': async (f, v) => { await q(sb.from('dealer_taxi').insert({ d: v.d, a: +v.a || 0, m: v.m || null })); await taxiLoad(); closeSheet(); render(); toast('기록했어요'); },
  'tpl-form': async (f, v) => { await q(sb.from('hq_tpl').insert({ t: v.t.trim() })); await tplLoad(); closeSheet(); render(); },
  'grade-form': async (f, v) => { const equip = { ...(S.store.equip || {}), grade_rule: { m1: +v.m1 || 0, m2: +v.m2 || 0, pr: +v.pr || 0 } }; await q(sb.from('stores').update({ equip }).eq('id', S.store.id)); S.store.equip = equip; closeSheet(); render(); toast('등급 조건을 바꿨어요'); },
  'alert-form': async (f, v) => { const alert = { min: +v.min || 0, off: !!v.off, f: v.af || '', t: v.at || '' }; await q(sb.from('profiles').update({ alert }).eq('id', S.user.id)); S.prof.alert = alert; closeSheet(); render(); toast('알림 조건을 저장했어요'); },
  'ho-form': async (f, v) => { const me = S.my[S.mi || 0]; await q(sb.from('store_notes').insert({ store_id: me.store_id, kind: 'handover', body: v.body, data: { by: me.nick }, created_by: S.user.id })); closeSheet(); S.hoOk = 1;
    const { data: k, error } = await attendGeo(S.pendCode); if (error) { toast(/코드가 맞지/.test(error.message) ? '인수인계는 남겼어요. 번호가 바뀌었으니 매장 화면의 새 번호로 퇴근을 다시 눌러주세요' : '인수인계는 남겼어요. ' + koErr(error.message)); return reload(); } toast(k === 'out' ? '인수인계 남기고 퇴근했어요. 수고하셨어요' : '인수인계를 남겼어요'); await reload(); }
});

// ===== 운영사: 딜러 명단 =====
function hqDealerRows() {
  const q0 = (S.hqDq || '').trim(), f = S.hqDf || 'all', L = (S.hqDealers || []).filter(d => (!q0 || `${d.name} ${d.phone || ''} ${d.area || ''}`.includes(q0)) && (f === 'all' || (f === 'now' && d.now_on) || (f === 'work' && +d.done > 0) || (f === 'new' && Date.now() - Date.parse(d.created_at) < 30 * 864e5) || (f === 'ban' && d.banned)));
  return L.slice(0, 200).map(d => `<div class="li"><div style="min-width:0"><b>${esc(d.name || '이름 없음')}</b>${d.verified ? ' <span class="pill g">✓ 인증</span>' : ''}${d.now_on ? ' <span class="pill g">🙋 지금 가능</span>' : ''}${d.banned ? ' <span class="pill r">정지</span>' : ''}${!d.verified && d.open_to_sub ? ' <span class="pill">직원 겸 대타</span>' : ''}<small class="mut" style="display:block">${esc(d.area || '지역 없음')} · 경력 ${d.career_months || 0}개월 · 가입 ${new Date(d.created_at).toLocaleDateString('ko-KR')}${d.last_work ? ` · 최근 근무 ${new Date(d.last_work).toLocaleDateString('ko-KR')}` : ''}</small></div><span class="row" style="gap:6px;flex-wrap:nowrap"><span class="num">${d.done}회${+d.noshow ? ` · <span class="down">노쇼 ${d.noshow}</span>` : ''}</span>${d.phone ? `<button class="btn sm" data-act="copy" data-v="${esc(d.phone)}" aria-label="전화번호 복사">📞</button>` : ''}<button class="btn sm" data-act="cv" data-v="${d.id}">이력</button></span></div>`).join('') || '<div class="empty">조건에 맞는 딜러가 없어요</div>';
}
function hqDealerCard() {
  if (!S.hqDealers) { if (!S.hqDBusy) { S.hqDBusy = 1; sb.rpc('hq_dealers').then(({ data }) => { S.hqDealers = data || []; S.hqDBusy = 0; render(); }); } return '<div class="card empty">딜러 명단 불러오는 중…</div>'; }
  const D = S.hqDealers, c = k => D.filter(k).length, wk = Date.now() - 7 * 864e5;
  const areas = Object.entries(D.reduce((a, d) => { const k = (d.area || '미지정').split(' ')[0]; a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]), mx = Math.max(1, ...areas.map(x => x[1]));
  return `<div class="card"><div class="row between"><h3 style="margin:0">딜러 <small>전체 ${D.length}명</small></h3><button class="btn sm" data-act="hq-dcsv">엑셀</button></div>
  <div class="kpi5" style="margin:10px 0"><div><small>전체</small><b class="num">${D.length}</b></div><div><small>본인 인증</small><b class="num">${c(d => d.verified)}</b></div><div><small>근무 1회+</small><b class="num">${c(d => +d.done > 0)}</b></div><div><small>지금 가능</small><b class="num up">${c(d => d.now_on)}</b></div><div><small>이번 주 가입</small><b class="num">${c(d => Date.parse(d.created_at) > wk)}</b></div></div>
  ${areas.slice(0, 8).map(([a, n]) => `<div class="cb"><span>${esc(a)}</span><div class="bar"><i style="width:${n / mx * 100}%"></i></div><b class="num">${n}명</b></div>`).join('')}
  <div class="row" style="gap:6px;margin:12px 0 6px;flex-wrap:wrap"><input id="hq-dq" placeholder="이름·전화·지역 찾기" value="${esc(S.hqDq || '')}" style="flex:1;min-width:140px">${[['all', '전체'], ['work', '근무 경험'], ['now', '지금 가능'], ['new', '최근 30일'], ['ban', '정지']].map(([k, l]) => `<button class="fchip ${(S.hqDf || 'all') === k ? 'on' : ''}" data-act="hq-df" data-v="${k}">${l}</button>`).join('')}</div>
  <div id="hq-dl">${hqDealerRows()}</div></div>`;
}
{ const o = vHqDash; vHqDash = () => { const h = o(); return h.replace('<div class="grid2">', `${hqDealerCard()}<div class="grid2">`); }; }
document.addEventListener('input', e => { if (e.target.id !== 'hq-dq') return; S.hqDq = e.target.value; const el = $('#hq-dl'); if (el) el.innerHTML = hqDealerRows(); });
Object.assign(A68, {
  'hq-df': (b, d) => { S.hqDf = d.v; render(); },
  cv: (b, d) => { cvView(d.v); },
  'hq-dcsv': () => download(`딜러명단_${TODAY}.csv`, [['이름', '전화', '본인인증', '지역', '경력(개월)', '가입일', '완료 근무', '노쇼', '최근 근무', '정지'], ...(S.hqDealers || []).map(d => [d.name, d.phone || '', d.verified ? 'Y' : '', d.area || '', d.career_months || 0, String(d.created_at).slice(0, 10), d.done, d.noshow, d.last_work ? String(d.last_work).slice(0, 10) : '', d.banned ? 'Y' : ''])])
});
// ===== 사장님: 우리 지역 딜러 수 (이름 없이 숫자만) =====
function areaDealerCard() {
  const A = S.areaD; if (!A || !isMgr()) return '';
  const where = A.gu ? `${A.sido} ${A.gu}` : A.sido || '전국', tile = (l, v, c = '') => `<div><small>${l}</small><b class="num ${c}">${E.won(v)}<i style="font-size:12px;font-style:normal">명</i></b></div>`;
  const ratio = A.posts30 ? (A.sido_n / A.posts30).toFixed(1) : null;
  return `<div class="card"><div class="row between"><h3 style="margin:0">우리 지역 딜러 <small>${esc(where)} · 이 앱에 가입한 딜러 수 (이름은 안 보여요)</small></h3><button class="btn sm" data-tab="jobs">구인 →</button></div>
  <div class="kpi5" style="margin:10px 0">${tile(`${A.sido || '전국'} 딜러`, A.sido_n || A.all)}${A.gu ? tile(`${A.gu} 활동`, A.gu_n) : ''}${tile('근무 경험', A.worked)}${tile('본인 인증', A.verified)}${tile('🙋 지금 가능', A.now_on, A.now_on ? 'up' : '')}</div>
  <small class="mut">긴급 알림 받는 딜러 ${E.won(A.alert_on)}명 · 이번 주 새로 가입 ${E.won(A.new7)}명 · 전국 ${E.won(A.all)}명${ratio ? ` · 최근 30일 우리 지역 공고 ${A.posts30}건 (공고 1건당 딜러 ${ratio}명)` : ''}</small></div>`;
}
{ const o = loadStore; loadStore = async () => { await o(); if (isMgr()) S.areaD = (await sb.rpc('area_dealers', { p_store: S.store.id })).data || null; }; }
{ const o = vJobs; vJobs = () => o() + areaDealerCard(); }
{ const o = vHome; vHome = () => o().replace('<div class="hside">', `<div class="hside">${areaDealerCard()}`); }
// v0.74 손님앱(+EV TABLE) 연결: 버튼 한 번 → 매장 자동 등록 + 점주 초대 링크로 이동
let tableCard = () => isOwner() && S.store?.id ? `<div class="card"><h3>📱 손님앱 <small>+EV TABLE · 대회 신청·대기·좌석</small></h3><p class="sub" style="margin:4px 0 10px">손님이 폰으로 대회 신청·대기 등록·내 자리 확인. ${esc(S.store.name)}은(는) 자동 연결돼 있어요 · 손님앱에 같은 카카오로 로그인하면 바로 점주 화면이 열려요.</p><div class="row"><button class="btn pri" data-act="ev-table">손님앱 열기</button><a class="btn" href="https://plusevapp.kr/table/owner" target="_blank" rel="noopener">점주 화면</a></div></div>` : '';
A68['ev-table'] = async () => { if (!sb.auth.getSession) { window.open('https://plusevapp.kr/table/about', '_blank'); return; } const w = window.open('', '_blank'); try {
  const tok = (await sb.auth.getSession()).data.session?.access_token;
  const r = await fetch('https://vjvsbuaxptnnqyghwxcb.supabase.co/functions/v1/ev-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok, store: S.store.id, invite: true }) });
  const d = await r.json(); if (!r.ok || !d.invite) throw new Error(d.error || '연결 실패');
  const url = 'https://plusevapp.kr/table/staff?invite=' + encodeURIComponent(d.invite); if (w) w.location = url; else location.href = url;
  toast('손님앱에 매장을 연결했어요 · 카카오로 로그인하면 점주로 등록돼요');
} catch (e) { w?.close(); toast('손님앱 연결에 실패했어요: ' + e.message); } };
{ const o = vHome; vHome = () => o().replace('<div class="hside">', `<div class="hside">${tableCard()}`); }
// v0.76 손님앱 연동 강화: 동기화 상태·오늘 현황·HQ 지표 (ev-link 'sync'|'stats'|'overview')
const EVL = 'https://vjvsbuaxptnnqyghwxcb.supabase.co/functions/v1/ev-link', TL = 'https://plusevapp.kr/table';
const evl = async b => { const tok = (await sb.auth.getSession()).data.session?.access_token; const r = await fetch(EVL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok, ...b }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d; };
const tlSync = async force => { const s = S.store; if (!isOwner() || !s?.id || !sb.auth.getSession) return;
  // 매장 이름·지역·주소가 바뀌면 키가 달라져서 즉시 다시 동기화 (#5)
  const k = 'ev-tl-' + s.id + '-' + TODAY + '-' + [s.name, s.area, s.address].join('|'); if (!force && lsGet(k)) { S.tlSync = { ok: 1, at: lsGet(k) }; return; }
  try { const d = await evl({ store: s.id, invite: false }); S.tlSync = { ok: 1, at: d.synced_at, staff: d.staff }; try { localStorage.setItem(k, d.synced_at) } catch { } }
  catch (e) { S.tlSync = { err: e.message }; } };
const tlStats = async () => { if (!isOwner() || !S.store?.id || !sb.auth.getSession) return; try { S.tls = await evl({ store: S.store.id, mode: 'stats' }); } catch { S.tls = null; } if (S.tab === 'home' || S.tab === 'sales') render(); };
{ const o = loadStore; loadStore = async () => { await o(); S.tls = null; tlSync().then(tlStats); }; }
const WD = '일월화수목금토';
function tlBody() { const x = S.tls, t = x?.today, st = S.tlSync || {}; if (!x) return '';
  const wd = Object.entries(x.weekday_avg || {}).sort((a, b) => b[1] - a[1]), alert = (x.new_feedback || 0) + (x.inbox_unread || 0);
  return `<div class="grid2" style="margin:8px 0"><div><small class="mut">오늘 참가</small><b class="num" style="display:block;font-size:20px">${t.entries}건 · ${t.players}명</b></div><div><small class="mut">대기 / 진행중</small><b class="num" style="display:block;font-size:20px">${t.waiting}명 · ${t.running}개</b></div></div>
  ${t.tables_in_use ? `<p class="sub">🃏 테이블 ${t.tables_in_use}개 운영중 → 딜러 최소 ${t.tables_in_use}명 필요 (교대 포함 ${Math.ceil(t.tables_in_use * 1.3)}명)</p>` : ''}
  ${t.waiting >= 10 ? `<div class="row between"><span class="sub" style="color:var(--gold)">⚡ 대기 ${t.waiting}명 — 딜러가 모자랄 수 있어요</span><button class="btn sm gold" data-tab="jobs">긴급구인</button></div>` : ''}
  ${alert ? `<div class="row between"><span class="sub">🔔 새 피드백 ${x.new_feedback} · 안 읽은 문의 ${x.inbox_unread}</span><a class="btn sm" href="${TL}/owner" target="_blank" rel="noopener">답하기</a></div>` : ''}
  <p class="sub">이번 주 손님 ${x.week_players}명${x.review?.n ? ` · ★ ${x.review.avg} (${x.review.n})` : ''}${x.stamp_rewards_30d ? ` · 스탬프 보상 30일 ${x.stamp_rewards_30d}건 (경품 재고 확인)` : ''}</p>
  ${wd.length ? `<p class="sub">📅 손님 많은 요일: ${wd.slice(0, 3).map(([d, n]) => `${WD[d]} ${n}명`).join(' · ')} → 이날 딜러를 더 배치하세요</p>` : ''}
  ${x.upcoming?.length ? `<p class="sub">다가오는 대회: ${x.upcoming.slice(0, 3).map(u => `${esc(u.title)} ${fmtDT(u.starts_at).split(' ').slice(-2).join(' ')}`).join(' · ')}</p>` : ''}
  <div class="row" style="margin-top:6px">${x.upcoming?.[0] ? `<a class="btn sm" href="${TL}/tv?t=${x.upcoming[0].id}" target="_blank" rel="noopener">📺 TV 화면</a><a class="btn sm" href="${TL}/poster?t=${x.upcoming[0].id}" target="_blank" rel="noopener">🖨 입구 포스터</a>` : ''}<button class="btn sm" data-act="tl-sync">${st.err ? '⚠ 다시 연결' : '↻ 동기화'}</button></div>
  <small class="mut">${st.err ? `동기화 실패: ${esc(st.err)}` : st.at ? `마지막 동기화 ${fmtDT(st.at)}` : ''}</small>`; }
/* 헬퍼: 앱 가입 안 한 사람도 근무표·인건비에 넣기 (가입하면 직원 승인 때 이 칸에 연결됨) */
A68['helper-add'] = () => openSheet(`<h2>헬퍼 추가</h2><p class="note" style="margin-top:0">앱 가입 안 해도 돼요. 근무표에 넣으면 인건비·매출정산에 바로 잡혀요.</p><form class="f" id="helper-form"><label class="fl">이름<input name="nick" required maxlength="20" placeholder="예: 헬퍼 민수"></label><div class="grid2"><label class="fl">시급<input name="rate" type="number" min="0" step="10" value="${minWage()}" required></label><label class="fl">하는 일<select name="job"><option>딜러</option><option>플로어</option></select></label></div><label class="fl">전화번호 <small class="mut">선택 · 나중에 가입하면 자동 연결</small><input name="phone" inputmode="tel" placeholder="010-0000-0000"></label><div class="grid2"><label class="fl">오늘 시작 <small class="mut">선택</small><input name="s" type="time"></label><label class="fl">오늘 끝<input name="e" type="time"></label></div><button class="btn pri">추가</button></form>`);
F68['helper-form'] = async (f, v) => { const ph = (v.phone || '').replace(/[^0-9-]/g, '') || null; const ins = await q(sb.from('members').insert({ nick: v.nick.trim(), hourly_rate: +v.rate || 0, job_role: v.job, emp_type: '헬퍼', contract: '3.3', night_pay: true, joined_on: TODAY, phone: ph, company_id: S.store.company_id, store_id: S.store.id, role: 'staff' }).select('id'));
  if (v.s && v.e && ins?.[0]) await q(sb.from('shift_overrides').upsert({ member_id: ins[0].id, work_date: TODAY, start_t: v.s, end_t: v.e, break_min: null, off: false }));
  closeSheet(); await reload(); toast(v.s && v.e ? `${v.nick.trim()} 오늘 ${v.s}~${v.e} 근무로 넣었어요` : `${v.nick.trim()} 추가 · 근무표 + 눌러서 시간 넣으세요`); };
A68['wk'] = (b, d) => { S.wk = +d.v; S.selCell = null; render(); };
const wkDates = w => { const mon = addDay(E.ymd(S.y, S.m, 1), (w - 1) * 7 - E.wdOf(S.y, S.m, 1)); return [0, 1, 2, 3, 4, 5, 6].map(i => addDay(mon, i)); };
A68['wk-auto'] = (b, d) => { const w = +d.v, by = {}; for (const k of wkDates(w)) if (k >= TODAY) (by[k.slice(0, 7) + '-01'] = by[k.slice(0, 7) + '-01'] || {})[k] = needOn(k, S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2]);
  if (!Object.keys(by).length) return toast('지난 주는 자동 배정할 수 없어요');
  if (!confirm(`${S.m}월 ${w}주차(오늘 이후)를 자동으로 다시 짤까요? 그 주에 손으로 넣은 근무는 바뀌어요.`)) return;
  return busy(async () => { toast('배정 중…'); let short = 0; for (const [month, need] of Object.entries(by)) { const { data, error } = await sb.functions.invoke('sched-auto', { body: { store_id: S.store.id, month, need, week: true } }); if (error || !data?.ok) return toast(data?.msg || '배정을 못 했어요'); short += data.short.length; } toast(short ? `${w}주차 완료 · 빈자리 ${short}일` : `${w}주차 완료 · 빈자리 없음`); await reload(); }); };
/* 지난주 근무를 이번 주에 그대로 (#이전 주 복사) */
A68['wk-prev'] = (b, d) => { const w = +d.v, staff = S.members.filter(p => p.role !== 'owner'), rows = [];
  for (const k of wkDates(w)) { const [y, m, dd] = addDay(k, -7).split('-').map(Number), [y2, m2, d2] = k.split('-').map(Number);
    for (const p of staff) { const t = E.shiftOn(p.id, y, m, dd, S.tpl, S.ov), cur = E.shiftOn(p.id, y2, m2, d2, S.tpl, S.ov);
      if (t) rows.push({ member_id: p.id, work_date: k, start_t: t5(t.s), end_t: t5(t.e), break_min: t.brk ?? null, off: false }); else if (cur) rows.push({ member_id: p.id, work_date: k, start_t: null, end_t: null, break_min: null, off: true }); } }
  if (!rows.length) return toast('지난주 근무가 없어요');
  if (!confirm(`${S.m}월 ${w}주차를 지난주와 똑같이 바꿀까요? (${rows.filter(r => !r.off).length}칸)`)) return;
  return busy(async () => { await putOv(rows); toast('지난주 근무를 복사했어요'); }); };
/* 지난 날짜 근무 한번에 입력 (소급) — 칸에 18-02 또는 18:30-02:00, 비우면 그대로, x는 휴무 */
A68['sel-copy'] = () => { if (S.sels?.length) copySel(S.sels); };
A68['bulk-past'] = () => { const staff = S.members.filter(p => p.role !== 'owner'), y = S.y, m = S.m, last = Math.min(E.daysIn(y, m), TODAY.slice(0, 7) === `${y}-${E.pad(m)}` ? +TODAY.slice(8) : E.daysIn(y, m));
  const cell = (p, d) => { const t = E.shiftOn(p.id, y, m, d, S.tpl, S.ov); return t ? `${t5(t.s)}-${t5(t.e)}` : ''; };
  openSheet(`<h2>${m}월 근무 한번에 입력</h2><p class="note" style="margin-top:0">칸에 <b>18-02</b> 또는 <b>18:30-02:00</b> · 쉬는 날은 <b>x</b> · 저장하면 인건비·매출정산에 바로 반영</p><form class="f" id="bulk-past-form"><div class="tbl"><table><thead><tr><th>날짜</th>${staff.map(p => `<th>${esc(p.nick)}</th>`).join('')}</tr></thead><tbody>
    ${Array.from({ length: last }, (_, i) => i + 1).map(d => `<tr><td>${d}(${E.WD[E.wdOf(y, m, d)]})</td>${staff.map(p => `<td><input name="c_${p.id}_${d}" value="${cell(p, d)}" data-o="${cell(p, d)}" style="width:96px;padding:4px" inputmode="text"></td>`).join('')}</tr>`).join('')}</tbody></table></div><button class="btn pri full">저장</button></form>`);
  /* 엑셀·카톡에서 여러 칸 복사해 붙이면 표에 그대로 펼침 (탭=옆 칸, 줄바꿈=다음 날) */
  $('#bulk-past-form').addEventListener('paste', e => { const t = e.clipboardData?.getData('text') || '', el = e.target; if (!/[\t\n]/.test(t.trim()) || el.tagName !== 'INPUT') return; e.preventDefault();
    const td = el.closest('td'), tr = td.parentElement, col = [...tr.children].indexOf(td), rows = [...tr.parentElement.children], r0 = rows.indexOf(tr); let n = 0;
    t.replace(/\r/g, '').split('\n').filter((l, i, A) => l || i < A.length - 1).forEach((line, i) => line.split('\t').forEach((v, j) => { const inp = rows[r0 + i]?.children[col + j]?.querySelector('input'); if (inp) { inp.value = v.trim(); n++; } }));
    toast(`${n}칸 붙였어요 · 확인 후 저장`); }); };
const parseRange = v => { const m = String(v).trim().match(/^(\d{1,2})(?::?(\d{2}))?\s*[-~]\s*(\d{1,2})(?::?(\d{2}))?$/); if (!m) return null; const h = (a, b) => `${E.pad(+a % 24)}:${b || '00'}`; return [h(m[1], m[2]), h(m[3], m[4])]; };
F68['bulk-past-form'] = async f => { const rows = [], bad = [];
  for (const el of f.querySelectorAll('input[name^="c_"]')) { if (el.value === el.dataset.o) continue; const [, mid, d] = el.name.split('_'), k = E.ymd(S.y, S.m, +d), v = el.value.trim();
    if (!v || /^x$/i.test(v)) rows.push({ member_id: mid, work_date: k, start_t: null, end_t: null, break_min: null, off: true });
    else { const r = parseRange(v); if (!r) { bad.push(`${d}일 ${v}`); continue; } rows.push({ member_id: mid, work_date: k, start_t: r[0], end_t: r[1], break_min: null, off: false }); } }
  if (bad.length) return toast(`형식 확인: ${bad.slice(0, 3).join(', ')}`);
  if (!rows.length) return toast('바뀐 칸이 없어요');
  await q(sb.from('shift_overrides').upsert(rows)); closeSheet(); await reload(); toast(`${rows.length}칸 저장 · 인건비에 반영됐어요`); };
A68['tl-sync'] = async () => { toast('손님앱과 동기화 중…'); await tlSync(true); await tlStats(); toast(S.tlSync?.err ? '동기화 실패: ' + S.tlSync.err : '동기화했어요'); };
{ const o = tableCard; tableCard = () => { const h = o(); return h && h.replace(/<\/div><\/div>$/, `</div>${tlBody()}</div>`); }; }
// 마감 참가자 수: 비어 있으면 손님앱 오늘 참가 건수로 채움 (#2)
{ const o = vSales; vSales = () => { const h = o(), n = S.tls?.today?.entries; return n ? h.replace('value="" placeholder="0">', `value="" placeholder="${n} (손님앱)">`).replace(/(name="entries"[^>]*value=")(")/, `$1${n}$2`) : h; }; }
// 운영사: 손님앱 전체 지표 (#10, #93)
{ const o = vHqDash; vHqDash = () => { if (!S.tlo && !S.tloBusy && sb.auth.getSession) { S.tloBusy = 1; evl({ mode: 'overview' }).then(d => { S.tlo = d; if (S.tab === 'dash') render(); }).catch(() => { }); } const x = S.tlo;
  return o() + (x ? `<div class="card"><h3>📱 손님앱 (+EV TABLE)</h3><div class="grid2"><div><small class="mut">매장 / 연동</small><b class="num" style="display:block">${x.stores} / ${x.linked}</b></div><div><small class="mut">손님 (7일 신규)</small><b class="num" style="display:block">${x.users} (+${x.users_7d})</b></div><div><small class="mut">7일 참가</small><b class="num" style="display:block">${x.entries_7d}</b></div><div><small class="mut">재방문율</small><b class="num" style="display:block">${x.repeat_rate ?? 0}%</b></div></div><p class="sub">진행중 대회 ${x.running} · 오류 24시간 <b class="${x.errors_24h ? 'down' : ''}">${x.errors_24h}</b></p></div>` : ''); }; }
// 급여 이체 CSV (#76) · 4대보험 도우미 (#77)
A68['pay-csv'] = () => download(`급여이체_${S.y}-${String(S.m).padStart(2, '0')}.csv`, [['예금주', '은행', '계좌', '금액', '메모'], ...S.members.filter(p => p.role !== 'owner').map(p => [p.bank_holder || p.real_name || p.nick, p.bank_name || '', p.bank_acct || '', payOf(p).xfer, `${S.m}월급여`])]);
A68['ins-help'] = () => { const L = S.members.filter(p => p.role !== 'owner' && p.contract === '4대'); openSheet(`<h2>4대보험 신고 도우미</h2><p class="sub">참고용 일정이에요. 실제 신고 기준·금액은 노무사·4대사회보험 정보연계센터(4insure.or.kr)에서 확인하세요.</p>
  <div class="card"><b>📌 할 일</b><div class="li"><span>입사자 취득신고</span><span>입사일 다음 달 15일까지</span></div><div class="li"><span>퇴사자 상실신고</span><span>퇴사일 다음 달 15일까지</span></div><div class="li"><span>보험료 납부</span><span>매월 10일</span></div></div>
  <div class="card"><b>4대 가입 직원 ${L.length}명</b>${L.map(p => `<div class="li"><span>${esc(p.real_name || p.nick)}</span><span class="mut">${p.hired_on || p.created_at?.slice(0, 10) || ''}</span></div>`).join('') || '<p class="sub">없어요</p>'}</div>`); };
{ const o = vStaff; vStaff = () => o().replace('<button class="btn sm" data-act="pay-copy">이체 목록 복사</button>', '<button class="btn sm" data-act="pay-copy">이체 목록 복사</button><button class="btn sm" data-act="pay-csv">CSV</button><button class="btn sm" data-act="ins-help">4대보험</button>'); }
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-tab],[data-act]'); if (!b) return; const d = b.dataset;
  if (d.tab) { S.tab = d.tab; S.sub = null; closeSheet(); render(); scrollTo(0, 0); return; }
  const a = d.act;
  if (A68[a] && A68[a](b, d) !== false) return;
  if (a === 'authmode') { S.authMode = d.v; render(); }
  if (a === 'menu') return menuSheet();
  if (a === 'rep-act') return busy(async () => { await q(sb.rpc('hq_report_act', { p_kind: d.k, p_id: d.id, p_act: d.v })); toast('처리했어요'); await hqRepLoad(1); });
  if (a === 'hq-find') return busy(async () => { const qv = ($('#hq-uq')?.value || '').trim(); if (qv.length < 2) return toast('2글자 이상 넣어주세요'); S.hqUsers = await q(sb.rpc('hq_find_user', { p_q: qv })); render(); if (!S.hqUsers.length) toast('찾는 계정이 없어요'); });
  if (a === 'ban') return busy(async () => { const dd = +d.d; let why = ''; if (dd) { why = (await askText('정지 사유 (사용자에게 보여요)', '', '운영정책 위반')) || ''; if (!why) return; } else if (!confirm('정지를 풀까요?')) return; await q(sb.rpc('hq_ban', { p_user: d.u, p_days: dd, p_reason: why })); toast(dd ? '정지했어요' : '정지를 풀었어요'); const qv = ($('#hq-uq')?.value || '').trim(); if (qv) S.hqUsers = await q(sb.rpc('hq_find_user', { p_q: qv })); render(); });
  if (a === 'fb-img') return busy(async () => { const { data, error } = await sb.storage.from('feedback').createSignedUrl(d.v, 600); if (error) return toast('사진을 열 수 없어요'); open(data.signedUrl, '_blank', 'noopener'); });
  if (a === 'fb-open') return openSheet(`<h2>의견 보내기</h2><p class="sub">불편한 점이나 바라는 기능을 적어주세요. 화면 캡처를 붙이면 더 빨리 고쳐요.</p><form class="f" id="fb-form"><label class="fl">내용<textarea name="body" rows="4" required placeholder="예: 스케줄 화면에서 이름이 잘려 보여요"></textarea></label><label class="fl">사진 (선택)<input type="file" name="img" accept="image/*"></label><button class="btn pri full">보내기</button><button type="button" class="btn full" data-act="close">닫기</button></form>`);
  if (a === 'reject') return openSheet(`<h2>불채용 사유</h2><p class="sub">딜러에게 짧게 알려줘요. 연락처는 보내지 않아요.</p><form class="f" id="rej-form" data-a="${d.a}" data-p="${d.p}" data-k="${d.k}"><div class="days wrap">${['시간이 안 맞아요', '인원이 다 찼어요', '경력이 더 필요해요', '조건이 안 맞아요'].map((x, i) => `<label><input type="radio" name="why" value="${x}" ${i ? '' : 'checked'}><span>${x}</span></label>`).join('')}</div><label class="fl">직접 쓰기 (선택)<input name="etc" maxlength="60"></label><button class="btn pri full">불채용 알리기</button><button type="button" class="btn full" data-act="close">취소</button></form>`);
  if (a === 'cmp') { const ids = [...document.querySelectorAll(`#mg-${d.p} [data-cmp]:checked`)].map(x => x.dataset.cmp), L = (S.mgApps?.[d.p] || []).filter(x => ids.includes(x.app_id)); if (L.length < 2) return toast('비교할 지원자를 2명 이상 골라주세요');
    const row = (l, f) => `<tr><th>${l}</th>${L.map(x => `<td>${f(x)}</td>`).join('')}</tr>`;
    return openSheet(`<h2>지원자 비교</h2><div class="tbl"><table class="cmpt"><thead><tr><th></th>${L.map(x => `<th>${esc(x.name)}</th>`).join('')}</tr></thead><tbody>${row('경력', x => `${x.career_months}개월`)}${row('완료 근무', x => `${x.rep?.done ?? 0}건`)}${row('재호출', x => x.rep?.recall_pct == null ? '-' : x.rep.recall_pct + '%')}${row('노쇼', x => `<b class="${x.rep?.noshow ? 'down' : ''}">${x.rep?.noshow ?? 0}회</b>`)}${row('교육', x => x.rep?.edu ? '수료' : '-')}${row('할 수 있는 것', x => skillTags(x.rep?.skills) || '-')}${row('소개', x => `<small>${esc((x.bio || '').slice(0, 80))}</small>`)}${row('', x => x.status === 'applied' ? `<button class="btn sm pri" data-act="hire" data-a="${x.app_id}" data-p="${d.p}" data-k="${d.k}">채용하기</button>` : '')}</tbody></table></div><button class="btn full" data-act="close">닫기</button>`); }
  if (a === 'post-preview') { const f = $('#post-form'); if (!f) return; const v = Object.fromEntries(new FormData(f)), urg = !f.elements.ptype; const pf = [...f.querySelectorAll('[name=pf]:checked')].map(x => x.value).concat(v.pf_etc ? [v.pf_etc] : []);
    const j = { id: 'pv', kind: urg ? 'urgent' : 'hire', job_role: v.role, title: v.title || '(제목)', body: [v.body, v.park && '🅿 주차: ' + v.park, v.dress && '👔 복장: ' + v.dress, v.rule && '📌 ' + v.rule].filter(Boolean).join('\n'), store_name: S.store.name, area: S.store.area, address: S.store.address, taxi_amt: +digits(v.taxi) || 0, flash: !!f.elements.flash?.checked, incentive: v.inc_on === '1' ? v.inc : '', prefer: pf.join(', '), expires_at: new Date(Date.now() + 6 * 36e5).toISOString(),
      slots: urg ? Array.from({ length: +v.heads || 1 }, () => ({ start: v.s, end: v.e, pay: +digits(v.pay) || 0, status: 'OPEN' })) : [], pay_text: urg ? '' : v.ptype === '협의' ? '급여 협의' : `${v.ptype} ₩${E.won(+digits(v.pamt) || 0)}${v.nego ? ' · 협의 가능' : ''}`, work_time: urg ? '' : `${[...f.querySelectorAll('[name=wd]:checked')].map(x => x.value).join('·')} ${v.s}–${v.e}` };
    return openSheet(`<h2>딜러에게 이렇게 보여요</h2><p class="sub">아직 올라가지 않았어요. 닫고 고치거나 올리세요.</p>${jobCard(j, true)}<button class="btn full" data-act="close" style="margin-top:12px">닫고 계속 쓰기</button>`); }
  if (a === 'memo-save') return busy(async () => { const t = $('#mmemo')?.value || ''; await q(sb.from('member_notes').upsert({ member_id: d.m, memo: t, updated_at: new Date().toISOString() })); toast('메모를 저장했어요'); });
  if (a === 'lbud') return openSheet(`<h2>인건비 예산</h2><p class="sub">홀덤펍은 보통 매출의 25~35%예요</p><form class="f" id="lbud-form"><label class="fl">매출의 몇 %까지<input name="pct" type="number" min="5" max="80" step="1" value="${+S.store.equip?.labor_pct || 30}" required></label><button class="btn pri full">저장</button></form>`);
  if (a === 'ins-done') return busy(async () => { const p = S.members.find(x => x.id === d.m); await q(sb.from('members').update({ checks: { ...(p.checks || {}), ins_in: TODAY } }).eq('id', d.m)); await reload(); toast('신고 완료로 표시했어요'); });
  if (a === 'kiosk') { document.body.classList.add('kiosk'); document.documentElement.requestFullscreen?.().catch(() => { }); try { navigator.wakeLock?.request('screen').then(w => S.wake = w, () => { }); } catch { } return toast('태블릿 모드예요. 직원은 이 화면의 QR·번호로 출퇴근해요'); }
  if (a === 'kiosk-off') return reauth(() => { document.body.classList.remove('kiosk'); document.exitFullscreen?.().catch(() => { }); S.wake?.release?.(); }, '태블릿 모드를 끝내려면 대표 확인이 필요해요');
  if (a === 'paylock') return reauth(() => busy(async () => { await q(sb.from('pay_locks').upsert({ store_id: S.store.id, month: monFirst(), on_: !!d.v, locked_at: new Date().toISOString() })); await reload(); toast(d.v ? `${S.m}월 급여를 마감했어요` : '마감을 풀었어요. 고친 뒤 다시 마감하세요'); }), d.v ? '마감하면 이 달 근무표·급여를 못 고쳐요' : '마감을 풀면 숫자를 다시 고칠 수 있어요');
  if (a === 'swap') return busy(async () => { await q(sb.rpc('swap_act', { p_id: d.v, p_ok: !!d.ok })); toast(d.ok ? '처리했어요' : '거절했어요'); await reload(); });
  if (a === 'swap-new') return busy(async () => { const me = S.my[S.mi || 0], co = await q(sb.rpc('my_coworkers', { p_member: me.id })), days = []; for (let i = 0; i < 30 && days.length < 12; i++) { const k = addDay(TODAY, i), [y, m, dd] = k.split('-').map(Number), t = E.shiftOn(me.id, y, m, dd, S.tpl, S.ov); if (t) days.push([k, `${mdKr(k)} ${t5(t.s)}–${t5(t.e)}`]); }
    if (!days.length) return toast('앞으로 30일 안에 잡힌 근무가 없어요'); openSheet(`<h2>근무 바꾸기</h2><form class="f" id="swap-form"><label class="fl">바꿀 근무<select name="day">${days.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label><label class="fl">누구에게<select name="to" required>${co.map(c => `<option value="${c.id}">${esc(c.nick)}</option>`).join('')}</select></label><label class="fl">한마디<input name="note" placeholder="예: 가족 행사가 있어요"></label><button class="btn pri full">요청 보내기</button></form>`); });
  if (a === 'save') return busy(async () => { const on = !saved(d.k, d.v); await q(sb.from('dealer_saves').upsert({ user_id: S.user.id, kind: d.k, ref: d.v, on_: on })); S.saves = on ? [...(S.saves || []), { kind: d.k, ref: d.v }] : (S.saves || []).filter(x => !(x.kind === d.k && x.ref === d.v)); render(); toast(on ? (d.k === 'post' ? '찜했어요' : '이 매장 새 공고가 뜨면 알려드릴게요') : '해제했어요'); });
  if (a === 'savedonly') { S.savedOnly = !S.savedOnly; return render(); }
  if (a === 'jmore') return openSheet(`<h2>공고 더 보기</h2><div class="mn-list"><button data-act="jrep" data-p="${d.p}">🚩 허위·이상한 공고 신고<i>›</i></button><button data-act="jblock" data-s="${d.s}">🚫 이 매장 공고 안 보기<i>›</i></button></div>`);
  if (a === 'jrep') return openSheet(`<h2>공고 신고</h2><form class="f" id="jrep-form" data-p="${d.p}"><div class="seg brk" style="flex-wrap:wrap">${['급여가 달라요', '없는 매장 같아요', '불법·성인 업소', '연락이 안 돼요', '기타'].map((x, i) => `<label style="flex:1 1 45%"><input type="radio" name="why" value="${x}" ${i ? '' : 'checked'}><span>${x}</span></label>`).join('')}</div><label class="fl">자세히 (선택)<input name="memo"></label><button class="btn pri full">신고하기</button><p class="note">운영사가 확인해요. 3명 넘게 신고하면 바로 내려가요.</p></form>`);
  if (a === 'jblock') return busy(async () => { await q(sb.from('blocks').upsert({ store_id: d.s, dealer_id: S.user.id, by: 'dealer', on_: true })); S.board = (S.board || []).filter(j => j.store_id !== d.s); S.myBlocks = [...(S.myBlocks || []), { store_id: d.s }]; closeSheet(); render(); toast('이 매장 공고는 이제 안 보여요. 내 정보에서 풀 수 있어요'); });
  if (a === 'my-blocks') return busy(async () => { const ids = (S.myBlocks || []).map(x => x.store_id), nm = {}; (S.board || []).forEach(j => nm[j.store_id] = j.store_name); (S.slots || []).forEach(s => s.store_id && (nm[s.store_id] = s.store_name)); openSheet(`<h2>안 보는 매장</h2>${ids.map(id => `<div class="li"><span>${esc(nm[id] || '매장')}</span><button class="btn sm" data-act="unblock" data-s="${id}">다시 보기</button></div>`).join('')}`); });
  if (a === 'unblock') return busy(async () => { await q(sb.from('blocks').update({ on_: false }).match({ store_id: d.s, dealer_id: S.user.id, by: 'dealer' })); S.myBlocks = (S.myBlocks || []).filter(x => x.store_id !== d.s); closeSheet(); await reload(); toast('다시 보여요'); });
  if (a === 'cond') { const sl = (S.slots || []).find(x => x.slot_id === d.s); return openSheet(`<h2>근무 조건 확인서</h2><div class="kvbox"><div><small>매장</small><b>${esc(sl.store_name)}</b></div><div><small>근무일</small><b>${sl.work_day || '-'}</b></div><div><small>시간</small><b>${t5(sl.start_t)}–${t5(sl.end_t)} (${slotHours(sl)}시간)</b></div><div><small>일당</small><b>₩${E.won(sl.pay)}</b></div><div><small>받는 돈</small><b>₩${E.won(Math.round(sl.pay * 0.967))} <small class="mut">3.3% 원천세 뺀 금액</small></b></div><div><small>지급</small><b>매장 확인 후 지갑으로</b></div></div>${sl.address ? `<p class="note">📍 ${esc(sl.address)}${sl.entry_note ? `<br>🚪 ${esc(sl.entry_note)}` : ''}</p>` : ''}<p class="note">연장 근무는 매장이 +1시간 단위로 추가해요. 노쇼는 평판에 남고, 문제가 생기면 근무 카드에서 바로 신고할 수 있어요.</p>${sl.ack_at ? `<p class="mut">✓ ${fmtDT(sl.ack_at)}에 확인했어요</p>` : `<button class="btn pri full" data-act="cond-ok" data-s="${d.s}">조건 확인했어요</button>`}`); }
  if (a === 'cond-ok') return busy(async () => { await q(sb.rpc('slot_ack', { p_slot: d.s })); const sl = (S.slots || []).find(x => x.slot_id === d.s); if (sl) sl.ack_at = new Date().toISOString(); closeSheet(); render(); toast('확인했어요. 매장에도 표시돼요'); });
  if (a === 'slip') { const sl = (S.slots || []).find(x => x.slot_id === d.s), r = sl.result || {}; return openSheet(`<div class="print-area"><h2>근무 정산서</h2><div class="kvbox"><div><small>매장</small><b>${esc(sl.store_name)}</b></div><div><small>근무일</small><b>${sl.work_day || ''}</b></div><div><small>시간</small><b>${t5(sl.start_t)}–${t5(sl.end_t)}</b></div><div><small>일당</small><b>₩${E.won(sl.pay)}</b></div>${sl.extra ? `<div><small>연장</small><b>₩${E.won(sl.extra)}</b></div>` : ''}<div><small>지급 총액</small><b>₩${E.won(r.gross ?? sl.pay + sl.extra)}</b></div><div><small>원천세 (3.3%)</small><b>−₩${E.won(r.tax || 0)}</b></div><div><small>받은 돈</small><b class="up">₩${E.won(r.net || 0)}</b></div><div><small>완료</small><b>${sl.done_at ? fmtDT(sl.done_at) : '-'}</b></div></div></div><button class="btn full no-print" data-act="print">인쇄 · PDF</button>`); }
  if (a === 'rate') return openSheet(`<h2>매장 평가</h2><p class="sub">매장에는 안 보이고 운영사만 봐요. 좋은 매장이 위로 오게 쓰여요.</p><form class="f" id="rate-st" data-s="${d.s}" data-st="${d.st}"><div class="stars">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="score" value="${n}" ${n === 5 ? 'checked' : ''}><span>${'★'.repeat(n)}</span></label>`).join('')}</div><label class="fl">한 줄 (선택)<input name="memo" maxlength="100" placeholder="예: 시간 잘 지키고 친절해요"></label><button class="btn pri full">보내기</button></form>`);
  if (a === 'egoal') return openSheet(`<h2>이번 달 수입 목표</h2><form class="f" id="egoal-form"><label class="fl">목표 (원)<input name="g" type="number" step="10000" value="${+lsGet('ev_egoal') || 1000000}"></label><button class="btn pri full">저장</button><p class="note">이 폰에만 저장돼요.</p></form>`);
  if (a === 'cert') return certSheet();
  if (a === 'cv-link') { const u = `${location.origin}/?cv=${S.user.id}`; navigator.clipboard?.writeText(u).then(() => toast('이력서 링크를 복사했어요. 매장에 보내보세요'), () => toast(u)); return; }
  if (a === 'my-data') { const p = S.prof; download(`내데이터_${TODAY}.csv`, [['[프로필]'], ['이름', '연락처', '경력(개월)', '지역', '은행', '계좌', '예금주'], [p.name || '', p.phone || '', p.career_months || 0, p.area || '', p.bank_name || '', p.bank_acct || '', p.bank_holder || ''], [], ['[근무]'], ['근무일', '매장', '공고', '시작', '끝', '일당', '연장', '상태', '받은 돈', '원천세'], ...(S.slots || []).map(s => [s.work_day || '', s.store_name, s.title, t5(s.start_t), t5(s.end_t), s.pay, s.extra, SLOT[s.status]?.[1] || s.status, s.result?.net ?? '', s.result?.tax ?? '']), [], ['[지원]'], ['날짜', '매장', '공고', '상태'], ...(S.apps || []).map(a2 => [String(a2.created_at).slice(0, 10), a2.store_name, a2.title, a2.status]), [], ['[출금]'], ['날짜', '금액', '수수료', '상태'], ...(S.wds || []).map(x => [String(x.created_at).slice(0, 10), x.amount, x.fee || 0, x.status])]); return; }
  if (a === 'ns-appeal') return openSheet(`<h2>노쇼 기록 이의 신청</h2><p class="sub">억울한 노쇼 기록이면 이유를 적어주세요. 운영사가 매장에 확인하고 지워드려요.</p><form class="f" id="ns-form"><label class="fl">어느 매장·날짜<input name="where" required placeholder="예: 강남 1호점 10/2"></label><label class="fl">이유<textarea name="why" rows="3" required placeholder="예: 매장이 시간을 바꿨는데 연락을 못 받았어요"></textarea></label><button class="btn pri full">보내기</button></form>`);
  if (a === 'faq') return busy(async () => { const L = await q(sb.from('faq').select('*').eq('on_', true).order('sort')); openSheet(`<h2>자주 묻는 질문</h2>${L.map(x => `<details class="more faq"><summary><b>${esc(x.q)}</b></summary><p>${esc(x.a)}</p></details>`).join('') || '<p class="mut">아직 등록된 질문이 없어요</p>'}<button class="btn full" data-act="fb-open" style="margin-top:10px">답이 없으면 운영사에 묻기</button>`); });
  if (a === 'faq-load') return busy(async () => { S.faqs = await q(sb.from('faq').select('*').order('sort')); const el = $('#faq-hq'); if (el) el.innerHTML = S.faqs.map(x => `<div class="li"><span><b>${esc(x.q)}</b>${x.on_ ? '' : ' <span class="pill">숨김</span>'}</span><button class="btn sm" data-act="faq-edit" data-v="${x.id}">수정</button></div>`).join('') || '<small class="mut">없어요</small>'; });
  if (a === 'faq-edit') { const x = (S.faqs || []).find(f => String(f.id) === d.v) || {}; return openSheet(`<h2>질문 ${x.id ? '수정' : '추가'}</h2><form class="f" id="faq-form" data-v="${x.id || ''}"><label class="fl">질문<input name="q" required value="${esc(x.q || '')}"></label><label class="fl">답<textarea name="a" rows="5" required>${esc(x.a || '')}</textarea></label><div class="grid2"><label class="fl">순서<input name="sort" type="number" value="${x.sort ?? 0}"></label><label class="tog"><span><b>보이기</b></span><input type="checkbox" name="on" ${x.on_ !== false ? 'checked' : ''}></label></div><button class="btn pri full">저장</button></form>`); }
  if (a === 'blk-app') return busy(async () => { await q(sb.rpc('block_app', { p_app: d.a })); toast('차단했어요. 이 딜러는 우리 공고를 못 봐요'); await manage(d.p, d.k); });
  if (a === 'blk-list') return busy(async () => { const L = await q(sb.rpc('store_blocks', { p_store: S.store.id })); openSheet(`<h2>차단한 딜러</h2>${L.map(x => `<div class="li"><span>${esc(x.name || '딜러')} <small class="mut">${fmtDT(x.at)}</small></span><button class="btn sm" data-act="unblk" data-v="${x.dealer_id}">풀기</button></div>`).join('') || '<p class="mut">없어요</p>'}`); });
  if (a === 'unblk') return busy(async () => { await q(sb.from('blocks').update({ on_: false }).match({ store_id: S.store.id, dealer_id: d.v, by: 'store' })); closeSheet(); toast('차단을 풀었어요'); });
  if (a === 'snote') return openSheet(`<h2>딜러에게 한마디</h2><p class="sub">딜러 근무 카드에 보이고 알림이 가요</p><form class="f" id="snote-form" data-s="${d.s}" data-p="${d.p}" data-k="${d.k}"><input name="note" maxlength="200" placeholder="예: 오늘 진행 깔끔했어요! 다음에도 부를게요" required><button class="btn pri full" style="margin-top:8px">보내기</button></form>`);
  if (a === 'notis') { notiSheet(); return; }
  if (a === 'noti-read') return busy(async () => { await q(sb.from('notifications').update({ read: true }).eq('read', false)); (S.notis || []).forEach(x => x.read = true); notiSheet(); render(); });
  if (a === 'noti-clear') return busy(async () => { const ids = (S.notis || []).map(x => x.id); await q(sb.from('notifications').update({ hidden: true, read: true }).in('id', ids)); S.notis = []; notiSheet(); render(); toast('알림을 지웠어요'); });
  if (a === 'noti-more') return busy(async () => { const L = S.notis || [], more = await q(sb.from('notifications').select('*').neq('hidden', true).order('created_at', { ascending: false }).range(L.length, L.length + 29)); S.notis = [...L, ...more]; notiSheet(); });
  if (a === 'noti-cfg') { closeSheet(); return menuSheet(); }
  if (a === 'dnd') { const v = S.prof?.dnd || {}; return openSheet(`<h2>방해 금지 시간</h2><p class="sub">이 시간엔 알림 소리를 안 내요. 끝나면 모아서 보내요.</p><form class="f" id="dnd-form"><div class="grid2"><label class="fl">시작<input type="time" name="f" value="${v.f || '04:00'}"></label><label class="fl">끝<input type="time" name="t" value="${v.t || '11:00'}"></label></div><button class="btn pri full">켜기</button>${v.f ? '<button type="button" class="btn full" data-act="dnd-off" style="margin-top:8px">끄기</button>' : ''}</form>`); }
  if (a === 'dnd-off') return busy(async () => { await q(sb.from('profiles').update({ dnd: null }).eq('id', S.user.id)); S.prof.dnd = null; closeSheet(); toast('방해 금지를 껐어요'); });
  if (a === 'pin-set') return lsGet('ev_pin') ? reauth(() => { lsSet('ev_pin', ''); closeSheet(); toast('앱 잠금을 껐어요'); }, 'PIN 잠금을 끄려면 확인이 필요해요') : openSheet(`<h2>앱 잠금 PIN</h2><p class="sub">앱을 열거나 3분 넘게 나갔다 오면 PIN을 물어요. 이 폰에만 저장돼요.</p><form class="f" id="pin-form"><label class="fl">PIN 4~6자리<input name="pin" type="password" inputmode="numeric" minlength="4" maxlength="6" pattern="[0-9]{4,6}" required></label><label class="fl">한 번 더<input name="pin2" type="password" inputmode="numeric" maxlength="6" required></label><button class="btn pri full">잠금 켜기</button></form>`);
  if (a === 'pin-forgot') return busy(async () => { lsSet('ev_pin', ''); $('#pinlock')?.remove(); await sb.auth.signOut(); location.reload(); });
  if (a === 'logout-all') return reauth(() => busy(async () => { await sb.auth.signOut({ scope: 'global' }); lsSet('ev_pin', ''); location.reload(); }), '이 폰을 포함해 모든 기기에서 로그아웃해요');
  if (a === 'code-new') return reauth(() => busy(async () => { const c = 'D-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join(''); await q(sb.from('stores').update({ join_code: c }).eq('id', S.store.id)); S.store.join_code = c; closeSheet(); render(); toast(`새 가입코드 ${c} · 예전 코드는 이제 안 돼요`); }), '가입코드를 바꾸면 예전 코드로는 소속 신청이 안 돼요');
  if (a === 'backups') return reauth(() => backupSheet(), '직원 개인정보가 들어 있어 한 번 더 확인해요');
  if (a === 'bk-get') return busy(async () => { const { data: b } = await sb.from('store_backups').select('made_at,data').eq('id', d.v).single(); const D = b.data, M = D.members || [], Rp = D.reports || [], X = D.expenses || [];
    download(`자동백업_${S.store.name}_${String(b.made_at).slice(0, 10)}.csv`, [['[직원]'], ['닉네임', '실명', '직책', '계약', '시급', '입사일', '연락처', '재직'], ...M.map(p => [p.nick, p.real_name || '', p.job_role || '', p.contract, p.hourly_rate, p.joined_on || '', p.phone || '', p.active ? 'O' : '퇴사']), [], ['[매출]'], ['날짜', '총매출', '엔트리', '카드', '현금', '이체', '현금지출', '금고차액', '메모'], ...Rp.sort((a, c) => c.report_date.localeCompare(a.report_date)).map(r => [r.report_date, r.sales, r.entries ?? '', r.card, r.cash, r.transfer, r.expense, r.cash_diff ?? '', r.memo || '']), [], ['[지출]'], ['날짜', '항목', '금액'], ...X.map(x => [x.spent_on, CAT[x.category] || x.category, x.amount])]); });
  if (a === 'help') return openSheet(`<h2>도움말</h2><p style="font-size:15px;line-height:1.7">${esc(HELP[d.v] || '')}</p><button class="btn full" data-act="close">알겠어요</button>`);
  if (a === 'ops-open') { S.notes = null; if (S.mode === 'staff') { S.sub = 'ops'; render(); } else { S.tab = 'more'; S.sub = 'ops'; render(); } return scrollTo(0, 0); }
  if (a === 'ops-close') { S.sub = null; return render(); }
  if (a === 'opsf') { S.opsF = d.v; return render(); }
  if (a === 'sos') return sosSheet();
  if (a === 'note-new') return noteSheet();
  if (a === 'chk') return busy(async () => { const day = bizDay(), row = S.notes.find(n => n.kind === 'check' && n.data?.day === day && n.data?.type === d.t), done = new Set(row?.data?.done || []); b.checked ? done.add(+d.i) : done.delete(+d.i); const data = { day, type: d.t, done: [...done], by: myNick() };
    if (row) await q(sb.from('store_notes').update({ data }).eq('id', row.id)); else await q(sb.from('store_notes').insert({ store_id: opsStore(), kind: 'check', data })); await opsLoad(); });
  if (a === 'chk-edit') { const tpl = S.notes.find(n => n.kind === 'checklist')?.data || CHK0; return openSheet(`<h2>${d.v === 'open' ? '오픈' : '마감'} 체크 항목</h2><form class="f" id="chk-form" data-t="${d.v}"><label class="fl">한 줄에 하나씩<textarea name="items" rows="8">${esc((tpl[d.v] || []).join('\n'))}</textarea></label><button class="btn pri full">저장</button></form>`); }
  if (a === 'vote') return busy(async () => { await q(sb.from('store_note_marks').upsert({ note_id: d.v, user_id: S.user.id, val: d.i })); await opsLoad(); });
  if (a === 'nread') return busy(async () => { await q(sb.from('store_note_marks').upsert({ note_id: d.v, user_id: S.user.id, val: 'read' })); await opsLoad(); });
  if (a === 'pin') return busy(async () => { const n = S.notes.find(x => String(x.id) === d.v); await q(sb.from('store_notes').update({ pinned: !n.pinned }).eq('id', n.id)); await opsLoad(); });
  if (a === 'nstat') return busy(async () => { await q(sb.from('store_notes').update({ status: d.s, done_at: new Date().toISOString() }).eq('id', d.v)); await opsLoad(); toast('처리했어요'); });
  if (a === 'ndel') return busy(async () => { await q(sb.from('store_notes').delete().eq('id', d.v)); await opsLoad(); toast('지웠어요'); });
  if (a === 'edu') return busy(async () => { const p = S.members.find(x => x.id === d.m), e = new Set(p.checks?.edu || []); e.has(d.v) ? e.delete(d.v) : e.add(d.v); await q(sb.from('members').update({ checks: { ...(p.checks || {}), edu: [...e] } }).eq('id', d.m)); p.checks = { ...(p.checks || {}), edu: [...e] }; b.classList.toggle('on'); });
  if (a === 'paid') return busy(async () => { const k = { member_id: d.m, month: monFirst() }; if (d.v) await q(sb.from('pay_marks').upsert({ ...k, paid_at: new Date().toISOString() })); else await q(sb.from('pay_marks').update({ paid_at: null }).match(k)); await reload(); toast(d.v ? '지급 완료로 표시했어요. 직원 앱에도 보여요' : '지급 표시를 취소했어요'); });
  if (a === 'adv-new') return openSheet(`<h2>가불 기록</h2><p class="sub">${S.m}월 급여 이체할 돈에서 빠져요</p><form class="f" id="adv-form" data-m="${d.m}"><div class="grid2"><label class="fl">금액<input name="amount" type="number" inputmode="numeric" required></label><label class="fl">준 날<input name="date" type="date" value="${TODAY}"></label></div><label class="fl">메모<input name="memo" placeholder="예: 병원비"></label><button class="btn pri full">저장</button></form>`);
  if (a === 'adv-del') return busy(async () => { await q(sb.from('advances').delete().eq('id', d.v)); await reload(); toast('가불 기록을 지웠어요'); });
  if (a === 'pay-seen') return busy(async () => { await q(sb.rpc('pay_seen', { p_member: d.m, p_month: d.v })); await reload(); toast('확인했어요'); });
  if (a === 'rate-bulk') return reauth(() => openSheet(`<h2>시급 한 번에 바꾸기</h2><form class="f" id="rate-form"><div class="fl"><span>누구</span><div class="seg brk">${['전체', ...EMP].map((t, i) => `<label><input type="radio" name="who" value="${t}" ${i ? '' : 'checked'}><span>${t}</span></label>`).join('')}</div></div><div class="seg"><label><input type="radio" name="how" value="add" checked><span>+ 금액 올리기</span></label><label><input type="radio" name="how" value="min"><span>최저임금 미만만 맞추기</span></label></div><label class="fl">올릴 금액 (원)<input name="amt" type="number" step="10" value="500"></label><p class="note">${TODAY.slice(0, 4)}년 최저임금 ₩${E.won(minWage())}</p><button class="btn pri full">바꾸기</button></form>`), '여러 직원 시급을 한 번에 바꿔요');
  if (a === 'toss-link') return busy(async () => { await q(sb.rpc('toss_link', { p_merchant: +d.v, p_store: S.store.id })); toast('토스 POS를 연결했어요'); await tossLoad(1); });
  if (a === 'pos-fill') return busy(async () => { const f = $('#report-form'); if (!f) return; const dt = f.elements.date?.value || bizDay(), t = (await q(sb.rpc('pos_day_summary', { p_store: S.store.id, p_date: dt }))) || {}; if (!t.total) return toast(`${dt.slice(5).replace('-', '/')} 토스 POS 결제가 아직 없어요`);
    const set = (n, v) => { if (f.elements[n]) { f.elements[n].value = v; f.elements[n].dispatchEvent(new Event('input', { bubbles: true })); } }; set('sales', t.total); set('card', t.card); set('transfer', (t.transfer || 0) + (t.other || 0)); f.querySelector('details.more')?.setAttribute('open', ''); closeCalc(); f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`토스 POS ${t.n}건 · ₩${E.won(t.total)}을 채웠어요. 숫자 확인하고 마감하세요`); });
  if (a === 'wmon') { let y = S.wy || now.getFullYear(), m = (S.wm || now.getMonth() + 1) + +d.v; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } S.wy = y; S.wm = m; return render(); }
  if (a === 'big') { const on = b.checked; lsSet('ev_big', on ? '1' : ''); document.documentElement.classList.toggle('big', on); return; }
  if (a === 'srch-go') { closeSheet(); if (d.s) { S.tab = 'more'; S.sub = d.s; } else if (d.t) { S.tab = d.t; S.sub = null; } render(); return scrollTo(0, 0); }
  if (a === 'ver-go') return location.reload();
  if (a === 'pw-change') return openSheet(`<h2>비밀번호 바꾸기</h2><form class="f" id="pwc-form"><label class="fl">지금 비밀번호<input name="old" type="password" required autocomplete="current-password"></label><label class="fl">새 비밀번호<input name="pw" type="password" minlength="6" required autocomplete="new-password"></label><label class="fl">새 비밀번호 한 번 더<input name="pw2" type="password" minlength="6" required autocomplete="new-password"></label><button class="btn pri full">바꾸기</button><button type="button" class="btn full" data-act="close">취소</button></form>`);
  if (a === 'acct-del') return openSheet(`<h2>회원 탈퇴</h2><div class="del-warn"><b>탈퇴하면 이렇게 돼요</b><ul><li>이름·연락처·계좌·자기소개가 지워져요</li><li>지원 중인 공고는 자동으로 취소돼요</li><li>근무·급여 기록은 법에 따라 매장에 남아요</li><li>지갑에 1,000원 이상 남아 있으면 먼저 출금해 주세요</li></ul></div><form class="f" id="del-form"><label class="fl">확인을 위해 '탈퇴'라고 적어주세요<input name="word" autocomplete="off" required></label><button class="btn red full">탈퇴하기</button><button type="button" class="btn full" data-act="close">그만두기</button></form>`);
  if (a === 'app-cancel') return busy(async () => { if (!confirm('이 지원을 취소할까요?')) return; await q(sb.rpc('cancel_apply', { p_app: d.a })); await reload(); toast('지원을 취소했어요'); });
  if (a === 'post-close' || a === 'post-reopen') return busy(async () => { const op = a === 'post-close'; if (op && !confirm('공고를 내릴까요? 더 이상 지원이 들어오지 않아요.')) return; await q(sb.from('job_posts').update({ status: op ? 'closed' : 'open' }).eq('id', d.p)); await reload(); toast(op ? '공고를 내렸어요' : '공고를 다시 열었어요'); });
  if (a === 'bd-report') return busy(async () => { if (!confirm('이 글을 신고할까요? 3명이 신고하면 바로 가려져요.')) return; const n = await q(sb.rpc('board_report', { p_id: +d.v })); toast(n >= 3 ? '신고가 모여 글을 가렸어요' : '신고했어요. 운영사가 확인해요'); S.lgAt = 0; closeSheet(); await loungeLoad(1); });
  if (a === 'print') { document.documentElement.classList.add('printing'); setTimeout(() => { window.print(); document.documentElement.classList.remove('printing'); }, 60); return; }
  if (a === 'theme') { lsSet('ev_theme', d.v === 'mint' ? '' : d.v); applyTheme(themeNow()); return menuSheet(); }
  if (a === 'refresh') return refreshNow(b);
  if (a === 'logout') busy(async () => { S.byMe = 1; closeSheet(); await sb.auth.signOut(); });
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
  if (a === 'cellsel') { if (e.target.closest?.('.dn, .chip')) return; S.selCell = d.d; S.sels = []; render(); return; }
  if (a === 'unsel') { S.sels = []; S.selCell = null; render(); return; }
  if (a === 'edit-d') { S.edit = { memberId: d.m, date: d.d }; shiftSheet(S.edit); }
  if (a === 'add-d') { S.edit = { date: d.d, add: true }; shiftSheet(S.edit); }
  if (a === 'edit-w') { S.edit = { memberId: d.m, weekday: +d.w }; shiftSheet(S.edit); }
  if (a === 'shift-off') busy(async () => {
    const { memberId, date, weekday } = S.edit;
    const prev = date ? (S.ov || []).find(o => o.member_id === memberId && o.work_date === date) : (S.tpl || []).find(t => t.member_id === memberId && t.weekday === weekday);
    if (date) await q(sb.from('shift_overrides').upsert({ member_id: memberId, work_date: date, off: true, start_t: null, end_t: null, break_min: null }));
    else await q(sb.from('shift_templates').delete().eq('member_id', memberId).eq('weekday', weekday));
    closeSheet(); await reload();
    undoToast('휴무로 바꿨어요', () => busy(async () => { if (date) { if (prev) { const { id: _i, ...o } = prev; await q(sb.from('shift_overrides').upsert(o)); } else await q(sb.from('shift_overrides').delete().eq('member_id', memberId).eq('work_date', date)); } else if (prev) { const { id: _i, ...t } = prev; await q(sb.from('shift_templates').insert(t)); } await reload(); toast('되돌렸어요'); }));
  });
  if (a === 'kakao') return busy(async () => { const { error } = await sb.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: location.origin + location.pathname } }); if (error) toast('카카오 로그인이 아직 준비 중이에요'); });
  if (a === 'otp-send') { const ph = ($('#dealer-form [name=phone]')?.value || '').trim(); return busy(async () => { const { data, error } = await sb.functions.invoke('phone-otp', { body: { action: 'send', phone: ph } }); if (error || !data?.ok) return toast(data?.msg || '문자 발송에 실패했어요'); openSheet(`<h2>인증번호 입력</h2><p class="sub">${esc(ph)}로 보낸 6자리 숫자를 넣어주세요 (3분 안에)</p><form class="f" id="otp-form"><input name="code" required inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="text-align:center;letter-spacing:.3em;font-size:22px"><button class="btn pri full">확인</button></form>`); }); }
  if (a === 'pw-eye') { const i = b.closest('.pwwrap').querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? '👁' : '🙈'; return; }
  if (a === 'pw-forgot') { const em = ($('#auth-form [name=email]')?.value || '').trim(); if (!em) return toast('이메일을 먼저 적어주세요'); return busy(async () => { const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname }); toast(error ? error.message : '재설정 메일을 보냈어요. 메일의 버튼을 누르면 새 비밀번호를 정할 수 있어요'); }); }
  if (a === 'biz-check') return busy(async () => { const { data, error } = await sb.functions.invoke('biz-verify', { body: { company_id: S.company.id } }); if (error || !data?.ok) return toast(data?.msg || '국세청 조회에 실패했어요. 잠시 후 다시 해주세요'); toast(`국세청 확인: ${data.status}`); await boot(); });
  if (a === 'xrow-add') { $('#close-exp')?.insertAdjacentHTML('beforeend', xrowHtml()); return; }
  if (a === 'xrow-del') { b.closest('.xrow')?.remove(); xsum(); return; }
  if (a === 'staff-new') staffSheet(null);
  if (a === 'doc-new') return contractSheet(d.m);
  if (a === 'doc-slip') return slipSheet(d.m);
  if (a === 'doc-open') { location.href = docUrl(d.v, true); return; }
  if (a === 'doc-link') { navigator.clipboard?.writeText(docUrl(d.v)).then(() => toast('서명 링크를 복사했어요'), () => toast(docUrl(d.v))); return; }
  if (a === 'doc-share') { navigator.share?.({ title: '+EV 전자 서류', text: '근로계약서/명세서를 확인하고 서명해 주세요', url: docUrl(d.v) }).catch(() => { }); return; }
  if (a === 'sig-clear') { PAD?.clear(); useLast = false; return; }
  if (a === 'sig-last') { const cv = $('#own-cv'), img = new Image(); img.onload = () => { PAD?.clear(); const g = cv.getContext('2d'), r = window.devicePixelRatio || 1; g.drawImage(img, 0, 0, cv.width / r, cv.height / r); useLast = true; }; img.src = lastSig(); return; }
  if (a === 'tpl-edit') return tplSheet();
  if (a === 'doc-bulk') return bulkSheet();
  if (a === 'tpl-save') return busy(async () => {
    const v = formVals($('#tpl-form')), t = { place: v.place, duty: v.duty, days: v.days, tf: v.tf, tt: v.tt, brk: +v.brk || 0, payday: +v.payday || 10, extra: v.extra || '' };
    await q(sb.rpc('save_contract_tpl', { p_store: S.store.id, p_tpl: t })); S.store.contract_tpl = t; closeSheet(); render(); toast('표준 계약서 양식을 저장했어요');
  });
  if (a === 'doc-send') return busy(async () => {
    const f = $('#doc-form'), v = formVals(f), p = S.members.find(x => x.id === f.dataset.m), sig = ownerSig();
    if (!sig) return toast('대표 서명을 그려 주세요'); if (!+p.hourly_rate) return toast('직원 시급을 먼저 넣어 주세요');
    const open = f.querySelector('details')?.open, t = open ? { place: v.o_place, duty: v.o_duty, days: v.o_days, tf: v.o_tf, tt: v.o_tt, brk: v.o_brk, payday: v.o_payday, extra: v.o_extra } : tplOf();
    const terms = contractTerms(p, t, open ? v.start : null);
    const [r] = await q(sb.rpc('contract_create', { p_member: p.id, p_terms: terms, p_body: laborBody(terms), p_owner_sig: sig, p_kind: 'labor', p_title: '근로계약서' }));
    await afterSend(r.token, terms.employee_name);
  });
  if (a === 'bulk-send') return busy(async () => {
    const v = formVals($('#bulk-form')), L = needContract().filter(p => v['m_' + p.id]), sig = ownerSig();
    if (!L.length) return toast('보낼 직원을 골라 주세요'); if (!sig) return toast('대표 서명을 그려 주세요');
    const bad = L.filter(p => !+p.hourly_rate); if (bad.length) return toast(`${bad.map(p => p.nick).join(', ')}님 시급을 먼저 넣어 주세요`);
    for (const p of L) { const terms = contractTerms(p, tplOf()); await q(sb.rpc('contract_create', { p_member: p.id, p_terms: terms, p_body: laborBody(terms), p_owner_sig: sig, p_kind: 'labor', p_title: '근로계약서' })); }
    await reload(); closeSheet(); toast(`${L.length}명에게 근로계약서를 보냈어요`);
  });
  if (a === 'slip-bulk') { const L = S.members.filter(p => p.role !== 'owner' && !docOf(p.id, 'payslip', slipTitle())); if (!L.length) return toast(`${S.m}월 명세서를 모두 보냈어요`); const nx = new Date(S.y, S.m, +(S.store.contract_tpl?.payday || 10));
    openSheet(`<h2>${slipTitle()} 한 번에 보내기</h2><p class="sub">아직 안 보낸 직원에게 한꺼번에 보내요. 대표 서명은 한 번만 하면 돼요.${S.y === now.getFullYear() && S.m === now.getMonth() + 1 ? ' <b class="warn">이번 달은 어제까지 근무 기준이에요</b>' : ''}</p><form class="f" id="slipb-form"><label class="fl">지급일<input type="date" name="pay_date" value="${E.ymd(nx.getFullYear(), nx.getMonth() + 1, nx.getDate())}"></label>${L.map(p => { const r = payOf(p); return `<label class="tog"><span><b>${esc(p.real_name || p.nick)}</b><small>실지급 ₩${E.won(r.net)} · ${r.days}일</small></span><input type="checkbox" name="m_${p.id}" ${r.net > 0 ? 'checked' : ''}></label>`; }).join('')}${sigBlock()}<button type="button" class="btn pri full" data-act="slip-bulk-send">서명하고 선택한 직원에게 보내기</button></form>`); mountPad(); return; }
  if (a === 'slip-bulk-send') return busy(async () => { const v = formVals($('#slipb-form')), sig = ownerSig(), L = S.members.filter(p => v['m_' + p.id]); if (!L.length) return toast('보낼 직원을 골라 주세요'); if (!sig) return toast('대표 서명을 그려 주세요');
    for (const p of L) { const r = payOf(p), t = { ...baseTerms(p), period: `${S.y}년 ${S.m}월`, pay_date: v.pay_date, days: r.days, hours: r.hours.toFixed(1), lines: [['기본급', r.base], ['야간수당', r.np], ['연장수당', r.otp], ['주휴수당', r.juhu], ['인센티브', r.inc]].filter(([, x]) => x), gross: r.gross, ded: r.ded, net: r.net }; await q(sb.rpc('contract_create', { p_member: p.id, p_terms: t, p_body: payslipBody(t), p_owner_sig: sig, p_kind: 'payslip', p_title: slipTitle() })); }
    await reload(); closeSheet(); toast(`${L.length}명에게 명세서를 보냈어요`); });
  if (a === 'slip-send') return busy(async () => {
    const f = $('#slip-form'), v = formVals(f), p = S.members.find(x => x.id === f.dataset.m), sig = ownerSig(), r = payOf(p);
    if (!sig) return toast('대표 서명을 그려 주세요');
    const t = { ...baseTerms(p), period: `${S.y}년 ${S.m}월`, pay_date: v.pay_date, days: r.days, hours: r.hours.toFixed(1), lines: [['기본급', r.base], ['야간수당', r.np], ['연장수당', r.otp], ['주휴수당', r.juhu], ['인센티브', r.inc]].filter(([, x]) => x), gross: r.gross, ded: r.ded, net: r.net };
    const [o] = await q(sb.rpc('contract_create', { p_member: p.id, p_terms: t, p_body: payslipBody(t), p_owner_sig: sig, p_kind: 'payslip', p_title: slipTitle() }));
    await afterSend(o.token, t.employee_name);
  });
  if (a === 'peak-save') return busy(async () => { const peak = { from: $('#pk-f').value, to: $('#pk-t').value, extra: +$('#pk-n').value || 0 }; await q(sb.from('stores').update({ peak: peak.from && peak.to && peak.extra ? peak : null }).eq('id', S.store.id)); S.store.peak = peak.from && peak.to && peak.extra ? peak : null; render(); toast(S.store.peak ? `${peak.from}~${peak.to}에는 ${peak.extra}명 더 필요하게 맞췄어요` : '피크 시간을 지웠어요'); });
  if (a === 'exp-photo') return busy(async () => { const { data, error } = await sb.storage.from('receipts').createSignedUrl(d.p, 600); if (error) return toast('영수증을 열 수 없어요'); window.open(data.signedUrl, '_blank'); });
  if (a === 'bin') return busy(async () => { const L = await q(sb.from('bin_rows').select('*').eq('store_id', S.store.id).not('tbl', 'like', 'restored:%').gte('removed_at', new Date(Date.now() - 7 * 864e5).toISOString()).order('removed_at', { ascending: false }).limit(50));
    openSheet(`<h2>최근 삭제 (7일)</h2>${L.map(x => `<div class="li"><div><b>${x.tbl === 'expenses' ? `${CAT[x.row.category] || '비용'} ₩${E.won(x.row.amount)}` : `${x.row.report_date} 마감 ₩${E.won(x.row.sales)}`}</b><small>${fmtDT(x.removed_at)} 삭제</small></div><button class="btn sm pri" data-act="unbin" data-v="${x.id}">되살리기</button></div>`).join('') || '<div class="empty">최근 7일 동안 지운 기록이 없어요</div>'}`); });
  if (a === 'unbin') return busy(async () => { await q(sb.rpc('restore_bin', { p_id: +d.v })); closeSheet(); await reload(); toast('되살렸어요'); });
  if (a === 'geo-set') return busy(async () => { const p = await getPos(); if (!p) return toast('위치를 못 가져왔어요. 위치 권한을 허용해 주세요'); await q(sb.from('stores').update({ geo_lat: p.lat, geo_lng: p.lng }).eq('id', S.store.id)); Object.assign(S.store, { geo_lat: p.lat, geo_lng: p.lng }); toast('매장 위치를 저장했어요. 이제 매장 근처에서만 출퇴근돼요'); render(); });
  if (a === 'geo-off') return busy(async () => { await q(sb.from('stores').update({ geo_lat: null, geo_lng: null }).eq('id', S.store.id)); Object.assign(S.store, { geo_lat: null, geo_lng: null }); toast('위치 확인을 껐어요'); render(); });
  if (a === 'inc-rule') { const r = S.store.inc_rule || {}; openSheet(`<h2>인센티브 규칙</h2><p class="sub">정해두면 [이번 달 채우기] 한 번으로 직원별 인센티브가 들어가요. 0이면 안 줘요.</p><form class="f" id="inc-form"><label class="fl">근무 1회당 (원)<input name="per_shift" type="number" inputmode="numeric" value="${r.per_shift || ''}" placeholder="예: 5000"></label><label class="fl">개근 보너스 (원) <small class="mut">출퇴근 기록상 지각·누락 0회</small><input name="full_attend" type="number" inputmode="numeric" value="${r.full_attend || ''}"></label><label class="fl">매장 목표 달성 보너스 (원)<input name="goal_bonus" type="number" inputmode="numeric" value="${r.goal_bonus || ''}"></label><button class="btn full">규칙 저장</button><button type="button" class="btn pri full" data-act="inc-apply">${S.m}월 규칙대로 채우기</button></form>`); return; }
  if (a === 'inc-apply') return busy(async () => { const r = S.store.inc_rule || {}; if (!r.per_shift && !r.full_attend && !r.goal_bonus) return toast('먼저 규칙을 저장해 주세요'); const g = goalOf(S.y, S.m), hit = g && monthSummary(S.y, S.m).sales >= g, mon = E.ymd(S.y, S.m, 1), staff = S.members.filter(p => p.role !== 'owner');
    const rows = staff.map(p => { const pr = payOf(p), at = attOf(p), amt = (+r.per_shift || 0) * pr.days + (at && !at.late && !at.miss && pr.days ? +r.full_attend || 0 : 0) + (hit ? +r.goal_bonus || 0 : 0); return { member_id: p.id, month: mon, amount: amt, reason: '규칙' }; }).filter(x => x.amount > 0);
    await q(sb.from('incentives').delete().in('member_id', staff.map(p => p.id)).eq('month', mon).eq('reason', '규칙')); if (rows.length) await q(sb.from('incentives').insert(rows)); closeSheet(); await reload(); toast(`${rows.length}명에게 인센티브를 채웠어요 (어제까지 근무 기준)`); });
  if (a === 'paynote') return busy(async () => { const pd = new Date(S.y, S.m, +(S.store.contract_tpl?.payday || 10)); const { data, error } = await sb.functions.invoke('ai', { body: { store_id: S.store.id, mode: 'paynote', store: S.store.name, month: `${S.m}월`, pay_date: `${pd.getMonth() + 1}월 ${pd.getDate()}일`, n: S.members.filter(p => p.role !== 'owner').length } });
    if (error || !data?.ok) return toast(data?.msg || 'AI가 지금 답하지 않아요'); openSheet(`<h2>급여 안내문</h2><textarea id="pn-text" rows="7" style="width:100%">${esc(data.text)}</textarea><button class="btn pri full" data-act="copy-pn">복사해서 단톡방에 붙이기</button>`); });
  if (a === 'copy-pn') { navigator.clipboard?.writeText($('#pn-text').value).then(() => toast('복사했어요'), () => toast('복사가 막혀 있어요. 길게 눌러 복사해 주세요')); return; }
  if (a === 'perm') { const p = S.members.find(x => x.id === d.m), pm = p?.perms || {}; openSheet(`<h2>${esc(p?.nick || '')} 점장이 볼 수 있는 것</h2><form class="f" id="perm-form" data-m="${d.m}"><label class="tog"><span><b>매출·손익</b><small>홈 브리핑과 매출 탭</small></span><input type="checkbox" name="sales" ${pm.sales === false ? '' : 'checked'}></label><label class="tog"><span><b>급여 대장</b><small>직원별 급여·계좌</small></span><input type="checkbox" name="pay" ${pm.pay === false ? '' : 'checked'}></label><button class="btn pri full">저장</button></form><p class="note">스케줄·직원·구인은 항상 볼 수 있어요. 끄면 점장 화면에서 해당 메뉴가 사라져요.</p>`); return; }
  if (a === 'setup-help') return busy(async () => { await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store.id, body: `[세팅 대행 요청] ${S.store.name} · 직원·시급·근무표·고정비 입력을 도와주세요` })); toast('요청했어요. 운영사가 연락드리고 대신 입력해 드려요'); });
  if (a === 'staff-bulk') { openSheet(`<h2>엑셀에서 붙여넣기</h2><p class="sub">엑셀·구글시트에서 <b>이름 · 시급 · 직책 · 연락처</b> 순서로 칸을 복사해 붙이세요. 한 줄에 한 명이에요.</p><form class="f" id="bulk-form"><textarea name="t" rows="7" placeholder="에이스	13000	딜러	010-1111-2222&#10;민지	11000	플로어" style="width:100%"></textarea>${impFile('roster', '.csv,.xlsx,.xls,.txt,image/*')}<p class="note" id="bulk-pv">붙여넣으면 몇 명인지 바로 보여요</p><button class="btn pri full">한 번에 등록</button></form>`); return; }
  if (a === 'noti-cat') return busy(async () => { const off = new Set(S.prof.noti_off || []); off.has(d.v) ? off.delete(d.v) : off.add(d.v); await q(sb.from('profiles').update({ noti_off: [...off] }).eq('id', S.user.id)); S.prof.noti_off = [...off]; render(); });
  if (a === 'bench-why') { openSheet(`<h2>순위는 이렇게 비교해요</h2><div class="li"><span>비교 대상</span><b>+EV를 쓰는 홀덤펍 중 그 달 7일 이상 마감한 매장</b></div><div class="li"><span>크기 맞추기</span><b>전기·통신은 평당, 가동률은 테이블당으로 나눠 비교</b></div><div class="li"><span>공개 범위</span><b>다른 매장 이름·숫자는 보이지 않아요</b></div><p class="note">매장이 많아질수록 지역·평수가 비슷한 곳끼리 묶어 더 정확해져요.</p>`); return; }
  if (a === 'brk-all') { openSheet(`<h2>휴게시간 한 번에</h2><p class="sub">모든 직원의 매주 기본 근무에 같은 휴게시간을 넣어요. 날짜별로 고친 근무는 그대로예요.</p><form class="f" id="brk-form"><label class="fl">휴게 (분)<input name="brk" type="number" min="0" max="180" step="10" value="30" required></label><button class="btn pri full">모두 적용</button></form>`); return; }
  if (a === 'bill') { $('#bill-file').click(); return; }
  if (a === 'backup') { const rows = [['[직원]'], ['닉네임', '실명', '직책', '계약', '시급', '입사일', '연락처', '은행', '계좌', '예금주'], ...S.members.filter(p => p.role !== 'owner').map(p => [p.nick, p.real_name || '', p.job_role || '', p.contract, p.hourly_rate, p.joined_on || '', p.phone || '', p.bank_name || '', p.bank_acct || '', p.bank_holder || '']), [], ['[매출 최근 6개월]'], ['날짜', '총매출', '엔트리', '카드', '현금', '이체', '현금지출', '금고차액', '메모'], ...S.hist.map(r => [r.report_date, r.sales, r.entries ?? '', r.card, r.cash, r.transfer, r.expense, r.cash_diff ?? '', r.memo || '']), [], ['[지출 최근 6개월]'], ['날짜', '항목', '금액'], ...(S.expAll || []).map(x => [x.spent_on, CAT[x.category] || x.category, x.amount]), [], ['[근무 변경 기록]'], ['직원', '날짜', '시작', '끝', '휴무'], ...S.ov.map(o => [S.members.find(p => p.id === o.member_id)?.nick || '', o.work_date, o.start_t || '', o.end_t || '', o.off ? 'O' : ''])];
    download(`전체백업_${S.store.name}_${TODAY}.csv`, rows); return; }
  if (a === 'post-copy') { const p = S.posts.find(x => x.id === d.p); if (!p) return; const tm = /(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})/.exec(p.work_time || ''); S.pre = { title: p.title, heads: p.heads, body: p.body || '', s: tm?.[1], e: tm?.[2] }; S.postKind = p.kind; render(); scrollTo(0, 0); toast('지난 공고 내용을 채워뒀어요. 고칠 곳만 고쳐 올리세요'); return; }
  if (a === 'ai-post') return busy(async () => { const f = $('#post-form'), v = Object.fromEntries(new FormData(f)), pf = [...f.querySelectorAll('[name=pf]:checked')].map(x => x.value).concat(v.pf_etc || []).filter(Boolean).join(', ');
    const { data, error } = await sb.functions.invoke('ai', { body: { store_id: S.store.id, mode: 'post', store: S.store.name, area: S.store.area, role: v.role, time: `${[...f.querySelectorAll('[name=wd]:checked')].map(x => x.value).join('·')} ${v.s}–${v.e}`, pay: v.pay ? `일당 ${E.won(+v.pay)}원` : `${v.ptype || ''} ${v.pamt ? E.won(+v.pamt) + '원' : ''}`, prefer: pf, note: v.body } });
    if (error || !data?.ok) return toast(data?.msg || 'AI가 지금 답하지 않아요'); f.elements.body.value = data.text; toast('공고 내용을 채웠어요. 확인하고 고쳐 주세요'); });
  if (a === 'ai-write') return busy(async () => { const tp = ($('#ai-q')?.value || '').trim(); if (!tp) return toast(d.k === 'promo' ? '홍보할 내용을 위 칸에 적어주세요 (예: 토요일 8시 토너먼트 바인 3만)' : '공지할 내용을 위 칸에 적어주세요 (예: 다음 주부터 마감 청소 순번제)');
    const { data, error } = await sb.functions.invoke('ai', { body: { store_id: S.store.id, mode: d.k, topic: tp, store: S.store.name, area: S.store.area || '' } }); if (error || !data?.ok) return toast(data?.msg || 'AI가 지금 답하지 않아요'); const el = $('#ai-a'); if (el) el.textContent = data.text; const cb = $('#ai-copy'); if (cb) cb.hidden = false; });
  if (a === 'ai-copy') { navigator.clipboard?.writeText($('#ai-a')?.textContent || '').then(() => toast('복사했어요. 단톡방·인스타에 붙여 넣으세요'), () => toast('복사가 막혀 있어요. 길게 눌러 복사해 주세요')); return; }
  if (a === 'ai-ask') return busy(async () => { const qv = (d.q ? '이번 달 운영을 3줄로 총평하고, 이번 주에 할 일 3개를 번호로 알려줘' : ($('#ai-q')?.value || '')).trim(); if (!qv) return toast('궁금한 걸 적어주세요'); const M = monthSummary(S.y, S.m), p0 = new Date(S.y, S.m - 2, 1), L = monthSummary(p0.getFullYear(), p0.getMonth() + 1);
    const facts = { 매장: S.store.name, 이번달: { 마감일수: M.n, 매출: Math.round(M.sales), 예상매출: Math.round(M.proj), 인건비: Math.round(M.labor), 비용합계: Math.round(M.cost), 예상순이익: Math.round(M.left), 비용항목: M.exp }, 지난달: { 매출: Math.round(L.sales), 인건비: Math.round(L.labor), 비용합계: Math.round(L.cost), 순이익: Math.round(L.left) }, 직원수: S.members.filter(p => p.role !== 'owner').length, 목표: goalOf(S.y, S.m) || null };
    const { data, error } = await sb.functions.invoke('ai', { body: { store_id: S.store.id, mode: 'ask', q: qv, facts } }); if (error || !data?.ok) return toast(data?.msg || 'AI가 지금 답하지 않아요'); const el = $('#ai-a'); if (el) el.textContent = data.text; const cb = $('#ai-copy'); if (cb) cb.hidden = false; });
  if (a === 'ios-ok') { lsSet('ev_ios_ok', '1'); render(); return; }
  if (a === 'my-pay') { const me = S.my[S.mi || 0]; openSheet(`<h2>급여 받을 정보</h2><p class="sub">대표님·점장님만 봐요 · 계좌는 뒷 4자리만 보여요</p><form class="f" id="mypay-form"><label class="fl">실명<input name="name" required value="${esc(me.real_name || '')}" placeholder="통장에 적힌 이름"></label><div class="grid2"><label class="fl">은행<input name="bank" required value="${esc(me.bank_name || '')}" placeholder="카카오뱅크"></label><label class="fl">계좌번호<input name="acct" ${me.bank_acct ? '' : 'required'} inputmode="numeric" placeholder="${me.bank_acct ? '그대로 두면 안 바뀌어요' : '숫자만'}"></label></div><label class="fl">예금주<input name="holder" value="${esc(me.bank_holder || me.real_name || '')}" placeholder="본인 이름"></label><button class="btn pri full">저장</button></form>`); return; }
  if (a === 'audit') return busy(async () => { const L = await q(sb.from('audit_log').select('*').eq('store_id', S.store.id).order('at', { ascending: false }).limit(80)); openSheet(`<h2>변경 기록 <small>최근 ${L.length}건</small></h2><p class="sub">시급 · 권한 · 퇴사 · 계좌 · 마감 수정 · 비용 삭제 · 직원 정보 열람이 자동으로 남아요</p>${L.map(x => `<div class="li"><span><b>${esc(x.what)}</b><small class="mut" style="display:block">${fmtDT(x.at)} · ${esc(S.members.find(p => p.user_id && p.user_id === x.actor)?.nick || (x.actor ? '대표' : '자동'))}</small></span></div>`).join('') || '<p class="note">아직 기록이 없어요. 오늘부터 쌓여요</p>'}`); });
  if (a === 'sub-share') { const t = `[${S.store.name}] 대타 구해요 · ${d.v}\n+EV 앱에서 먼저 수락하면 바로 확정돼요\n${location.origin}/`; if (navigator.share) navigator.share({ text: t }).catch(() => { }); else navigator.clipboard?.writeText(t).then(() => toast('복사했어요. 단톡방에 붙여넣으세요'), () => toast(t)); return; }
  if (a === 'tax-csv' && S.mode === 'store') { const pre = `${S.y}-${E.pad(S.m)}`, by = S.hist.filter(r => r.report_date.startsWith(pre)).sort((x, y2) => x.report_date.localeCompare(y2.report_date)), ex = (S.expAll || []).filter(x => x.spent_on.startsWith(pre)).sort((x, y2) => x.spent_on.localeCompare(y2.spent_on)), st = S.members.filter(p => p.role !== 'owner' && (p.active ?? true)), tot = k => by.reduce((s, r) => s + (+r[k] || 0), 0), pr = st.map(p => [p, payOf(p)]);
    download(`세무사용_${S.store.name}_${pre}.csv`, [[`${S.store.name} ${S.y}년 ${S.m}월 세무 자료`], [], ['[요약]'], ['총매출', '카드', '현금', '계좌이체·간편결제', '비용 합계', '급여 지급총액', '급여 공제 합계'], [tot('sales'), tot('card'), tot('cash'), tot('transfer'), ex.reduce((s, x) => s + (+x.amount || 0), 0), pr.reduce((s, [, r]) => s + r.gross, 0), pr.reduce((s, [, r]) => s + r.ded, 0)], [], ['[일 매출]'], ['날짜', '총매출', '카드', '현금', '계좌이체·간편결제'], ...by.map(r => [r.report_date, r.sales, r.card, r.cash, r.transfer]), [], ['[비용]'], ['날짜', '항목', '금액', '메모'], ...ex.map(x => [x.spent_on, CAT[x.category] || x.category, x.amount, x.memo || '']), [], ['[급여]'], ['성명', '계약', '근무시간', '지급총액', '공제', '실지급'], ...pr.map(([p, r]) => [p.real_name || p.nick, p.contract === '4대' ? '4대보험' : '3.3%', r.hours.toFixed(1), r.gross, r.ded, r.net])]); toast('세무사에게 이 파일 하나만 보내면 돼요'); return; }
  if (a === 'invite') { const url = `${location.origin}/?join=${S.store.join_code}`, text = `${S.store.name} 직원 초대 · +EV에서 근무표·급여를 바로 확인하세요`; if (navigator.share) navigator.share({ title: '+EV 직원 초대', text, url }).catch(() => { }); else navigator.clipboard?.writeText(`${text}\n${url}`).then(() => toast('초대 링크를 복사했어요. 카톡에 붙여넣으세요'), () => toast(url)); return; }
  if (a === 'post-share') { const p = S.posts.find(x => x.id === d.p), url = `${location.origin}/?post=${d.p}`, text = `[${S.store.name}] ${p?.title || '구인'} · +EV에서 바로 지원`; if (navigator.share) navigator.share({ title: p?.title, text, url }).catch(() => { }); else navigator.clipboard?.writeText(`${text}\n${url}`).then(() => toast('공고 링크를 복사했어요. 카톡 구인방에 붙여넣으세요'), () => toast(url)); return; }
  if (a === 'fav') return busy(async () => { const on = await q(sb.rpc('fav_toggle', { p_app: d.a })); b.textContent = on ? '★ 단골' : '☆ 단골'; toast(on ? '단골로 등록했어요. 긴급 공고를 올리면 먼저 알림이 가요' : '단골에서 뺐어요'); });
  if (a === 'sales-csv') { const by = S.hist.filter(r => r.report_date.startsWith(`${S.y}-${E.pad(S.m)}`)).sort((x, y2) => x.report_date.localeCompare(y2.report_date)), ex = (S.expAll || []).filter(x => x.spent_on.startsWith(`${S.y}-${E.pad(S.m)}`));
    download(`매출지출_${S.store.name}_${S.y}-${E.pad(S.m)}.csv`, [['[일 매출]'], ['날짜', '요일', '총매출', '엔트리', '카드', '현금', '계좌이체', '현금지출', '금고차액', '메모'], ...by.map(r => { const [yy, mm, dd] = r.report_date.split('-').map(Number); return [r.report_date, E.WD[E.wdOf(yy, mm, dd)], r.sales, r.entries ?? '', r.card, r.cash, r.transfer, r.expense, r.cash_diff ?? '', r.memo || '']; }), [], ['[지출]'], ['날짜', '항목', '금액', '입력 경로'], ...ex.map(x => [x.spent_on, CAT[x.category] || x.category, x.amount, x.source === 'close' ? '마감' : '직접'])]); return; }
  if (a === 'bulk-xfer') { const L = S.members.filter(p => p.role !== 'owner').map(p => [p, payOf(p)]).filter(([, r]) => r.net > 0); const bad = L.filter(([p]) => !p.bank_acct || !p.bank_holder).map(([p]) => p.nick);
    download(`대량이체_${S.store.name}_${S.y}-${E.pad(S.m)}.csv`, [['입금은행', '입금계좌번호', '예금주', '이체금액', '받는분 통장표시', '내 통장표시'], ...L.filter(([p]) => p.bank_acct).map(([p, r]) => [p.bank_name || '', (p.bank_acct || '').replace(/-/g, ''), p.bank_holder || p.real_name || '', r.net, `${S.store.name} ${S.m}월급여`, `${p.nick} ${S.m}월급여`])]);
    toast(bad.length ? `${bad.join(', ')}님은 계좌가 없어 빠졌어요. 은행 앱 대량이체 → 파일 등록에 올리세요` : '은행 앱 대량이체 → 파일 등록에 올리세요. 은행마다 열 순서가 다르면 맞춰 주세요'); return; }
  if (a === 'wht') return busy(async () => { S.whtU = await q(sb.rpc('store_urgent_wht', { p_store: S.store.id, p_month: E.ymd(S.y, S.m, 1) })) || []; const R = whtAll(), t = k => R.reduce((s, x) => s + x[k], 0); openSheet(`<h2>${S.m}월 원천세 (3.3%)</h2><p class="sub">3.3% 직원 + 긴급 대타 딜러 · 다음 달 10일까지 홈택스에 신고·납부해요 · 신고엔 딜러 주민번호가 필요해요 (딜러에게 직접 받기)${S.y === now.getFullYear() && S.m === now.getMonth() + 1 ? ' · <b class="warn">이번 달은 어제까지 기준</b>' : ''}</p>${R.map(x => `<div class="li"><span><b>${esc(x.p.real_name || x.p.nick)}</b><small class="mut" style="display:block">지급 ₩${E.won(x.gross)}</small></span><span class="num">소득세 ₩${E.won(x.it)} · 지방 ₩${E.won(x.lt)}</span></div>`).join('') || '<p class="note">이번 달 3.3% 지급이 없어요</p>'}<div class="li"><b>합계</b><b class="num">소득세 ₩${E.won(t('it'))} · 지방 ₩${E.won(t('lt'))}</b></div><button class="btn pri full" data-act="wht-csv">엑셀로 받기</button>`); });
  if (a === 'wht-csv') { download(`원천세_${S.store.name}_${S.y}-${E.pad(S.m)}.csv`, [['성명', '닉네임', '지급액', '소득세(3%)', '지방소득세(0.3%)', '실지급'], ...whtAll().map(x => [x.p.real_name || '', x.p.nick, x.gross, x.it, x.lt, x.net])]); return; }
  if (a === 'sched-img') return busy(async () => {
    const staff = S.members.filter(p => p.role !== 'owner'), D = E.daysIn(S.y, S.m), rows = [], lead = E.wdOf(S.y, S.m, 1), wk = S.schedView === 'month' || !S.schedView ? S.wk || 0 : 0;
    for (let i = 1; i <= D; i++) { const k = E.ymd(S.y, S.m, i); if (wk && Math.floor((lead + i - 1) / 7) + 1 !== wk) continue; rows.push([k, staff.map(p => [p, E.shiftOn(p.id, S.y, S.m, i, S.tpl, S.ov)]).filter(x => x[1]).map(([p, t]) => `${p.nick} ${t5(t.s).slice(0, 2)}-${t5(t.e).slice(0, 2)}`).join('   ')]); }
    const W = 1080, lh = 44, top = 130, c = document.createElement('canvas'); c.width = W; c.height = top + rows.length * lh + 30; const g = c.getContext('2d');
    g.fillStyle = '#111417'; g.fillRect(0, 0, W, c.height); g.fillStyle = '#ffffff'; g.font = 'bold 44px sans-serif'; g.fillText(`${S.store.name} ${S.m}월 ${wk ? wk + '주차 ' : ''}근무표`, 40, 70); g.fillStyle = '#8C9AB3'; g.font = '22px sans-serif'; g.fillText('+EV', 40, 104);
    rows.forEach(([k, txt], i) => { const yy = top + i * lh + 28, dd = +k.slice(8), wd = E.wdOf(S.y, S.m, dd); if (i % 2) { g.fillStyle = '#141B2B'; g.fillRect(0, yy - 30, W, lh); } g.fillStyle = wd === 6 || isHoliday(k) ? '#F87171' : wd === 5 ? '#93C5FD' : '#9CA3AF'; g.font = 'bold 24px sans-serif'; g.fillText(`${dd}(${E.WD[wd]})`, 40, yy); g.fillStyle = txt ? '#E5E7EB' : '#4B5563'; g.font = '24px sans-serif'; g.fillText(txt || '휴무', 160, yy, W - 190); });
    const blob = await new Promise(r => c.toBlob(r, 'image/png')), file = new File([blob], `근무표_${S.y}-${E.pad(S.m)}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title: `${S.m}월 근무표` }).catch(() => { });
    const u = URL.createObjectURL(blob), lk = document.createElement('a'); lk.href = u; lk.download = file.name; lk.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); toast('근무표 이미지를 저장했어요. 단톡방에 올려 주세요'); });
  if (a === 'sub-day') return busy(() => subSheet(d.d));
  if (a === 'req-ok') return busy(async () => { await q(sb.rpc('decide_req', { p_id: d.v, p_ok: true })); await reload(); await subSheet(d.d, d.m); });
  if (a === 'req-no') return busy(async () => { await q(sb.rpc('decide_req', { p_id: d.v, p_ok: false })); toast('거절했어요. 직원에게 알렸어요'); await reload(); });
  if (a === 'offer-ok' || a === 'offer-no') return busy(async () => { const r = await q(sb.rpc('answer_offer', { p_id: d.v, p_ok: a === 'offer-ok' })); toast(r === 'ok' ? '수락했어요. 근무표에 들어갔어요' : r === 'no' ? '대표님께 전달했어요' : '다른 분이 먼저 수락했어요'); await reload(); });
  if (a === 'fix-new') return openSheet(`<h2>출퇴근 기록 고치기</h2><p class="sub">대표님이 승인하면 급여 계산에 반영돼요.</p><form class="f" id="fix-form"><div class="seg"><label><input type="radio" name="kind" value="in" checked><span>출근</span></label><label><input type="radio" name="kind" value="out"><span>퇴근</span></label></div><div class="grid2"><label class="fl">날짜<input type="date" name="date" value="${TODAY}" max="${TODAY}" min="${addDay(TODAY, -35)}" required></label><label class="fl">실제 시각<input type="time" name="time" required></label></div><label class="fl">이유<input name="note" placeholder="예: QR 찍는 걸 깜빡했어요" required></label><button class="btn pri full">요청 보내기</button></form>`);
  if (a === 'fix-dec') return busy(async () => { await q(sb.rpc('att_fix_decide', { p_id: d.v, p_ok: !!d.ok })); toast(d.ok ? '승인했어요. 출퇴근 기록에 넣었어요' : '거절했어요'); await reload(); });
  if (a === 'req-new') { openSheet(`<h2>휴무 신청</h2><p class="sub">승인되면 근무표에서 빠지고, 대표님이 대타를 구해요.</p><form class="f" id="req-form"><label class="fl">날짜<input type="date" name="date" min="${TODAY}" required></label><label class="fl">사유 <small class="mut">(선택)</small><input name="note" placeholder="예: 병원, 시험"></label><button class="btn pri full">신청</button></form>`); return; }
  if (a === 'ext-post') { const k = d.d, [y, m, dd] = k.split('-').map(Number), f = $('#sub-form'), soon = k <= addDay(TODAY, 1); S.pre = { title: `${mdKr(k)} 딜러 구해요`, heads: 1, s: f?.elements.s.value || '20:00', e: f?.elements.e.value || '04:00', wd: E.wdOf(y, m, dd) }; S.postKind = soon ? 'urgent' : 'hire'; closeSheet(); S.tab = 'jobs'; S.sub = null; render(); scrollTo(0, 0); toast(soon ? '긴급 공고 내용을 채워뒀어요' : '날짜가 멀어서 상시 공고로 채워뒀어요'); return; }
  if (a === 'rd-start') return busy(async () => { await q(sb.rpc('sched_step', { p_store: S.store.id, p_month: S.nmKey, p_status: 'collect', p_deadline: addDay(TODAY, 5) })); toast('직원들에게 가능일 요청을 보냈어요'); await reload(); });
  if (a === 'rd-draft') return busy(async () => { const [y, m] = S.nmKey.split('-').map(Number), need = {}; for (let i = 1; i <= E.daysIn(y, m); i++) { const k = E.ymd(y, m, i); if (k < TODAY) continue; need[k] = needOn(k, S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2]); } toast('배정 중… 10초쯤 걸려요'); const { data, error } = await sb.functions.invoke('sched-auto', { body: { store_id: S.store.id, month: S.nmKey, need } }); if (error || !data?.ok) return toast(data?.msg || '초안을 못 만들었어요'); toast(data.short.length ? `초안 완료 · 빈자리 ${data.short.length}일` : '초안 완료 · 빈자리 없음'); await reload(); });
  if (a === 'rd-send' || a === 'rd-done') return busy(async () => { await q(sb.rpc('sched_step', { p_store: S.store.id, p_month: S.nmKey, p_status: a === 'rd-send' ? 'sent' : 'done' })); toast(a === 'rd-send' ? '직원들에게 확인 요청을 보냈어요' : '확정했어요. 직원들에게 알렸어요'); await reload(); });
  if (a === 'mp-close' || a === 'mp-wallet') { $('#mpop')?.remove(); if (a === 'mp-wallet') { S.tab = 'wallet'; render(); } return; }
  if (a === 'spin-open') return spinOpen();
  if (a === 'spin-go') return spinPlay();
  if (a === 'spin-close' || a === 'spin-wallet') { $('#roul')?.remove(); document.body.classList.remove('rl-open'); if (a === 'spin-wallet') { S.tab = 'wallet'; render(); } return; }
  if (a === 'ref-share') { const u = `${location.origin}/?ref=${myRef()}`, t = `+EV 딜러 앱 · 가입하면 족보 룰렛! 초대 코드 ${myRef()}`; if (navigator.share) { navigator.share({ title: '+EV', text: t, url: u }).catch(() => { }); return; } navigator.clipboard?.writeText(`${t} ${u}`).then(() => toast('초대 링크를 복사했어요'), () => toast(u)); return; }
  if (a === 'ref-set') return busy(async () => { const v = ($('#ref-in')?.value || '').trim(); if (v.length !== 6) return toast('코드 6자리를 넣어주세요'); const nm = await q(sb.rpc('set_ref', { p_code: v })); toast(`${nm}님을 추천인으로 등록했어요`); await reload(); });
  if (a === 'lg-tab') { S.lgTab = d.v; return render(); }
  if (a === 'bd-post') return busy(async () => { const v = ($('#bd-new')?.value || '').trim(); if (!v) return toast('내용을 써주세요'); if (await bdWrite(v)) { S.dirty = false; toast('올렸어요'); S.lgAt = 0; await loungeLoad(1); } });
  if (a === 'bd-open') return busy(() => bdSheet(d.v));
  if (a === 'bd-reply') return busy(async () => { const v = ($('#bd-re')?.value || '').trim(); if (!v) return; if (await bdWrite(v, +d.v)) { await bdSheet(d.v); S.lgAt = 0; loungeLoad(1); } });
  if (a === 'bd-del') return busy(async () => { await q(sb.rpc('board_hide', { p_id: +d.v })); toast('삭제했어요'); if (d.p) await bdSheet(d.p); else closeSheet(); S.lgAt = 0; await loungeLoad(1); });
  if (a === 'rd-mon') { S.rdKey = d.k; S.rdArm = null; return busy(reload); }
  if (a === 'rd-reset') { if (S.rdArm !== S.nmKey) { S.rdArm = S.nmKey; return render(); } S.rdArm = null; return busy(async () => { const [y, m] = S.nmKey.split('-').map(Number), from = S.nmKey < TODAY ? TODAY : S.nmKey, ids = S.members.filter(p => p.role !== 'owner').map(p => p.id); if (ids.length) await q(sb.from('shift_overrides').delete().in('member_id', ids).gte('work_date', from).lte('work_date', E.ymd(y, m, E.daysIn(y, m)))); await q(sb.rpc('sched_reset', { p_store: S.store.id, p_month: S.nmKey })); toast(`${m}월 스케줄을 초기화했어요 (지난 날짜는 그대로)`); await reload(); }); }
  if (a === 'rd-view') { const [y, m] = S.nmKey.split('-').map(Number); S.y = y; S.m = m; S.schedView = 'month'; S.tab = 'sched'; return busy(reload); }
  if (a === 'av-d') { S.avSel.has(d.d) ? S.avSel.delete(d.d) : S.avSel.add(d.d); const n = $('#av-note')?.value; render(); if (n != null && $('#av-note')) $('#av-note').value = n; return; }
  if (a === 'av-edit') { S.avEdit = true; S.avSel = null; render(); return; }
  if (a === 'av-submit') return busy(async () => { const note = ($('#av-note')?.value || '').trim(); await q(sb.from('sched_avail').upsert({ member_id: S.my[S.mi || 0].id, month: S.nmKey, days: [...S.avSel].sort(), note: note || null, submitted_at: new Date().toISOString() })); S.avEdit = false; S.avSel = null; toast('제출했어요. 근무표가 나오면 알려드릴게요'); await reload(); });
  if (a === 'cf-ok') return busy(async () => { await q(sb.from('sched_avail').upsert({ member_id: S.my[S.mi || 0].id, month: S.nmKey, confirm: 'ok', confirmed_at: new Date().toISOString() })); toast('확인했어요'); await reload(); });
  if (a === 'cf-change') { openSheet(`<h2>변경 요청</h2><p class="sub">바꾸고 싶은 날짜와 이유를 적어주세요. 대표님께 바로 알림이 가요.</p><form class="f" id="cf-form"><textarea name="note" rows="3" required placeholder="예: 14일 금요일 대신 15일 가능해요"></textarea><button class="btn pri full">보내기</button></form>`); return; }
  if (a === 'rcpt') { toast('영수증을 평평하게 펴고, 밝은 곳에서 글씨가 화면에 꽉 차게 찍어주세요'); $('#rcpt-file').click(); return; }
  if (a === 'phone-ok') return busy(async () => { const { error } = await sb.rpc('confirm_phone', { p_member: d.m }); if (error) return toast('확인에 실패했어요'); toast('연락처 확인 완료'); await reload(); });
  if (a === 'staff-edit') staffSheet(d.m);
  if (a === 'staff-del') { const mid = $('#staff-form').dataset.m, p = S.members.find(x => x.id === mid); return reauth(() => openSheet(`<h2>${esc(p.nick)} 퇴사 처리</h2><p class="sub">빠뜨리기 쉬운 것만 모았어요. 체크는 기록으로 남아요.</p><form class="f" id="out-form" data-m="${mid}"><div class="chks col">${DOCS_OUT.filter(([k]) => k !== 'sev' || sevOf(p)?.amt).map(([k, l]) => `<label><input type="checkbox" name="o_${k}"><span>${l}${k === 'sev' ? ` · 약 ₩${E.won(sevOf(p).amt)}` : ''}</span></label>`).join('')}</div><button class="btn pri full" style="background:#F08C7A;border-color:#F08C7A">퇴사 처리</button><p class="note">급여·출퇴근 기록은 남아요. 5초 안에 되돌릴 수 있어요. 실명·연락처·계좌는 퇴사 3년 뒤 자동으로 지워져요 (근로기준법 서류 보존 기간).</p></form>`), '퇴사 처리는 한 번 더 확인해요'); }
  if (a === 'join-open') joinSheet(d.r);
  if (a === 'mgr') busy(async () => { await q(sb.rpc('set_manager', { p_member: d.m, p_on: d.v === 'true' })); await reload(); toast(d.v === 'true' ? '점장 권한을 줬어요' : '점장 권한을 회수했어요'); });
  if (a === 'pay-copy') { const t = S.members.filter(p => p.role !== 'owner').map(p => { const r = payOf(p); return `${p.bank_holder || p.real_name || p.nick}\t${p.bank_name || '-'}\t${p.bank_acct || '-'}\t${r.xfer}`; }).join('\n'); navigator.clipboard?.writeText(t).then(() => toast('예금주·은행·계좌·금액을 복사했어요. 은행 앱 대량이체에 붙여넣으세요'), () => toast('복사가 막혀 있어요')); }
  if (a === 'copy') { navigator.clipboard?.writeText(d.v).then(() => toast('복사했어요'), () => toast(d.v)); }
  if (a === 'exp-del') busy(async () => { await q(sb.from('expenses').delete().eq('id', d.id)); closeSheet(); await reload(); toast('삭제했어요'); });
  if (a === 'exp-new') openSheet(`<h2>고지서·기타 비용</h2><form class="f" id="expense-form"><div class="grid2"><label class="fl">항목<select name="cat">${Object.entries(CAT).filter(([k]) => k !== 'card').map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label class="fl">금액 (원)<input name="amount" type="number" inputmode="numeric" required></label></div><label class="fl">날짜<input type="date" name="date" value="${TODAY}"></label><label class="fl">영수증 사진 <small class="mut">(선택)</small><input type="file" name="photo" accept="image/*"></label><button class="btn pri full">추가</button></form>`);
  if (a === 'exp-list') openSheet(`<h2>${S.m}월 비용 내역</h2>${S.expenses.map(x => `<div class="li"><div><b>${CAT[x.category] || x.category}</b><small>${x.spent_on} · ${x.source === 'close' ? '마감 때 쓴 현금' : '직접 입력'}</small></div><span class="row"><span class="num">₩${E.won(x.amount)}</span>${x.photo ? `<button class="btn sm" data-act="exp-photo" data-p="${esc(x.photo)}" aria-label="영수증 보기">📎</button>` : ''}<button class="btn sm" data-act="exp-del" data-id="${x.id}">삭제</button></span></div>`).join('') || '<div class="empty">비용 기록이 없어요</div>'}<button class="btn sm" data-act="bin" style="margin-top:10px">최근 삭제한 기록 (7일)</button>`);
  if (a === 'pos') openSheet(`<h2>통합 POS 연동</h2><div class="card pos-toss"><b>토스플레이스 <span class="pill g">지금 연결 가능</span></b><ol class="steps"><li>토스 POS → <b>설정</b> → <b>기타설정</b> → <b>서비스 연동</b></li><li><b>서비스 코드로 연결</b> 누르기</li><li>코드 입력 <button type="button" class="btn sm" data-act="copy" data-v="${TOSS_CODE}"><b class="num">${TOSS_CODE}</b> 복사</button></li></ol><small class="mut">설치되면 이 화면에 바로 떠요</small></div><h3 style="margin:18px 0 6px">다른 POS · 준비 중</h3><p class="mut">쓰는 POS를 신청해 주시면 먼저 연동해서 알려드려요.</p><form class="f" id="pos-form"><div class="seg brk" style="flex-wrap:wrap">${[...POS.slice(1), '기타'].map((p, i) => `<label style="flex:1 1 30%"><input type="radio" name="pos" value="${p}" ${i ? '' : 'checked'}><span>${p}</span></label>`).join('')}</div><label class="fl">기타면 이름<input name="etc" placeholder="예: 포스 회사 이름"></label><button class="btn pri full">연동 신청</button></form>`);
  if (a === 'csv') {
    const rows = [['이름', '실명', '직책', '계약', '시급', '근무일', '근무시간', '기본급', '야간수당', '연장수당', '주휴수당', '인센티브', '지급총액', '공제', '실지급', '은행', '계좌번호', '예금주']];
    S.members.filter(p => p.role !== 'owner').forEach(p => { const r = payOf(p); rows.push([p.nick, p.real_name, p.job_role, p.contract, p.hourly_rate, r.days, r.hours.toFixed(1), r.base, r.np, r.otp, r.juhu, r.inc, r.gross, r.ded, r.net, p.bank_name, p.bank_acct, p.bank_holder]); });
    download(`급여대장_${S.store.name}_${S.y}-${E.pad(S.m)}.csv`, rows);
  }
  if (a === 'hq-csv') download(`데이터자산_${S.y}-${E.pad(S.m)}.csv`, [['회사', '브랜드', '매장', '지역', '사업자확인', '요금제', '매출', '보고일', '지출', '직원'], ...(S.stats || []).map(x => [x.company, x.brand, x.store, x.area, x.verified ? 'O' : 'X', x.plan, x.sales, x.days, x.expenses, x.staff])]);
  if (a === 'pkind') { S.postKind = d.v; render(); }
  if (a === 'manage') busy(() => manage(d.p, d.k));
  if (a === 'hire') busy(async () => { await q(sb.rpc('hire', { p_app: d.a })); track('job_matched'); toast('채용했어요! 연락처가 열렸어요'); await manage(d.p, d.k); });
  if (a === 'cancel-hire') busy(async () => { if (!confirm('채용을 취소할까요?')) return; await q(sb.rpc('cancel_hire', { p_app: d.a })); toast('채용을 취소했어요'); await manage(d.p, d.k); });
  if (a === 'contact') busy(async () => { const ph = await q(sb.rpc('get_contact', { p_app: d.a })); b.outerHTML = ph ? `<span class="row" style="gap:4px"><a class="btn sm pri" href="tel:${esc(ph)}">전화 ${esc(ph)}</a><a class="btn sm" href="sms:${esc(ph)}">문자</a></span>` : '<span class="mut">번호 없음</span>'; });
  if (a === 'slot') busy(async () => { if (d.v === 'dispute' && !confirm('문제를 신고할까요? 자동 지급이 멈추고 운영사가 확인해요.')) return; await q(sb.rpc('slot_act', { p_slot: d.s, p_act: d.v })); toast({ start: '출근을 확인했어요', noshow: '다시 모집해요', extra: '1시간 연장했어요', ok: '확인했어요. 딜러에게 지급돼요', dispute: '운영사에 신고했어요' }[d.v]); const mb = b.closest('.job')?.querySelector('[data-act=manage]'); if (mb) await manage(mb.dataset.p, mb.dataset.k); });
  if (a === 'dslot') busy(async () => { await q(sb.rpc('slot_act', { p_slot: d.s, p_act: 'done' })); toast('근무 완료를 알렸어요. 수고하셨어요!'); await reload(); });
  if (a === 'apply') busy(async () => { track('job_applied'); await q(sb.rpc('apply_job', { p_post: d.p })); toast('지원했어요! 매장이 채용하면 알림이 와요'); await reload(); });
  if (a === 'uf') { S.uf = { ...(S.uf || { c: '전체', r: '전체', st: '판매중', sort: 'new', min: '', max: '' }), [d.k]: d.v }; render(); return; }
  if (a === 'upcover') { S.upCover = +d.v; document.querySelectorAll('.upv button').forEach((x, i) => { x.classList.toggle('on', i === S.upCover); x.querySelector('i')?.remove(); if (i === S.upCover) x.insertAdjacentHTML('beforeend', '<i>대표</i>'); }); return; }
  if (a === 'used-st') busy(async () => { await q(sb.from('used_items').update({ status: d.s }).eq('id', d.v)); const u = S.used.find(x => x.id === d.v); u.status = d.s; if (d.s === '판매완료') u.boost = null; usedSheet(d.v); render(); toast(`${d.s}(으)로 바꿨어요`); });
  if (a === 'used-boost') busy(() => pay('used_boost', { item: d.v, type: d.t }));
  if (a === 'jf') { S.jf = { ...(S.jf || { k: '전체', r: '전체', a: '전체' }), [d.k]: d.v }; render(); }
  if (a === 'used-new') { S.usedNew = !S.usedNew; S.upFiles = []; S.upCover = 0; render(); usedSise(); }
  if (a === 'used-open') usedSheet(d.v);
  if (a === 'used-rec') { const f = document.getElementById('used-form'); f.price.value = d.v; usedSise(); return; }
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
  if (a === 'day-rep') { const r = S.hist.find(x => x.report_date === d.d), [, mm, dd] = d.d.split('-').map(Number); openSheet(`<h2>${mm}월 ${dd}일 마감</h2>${daySlip(r)}${[['총매출', '₩' + E.won(r.sales)], ['엔트리', (r.entries ?? '-') + '명'], ['카드', '₩' + E.won(r.card)], ['현금', '₩' + E.won(r.cash)], ['계좌이체', '₩' + E.won(r.transfer)], ['현금으로 쓴 돈', '₩' + E.won(r.expense)], ['금고 차액', r.cash_diff == null ? '안 셈' : r.cash_diff ? (r.cash_diff > 0 ? '+' : '−') + '₩' + E.won(Math.abs(r.cash_diff)) : '딱 맞음']].map(([k, v]) => `<div class="li"><span class="mut">${k}</span><b class="num">${v}</b></div>`).join('')}${r.detail ? [['rebuy', '리바이', '회'], ['addon', '애드온', '회'], ['tourn', '토너먼트', '회'], ['prize', '상금 지급', '원'], ['fnb', '음료·식사 매출', '원'], ['etc', '기타 매출', '원'], ['refund', '환불·카드 취소', '원']].filter(([k]) => r.detail[k] != null).map(([k, l, u]) => `<div class="li"><span class="mut">${l}</span><b class="num">${u === '원' ? '₩' + E.won(r.detail[k]) : r.detail[k] + u}</b></div>`).join('') + (r.detail.fnb != null ? `<div class="li"><span class="mut">게임 매출 (총매출 − 음료·기타 − 상금)</span><b class="num">₩${E.won(r.sales - (r.detail.fnb || 0) - (r.detail.etc || 0) - (r.detail.prize || 0))}</b></div>` : '') : ''}${r.memo ? `<p>${esc(r.memo)}</p>` : ''}<div id="rep-log"></div>`); busy(async () => { const L = await q(sb.from('report_log').select('*').eq('store_id', S.store.id).eq('report_date', d.d).order('changed_at', { ascending: false })); const el = $('#rep-log'); if (el && L.length) el.innerHTML = `<h3 style="margin-top:14px">수정 이력 <small>${L.length}회</small></h3>${L.map(x => `<div class="li"><span class="mut">${fmtDT(x.changed_at)} · ${esc(S.members.find(p => p.user_id === x.changed_by)?.nick || '대표')}</span><small>고치기 전 매출 ₩${E.won(x.old.sales || 0)} · 카드 ₩${E.won(x.old.card || 0)} · 현금 ₩${E.won(x.old.cash || 0)}</small></div>`).join('')}`; }); }
  if (a === 'open-edit') { S.open = null; render(); }
  if (a === 'prod') { const p = item(d.v); openSheet(`<div class="udetail">${p.img ? `<img src="${esc(p.img)}" alt="">` : `<div class="ph big">${SHOP_ICON[p.c] || ''}<small>사진 준비 중</small></div>`}</div><small class="mut">${SHOP_CAT[p.c]} · ${esc(p.u)}</small><h2 style="margin:4px 0">${esc(p.n)}</h2><div><s class="mut num">₩${E.won(p.p)}</s> <b class="num up" style="font-size:22px">₩${E.won(p.sp)}</b> <span class="pill g">${Math.round((1 - p.sp / p.p) * 100)}% 할인</span></div>${p.body ? `<p>${esc(p.body)}</p>` : ''}<button class="btn pri full" data-act="cart" data-v="${p.id}">주문서에 담기${S.cart[p.id] ? ` (지금 ${S.cart[p.id]}개)` : ''}</button>`); }
  if (a === 'order') busy(async () => { const items = Object.entries(S.cart).map(([id, n]) => ({ id: +id, q: n, price: item(id).sp, alc: item(id).c === 'alc' })), total = items.filter(i => !i.alc).reduce((x, i) => x + i.price * i.q, 0);
    await q(sb.from('orders').insert({ store_id: S.store.id, items, total, tax_invoice: $('#tax-inv')?.checked !== false })); S.cart = {}; await reload(); toast('주문했어요. 도착 예정일은 아래 주문 기록에서 볼 수 있어요'); });
  if (a === 'ostat') busy(async () => { await q(sb.from('orders').update({ status: d.v }).eq('id', d.o)); await reload(); toast(`${d.v}(으)로 바꿨어요`); });
  if (a === 'plan' && (d.v === 'pro' || d.v === 'basic')) return pay('plan', { plan: d.v });
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
  if (a === 'fr-dispute') { askText('어떤 문제였나요?', '예: 광고 전화, 잘못 걸린 전화, 같은 사람 반복').then(note => { if (!note) return; busy(async () => { await q(sb.rpc('fr_dispute', { p_lead: d.v, p_note: note })); closeSheet(); toast('이의제기를 보냈어요. 운영사가 확인하면 알려드려요'); }); }); return; }
  if (a === 'fr-resolve') busy(async () => { await q(sb.rpc('fr_resolve', { p_lead: d.v, p_valid: d.ok === 'true', p_reason: d.ok === 'true' ? null : (d.r || '운영사 확인 · 무효') })); await reload(); toast(d.ok === 'true' ? '유효로 확정했어요' : '무효 처리하고 비용을 뺐어요'); });
  if (a === 'fr-track') busy(async () => { const v = await askText('추적 전화번호', '예: 0507-1234-5678'); if (v == null) return; await q(sb.from('franchise_postings').update({ tracking_number: v.trim() || null }).eq('id', d.v)); await reload(); toast('추적번호를 저장했어요'); });
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
  if (a === 'fixed') { const y = +d.y || S.y, m = +d.m || S.m, fx = fixedFor(y, m).fx; openSheet(`<h2>${y}년 ${m}월 고정비</h2><form class="f" id="fixed-form" data-mon="${E.ymd(y, m, 1)}"><button type="button" class="btn sm" data-act="bill">📷 고지서 사진으로 채우기</button><input type="file" accept="image/*" id="bill-file" hidden>${FIXED.map(([k, n]) => `<label class="fl">${n} (원)<input name="${k}" type="number" min="0" value="${+fx[k] || ''}"></label>`).join('')}<p class="note">저장하면 ${m}월부터 다음에 바꿀 때까지 매달 이 금액으로 계산돼요.</p><button class="btn pri full">저장</button></form>`); }
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
document.addEventListener('input', e => { if (e.target.id === 'srch') srchRender(e.target.value); const rf = e.target.closest?.('#report-form'); if (rf && S.store) { const o = {}; [...rf.elements].forEach(el => { if (el.name && el.type !== 'button' && el.type !== 'submit' && el.name !== 'xc' && el.name !== 'xa') o[el.name] = el.value; }); lsSet('ev_draft_' + S.store.id, JSON.stringify(o)); }
  const pe = e.target.closest?.('.pedit'); if (pe) xfeeBox(pe); if (e.target.closest?.('#post-form')) feeBox(); if (e.target.closest?.('#used-form')) usedSise(); if (e.target.closest?.('#close-exp')) xsum(); else if (e.target.closest?.('#report-form')) closeCalc(); });
document.addEventListener('change', e => { if (e.target.name === 'category' && e.target.closest?.('#used-form')) usedSise();
  const t = e.target, d = t.dataset;
  if (d?.act === 'push') { pushToggle(t.checked).catch(err => { toast(err.message || '알림을 켤 수 없어요'); t.checked = !t.checked; }); return; }
  if (t.classList?.contains('qtype')) { examKeep(); S.examDraft[+t.name.slice(1)].type = t.value; if (t.value === 'mc' && !S.examDraft[+t.name.slice(1)].o.length) { S.examDraft[+t.name.slice(1)].o = ['', '', '', '']; S.examDraft[+t.name.slice(1)].a = 0; } examSheet(); return; }
  if (t.dataset?.uf) { S.uf = { ...(S.uf || { c: '전체', r: '전체', st: '판매중', sort: 'new', min: '', max: '' }), [t.dataset.uf]: t.value }; render(); return; }
  if (t.name === 'photos' && t.files?.length) { const fs = [...(S.upFiles || []), ...[...t.files].map(f => ({ f, url: URL.createObjectURL(f) }))]; if (fs.length > 10) toast('사진은 10장까지예요. 앞의 10장만 올려요'); const keep = formVals(t.form); S.upFiles = fs.slice(0, 10); render(); const nf = $('#used-form'); if (nf) Object.entries(keep).forEach(([k, v]) => { const el = nf.elements[k]; if (el && el.type !== 'checkbox' && el.type !== 'file') el.value = v; }); return; }
  if ((t.name === 'logo' || t.name === 'image') && t.files?.[0]) { const pv = $(t.name === 'logo' ? '#fr-logo-prev' : '#fr-img-prev'); if (pv) pv.innerHTML = `<img src="${URL.createObjectURL(t.files[0])}" alt="">`; return; }
  if (t.name === 'photo' && t.files?.[0]) { const pv = $('#photo-prev'); if (pv) pv.innerHTML = `<img src="${URL.createObjectURL(t.files[0])}" alt=""><small>다시 누르면 바꿔요</small>`; }
  if (t.closest('#post-form')) feeBox();
  if (t.id === 'store-sel') busy(async () => { lsSet('ev_store', t.value); S.store = S.stores.find(s => s.id === t.value); await loadStore(); render(); });
  if (d.rot) { const R = rotState(); R[d.rot] = Math.max(5, +t.value || 5); render(); busy(saveRot); }
  if (d.stock || d.stockmin) busy(async () => { const id = +(d.stock || d.stockmin), row = S.stock.find(s => s.item_id === id), patch = d.stock ? { qty: +t.value || 0 } : { min: +t.value || 0 }; Object.assign(row, patch); await q(sb.from('stock').update(patch).eq('store_id', S.store.id).eq('item_id', id)); render(); });
  if (t.id === 'tax-inv') S.taxInv = t.checked;
  if (d.need !== undefined) busy(async () => { const need = [...(S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2])]; if (need.length < 8) need[7] = need[6]; need[+d.need] = +t.value || 0; await q(sb.rpc('set_need', { p_store: S.store.id, p_need: need })); S.store.need_by_wd = need; render(); });
  if (d.inc) busy(async () => { const month = E.ymd(S.y, S.m, 1); await q(sb.from('incentives').delete().eq('member_id', d.inc).eq('month', month)); if (+t.value) await q(sb.from('incentives').insert({ member_id: d.inc, month, amount: +t.value, reason: '' })); await reload(); toast('인센티브를 반영했어요'); });
});
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target, v = formVals(f), id = f.id;
  busy(async () => {
    if (F68[id] && await F68[id](f, v) !== false) return;
    if (id === 'mypay-form') { const me = S.my[S.mi || 0]; await q(sb.rpc('set_my_pay', { p_member: me.id, p_name: v.name, p_bank: v.bank, p_acct: v.acct || '', p_holder: v.holder || v.name })); Object.assign(me, { real_name: v.name || me.real_name, bank_name: v.bank || me.bank_name, bank_acct: (v.acct || '').replace(/[^0-9-]/g, '') || me.bank_acct, bank_holder: v.holder || v.name || me.bank_holder }); closeSheet(); toast('저장했어요. 이번 달 급여부터 이 계좌로 받아요'); return reload(); }
    if (id === 'sub-form') { const k = f.dataset.d, ids = S.members.filter(p => v['c_' + p.id]).map(p => p.id); if (v.absent) await q(sb.from('shift_overrides').upsert({ member_id: v.absent, work_date: k, off: true, start_t: null, end_t: null, break_min: null })); if (ids.length) await q(sb.rpc('send_offers', { p_members: ids, p_date: k, p_s: v.s, p_e: v.e, p_brk: +v.brk || 0 })); closeSheet(); toast(ids.length ? `${ids.length}명에게 대타 요청을 보냈어요. 수락하면 알려드릴게요` : '휴무 처리했어요'); return reload(); }
    if (id === 'fix-form') { const at = new Date(`${v.date}T${v.time}:00+09:00`); if (at > new Date()) return toast('아직 안 온 시각이에요'); await q(sb.from('att_fix').insert({ member_id: S.my[S.mi || 0].id, kind: v.kind, at: at.toISOString(), note: v.note })); closeSheet(); toast('요청했어요. 대표님께 알림이 갔어요'); return reload(); }
    if (id === 'req-form') { await q(sb.from('shift_reqs').insert({ member_id: S.my[S.mi || 0].id, work_date: v.date, note: v.note || null })); closeSheet(); toast('신청했어요. 대표님께 알림이 갔어요'); return reload(); }
    if (id === 'inc-form') { const r = { per_shift: +v.per_shift || 0, full_attend: +v.full_attend || 0, goal_bonus: +v.goal_bonus || 0 }; await q(sb.from('stores').update({ inc_rule: r }).eq('id', S.store.id)); S.store.inc_rule = r; toast('규칙을 저장했어요. [이번 달 채우기]를 누르면 들어가요'); return; }
    if (id === 'perm-form') { const perms = { ...(S.members.find(x => x.id === f.dataset.m)?.perms || {}), sales: !!f.elements.sales.checked, pay: !!f.elements.pay.checked }; await q(sb.from('members').update({ perms }).eq('id', f.dataset.m)); closeSheet(); await reload(); toast('점장 권한을 바꿨어요'); return; }
    if (id === 'bulk-form') { const L = bulkRows(v.t); if (!L.length) return toast('붙여넣은 내용이 없어요'); await q(sb.from('members').insert(L.map(r => ({ ...r, company_id: S.store.company_id, store_id: S.store.id, role: 'staff', contract: '3.3', emp_type: '파트타임', night_pay: true })))); closeSheet(); await reload(); toast(`${L.length}명을 등록했어요. 계좌·계약 형태는 직원별로 채워주세요`); return; }
    if (id === 'brk-form') { const ids = S.members.filter(p => p.role !== 'owner').map(p => p.id); await q(sb.from('shift_templates').update({ break_min: +v.brk || 0 }).in('member_id', ids)); closeSheet(); toast(`매주 기본 근무 휴게를 ${+v.brk || 0}분으로 맞췄어요`); return reload(); }
    if (id === 'cf-form') { await q(sb.from('sched_avail').upsert({ member_id: S.my[S.mi || 0].id, month: S.nmKey, confirm: 'change', confirm_note: v.note, confirmed_at: new Date().toISOString() })); closeSheet(); toast('대표님께 보냈어요'); return reload(); }
    if (id === 'otp-form') { const { data, error } = await sb.functions.invoke('phone-otp', { body: { action: 'verify', code: v.code } }); if (error || !data?.ok) return toast(data?.msg || '인증에 실패했어요'); closeSheet(); S.prof = await q(sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle()); render(); return toast('휴대폰 인증 완료'); }
    if (id === 'newpw-form') { if (v.pw !== v.pw2) return toast('비밀번호가 서로 달라요'); const { error } = await sb.auth.updateUser({ password: v.pw }); if (error) return toast(error.message); closeSheet(); return toast('새 비밀번호로 바꿨어요'); }
    if (id === 'auth-form') {
      { const dm = (v.email || '').split('@')[1]?.toLowerCase() || '', fix = { 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmali.com': 'gmail.com', 'naver.co': 'naver.com', 'naver.con': 'naver.com', 'nave.com': 'naver.com', 'navr.com': 'naver.com', 'naer.com': 'naver.com', 'hanmail.ne': 'hanmail.net', 'hanmail.com': 'hanmail.net', 'daum.com': 'daum.net', 'nate.co': 'nate.com' }[dm]; if (fix && f.dataset.typo !== v.email) { f.dataset.typo = v.email; f.elements.email.value = v.email.split('@')[0] + '@' + fix; return toast(`이메일을 ${fix}로 고쳤어요. 맞으면 한 번 더 눌러주세요`); } }
      if (S.authMode === 'signup') { lsSet('ev_terms', new Date().toISOString()); const { data, error } = await sb.auth.signUp({ email: v.email, password: v.pw, options: { data: { name: v.name }, emailRedirectTo: location.origin + location.pathname } }); if (error) return toast(error.message.includes('registered') ? '이미 가입된 이메일이에요. 로그인해 주세요' : error.message); if (!data.session) toast('확인 메일을 보냈어요. 메일의 버튼을 눌러주세요'); }
      else { const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.pw }); if (error) toast(error.message.includes('Invalid') ? '이메일이나 비밀번호가 달라요' : error.message); }
    }
    if (id === 'owner-form') { if (!bizOk(v.biz)) return toast('사업자등록번호가 맞지 않아요. 사업자등록증의 10자리를 다시 확인해 주세요'); const __cid = await q(sb.rpc('create_company', { p_name: v.name, p_brand: v.brand || null, p_biz_no: v.biz, p_store: v.store, p_area: v.area || null, p_nick: v.nick })); if ((v.ref || '').trim()) await q(sb.rpc('set_company_ref', { p_company: __cid, p_ref: v.ref })); track('store_created'); await q(sb.from('profiles').update({ name: v.nick }).eq('id', S.user.id)); toast('매장을 만들었어요! 이어서 매장에 맞게 준비할게요'); await boot(); if (S.store?.id) obOpen(); }
    if (id === 'dealer-form') { if (v.birth === 'minor') return toast('만 19세 이상(올해 기준)만 가입할 수 있어요'); if ((v.area2 || '').split(/[,·]+/).filter(x => x.trim()).length > 3) return toast('구·시는 3곳까지 넣을 수 있어요'); const sk = [...f.querySelectorAll('[name=sk]:checked')].map(x => x.value);
      await q(sb.rpc('start_dealer', { p_name: v.name, p_phone: v.phone, p_career: +v.career || 0, p_bio: v.bio || '' })); if (S.mode !== 'onboard') await q(sb.from('profiles').update({ area: v.area || null, area2: (v.area2 || '').trim() || null, games: v.games || null, open_to_sub: !!f.open_to_sub?.checked }).eq('id', S.user.id)); const avd = [...f.querySelectorAll('[name=av]:checked')].map(x => +x.value), a2 = (v.area2 || '').split(/[,·]+/).map(x => x.trim()).filter(Boolean);
      await q(sb.from('profiles').update({ skills: sk, ...(v.birth ? { birth_year: +v.birth } : {}), ...(f.elements.av_f ? { avail: avd.length || v.av_f ? { ...(avd.length ? { d: avd } : {}), f: v.av_f || null, t: v.av_t || null } : null } : {}) }).eq('id', S.user.id)); if (S.mode === 'onboard') track('dealer_signup'); toast(S.mode === 'onboard' ? '환영해요! 이제 공고에 바로 지원할 수 있어요' : '저장했어요'); await boot(); }
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
    if (id === 'open-form') { await q(sb.from('day_opens').upsert({ store_id: S.store.id, day: bizDay(), start_cash: +v.start_cash || 0 })); S.lastStart = +v.start_cash || 0; await reload(); toast('오픈했어요. 오늘도 좋은 하루 되세요'); }
    if (id === 'report-form') {
      if (!navigator.onLine) { lsSet('ev_pend_' + S.store.id, '1'); return toast('인터넷이 끊겼어요. 숫자는 이 폰에 저장해 뒀고, 연결되면 자동으로 마감할게요'); }
      { const avg = (L => L.length ? L.reduce((a, r) => a + r.sales, 0) / L.length : 0)(S.hist.filter(r => r.sales && r.report_date !== v.date).slice(0, 14)); if (+v.sales > (avg ? avg * 10 : 3e7) && f.dataset.big !== v.sales) { f.dataset.big = v.sales; return toast(`₩${E.won(+v.sales)} — 평소(₩${man(avg)})의 10배가 넘어요. 맞으면 한 번 더 눌러주세요`); } }
      { const p7 = S.hist.find(x => x.report_date === dAdd(v.date, -7)); if (p7?.sales >= 300000 && +v.sales < p7.sales * 0.7 && !p7.detail?.event && !(v.dt_event || '').trim() && !(v.memo || '').trim()) { f.elements.memo?.focus(); return toast(`지난주 같은 요일(₩${man(p7.sales)})보다 30% 넘게 적어요. 메모에 이유 한 줄만 남겨주세요`); } }
      if (Math.abs(+f.dataset.diff || 0) >= 30000 && !(v.memo || '').trim()) { f.elements.memo?.focus(); return toast('금고 차액이 3만 원 넘어요. 메모에 이유를 적어주세요. 대표님께 같이 알려드려요'); }
      await q(sb.from('daily_reports').upsert({ store_id: S.store.id, report_date: v.date, sales: +v.sales || 0, entries: +v.entries || null, card: +v.card || 0, cash: +f.dataset.cash || 0, transfer: +v.transfer || 0, expense: +v.expense || 0, cash_diff: f.dataset.diff === '' || f.dataset.diff == null ? null : +f.dataset.diff, memo: v.memo || null, reported_by: S.user.id, detail: (dt => Object.keys(dt).length ? dt : null)({ ...Object.fromEntries(['rebuy', 'addon', 'tourn', 'prize', 'fnb', 'etc', 'refund'].filter(k => v['dt_' + k] !== '' && v['dt_' + k] != null).map(k => [k, +v['dt_' + k] || 0])), ...((v.dt_event || '').trim() ? { event: v.dt_event.trim().slice(0, 40) } : {}), ...(f.dataset.cnt ? { end_cash: +f.dataset.cnt } : {}), closed_at: new Date().toISOString() }) }));
      lsSet('ev_draft_' + S.store.id, '');
      await q(sb.from('expenses').delete().eq('store_id', S.store.id).eq('spent_on', v.date).eq('source', 'close'));
      const xrows = [...f.querySelectorAll('.xrow')].map(r => ({ category: r.querySelector('[name=xc]').value, amount: +digits(r.querySelector('[name=xa]').value) || 0 })).filter(x => x.amount);
      if (xrows.length) await q(sb.from('expenses').insert(xrows.map(x => ({ store_id: S.store.id, spent_on: v.date, category: x.category, amount: x.amount, source: 'close' }))));
      S.lastStart = +v.start || S.lastStart; track('sales_entry'); await reload(); const M = monthSummary(S.y, S.m), g = goalOf(S.y, S.m);
      toast(Math.abs(+f.dataset.diff || 0) >= 10000 ? '마감했어요. 금고 차액을 대표님께 알렸어요' : g ? `마감했어요. 이번 달 목표 ${Math.floor(M.sales / g * 100)}% 달성 (₩${man(M.sales)} / ₩${man(g)})` : '마감을 저장했어요. 수고하셨어요');
    }
    if (id === 'quiz-form') { const r = await q(sb.rpc('submit_quiz', { p_answers: quizList().map((x, i) => x.type === 'sa' ? String(v['q' + i] || '').trim() : +v['q' + i]) })); S.quizRes = r; S.quizOn = false; render(); scrollTo(0, 0); toast(r.passed ? `합격! ${r.score}/${r.total} · 대표님께 결과가 갔어요` : `${r.score}/${r.total} · ${passN(r.total)}개 이상이면 합격이에요. 다시 도전해요`); }
    if (id === 'cquiz-form') { examKeep(); const items = []; for (const [i, x] of S.examDraft.entries()) { const qq = (x.q || '').trim(); if (!qq) continue; if (x.type === 'sa') { if (!(x.a || '').trim()) return toast(`${i + 1}번 정답을 적어주세요`); items.push({ q: qq, type: 'sa', o: [], a: x.a.trim() }); } else { const o = x.o.map(z => (z || '').trim()); if (o.length < 2 || o.some(z => !z)) return toast(`${i + 1}번 보기 ${o.length}개를 모두 채워주세요`); items.push({ q: qq, type: 'mc', o, a: Math.min(x.a, o.length - 1) }); } }
      if (items.length < 3) return toast('문제는 3개 이상 넣어주세요'); await q(sb.from('company_quiz').upsert({ company_id: S.company.id, items, updated_at: new Date().toISOString() })); S.cquiz = items; closeSheet(); render(); return toast(`우리 매장 시험 ${items.length}문제를 저장했어요. 다음 시험부터 이걸로 나가요`); }
    if (id === 'bank-form' && S.prof?.bank_acct && (v.acct || '').replace(/[^0-9-]/g, '') !== S.prof.bank_acct && !S.bankOk) { S.pendBank = v; const em = (S.user.app_metadata?.provider || 'email') === 'email'; return openSheet(`<h2>본인 확인</h2><p class="sub">받을 계좌를 바꾸려면 ${em ? '비밀번호를 한 번 더 넣어주세요' : '지금 등록된 계좌번호 끝 4자리를 넣어주세요'}.</p><form class="f" id="bankauth-form">${em ? '<label class="fl">비밀번호<input name="pw" type="password" required autocomplete="current-password"></label>' : '<label class="fl">지금 계좌 끝 4자리<input name="last4" inputmode="numeric" maxlength="4" required></label>'}<button class="btn pri full">확인하고 저장</button><button type="button" class="btn full" data-act="close">취소</button></form>`); }
    if (id === 'bankauth-form') { if (v.last4 != null) { if (String(S.prof.bank_acct).replace(/\D/g, '').slice(-4) !== v.last4.trim()) return toast('끝 4자리가 달라요'); } else { const { error } = await sb.auth.signInWithPassword({ email: S.user.email, password: v.pw }); if (error) return toast('비밀번호가 달라요'); } const b = S.pendBank; S.pendBank = null; closeSheet(); await q(sb.from('profiles').update({ bank_name: b.bank || null, bank_acct: (b.acct || '').replace(/[^0-9-]/g, '') || null, bank_holder: b.holder || null }).eq('id', S.user.id)); S.prof = await q(sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle()); render(); return toast('계좌를 바꿨어요'); }
    if (id === 'fb-form') { const file = f.elements.img?.files?.[0]; let tag = ''; if (file) { if (file.size > 8e6) return toast('사진은 8MB까지 보낼 수 있어요'); const path = `${S.user.id}/${Date.now()}.${(file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')}`; const { error } = await sb.storage.from('feedback').upload(path, file, { contentType: file.type || 'image/jpeg' }); if (error) return toast('사진을 올리지 못했어요. 글만 먼저 보내주세요'); tag = ` [img:${path}]`; }
      await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store?.id || null, body: `[의견 · ${S.mode} · ${S.tab || ''}] ${v.body}${tag}` })); closeSheet(); return toast('고마워요! 운영사에 보냈어요'); }
    if (id === 'rej-form') { await q(sb.rpc('reject_app', { p_app: f.dataset.a, p_reason: (v.etc || '').trim() || v.why })); closeSheet(); toast('불채용을 알렸어요'); return manage(f.dataset.p, f.dataset.k); }
    if (id === 'lbud-form') { const equip = { ...(S.store.equip || {}), labor_pct: Math.min(80, Math.max(5, +v.pct || 30)) }; await q(sb.from('stores').update({ equip }).eq('id', S.store.id)); S.store.equip = equip; closeSheet(); render(); return toast(`인건비 예산을 매출의 ${equip.labor_pct}%로 정했어요`); }
    if (id === 'swap-form') { await q(sb.from('shift_swaps').insert({ from_member: S.my[S.mi || 0].id, to_member: v.to, work_date: v.day, note: v.note || null })); closeSheet(); toast('보냈어요. 상대가 수락하면 대표님께 넘어가요'); return reload(); }
    if (id === 'jrep-form') { await q(sb.rpc('report_post', { p_post: f.dataset.p, p_reason: v.why + (v.memo ? ` · ${v.memo}` : '') })); closeSheet(); return toast('신고했어요. 운영사가 확인할게요'); }
    if (id === 'rate-st') { await q(sb.from('store_ratings').insert({ slot_id: f.dataset.s, store_id: f.dataset.st, score: +v.score, memo: v.memo || null })); const sl = (S.slots || []).find(x => x.slot_id === f.dataset.s); if (sl) sl.rated = true; closeSheet(); render(); return toast('고마워요. 매장에는 안 보여요'); }
    if (id === 'egoal-form') { lsSet('ev_egoal', String(+v.g || 0)); closeSheet(); render(); return toast('목표를 정했어요'); }
    if (id === 'ns-form') { await q(sb.from('inquiries').insert({ from_user: S.user.id, body: `[노쇼 이의] ${v.where} — ${v.why}` })); closeSheet(); return toast('보냈어요. 운영사가 확인하고 알려드려요'); }
    if (id === 'faq-form') { const row = { q: v.q, a: v.a, sort: +v.sort || 0, on_: !!f.elements.on?.checked }; if (f.dataset.v) await q(sb.from('faq').update(row).eq('id', f.dataset.v)); else await q(sb.from('faq').insert(row)); closeSheet(); toast('저장했어요'); return $('[data-act=faq-load]')?.click(); }
    if (id === 'dset-form') { const row = { hire_msg: (v.hire_msg || '').trim() || null, entry_note: (v.entry_note || '').trim() || null }; await q(sb.from('stores').update(row).eq('id', S.store.id)); Object.assign(S.store, row); return toast('저장했어요. 다음 채용부터 딜러에게 보여요'); }
    if (id === 'snote-form') { await q(sb.rpc('slot_note', { p_slot: f.dataset.s, p_note: v.note })); closeSheet(); toast('보냈어요'); return manage(f.dataset.p, f.dataset.k); }
    if (id === 'reauth-form') { if (isEmailUser()) { const { error } = await sb.auth.signInWithPassword({ email: S.user.email, password: v.pw }); if (error) return toast('비밀번호가 달라요'); } else if (await sha(v.pin + S.user.id) !== lsGet('ev_pin')) return toast('PIN이 달라요');
      S.reauthAt = Date.now(); closeSheet(); const fn = S.reauthFn; S.reauthFn = null; if (fn) setTimeout(fn, 60); return; }
    if (id === 'pin-form') { if (v.pin !== v.pin2) return toast('두 PIN이 달라요'); lsSet('ev_pin', await sha(v.pin + S.user.id)); lsSet('ev_pinlen', String(v.pin.length)); closeSheet(); return toast('앱 잠금을 켰어요. 이 폰에서만 적용돼요'); }
    if (id === 'dnd-form') { const dnd = { f: v.f, t: v.t }; await q(sb.from('profiles').update({ dnd }).eq('id', S.user.id)); S.prof.dnd = dnd; closeSheet(); return toast(`${v.f}~${v.t}엔 알림 소리를 안 내요`); }
    if (id === 'note-form') { const k = v.kind, data = { by: myNick(), ...(k === 'vote' ? { options: (v.opts || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 6) } : {}), ...(k === 'expiry' ? { date: v.date } : {}), ...(k === 'vendor' ? { phone: v.phone } : {}), ...(k === 'review' ? { score: +v.score } : {}) };
      if (k === 'vote' && data.options.length < 2) return toast('투표 선택지를 2개 이상 쉼표로 넣어주세요'); if (k === 'expiry' && !v.date) return toast('유통기한 날짜를 넣어주세요'); if (['praise', 'review'].includes(k) && !v.target) return toast('누구인지 골라주세요'); if (!(v.title || v.body || '').trim()) return toast('내용을 넣어주세요');
      await q(sb.from('store_notes').insert({ store_id: opsStore(), kind: k, title: v.title || null, body: v.body || null, data, target: v.target || null, pinned: k === 'notice' })); closeSheet(); S.opsF = 'all'; await opsLoad(); return toast(k === 'notice' || k === 'vote' ? '올렸어요. 직원들에게 알림이 갔어요' : '올렸어요'); }
    if (id === 'chk-form') { const row = S.notes.find(n => n.kind === 'checklist'), data = { ...(row?.data || CHK0), [f.dataset.t]: v.items.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 15) }; if (row) await q(sb.from('store_notes').update({ data }).eq('id', row.id)); else await q(sb.from('store_notes').insert({ store_id: opsStore(), kind: 'checklist', data })); closeSheet(); await opsLoad(); return toast('체크 항목을 바꿨어요'); }
    if (id === 'out-form') { const mid = f.dataset.m, p = S.members.find(x => x.id === mid); await q(sb.from('members').update({ active: false, checks: { ...(p.checks || {}), out: { at: TODAY, ...Object.fromEntries(DOCS_OUT.map(([k]) => [k, !!f.elements['o_' + k]?.checked])) } } }).eq('id', mid)); closeSheet(); await reload(); return undoToast('퇴사 처리했어요', () => busy(async () => { await q(sb.from('members').update({ active: true }).eq('id', mid)); await reload(); toast('되돌렸어요'); })); }
    if (id === 'adv-form') { await q(sb.from('advances').insert({ member_id: f.dataset.m, month: monFirst(), amount: +v.amount, given_on: v.date || TODAY, memo: v.memo || null })); closeSheet(); await reload(); return toast(`가불 ₩${E.won(+v.amount)}을 기록했어요`); }
    if (id === 'rate-form') { const L = S.members.filter(p => p.role !== 'owner' && (v.who === '전체' || (p.emp_type || '파트타임') === v.who)), up = L.map(p => [p, v.how === 'min' ? Math.max(+p.hourly_rate || 0, minWage()) : (+p.hourly_rate || 0) + (+v.amt || 0)]).filter(([p, r]) => r !== +p.hourly_rate);
      if (!up.length) return toast('바꿀 직원이 없어요'); await Promise.all(up.map(([p, r]) => q(sb.from('members').update({ hourly_rate: r }).eq('id', p.id)))); closeSheet(); await reload(); return toast(`${up.length}명 시급을 바꿨어요. 이번 달 급여에 바로 반영돼요`); }
    if (id === 'terms-form') { const t = new Date().toISOString(); await q(sb.from('profiles').update({ terms_at: t }).eq('id', S.user.id)); S.prof.terms_at = t; closeSheet(); return toast('동의했어요'); }
    if (id === 'pwc-form') { if (v.pw !== v.pw2) return toast('새 비밀번호가 서로 달라요'); const { error: e1 } = await sb.auth.signInWithPassword({ email: S.user.email, password: v.old }); if (e1) return toast('지금 비밀번호가 달라요'); const { error } = await sb.auth.updateUser({ password: v.pw }); if (error) return toast(error.message); closeSheet(); return toast('비밀번호를 바꿨어요'); }
    if (id === 'del-form') { if ((v.word || '').trim() !== '탈퇴') return toast("'탈퇴'라고 적어주세요"); await q(sb.rpc('delete_account')); closeSheet(); S.byMe = 1; await sb.auth.signOut(); lsSet('ev_bal_' + S.user?.id, ''); return toast('탈퇴했어요. 그동안 고마웠어요'); }
    if (id === 'bank-form') { await q(sb.from('profiles').update({ bank_name: v.bank || null, bank_acct: (v.acct || '').replace(/[^0-9-]/g, '') || null, bank_holder: v.holder || null }).eq('id', S.user.id)); S.prof = await q(sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle()); render(); toast('계좌를 저장했어요'); }
    if (id === 'pos-form') { const n = v.pos === '기타' ? (v.etc || '기타') : v.pos; await q(sb.from('inquiries').insert({ from_user: S.user.id, store_id: S.store.id, body: `[포스 연동] ${n} — ${S.store.name}` })); S.posAsk = n; closeSheet(); render(); toast(`${n} 연동을 신청했어요`); }
    if (id === 'expense-form') { const ph = f.elements.photo?.files?.[0]; let photo = null; if (ph) { photo = `${S.store.id}/${Date.now()}.jpg`; await q(sb.storage.from('receipts').upload(photo, await shrink(ph), { contentType: 'image/jpeg' })); } await q(sb.from('expenses').insert({ store_id: S.store.id, category: v.cat, amount: +v.amount, spent_on: v.date || TODAY, source: 'bill', photo })); closeSheet(); await reload(); toast('비용을 추가했어요'); }
    if (id === 'staff-form') {
      const mw = v.prob ? Math.ceil(minWage() * 0.9 / 10) * 10 : minWage();
      if (+v.rate && +v.rate < mw && f.dataset.okw !== v.rate) { f.dataset.okw = v.rate; return toast(`${TODAY.slice(0, 4)}년 최저임금은 시급 ₩${E.won(minWage())}이에요. 맞으면 저장을 한 번 더 눌러주세요`); }
      const age = v.birth ? (d0 => { const [by, bm, bd] = v.birth.split('-').map(Number), [ty, tm, td] = TODAY.split('-').map(Number); return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0); })() : null;
      if (age != null && age < 15) return toast('만 15세 미만은 고용할 수 없어요 (근로기준법 64조)');
      if (age != null && age < 19 && f.dataset.oka !== v.birth) { f.dataset.oka = v.birth; return toast(`만 ${age}세예요. 술을 파는 매장은 만 19세 미만 고용이 금지돼요(청소년보호법). 맞으면 저장을 한 번 더 눌러주세요`); }
      const checks = { ...(S.members.find(x => x.id === f.dataset.m)?.checks || {}), ...Object.fromEntries(DOCS_IN.map(([k]) => [k, !!f.elements['doc_' + k]?.checked])), meal: Math.min(200000, +v.meal || 0), prob: !!v.prob, leave: v.leave || null };
      const row = { birth: v.birth || null, health_exp: v.health || null, checks, nick: v.nick, real_name: v.real_name || null, job_role: v.job_role, contract: v.contract, hourly_rate: +v.rate || 0, joined_on: v.joined || null, night_pay: !!v.night, labor_law: !!v.law, bank_name: v.bank || null, bank_acct: (v.acct || '').replace(/[^0-9-]/g, '') || null, bank_holder: v.holder || null, emp_type: v.emp || '파트타임', phone: (v.phone || '').replace(/[^0-9-]/g, '') || null };
      if (f.dataset.m) await q(sb.from('members').update(row).eq('id', f.dataset.m));
      let newId = null; if (!f.dataset.m) { const ins = await q(sb.from('members').insert({ ...row, company_id: S.store.company_id, store_id: S.store.id, role: 'staff' }).select()); newId = ins?.[0]?.id || null; }
      closeSheet(); await reload(); toast('저장했어요. 스케줄·급여에 바로 반영돼요');
      if (newId && v.autodoc && typeof contractSheet === 'function') setTimeout(() => contractSheet(newId), 400);
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
    if (id === 'equip-form') { const eq = {}; EQ.forEach(([k, , t]) => { const x = v[k]; if (x === undefined || x === '') return; eq[k] = typeof t === 'string' && t !== 'm' ? +x || 0 : x; }); if (S.store.equip?.labor_pct) eq.labor_pct = S.store.equip.labor_pct; await q(sb.from('stores').update({ equip: eq }).eq('id', S.store.id)); S.store.equip = eq; render(); return toast('저장했어요. 줄일 방법을 다시 계산했어요'); }
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
      const PP = ({ p_store: S.store.id, p_kind: k, p_role: v.role, p_title: v.title, p_body: [v.body, v.park && '🅿 주차: ' + v.park, v.dress && '👔 복장: ' + v.dress, v.rule && '📜 하우스룰: ' + v.rule].filter(Boolean).join('\n') || null, p_pay_text: k === 'hire' ? (P.ptype === '협의' || !+P.pamt ? '급여 협의' : `${P.ptype} ${E.won(+P.pamt)}원${P.nego ? ' (협의 가능)' : ''}`) : null, p_work_time: k === 'hire' ? `${P.wd.join('·')} ${v.s}–${v.e}` : null, p_heads: heads, p_taxi: +v.taxi || 0, p_flash: !!v.flash, p_top: P.top, p_days: +v.days || 1, p_jump: P.jump, p_slots: k === 'urgent' ? Array.from({ length: heads }, () => ({ start: v.s, end: v.e, pay: +v.pay || 0 })) : [], p_incentive: P.inc_on === '1' ? P.inc : null, p_prefer: P.pf.join(', ') || null });
      const pid = await q(sb.rpc('create_post', PP)); track('job_posted', { kind: PP.p_kind }); S.pre = null; await reload(); if ((S.posts.find(x => x.id === pid) || {}).status === 'unpaid') await pay('post', { post: pid }); else toast('공고를 올렸어요');
    }
    if (id === 'attend-form') { const k = await q(attendGeo(v.code.trim())); toast(k === 'in' ? '출근했어요. 오늘도 화이팅!' : '퇴근했어요. 수고하셨어요'); await reload(); }
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
    if (id === 'addstore-form') { await q(sb.rpc('add_store', { p_name: v.name, p_area: v.area || '' })); await boot(); toast('매장을 추가했어요. 위에서 매장을 골라 전환하세요'); }
    if (f.dataset.inq) { await q(sb.from('inquiries').update({ reply: v.reply, replied_at: new Date().toISOString() }).eq('id', f.dataset.inq)); await reload(); toast('답변을 보냈어요'); }
  });
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {})
;(() => { let dp = null; const solo = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const show = () => { if (solo() || !dp || document.getElementById('inst-btn')) return; const b = document.createElement('button'); b.id = 'inst-btn'; b.className = 'btn pri'; b.textContent = /Android|iPhone|iPad/.test(navigator.userAgent) ? '📲 앱 설치' : '💻 바탕화면에 앱 설치'; b.style.cssText = 'position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom, 0px));z-index:50;box-shadow:0 4px 14px rgba(0,0,0,.25)'; b.onclick = async () => { b.remove(); dp.prompt(); const r = await dp.userChoice.catch(() => null); dp = null; if (r?.outcome === 'accepted') toast('설치했어요. 바탕화면·시작 메뉴의 +EV 아이콘으로 여세요'); }; document.body.appendChild(b); };
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); dp = e; show(); });
  addEventListener('appinstalled', () => document.getElementById('inst-btn')?.remove()); })();;
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
const NOTI_CAT = [['sched', '근무·대타'], ['sales', '매출·마감'], ['jobs', '구인·지원'], ['docs', '계약서·급여']];
const notiCats = () => S.push && S.prof ? `<div class="chips" style="margin-top:8px">${NOTI_CAT.map(([k, l]) => `<button class="fchip ${(S.prof.noti_off || []).includes(k) ? '' : 'on'}" data-act="noti-cat" data-v="${k}">${l}</button>`).join('')}</div><small class="mut">누른 종류만 알림을 받아요</small>` : '';
const pushRow = () => pushOk() ? `<label class="tog"><span><b>푸시 알림</b><small>${S.mode === 'store' ? '오후 4시 오늘 근무 인원 · 다음날 오전 마감 리마인드 · 지원자·문의 답변' : '긴급 대타 · 채용 확정 · 지급'}</small></span><input type="checkbox" data-act="push" ${S.push ? 'checked' : ''}></label>${notiCats()}` : '';

// ===== v0.82 매장 준비 10단계 · 기능 켜기/끄기 · 영업일 경계 · 근무 일괄 확정 · 가져오기 · 빈자리 추천 =====
// 설정은 stores.cfg 한 칸(jsonb). 꺼도 데이터는 그대로, 언제든 다시 켤 수 있음.
function CFG() { return S.store?.cfg || {}; }
const FEAT = [['sched', '스케줄·근무표', '근무표, 출퇴근 코드'], ['staff', '직원·급여', '직원 등록, 급여, 계약서, 교육'], ['jobs', '딜러 구인', '공고 올리기, 전체 구인 게시판'], ['market', '장터·양도·가맹', '중고 장터, 점포 양도양수, 가맹 모집']];
function featOff(k) { return S.mode === 'store' && (CFG().off || []).includes(k); }
const ATT = [['qr', '6자리 코드·QR', '매장 화면 번호를 직원이 넣거나 찍어요'], ['gps', '위치 확인', '매장 근처에서만 출근돼요'], ['mgr', '점장 일괄 확정', '스케줄대로 점장이 한 번에 확정해요']];
const SALES = [['pos', 'POS 자동연동', '지금 공식 연동은 토스플레이스만 돼요'], ['manual', '직접 입력', '마감 때 숫자를 넣거나 영수증 사진으로 채워요'], ['both', '함께 쓰기', 'POS 숫자를 채운 뒤 직접 고쳐요']];
const SCHED = [['manual', '직접 작성', '달력에서 사람을 넣고 옮겨요'], ['auto', '자동 생성', '고정 근무 패턴·지난주 복사·빈자리 추천'], ['mix', '자동 + 수정', '자동으로 채운 뒤 필요한 날만 고쳐요']];
async function cfgSave(patch) {
  const cfg = { ...CFG(), ...patch, at: new Date().toISOString() };
  await q(sb.from('stores').update({ cfg }).eq('id', S.store.id)); S.store.cfg = cfg;
  const st = (S.stores || []).find(x => x.id === S.store.id); if (st) st.cfg = cfg;
}
const label = (L, k) => L.find(x => x[0] === k)?.[1] || '';
function setupSteps() {
  const c = CFG(), staff = S.members.filter(p => p.role !== 'owner'), toss = (S.toss || []).some(x => x.store_id === S.store.id), noRate = staff.filter(p => !p.hourly_rate);
  return [
    ['acct', '계정', 1, '로그인 완료'],
    ['store', '매장', !!S.store.id, S.store.name || ''],
    ['hours', '영업시간', !!c.open, c.open ? `${c.open}~${c.close} · 새벽 ${c.cut ?? 6}시 전 기록은 전날 영업` : '오픈·마감 시간'],
    ['feat', '쓸 기능', !!c.feat, c.feat ? `${FEAT.filter(([k]) => !featOff(k)).length + 2}개 켜짐` : '필요한 메뉴만 켜기'],
    ['sales', '매출 방식', !!c.sales, c.sales ? label(SALES, c.sales) + (c.sales === 'manual' ? '' : toss ? ' · 연결됨' : ' · 연결 대기') : 'POS·직접 입력'],
    ['close', '마감 양식', c.cash0 != null, c.cash0 != null ? `시작 현금 ₩${E.won(c.cash0)}${c.carry === false ? '' : ' · 전날 남은 현금 이월'}` : '시작 현금·항목'],
    ['staff', '직원·출퇴근', staff.length > 0 || !!c.skip_staff, staff.length ? `직원 ${staff.length}명 · ${(c.att || ['qr']).map(k => label(ATT, k)).join(' · ')}` : c.skip_staff ? '나중에 등록' : '직원·출퇴근 방식'],
    ['sched', '스케줄', !!c.sched, c.sched ? label(SCHED, c.sched) + (staff.length ? S.tpl.length ? ' · 고정 근무 있음' : ' · 아직 비어 있음' : ' · 직원 등록 후 연결') : '작성 방식'],
    ['pay', '급여', staff.length > 0 && !noRate.length, !staff.length ? '직원 등록 후' : noRate.length ? `시급 미설정 ${noRate.length}명` : '시급 설정 완료'],
    ['done', '점검', !!c.done, c.done ? '운영 시작' : '사용 가능한 기능 확인']];
}
// 게임식: 스테이지 클리어마다 +100 XP, 클리어 수로 홀덤 랭크 (보상은 레벨·칭호뿐 — 요금 혜택 없음)
const RANK = ['입장', '입장', '프리플랍', '프리플랍', '플랍', '플랍', '턴', '턴', '리버', '리버', '쇼다운'];
const SICON = ['👤', '🏪', '🕐', '🧩', '💳', '🧾', '👥', '📅', '💰', '🏆'];
const cleared = () => setupSteps().filter(x => x[2]).length;
function questMap(L, cur) {
  return `<div class="qmap" role="list">${L.map((x, j) => `<button type="button" role="listitem" class="qn ${x[2] ? 'ok' : ''} ${j === cur ? 'cur' : ''}" data-act="wz" data-v="${j}" ${j < 2 ? 'disabled' : ''} aria-label="스테이지 ${j + 1} ${x[1]}${x[2] ? ' 클리어' : ''}"><i>${x[2] ? '✓' : SICON[j]}</i><small>${x[1]}</small></button>`).join('<span class="ql" aria-hidden="true"></span>')}</div>`;
}
const xpBar = n => `<div class="xp" aria-label="경험치 ${n * 100} / 1000"><i style="width:${n * 10}%"></i><span>${n * 100} / 1,000 XP</span></div>`;
function setupCard() {
  if (S.mode !== 'store' || !isOwner() || CFG().done) return '';
  const L = setupSteps(), n = L.filter(x => x[2]).length, next = Math.max(2, L.findIndex(x => !x[2]));
  return `<div class="card qcard"><div class="qh"><div><small class="qk">매장 키우기 퀘스트</small><b>Lv.${n} · ${RANK[n]}</b></div><button class="btn sm pri" data-act="wz" data-v="${next}">${n > 2 ? '다음 스테이지 ▶' : '게임 시작 ▶'}</button></div>
  ${xpBar(n)}${questMap(L, next)}
  <button class="ob-cta" data-act="ob-open"><b>📂 자료 끌어다 놓고 한 번에 세팅</b><small>근무표·직원 명단·매출 장부 사진이나 엑셀만 올리세요</small></button>
  <p class="note" style="margin:8px 0 0">다음: <b>${SICON[next]} ${L[next][1]}</b> · 클리어하면 +100 XP · <span class="mut">마감·매출 입력은 지금 바로 돼요</span></p></div>`;
}
// 한 줄 문장 → 설정 제안 (규칙 기반, 프로 AI 없이 무료). 못 읽은 값은 비워 둠
function sayParse(t) {
  t = String(t || ''); const r = {}, T = [...t.matchAll(/(오전|오후|저녁|밤|새벽|낮|아침)?\s*(\d{1,2})\s*(?:시\s*(반|\d{1,2}\s*분)?|:(\d{2}))/g)].map(m => {
    let h = +m[2]; const mi = m[4] ? +m[4] : m[3] === '반' ? 30 : m[3] ? parseInt(m[3]) : 0, w = m[1] || '';
    if (/오후|저녁|밤/.test(w) && h < 12) h += 12; if (w === '밤' && h === 24) h = 0; if (/새벽|오전|아침/.test(w) && h === 12) h = 0;
    return { h: h % 24, mi, w };
  }).filter(x => x.mi < 60);
  if (T[0]) { if (!T[0].w && T[0].h < 10) T[0].h += 12; r.open = `${String(T[0].h).padStart(2, '0')}:${String(T[0].mi).padStart(2, '0')}`; }
  if (T[1]) r.close = `${String(T[1].h).padStart(2, '0')}:${String(T[1].mi).padStart(2, '0')}`;
  const off = /((?:[월화수목금토일](?:요일)?\s*[,·、/및와과\s]*)+)\s*(?:휴무|쉬|정기휴|휴일)/.exec(t); if (off) r.offwd = [...new Set([...off[1].replace(/요일/g, '')].map(ch => E.WD.indexOf(ch)).filter(i => i >= 0))];
  const fx = /고정\s*(?:직원)?\s*(\d+)\s*명/.exec(t) || /직원\s*(\d+)\s*명/.exec(t); if (fx) r.fixed = +fx[1];
  if (/헬퍼|알바|대타/.test(t)) r.helper = true; if (/포스|POS|pos/.test(t)) r.pos = true;
  return r;
}
const cutOf = (o, c) => { const a = E.toMin(o || '19:00'), b = E.toMin(c || '04:00'); return b <= a ? Math.min(12, Math.floor(b / 60) + 2) : 6; };
const radios = (name, L, cur) => `<div class="choice">${L.map(([k, l, s]) => `<label class="tog"><span><b>${l}</b><small>${s}</small></span><input type="radio" name="${name}" value="${k}" ${cur === k ? 'checked' : ''}></label>`).join('')}</div>`;
function wzOpen(i) {
  if (!isOwner()) return toast('매장 설정은 대표만 바꿀 수 있어요');
  const L = setupSteps(); i = Math.max(2, Math.min(L.length - 1, +i)); S.wz = i;
  const [k, name] = L[i], c = CFG(), say = S.wzSay || {}, staff = S.members.filter(p => p.role !== 'owner');
  const n = L.filter(x => x[2]).length, nav = `<div class="qtop"><span class="qstage">STAGE ${i + 1} / 10</span><span class="qrank">Lv.${n} ${RANK[n]}</span><span class="qxp">${L[i][2] ? '클리어함' : '+100 XP'}</span></div>${xpBar(n)}${questMap(L, i)}`;
  const foot = `<div class="row" style="margin-top:12px">${i > 2 ? `<button type="button" class="btn" data-act="wz" data-v="${i - 1}">뒤로</button>` : ''}${k !== 'done' ? `<button type="button" class="btn" data-act="wz" data-v="${i + 1}">건너뛰기</button><button class="btn pri" style="flex:1">저장하고 다음</button>` : ''}</div>`;
  let body = '';
  if (k === 'hours') {
    const o = say.open || c.open || '19:00', cl = say.close || c.close || '04:00', cut = c.cut ?? cutOf(o, cl), off = say.offwd || c.offwd || [];
    body = `<p class="sub">자정 넘어 끝나도 하루 영업으로 묶어요.</p>
    <label class="fl">한 줄로 말하기 <small class="mut">(선택) 읽어서 아래 칸을 채워요</small><textarea name="say" rows="2" placeholder="예: 오후 6시부터 새벽 4시까지, 월요일 휴무, 고정직원 3명에 나머지는 헬퍼">${esc(S.wzSayT || '')}</textarea></label><button type="button" class="btn sm" data-act="wz-say">읽어서 채우기</button>
    <div class="grid2"><label class="fl">오픈<input type="time" name="open" value="${o}" required></label><label class="fl">마감<input type="time" name="close" value="${cl}" required></label></div>
    <label class="fl">영업일이 바뀌는 시각 <small class="mut">이 시각 전에 넣은 기록은 전날 영업으로 잡혀요</small><select name="cut">${Array.from({ length: 13 }, (_, h) => `<option value="${h}" ${h === cut ? 'selected' : ''}>새벽 ${h}시</option>`).join('')}</select></label>
    <div class="fl"><span>쉬는 요일 <small class="mut">마감 안 한 날 찾기에서 빼요</small></span><div class="chks">${E.WD.map((w, j) => `<label><input type="checkbox" name="off_${j}" ${off.includes(j) ? 'checked' : ''}><span>${w}</span></label>`).join('')}</div></div>
    ${say.fixed || say.helper ? `<p class="note">읽은 내용: ${say.fixed ? `고정 직원 ${say.fixed}명` : ''}${say.helper ? ' · 헬퍼 사용 → 직원 단계에서 헬퍼 추가, 출퇴근은 점장 일괄 확정을 추천해요' : ''}</p>` : ''}`;
  } else if (k === 'feat') {
    body = `<p class="sub">끈 메뉴는 아래 탭에서 숨겨요. <b>데이터는 지워지지 않고</b> 언제든 다시 켤 수 있어요.</p><div class="choice">
    <label class="tog"><span><b>홈·매출 마감</b><small>항상 켜져 있어요 (요금제·계정·약관도 늘 열려요)</small></span><input type="checkbox" checked disabled></label>
    ${FEAT.map(([fk, l, s]) => `<label class="tog"><span><b>${l}</b><small>${s}</small></span><input type="checkbox" name="f_${fk}" ${(c.off || []).includes(fk) ? '' : 'checked'}></label>`).join('')}</div>`;
  } else if (k === 'sales') {
    const toss = (S.toss || []).some(x => x.store_id === S.store.id);
    body = `<p class="sub">POS 연동이 안 돼도 마감은 바로 쓸 수 있어요.</p>${radios('sales', SALES, c.sales || (say.pos ? 'both' : 'manual'))}
    <p class="note">토스플레이스: ${toss ? '<b class="up">연결됨</b>' : '아직 연결 안 됨 · 매출 탭 위 \'통합 POS 연동\'에서 연결해요'}. 다른 POS는 공식 API 제휴 전이라 '준비 중'이에요.</p>
    <button type="button" class="btn sm" data-act="sales-csv">지난 매출 엑셀·CSV로 가져오기</button>`;
  } else if (k === 'close') {
    body = `<p class="sub">마감 화면을 매장에 맞춰요.</p>
    <label class="fl">영업 시작 현금 기본값 <small class="mut">영업 시작할 때 돈통에 넣어 두는 돈</small><input name="cash0" type="number" inputmode="numeric" min="0" value="${c.cash0 ?? S.lastStart ?? 300000}" required></label>
    <div class="choice"><label class="tog"><span><b>전날 남은 현금 이어받기</b><small>어제 마감 때 센 돈(은행 입금 뺀 금액)을 오픈 칸에 미리 채워요</small></span><input type="checkbox" name="carry" ${c.carry === false ? '' : 'checked'}></label>
    <label class="tog"><span><b>게임·음료 매출 나눠 적기</b><small>마감 화면에서 토너먼트·음료 칸을 펼쳐 둬요</small></span><input type="checkbox" name="split" ${c.split ? 'checked' : ''}></label></div>
    <p class="note">예상 남은 현금 = 시작 현금 + 현금 매출 − 현금 지출 − 현금 환불. 실제 센 돈과 다르면 마감 때 차액을 보여줘요.</p>`;
  } else if (k === 'staff') {
    const att = c.att || (say.helper ? ['qr', 'mgr'] : ['qr']);
    body = `<p class="sub">직원이 없어도 넘어갈 수 있어요. 스케줄 짤 때 바로 추가해도 돼요.</p>
    <div class="row" style="flex-wrap:wrap"><button type="button" class="btn sm" data-act="staff-new">+ 직원 한 명</button><button type="button" class="btn sm" data-act="staff-bulk">엑셀·사진으로 여러 명</button><button type="button" class="btn sm" data-act="helper-add">+ 헬퍼</button></div>
    <p class="note">지금 직원 ${staff.length}명${say.fixed ? ` · 말씀하신 고정 직원 ${say.fixed}명` : ''}</p>
    <div class="fl"><span>출퇴근 방식 <small class="mut">여러 개 같이 써도 돼요</small></span><div class="choice">${ATT.map(([ak, l, s]) => `<label class="tog"><span><b>${l}</b><small>${s}${ak === 'gps' && S.store.geo_lat == null ? ' · 출퇴근 코드 화면에서 매장 위치를 저장해야 켜져요' : ''}</small></span><input type="checkbox" name="a_${ak}" ${att.includes(ak) ? 'checked' : ''}></label>`).join('')}</div></div>
    ${staff.length ? '' : `<label class="tog"><span><b>직원은 나중에 등록할게요</b></span><input type="checkbox" name="skip_staff" ${c.skip_staff ? 'checked' : ''}></label>`}
    <p class="note">스케줄에 있다고 근무 완료로 치지 않아요. 코드·위치로 찍거나 점장이 확정해야 기록돼요.</p>`;
  } else if (k === 'sched') {
    body = `<p class="sub">언제든 바꿀 수 있어요. 자동으로 채워도 손으로 고칠 수 있어요.</p>${radios('sched', SCHED, c.sched || 'mix')}
    <div class="row" style="flex-wrap:wrap"><button type="button" class="btn sm" data-act="sched-import">기존 근무표 가져오기 (엑셀·사진)</button></div>
    ${staff.length ? '' : '<p class="note">직원이 아직 없어서 방식만 저장해요. 직원을 등록하면 근무표에 연결돼요.</p>'}`;
  } else if (k === 'pay') {
    const no = staff.filter(p => !p.hourly_rate);
    body = `<p class="sub">시급이 있어야 급여·예상 인건비를 계산해요. 모르는 값은 계산하지 않고 '미설정'으로 둬요.</p>
    ${!staff.length ? '<p class="note">직원을 등록하면 여기서 시급을 확인해요.</p>' : no.length ? `<div class="card warnc"><b>시급 미설정 ${no.length}명</b><small class="mut" style="display:block">${no.slice(0, 8).map(p => esc(p.nick)).join(', ')}</small></div><button type="button" class="btn sm pri" data-act="wz-go" data-v="staff">직원 탭에서 시급 넣기</button>` : '<p class="note up">모든 직원 시급이 들어가 있어요. 야간·연장·주휴는 직원별 계약 설정대로 계산해요.</p>'}`;
  } else {
    const ok = [], todo = [], st = L.slice(0, -1);
    ok.push('마감 시작', '매출 입력', '매장 정보 확인');
    const g = j => st[j][2];
    (g(6) && staff.length ? ok : todo).push('직원 스케줄'); (g(8) ? ok : todo).push('급여 자동계산');
    ((S.toss || []).some(x => x.store_id === S.store.id) ? ok : CFG().sales === 'manual' ? [] : todo).push('POS 자동연동');
    body = `<p class="sub" style="font-size:17px"><b>${todo.length ? '마감을 쓸 준비가 됐어요.' : '매장 운영 준비가 완료되었습니다.'}</b></p>
    <div class="card"><h3>바로 쓸 수 있어요</h3>${ok.map(x => `<div class="li"><span>✓ ${x}</span></div>`).join('')}</div>
    ${todo.length ? `<div class="card"><h3>추가 설정이 필요해요</h3>${todo.map(x => `<div class="li"><span class="mut">${x}</span><small class="mut">나중에 해도 돼요</small></div>`).join('')}</div>` : ''}
    <button type="button" class="btn pri full" data-act="wz-done">매장 대시보드로 이동</button><p class="note" style="text-align:center">설정은 오른쪽 위 메뉴 → 매장 준비·기능에서 다시 열 수 있어요</p>`;
  }
  openSheet(`${nav}<h2 class="qtitle">${SICON[i]} ${name}</h2><form class="f" id="wz-form" data-k="${k}">${body}${foot}</form>`);
  document.querySelector('#sheet .qn.cur')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
F68['wz-form'] = async (f) => {
  S.wzBefore = cleared(); const k = f.dataset.k, el = n => f.elements[n], ck = n => !!el(n)?.checked;
  if (k === 'hours') await cfgSave({ open: el('open').value, close: el('close').value, cut: +el('cut').value, offwd: E.WD.map((_, j) => j).filter(j => ck('off_' + j)) });
  if (k === 'feat') await cfgSave({ feat: 1, off: FEAT.map(([x]) => x).filter(x => !ck('f_' + x)) });
  if (k === 'sales') await cfgSave({ sales: f.querySelector('[name=sales]:checked')?.value || 'manual' });
  if (k === 'close') await cfgSave({ cash0: Math.max(0, +el('cash0').value || 0), carry: ck('carry'), split: ck('split') });
  if (k === 'staff') await cfgSave({ att: ATT.map(([x]) => x).filter(x => ck('a_' + x)), skip_staff: ck('skip_staff') });
  if (k === 'sched') await cfgSave({ sched: f.querySelector('[name=sched]:checked')?.value || 'mix' });
  const after = cleared(); render(); if (after > (S.wzBefore ?? after)) await stageClear(after); wzOpen(S.wz + 1);
};
// 스테이지 클리어 연출 — 탭하거나 1.6초 뒤 닫힘
function stageClear(n, fin) {
  const up = RANK[n] !== RANK[n - 1], el = document.createElement('div'); el.className = 'qclear' + (fin ? ' fin' : ''); el.setAttribute('role', 'status');
  el.innerHTML = `<div class="qc-in">${Array.from({ length: 14 }, (_, j) => `<i class="chip-p" style="--a:${j * 360 / 14}deg;--d:${90 + (j % 3) * 40}px;--c:${['#3ddc84', '#f5b942', '#ff6b6b', '#7aa7ff'][j % 4]}"></i>`).join('')}
    <b class="qc-t">${fin ? 'SHOWDOWN!' : 'STAGE CLEAR!'}</b><span class="qc-x">+100 XP</span>${fin ? '<span class="qc-r">🏆 매장 오픈 준비 완료 · Lv.10 쇼다운</span>' : up ? `<span class="qc-r">랭크 업! ${RANK[n - 1]} → <b>${RANK[n]}</b></span>` : `<span class="qc-r">Lv.${n} · ${RANK[n]}</span>`}</div>`;
  document.body.appendChild(el); try { navigator.vibrate?.(fin ? [40, 60, 80] : 30); } catch { }
  return new Promise(r => { const end = () => { el.remove(); r(); }; el.addEventListener('click', end, { once: true }); setTimeout(end, fin ? 2400 : 1600); });
}
// 근무 일괄 확정: 스케줄은 '예정'일 뿐, 확정해야 출퇴근 기록이 생김 (method 'mgr')
function mgrRows(k) {
  const [y, m, d] = k.split('-').map(Number);
  return S.members.filter(p => p.role !== 'owner').map(p => ({ p, t: E.shiftOn(p.id, y, m, d, S.tpl, S.ov) })).filter(x => x.t).map(({ p, t }) => {
    const a = new Date(`${k}T${t5(t.s)}:00+09:00`); let b = new Date(`${k}T${t5(t.e)}:00+09:00`); if (b <= a) b = new Date(+b + 864e5);
    const has = (S.attStore || []).some(x => x.member_id === p.id && new Date(x.at) > +a - 4 * 36e5 && new Date(x.at) < +b + 4 * 36e5);
    return { p, t, a, b, has };
  });
}
function mgrCard() {
  const k = S.mgrDay || addDay(bizDay(), -1), L = mgrRows(k), [, mm, dd] = k.split('-').map(Number), miss = L.filter(x => !x.has);
  return `<div class="card"><div class="row between"><h3 style="margin:0">근무 확정 ${(CFG().att || []).includes('mgr') ? '<span class="pill g">사용 중</span>' : ''}</h3><span class="row"><button class="btn sm" data-act="mgr-day" data-v="-1" aria-label="전날">◀</button><b class="num">${mm}/${dd}(${E.WD[E.wdOf(...k.split('-').map(Number))]})</b><button class="btn sm" data-act="mgr-day" data-v="1" aria-label="다음날" ${k >= bizDay() ? 'disabled' : ''}>▶</button></span></div>
  <p class="sub" style="margin:6px 0">스케줄은 예정이에요. 코드를 안 찍은 사람은 여기서 실제 일했는지 확정하세요. 결근이면 체크를 빼세요.</p>
  ${L.length ? `<form class="f" id="mgr-form" data-d="${k}">${L.map(x => `<label class="tog"><span><b>${esc(x.p.nick)}</b><small>${t5(x.t.s)}–${t5(x.t.e)}${x.has ? ' · <span class="up">기록 있음</span>' : ' · 기록 없음'}</small></span><input type="checkbox" name="m_${x.p.id}" ${x.has ? 'disabled' : 'checked'}></label>`).join('')}
  ${miss.length ? `<button class="btn pri full">체크한 사람 스케줄대로 확정</button>` : '<p class="note up">모두 기록이 있어요</p>'}</form>` : '<div class="empty">이날 스케줄이 없어요</div>'}</div>`;
}
F68['mgr-form'] = async (f) => {
  const k = f.dataset.d, R = mgrRows(k).filter(x => !x.has && f.elements['m_' + x.p.id]?.checked);
  if (!R.length) return toast('확정할 사람을 골라주세요');
  if (R.some(x => x.b > new Date())) return toast('아직 끝나지 않은 근무가 있어요. 끝난 뒤 확정하세요');
  const n = await q(sb.rpc('att_confirm', { p_store: S.store.id, p_rows: R.map(x => ({ m: x.p.id, in: x.a.toISOString(), out: x.b.toISOString() })) }));
  toast(`${n}명 근무를 확정했어요 · 급여에 반영돼요`); await reload(); render();
};
// 파일 → 텍스트: 엑셀(xlsx) · CSV(UTF-8/EUC-KR) · 사진(프로 AI)
async function fileText(file, kind) {
  if (file.type.startsWith('image/')) {
    const img = await createImageBitmap(file), z = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * z; c.height = img.height * z; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const { data, error } = await sb.functions.invoke('ai', { body: { store_id: S.store.id, mode: kind, image: c.toDataURL('image/jpeg', .85) } });
    if (error || !data?.ok) { toast(data?.msg || '사진을 못 읽었어요. 엑셀로 올리거나 붙여넣어 주세요'); return null; } return data.text;
  }
  if (/\.xlsx?$/i.test(file.name)) { const X = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'); const wb = X.read(await file.arrayBuffer()); return X.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: '\t', blankrows: false }); }
  const buf = await file.arrayBuffer(); try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('euc-kr').decode(buf); }
}
document.addEventListener('change', e => {
  const t = e.target; if (t.id !== 'imp-file' || !t.files[0]) return; const file = t.files[0], ta = t.closest('form')?.elements.t; t.value = '';
  busy(async () => { const x = await fileText(file, t.dataset.kind); if (x == null || !ta) return; ta.value = x.replace(/\r/g, '').trim(); ta.dispatchEvent(new Event('input', { bubbles: true })); toast('불러왔어요. 미리보기를 확인하고 고칠 게 있으면 고친 뒤 저장하세요'); });
});
const impFile = (kind, acc) => `<label class="btn sm" style="margin:6px 0;cursor:pointer">📎 엑셀·CSV${kind === 'sales' ? '' : '·사진'} 불러오기<input type="file" id="imp-file" data-kind="${kind}" accept="${acc}" hidden></label>`;
// 고정 근무 가져오기: "이름 요일 시작 끝 [휴게분]" 한 줄에 한 명
function schedRows(t) {
  const DAYS = { 매일: [0, 1, 2, 3, 4, 5, 6], 평일: [0, 1, 2, 3, 4], 주말: [5, 6] };
  return String(t || '').split(/\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const c = l.split(/\t|,|\s+/).filter(Boolean), name = c[0], rest = c.slice(1).join(' ');
    if (/^(이름|성명|닉네임|name)$/i.test(name)) return null;
    const tm = [...rest.matchAll(/(\d{1,2})(?::(\d{2})|시)/g)].map(m => `${String(+m[1] % 24).padStart(2, '0')}:${m[2] || '00'}`);
    let wds = Object.entries(DAYS).filter(([k]) => rest.includes(k)).flatMap(([, v]) => v); wds = [...new Set([...wds, ...[...rest.replace(/\d.*$/, '')].map(ch => E.WD.indexOf(ch)).filter(i => i >= 0)])].sort();
    const brk = +(/휴게\s*(\d+)/.exec(rest)?.[1] || 0), p = S.members.find(x => x.role !== 'owner' && (x.nick === name || x.real_name === name));
    return { name, p, wds, s: tm[0], e: tm[1], brk, ok: !!(p && wds.length && tm[0] && tm[1]) };
  }).filter(Boolean);
}
function schedPv(t) { const L = schedRows(t); return L.length ? `<table class="itbl"><tr><th>이름</th><th>요일</th><th>시간</th><th></th></tr>${L.map(r => `<tr><td>${esc(r.name)}</td><td>${r.wds.map(i => E.WD[i]).join('')}</td><td class="num">${r.s || '?'}–${r.e || '?'}</td><td>${r.ok ? '<span class="up">✓</span>' : `<span class="down">${!r.p ? '없는 직원' : !r.wds.length ? '요일 없음' : '시간 없음'}</span>`}</td></tr>`).join('')}</table><p class="note">✓ ${L.filter(r => r.ok).length}명 저장 · 나머지는 건너뛰어요 (없는 직원은 먼저 등록하세요)</p>` : '<p class="note">붙여넣으면 미리보기가 나와요</p>'; }
F68['simp-form'] = async (f, v) => {
  const L = schedRows(v.t).filter(r => r.ok); if (!L.length) return toast('저장할 줄이 없어요. 이름이 등록된 직원과 같은지 확인하세요');
  await q(sb.from('shift_templates').upsert(L.flatMap(r => r.wds.map(w => ({ member_id: r.p.id, weekday: w, start_t: r.s, end_t: r.e, break_min: r.brk })))));
  closeSheet(); await reload(); render(); toast(`${L.length}명 고정 근무를 저장했어요. 기본 탭에서 고칠 수 있어요`);
};
// 지난 매출 가져오기: "날짜 총매출 [카드] [현금] [이체]" · 이미 마감한 날은 덮어쓰지 않음
// 한 줄 → 칸: 탭 > 쉼표(따옴표 안 "980,000"은 한 칸) > 공백
function cells(l) { if (l.includes('\t')) return l.split('\t').map(x => x.trim()); if (!l.includes(',')) return l.trim().split(/\s+/); const o = []; let c = '', qt = false; for (const ch of l) { if (ch === '"') qt = !qt; else if (ch === ',' && !qt) { o.push(c.trim()); c = ''; } else c += ch; } o.push(c.trim()); return o; }
function salesRows(t) {
  return String(t || '').split(/\n/).map(cells).filter(c => c[0]).map(c => {
    const n = x => +String(x || '').replace(/[^0-9-]/g, '') || 0, m = /(\d{4})?[.\-/년\s]*(\d{1,2})[.\-/월\s]+(\d{1,2})/.exec(c[0]); if (!m) return null;
    const k = E.ymd(+(m[1] || now.getFullYear()), +m[2], +m[3]), sales = n(c[1]), card = n(c[2]), cash = c[3] != null ? n(c[3]) : null, tr = n(c[4]);
    return { k, sales, card, cash: cash ?? Math.max(0, sales - card - tr), tr, dup: (S.hist || []).some(r => r.report_date === k), ok: sales > 0 && k <= TODAY };
  }).filter(Boolean);
}
function salesPv(t) { const L = salesRows(t); return L.length ? `<table class="itbl"><tr><th>영업일</th><th>매출</th><th>카드</th><th></th></tr>${L.slice(0, 40).map(r => `<tr><td>${r.k}</td><td class="num">₩${E.won(r.sales)}</td><td class="num">₩${E.won(r.card)}</td><td>${r.dup ? '<span class="mut">이미 마감</span>' : r.ok ? '<span class="up">추가</span>' : '<span class="down">확인</span>'}</td></tr>`).join('')}</table><p class="note">추가 ${L.filter(r => r.ok && !r.dup).length}일 · 이미 마감한 날은 건너뛰어요</p>` : '<p class="note">붙여넣으면 미리보기가 나와요 · 첫 줄 제목은 무시해요</p>'; }
F68['sales-imp'] = async (f, v) => {
  const L = salesRows(v.t).filter(r => r.ok && !r.dup); if (!L.length) return toast('새로 넣을 날이 없어요');
  await q(sb.from('daily_reports').insert(L.map(r => ({ store_id: S.store.id, report_date: r.k, sales: r.sales, card: r.card, cash: r.cash, transfer: r.tr, reported_by: S.user.id, memo: '엑셀 가져오기', detail: { src: 'import' } }))));
  closeSheet(); await reload(); render(); toast(`${L.length}일 매출을 넣었어요. 일 매출 달력에서 고칠 수 있어요`);
};
document.addEventListener('input', e => {
  const f = e.target.closest?.('form'); if (e.target.name !== 't' || !f) return;
  if (f.id === 'simp-form') $('#simp-pv').innerHTML = schedPv(e.target.value);
  if (f.id === 'sales-imp') $('#sales-pv').innerHTML = salesPv(e.target.value);
});
// 빈자리 추천: 적정 인원보다 적은 날에, 이번 달 근무가 적은 직원부터 (휴무 신청한 날 제외)
function fillSug() {
  const need = S.store.need_by_wd || [3, 4, 3, 4, 6, 7, 2], staff = S.members.filter(p => p.role !== 'owner'), D = E.daysIn(S.y, S.m), hrs = Object.fromEntries(staff.map(p => [p.id, 0])), out = [];
  const on = d => staff.filter(p => E.shiftOn(p.id, S.y, S.m, d, S.tpl, S.ov));
  for (let d = 1; d <= D; d++) on(d).forEach(p => { const t = E.shiftOn(p.id, S.y, S.m, d, S.tpl, S.ov); hrs[p.id] += hoursOf(t5(t.s), t5(t.e)); });
  for (let d = 1; d <= D; d++) {
    const k = E.ymd(S.y, S.m, d); if (k < TODAY) continue; const W = on(d), gap = needOn(k, need) - W.length; if (gap <= 0) continue;
    const t0 = W[0] ? E.shiftOn(W[0].id, S.y, S.m, d, S.tpl, S.ov) : { s: CFG().open || '19:00', e: CFG().close || '04:00' };
    staff.filter(p => !W.includes(p) && !(S.ov || []).some(o => o.member_id === p.id && o.work_date === k && o.off)).sort((a, b) => hrs[a.id] - hrs[b.id]).slice(0, gap)
      .forEach(p => { out.push({ p, k, s: t5(t0.s), e: t5(t0.e) }); hrs[p.id] += hoursOf(t5(t0.s), t5(t0.e)); });
  }
  return out;
}
F68['sug-form'] = async (f) => {
  const L = (S.sug || []).filter((x, i) => f.elements['s_' + i]?.checked); if (!L.length) return toast('넣을 근무를 골라주세요');
  await q(sb.from('shift_overrides').upsert(L.map(x => ({ member_id: x.p.id, work_date: x.k, start_t: x.s, end_t: x.e, break_min: 0, off: false }))));
  closeSheet(); await reload(); render(); toast(`${L.length}개 근무를 넣었어요. 달력에서 옮기거나 지울 수 있어요`);
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'wz') return wzOpen(b.dataset.v);
  if (a === 'wz-say') { const f = $('#wz-form'), t = f.elements.say.value; S.wzSayT = t; S.wzSay = sayParse(t); const r = S.wzSay; if (!r.open && !r.close && !r.offwd) return toast('시간을 못 읽었어요. 아래 칸에 직접 넣어주세요'); return wzOpen(S.wz), toast('채웠어요. 맞는지 확인하고 저장하세요'); }
  if (a === 'wz-go') { closeSheet(); S.tab = b.dataset.v; S.sub = null; return render(); }
  if (a === 'wz-done') return busy(async () => { await cfgSave({ done: 1 }); closeSheet(); await stageClear(10, true); closeSheet(); S.tab = 'home'; S.sub = null; render(); toast('매장 운영을 시작해요'); });
  if (a === 'mgr-day') { const k = addDay(S.mgrDay || addDay(bizDay(), -1), +b.dataset.v); if (k > bizDay()) return; S.mgrDay = k; return render(); }
  if (a === 'sched-import') return openSheet(`<h2>고정 근무 가져오기</h2><p class="sub">한 줄에 한 명: <b>이름 · 요일 · 시작 · 끝</b> (휴게는 '휴게 30'). 매일·평일·주말도 돼요. 사진은 프로 요금제에서 읽어요.</p>
    <form class="f" id="simp-form">${impFile('sched', '.csv,.xlsx,.xls,.txt,image/*')}<textarea name="t" rows="7" style="width:100%" placeholder="에이스 월화수 19:00 04:00&#10;민지 주말 18:00 02:00 휴게 30"></textarea><div id="simp-pv"><p class="note">붙여넣으면 미리보기가 나와요</p></div><button class="btn pri full">확인한 줄 저장</button></form>`);
  if (a === 'sales-csv') return openSheet(`<h2>지난 매출 가져오기</h2><p class="sub">POS·장부에서 내려받은 파일을 올리거나 붙여넣으세요. 한 줄에 하루: <b>영업일 · 총매출 · 카드 · 현금 · 이체</b> (카드부터는 없어도 돼요).</p>
    <form class="f" id="sales-imp">${impFile('sales', '.csv,.xlsx,.xls,.txt')}<textarea name="t" rows="7" style="width:100%" placeholder="2026-10-01	1250000	900000&#10;2026-10-02	980000	700000"></textarea><div id="sales-pv"><p class="note">붙여넣으면 미리보기가 나와요 · 첫 줄 제목은 무시해요</p></div><button class="btn pri full">새 날짜만 저장</button></form>`);
  if (a === 'fill-sug') { const L = S.sug = fillSug(); if (!L.length) return toast('남은 날 중 비는 자리가 없거나, 넣을 수 있는 직원이 없어요');
    return openSheet(`<h2>빈자리 자동 추천 <small>${L.length}개</small></h2><p class="sub">적정 인원보다 적은 날에, 이번 달 근무가 적은 직원부터 넣었어요. 휴무 신청한 날은 뺐어요. 확인하고 넣으세요.</p>
      <form class="f" id="sug-form">${L.map((x, i) => { const [, mm, dd] = x.k.split('-').map(Number); return `<label class="tog"><span><b>${mm}/${dd}(${E.WD[E.wdOf(...x.k.split('-').map(Number))]}) ${esc(x.p.nick)}</b><small>${x.s}–${x.e}</small></span><input type="checkbox" name="s_${i}" checked></label>`; }).join('')}<button class="btn pri full">체크한 근무 넣기</button></form>`); }
});

// ===== v0.84 한 번에 세팅: 자료 끌어다 놓기 → 스캔 → 확인 → 한 번에 적용 =====
// 엑셀·CSV는 기기 안에서 바로 읽고, 사진은 AI(scan)가 읽음. 저장은 사장이 확인한 뒤에만.
const KIND = { roster: ['👥', '직원 명단'], sched: ['📅', '고정 근무표'], sales: ['🧾', '지난 매출'], none: ['❔', '알 수 없음'] };
function detectKind(t) {
  const L = String(t || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 30); if (!L.length) return 'none';
  const n = re => L.filter(l => re.test(l)).length;
  if (n(/^(\d{4}[.\-/년]\s*)?\d{1,2}[.\-/월]\s*\d{1,2}/) >= L.length / 2) return 'sales';
  if (n(/\d{1,2}(:\d{2}|시).*\d{1,2}(:\d{2}|시)/) >= L.length / 2 && n(/[월화수목금토일]|매일|평일|주말/) >= L.length / 2) return 'sched';
  if (n(/[가-힣A-Za-z]{2,}.*\d{4,}/) >= L.length / 2 || /시급|연락처|이름|성명/.test(L[0])) return 'roster';
  return 'none';
}
async function scanFile(file) {
  if (file.type.startsWith('image/')) {
    const img = await createImageBitmap(file), z = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * z; c.height = img.height * z; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const { data, error } = await sb.functions.invoke('ai', { body: { store_id: S.store.id, mode: 'scan', image: c.toDataURL('image/jpeg', .85) } });
    if (error || !data?.ok) return { kind: 'none', text: '', err: data?.msg || '사진을 못 읽었어요' };
    return { kind: KIND[data.kind] ? data.kind : 'none', text: String(data.text || '').trim() };
  }
  const text = (await fileText(file)) || ''; return { kind: detectKind(text), text: text.replace(/\r/g, '').trim() };
}
const ob = () => (S.ob = S.ob || { items: [], say: '' });
function obCount(it) {
  if (it.kind === 'roster') { const L = bulkRows(it.text); return `${L.length}명 인식`; }
  if (it.kind === 'sched') { const nw = new Set(ob().items.filter(x => x.kind === 'roster').flatMap(x => bulkRows(x.text).map(r => r.nick))), L = schedRows(it.text), ok = L.filter(r => r.wds.length && r.s && r.e && (r.p || nw.has(r.name))).length; return `${L.length}명 · 연결 가능 ${ok}명${ok < L.length ? ' · 이름이 직원과 다르면 고쳐주세요' : ''}`; }
  if (it.kind === 'sales') { const L = salesRows(it.text); return `${L.length}일 · 새 날짜 ${L.filter(r => r.ok && !r.dup).length}일`; }
  return it.err || '어떤 자료인지 모르겠어요 · 종류를 골라주세요';
}
function obItem(it, i) {
  const [ic, nm] = KIND[it.kind];
  if (it.st === 'scan') return `<div class="scan-it on"><div class="scan-th">${it.thumb ? `<img src="${it.thumb}" alt="">` : '<b>📄</b>'}<i class="scan-line"></i></div><div class="scan-tx"><b>${esc(it.name)}</b><small class="scan-msg">스캔 중입니다… 조금만 기다려 주세요</small><div class="scan-bar"><i></i></div></div></div>`;
  return `<div class="scan-it ${it.kind === 'none' ? 'bad' : 'ok'}"><div class="scan-th">${it.thumb ? `<img src="${it.thumb}" alt="">` : `<b>${ic}</b>`}</div><div class="scan-tx"><b>${ic} ${nm}</b><small>${esc(it.name)} · ${obCount(it)}</small>
    <div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap"><select data-ob-kind="${i}" aria-label="자료 종류">${Object.entries(KIND).map(([k, [, l]]) => `<option value="${k}" ${k === it.kind ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="btn sm" data-act="ob-edit" data-v="${i}">내용 보기·고치기</button><button type="button" class="btn sm" data-act="ob-del" data-v="${i}" aria-label="빼기">✕</button></div>
    ${it.open ? `<textarea data-ob-text="${i}" rows="6" style="width:100%;margin-top:6px">${esc(it.text)}</textarea>` : ''}</div></div>`;
}
function obOpen() {
  if (!isOwner()) return toast('대표만 할 수 있어요');
  const O = ob(), busyN = O.items.filter(x => x.st === 'scan').length, ready = O.items.filter(x => x.st !== 'scan' && x.kind !== 'none');
  openSheet(`<div class="qtop"><span class="qstage">한 번에 세팅</span><span class="qxp">자료만 올리면 끝</span></div>
  <h2 class="qtitle">📂 가지고 있는 자료를 끌어다 놓으세요</h2><p class="sub">근무표·직원 명단·매출 장부를 <b>사진, 캡처, 엑셀</b> 그대로 올리면 알아서 읽어요. 저장은 확인한 뒤에만 해요.</p>
  <label class="drop-z" id="ob-drop" tabindex="0"><input type="file" id="ob-file" multiple accept="image/*,.xlsx,.xls,.csv,.txt" hidden><b>여기에 끌어다 놓기</b><small>또는 눌러서 고르기 · 여러 개 한 번에 · 캡처는 Ctrl+V로 붙여넣기</small></label>
  <div class="scan-list">${O.items.map(obItem).join('')}</div>
  <label class="fl">영업시간 한 줄로 <small class="mut">(선택)</small><input id="ob-say" value="${esc(O.say)}" placeholder="예: 오후 6시~새벽 4시, 월요일 휴무"></label>
  <p class="note">사진 읽기는 AI라 프로·무료 체험에서 돼요. 엑셀·CSV는 언제나 돼요. 직원 명단 → 근무표 순서로 저장해서 이름을 자동으로 이어요.</p>
  <div class="row" style="margin-top:10px"><button type="button" class="btn" data-act="wz" data-v="2">하나씩 직접 할게요</button><button type="button" class="btn pri" style="flex:1" data-act="ob-apply" ${busyN || (!ready.length && !O.say.trim()) ? 'disabled' : ''}>${busyN ? `스캔 중… ${busyN}개` : `세팅 완료하기${ready.length ? ` · 자료 ${ready.length}개` : ''}`}</button></div>`);
}
async function obAdd(files) {
  const O = ob();
  for (const f of files) {
    const it = { name: f.name || '붙여넣은 캡처', st: 'scan', kind: 'none', text: '' };
    if (f.type.startsWith('image/')) it.thumb = URL.createObjectURL(f);
    O.items.push(it); obOpen();
    const t0 = Date.now();
    try { Object.assign(it, await scanFile(f)); } catch (e) { it.err = '읽지 못했어요'; }
    await new Promise(r => setTimeout(r, Math.max(0, 900 - (Date.now() - t0)))); // 너무 빨리 끝나면 스캔한 느낌이 안 나서 최소 0.9초
    it.st = 'done'; obOpen();
  }
}
async function obApply() {
  const O = ob(), before = cleared(), done = [], by = k => O.items.filter(x => x.st === 'done' && x.kind === k).map(x => x.text).join('\n');
  if (O.say.trim()) { const r = sayParse(O.say); if (r.open && r.close) { await cfgSave({ open: r.open, close: r.close, cut: CFG().cut ?? cutOf(r.open, r.close), offwd: r.offwd || CFG().offwd || [] }); done.push('영업시간'); } }
  const R = bulkRows(by('roster')); if (R.length) { await q(sb.from('members').insert(R.map(r => ({ ...r, company_id: S.store.company_id, store_id: S.store.id, role: 'staff', contract: '3.3', emp_type: '파트타임', night_pay: true })))); done.push(`직원 ${R.length}명`); await reload(); }
  const W = schedRows(by('sched')).filter(r => r.ok); if (W.length) { await q(sb.from('shift_templates').upsert(W.flatMap(r => r.wds.map(w => ({ member_id: r.p.id, weekday: w, start_t: r.s, end_t: r.e, break_min: r.brk }))))); await cfgSave({ sched: CFG().sched || 'mix' }); done.push(`고정 근무 ${W.length}명`); }
  const Y = salesRows(by('sales')).filter(r => r.ok && !r.dup); if (Y.length) { await q(sb.from('daily_reports').insert(Y.map(r => ({ store_id: S.store.id, report_date: r.k, sales: r.sales, card: r.card, cash: r.cash, transfer: r.tr, reported_by: S.user.id, memo: '한 번에 세팅', detail: { src: 'import' } })))); done.push(`매출 ${Y.length}일`); }
  if (!done.length) return toast('저장할 내용이 없어요. 자료 종류를 확인해 주세요');
  S.ob = null; closeSheet(); await reload(); render();
  const after = cleared(); for (let n = before + 1; n <= after; n++) await stageClear(n);
  toast(`세팅했어요 · ${done.join(' · ')}`);
  const next = setupSteps().findIndex(x => !x[2]); if (next > 0 && next < 9) wzOpen(next);
}
document.addEventListener('change', e => {
  if (e.target.id === 'ob-file' && e.target.files.length) { const F = [...e.target.files]; e.target.value = ''; obAdd(F); }
  if (e.target.dataset?.obKind != null) { const it = ob().items[+e.target.dataset.obKind]; it.kind = e.target.value; it.err = null; obOpen(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'ob-say') ob().say = e.target.value;
  if (e.target.dataset?.obText != null) ob().items[+e.target.dataset.obText].text = e.target.value;
});
document.addEventListener('dragover', e => { const z = e.target.closest?.('#ob-drop'); if (z) { e.preventDefault(); z.classList.add('hot'); } });
document.addEventListener('dragleave', e => e.target.closest?.('#ob-drop')?.classList.remove('hot'));
document.addEventListener('drop', e => { if (!e.target.closest?.('#ob-drop')) return; e.preventDefault(); obAdd([...e.dataTransfer.files]); });
document.addEventListener('paste', e => { if (!$('#ob-drop')) return; const F = [...(e.clipboardData?.files || [])]; if (F.length) { e.preventDefault(); obAdd(F); } });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'ob-open') return obOpen();
  if (a === 'ob-edit') { const it = ob().items[+b.dataset.v]; it.open = !it.open; return obOpen(); }
  if (a === 'ob-del') { ob().items.splice(+b.dataset.v, 1); return obOpen(); }
  if (a === 'ob-apply') return busy(obApply);
});

// ===== v0.85 계속 쓰게 만드는 기능: 펑크 대타 · 오늘 예측 · 시재 감시 · 노무 위험 · 급여일 · 포스터 =====
// 1) 펑크 1분 대타: 시작 15분 지나도 출근 기록이 없으면 홈 맨 위에 → 누르면 긴급 공고가 채워진 채로 열림
function noShowCard() {
  if (!isOwner() && S.myRole !== 'manager') return '';
  const k = bizDay(), [y, m, d] = k.split('-').map(Number), nowMs = Date.now();
  const L = S.members.filter(p => p.role !== 'owner').map(p => ({ p, t: E.shiftOn(p.id, y, m, d, S.tpl, S.ov) })).filter(x => x.t).map(x => { let a = +new Date(`${k}T${t5(x.t.s)}:00+09:00`); if (E.toMin(t5(x.t.s)) < (CFG().cut ?? 6) * 60) a += 864e5; return { ...x, a }; }) // 새벽 시작은 다음 날
    .filter(x => x.a + 15 * 6e4 < nowMs && nowMs - x.a < 3 * 36e5 && !(S.attStore || []).some(a => a.member_id === x.p.id && a.kind === 'in' && Math.abs(new Date(a.at) - x.a) < 5 * 36e5));
  if (!L.length) return '';
  return `<div class="card warnc noshow"><b>🚨 아직 출근 안 한 사람 ${L.length}명</b>${L.map(x => `<div class="li"><span>${esc(x.p.nick)} <small class="mut">${t5(x.t.s)}–${t5(x.t.e)}</small></span><button class="btn sm pri" data-act="sub-now" data-s="${t5(x.t.s)}" data-e="${t5(x.t.e)}" data-r="${esc(x.p.job_role || '딜러')}">대타 구하기</button></div>`).join('')}<small class="mut">누르면 긴급 공고가 채워져 있어요 · 올리면 대타 알림 받는 딜러에게 바로 가요</small></div>`;
}
// 3) 오늘 예측: 최근 8주 같은 요일 매출 평균 ÷ 그날들의 '1인당 매출' 중간값 → 필요한 인원
function forecastCard() {
  if (!isOwner()) return '';
  const k = bizDay(), [y, m, d] = k.split('-').map(Number), w = E.wdOf(y, m, d), staff = S.members.filter(p => p.role !== 'owner');
  const H = (S.hist || []).filter(r => r.sales > 0 && r.report_date < k && r.report_date >= addDay(k, -56) && E.wdOf(...r.report_date.split('-').map(Number)) === w);
  if (H.length < 3) return '';
  const avg = H.reduce((a, r) => a + r.sales, 0) / H.length;
  const sps = H.map(r => { const [yy, mm, dd] = r.report_date.split('-').map(Number), n = staff.filter(p => E.shiftOn(p.id, yy, mm, dd, S.tpl, S.ov)).length; return n ? r.sales / n : 0; }).filter(Boolean).sort((a, b) => a - b);
  const now = staff.filter(p => E.shiftOn(p.id, y, m, d, S.tpl, S.ov)).length, need = sps.length ? Math.max(1, Math.round(avg / sps[sps.length >> 1])) : null, gap = need ? need - now : 0;
  return `<div class="card fc"><div class="row between"><h3 style="margin:0">오늘 예상 <small>${E.WD[w]}요일 · 최근 ${H.length}주 기준</small></h3>${gap > 0 ? `<button class="btn sm pri" data-act="sub-now" data-s="${CFG().open || '19:00'}" data-e="${CFG().close || '04:00'}" data-r="딜러" data-n="${gap}">${gap}명 구하기</button>` : ''}</div>
    <div class="fc-row"><div><small>예상 매출</small><b class="num">₩${man(avg)}</b></div><div><small>근무표</small><b class="num">${now}명</b></div><div><small>필요 인원</small><b class="num ${gap > 0 ? 'down' : 'up'}">${need ?? '–'}명</b></div></div>
    <small class="mut">${gap > 0 ? `${gap}명 부족해 보여요` : gap < 0 ? `${-gap}명 여유 · 인건비를 줄일 수 있어요` : '딱 맞아요'} · 예측이라 실제와 다를 수 있어요</small></div>`;
}
// 5) 시재 구멍 감시: 최근 30일 금고 차액을 마감한 사람·요일별로
function cashWatchCard() {
  const R = (S.hist || []).filter(r => r.report_date >= addDay(TODAY, -30) && r.cash_diff);
  if (!R.length) return '';
  const by = {}; R.forEach(r => { const n = S.members.find(p => p.user_id === r.reported_by)?.nick || '대표'; (by[n] = by[n] || { n: 0, sum: 0, minus: 0 }); by[n].n++; by[n].sum += r.cash_diff; if (r.cash_diff < 0) by[n].minus++; });
  const tot = R.reduce((a, r) => a + r.cash_diff, 0), minus = R.filter(r => r.cash_diff < 0).length, warn = Object.entries(by).filter(([, v]) => v.minus >= 3);
  return `<div class="card ${warn.length ? 'warnc' : ''}"><h3>시재 감시 <small>최근 30일 · 금고 차액</small></h3>
    <div class="fc-row"><div><small>차액 합계</small><b class="num ${tot < 0 ? 'down' : ''}">${tot < 0 ? '−' : '+'}₩${E.won(Math.abs(tot))}</b></div><div><small>모자란 날</small><b class="num">${minus}일</b></div><div><small>차액 난 날</small><b class="num">${R.length}일</b></div></div>
    ${Object.entries(by).sort((a, b) => a[1].sum - b[1].sum).map(([n, v]) => `<div class="li"><span>${esc(n)} <small class="mut">마감 ${v.n}번 중 모자람 ${v.minus}번</small></span><span class="num ${v.sum < 0 ? 'down' : ''}">${v.sum < 0 ? '−' : '+'}₩${E.won(Math.abs(v.sum))}</span></div>`).join('')}
    ${warn.length ? `<small class="down">${warn.map(([n]) => esc(n)).join(', ')} 마감 때 3번 이상 모자랐어요 · 같이 세 보세요</small>` : '<small class="mut">반복되는 패턴은 아직 없어요</small>'}</div>`;
}
// 7) 노무 위험 한눈에: 최저임금 · 근로계약서 · 보건증 · 주 52시간
function laborCard() {
  if (!isOwner()) return '';
  const st = S.members.filter(p => p.role !== 'owner'), [y, m, d] = TODAY.split('-').map(Number), k0 = addDay(TODAY, -E.wdOf(y, m, d));
  const I = [
    ['최저임금 미만 시급', st.filter(p => p.hourly_rate && p.hourly_rate < minWage() && (p.labor_law ?? p.contract === '4대')), '과태료·체불 위험'],
    ['근로계약서 안 보냄', needContract(), '미작성 시 500만 원 이하 벌금'],
    ['보건증 만료·30일 내 만료', st.filter(p => p.health_exp && p.health_exp <= addDay(TODAY, 30)), '위생 점검 때 걸려요'],
    ['이번 주 52시간 넘음', st.filter(p => weekHours(p.id, k0) > 52), '연장근로 한도 초과']].filter(x => x[1].length);
  if (!I.length) return `<div class="card"><h3>노무 점검 <span class="pill g">이상 없음</span></h3><small class="mut">최저임금 · 근로계약서 · 보건증 · 주 52시간</small></div>`;
  return `<div class="card warnc"><h3>노무 위험 ${I.reduce((a, x) => a + x[1].length, 0)}건 <small>미리 막으세요</small></h3>${I.map(([t, L, why]) => `<div class="li"><span><b>${t}</b> <small class="mut">${why}</small><br><small>${L.slice(0, 5).map(p => esc(p.nick)).join(', ')}${L.length > 5 ? ` 외 ${L.length - 5}명` : ''}</small></span><button class="btn sm" data-tab="staff">고치기</button></div>`).join('')}</div>`;
}
// 6) 급여일 3일 전부터: 총액 + 이체 목록 복사 + 명세서 한 번에
function payDayCard() {
  if (!isOwner()) return '';
  const pd = +(S.store.contract_tpl?.payday || 10), [y, m, d] = TODAY.split('-').map(Number); let due = new Date(y, m - 1, pd); if (d > pd) due = new Date(y, m, pd);
  const left = Math.round((due - new Date(y, m - 1, d)) / 864e5); if (left > 3) return '';
  const L = S.members.filter(p => p.role !== 'owner').map(p => payOf(p).xfer || 0), tot = L.reduce((a, b) => a + b, 0); if (!tot) return '';
  return `<div class="card"><h3>💸 급여일 ${left ? `D-${left}` : '오늘'} <small>${due.getMonth() + 1}월 ${pd}일</small></h3><p class="sub" style="margin:4px 0 10px">총 이체액 <b class="num">₩${E.won(tot)}</b> · ${L.filter(Boolean).length}명</p><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm pri" data-act="pay-copy">① 이체 목록 복사</button><button class="btn sm" data-act="slip-bulk">② 명세서 한 번에 보내기</button></div><small class="mut">복사한 목록을 은행 앱 '대량이체'에 붙여넣으면 끝나요</small></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'sub-now') { const n = +(b.dataset.n || 1); S.postKind = 'urgent'; S.pre = { heads: n, title: `오늘 ${b.dataset.s}~${b.dataset.e} ${b.dataset.r} ${n > 1 ? n + '명 ' : ''}급구`, s: b.dataset.s, e: b.dataset.e }; S.tab = 'jobs'; S.sub = null; render(); scrollTo(0, 0); return toast('내용 확인하고 올리기만 누르세요'); }
});

// ===== v0.86 포스터 스튜디오 · 사진 마감 · 매장 공지(읽음) · 지난 주문 다시 · 보기 전용 링크 =====
// 포스터: 템플릿 6종 × 크기 3종, 배경 사진·어둡게, 색·글꼴·크기·정렬, 끌어서 위치, 내 템플릿 저장
const PT = {
  lux: { n: '블랙 럭셔리', bg: ['#0b0d0c', '#1c221f'], fg: '#ffffff', sub: '#b9c2bd', ac: '#d4af37', pos: 'top', al: 'left', deco: 'frame' },
  neon: { n: '네온 클럽', bg: ['#0a0620', '#24104a'], fg: '#ffffff', sub: '#c9b8ff', ac: '#39ff88', pos: 'center', al: 'center', deco: 'glow' },
  red: { n: '카지노 레드', bg: ['#2a0303', '#7a0d0d'], fg: '#fff6e5', sub: '#f3c9b8', ac: '#ffd166', pos: 'center', al: 'center', deco: 'suits' },
  mini: { n: '미니멀 화이트', bg: ['#f6f4ef', '#ece8df'], fg: '#111111', sub: '#555555', ac: '#1fa463', pos: 'top', al: 'left', deco: 'bar' },
  vip: { n: '골드 VIP', bg: ['#000000', '#141008'], fg: '#f7e7b4', sub: '#cdbb88', ac: '#e9c46a', pos: 'center', al: 'center', deco: 'double' },
  photo: { n: '사진 풀배경', bg: ['#111', '#222'], fg: '#ffffff', sub: '#e5e5e5', ac: '#3ddc84', pos: 'bottom', al: 'left', deco: 'shade' }
};
const PSIZE = { feed: [1080, 1350, '피드 4:5'], story: [1080, 1920, '스토리 9:16'], sq: [1080, 1080, '정사각형'] };
const PFONT = { 'Noto Sans KR': '기본', 'Black Han Sans': '굵은 제목', 'Do Hyeon': '도현', 'Jua': '주아', 'Gowun Dodum': '부드럽게' };
function pFontLoad() { if (S.pfLoaded) return; S.pfLoaded = 1; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Do+Hyeon&family=Jua&family=Gowun+Dodum&display=swap'; document.head.appendChild(l); }
function pState() { return S.pst = S.pst || { tpl: 'lux', size: 'feed', font: 'Black Han Sans', scale: 1, dx: 0, dy: 0, dim: 45, t: '', d: TODAY, s: CFG().open || '20:00', fee: '', sub: '', ...(CFG().poster || (() => { try { return JSON.parse(localStorage.getItem('ev-poster') || 'null'); } catch { return null; } })() || {}) }; }
function posterOpen() {
  pFontLoad(); const P = pState(), T = PT[P.tpl];
  openSheet(`<h2>🎨 포스터 스튜디오</h2><p class="sub">템플릿을 고르고 글자를 적으면 바로 보여요. 미리보기의 글자는 끌어서 옮길 수 있어요.</p>
  <div class="pt-row">${Object.entries(PT).map(([k, t]) => `<button type="button" class="pt ${P.tpl === k ? 'on' : ''}" data-act="pt" data-v="${k}" style="--a:${t.bg[0]};--b:${t.bg[1]};--c:${t.ac}"><i></i><small>${t.n}</small></button>`).join('')}</div>
  <canvas id="poster-cv" style="width:100%;max-width:420px;display:block;margin:10px auto;border-radius:12px;touch-action:none;cursor:grab"></canvas>
  <form class="f" id="poster-form">
    <div class="seg" style="margin-bottom:8px">${Object.entries(PSIZE).map(([k, v]) => `<button type="button" data-act="psize" data-v="${k}" aria-pressed="${P.size === k}">${v[2]}</button>`).join('')}</div>
    <label class="fl">이벤트 이름<input name="t" value="${esc(P.t)}" placeholder="예: 토요 데일리 토너먼트" required></label>
    <div class="grid2"><label class="fl">날짜<input type="date" name="d" value="${P.d}"></label><label class="fl">시작<input type="time" name="s" value="${P.s}"></label></div>
    <label class="fl">참가비 <small class="mut">(선택)</small><input name="fee" value="${esc(P.fee)}" placeholder="예: 3만 원"></label>
    <label class="fl">한 줄 소개 <small class="mut">(선택)</small><input name="sub" maxlength="40" value="${esc(P.sub)}" placeholder="예: 초보 환영 · 룰 설명해 드려요"></label>
    <details class="more" open><summary>디자인 조절</summary>
      <div class="grid2"><label class="fl">포인트 색<input type="color" name="ac" value="${P.ac || T.ac}"></label><label class="fl">글꼴<select name="font">${Object.entries(PFONT).map(([k, l]) => `<option value="${k}" ${P.font === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <label class="fl">글자 크기 <small class="mut" id="p-sc">${Math.round(P.scale * 100)}%</small><input type="range" name="scale" min="0.7" max="1.4" step="0.05" value="${P.scale}"></label>
      <div class="row" style="gap:6px;flex-wrap:wrap"><span class="mut" style="font-size:12px">정렬</span>${[['left', '왼쪽'], ['center', '가운데']].map(([k, l]) => `<button type="button" class="btn sm ${(P.al || T.al) === k ? 'pri' : ''}" data-act="palign" data-v="${k}">${l}</button>`).join('')}<button type="button" class="btn sm" data-act="preset">위치 처음으로</button></div>
      <div class="fl" style="margin-top:8px"><span>배경 사진 <small class="mut">매장·테이블 사진을 넣으면 고급스러워져요</small></span><div class="row" style="gap:6px"><label class="btn sm" style="cursor:pointer">📷 사진 넣기<input type="file" id="p-bg" accept="image/*" hidden></label>${P.img ? '<button type="button" class="btn sm" data-act="pbg-off">사진 빼기</button>' : ''}</div></div>
      ${P.img ? `<label class="fl">사진 어둡게 <small class="mut">${P.dim}%</small><input type="range" name="dim" min="0" max="85" step="5" value="${P.dim}"></label>` : ''}
    </details>
    <p class="note">현금 상금·환전처럼 사행성으로 보일 수 있는 문구는 넣지 마세요.</p>
    <div class="row" style="gap:6px"><button type="button" class="btn" data-act="psave">내 템플릿 저장</button><button class="btn pri" style="flex:1">이미지 저장·공유</button></div></form>`);
  posterDraw(); setTimeout(posterDraw, 600); document.fonts?.ready.then(posterDraw);
}
function posterDraw() {
  const c = $('#poster-cv'); if (!c) return; const P = pState(), T = PT[P.tpl], [W, H] = PSIZE[P.size]; if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = c.getContext('2d'), ac = P.ac || T.ac, al = P.al || T.al, sc = +P.scale || 1, F = (z, w = 900) => `${w} ${Math.round(z * sc)}px "${P.font}", "Noto Sans KR", sans-serif`;
  const g = x.createLinearGradient(0, 0, W * .4, H); g.addColorStop(0, T.bg[0]); g.addColorStop(1, T.bg[1]); x.fillStyle = g; x.fillRect(0, 0, W, H);
  if (P.imgEl) { const im = P.imgEl, k = Math.max(W / im.width, H / im.height); x.drawImage(im, (W - im.width * k) / 2, (H - im.height * k) / 2, im.width * k, im.height * k); x.fillStyle = `rgba(0,0,0,${P.dim / 100})`; x.fillRect(0, 0, W, H); }
  x.save();
  if (T.deco === 'frame') { x.strokeStyle = ac; x.lineWidth = 3; x.strokeRect(54, 54, W - 108, H - 108); }
  if (T.deco === 'double') { x.strokeStyle = ac; x.lineWidth = 6; x.strokeRect(48, 48, W - 96, H - 96); x.lineWidth = 2; x.strokeRect(70, 70, W - 140, H - 140); }
  if (T.deco === 'bar') { x.fillStyle = ac; x.fillRect(0, 0, 24, H); }
  if (T.deco === 'glow') { const r = x.createRadialGradient(W * .8, H * .2, 10, W * .8, H * .2, W * .7); r.addColorStop(0, ac + '55'); r.addColorStop(1, 'transparent'); x.fillStyle = r; x.fillRect(0, 0, W, H); }
  if (T.deco === 'suits') { x.fillStyle = 'rgba(255,255,255,.06)'; x.font = '220px serif'; ['♠', '♥', '♦', '♣'].forEach((ch, i) => x.fillText(ch, (i % 2) * W * .62 + 40, i < 2 ? 260 : H - 80)); }
  if (T.deco === 'shade') { const s2 = x.createLinearGradient(0, H * .35, 0, H); s2.addColorStop(0, 'transparent'); s2.addColorStop(1, 'rgba(0,0,0,.85)'); x.fillStyle = s2; x.fillRect(0, 0, W, H); }
  x.restore();
  const pad = 120, mx = W - pad * 2, X = (al === 'center' ? W / 2 : pad) + (P.dx || 0); x.textAlign = al; x.textBaseline = 'alphabetic';
  const wrap = (t, z) => { x.font = F(z); const o = []; let l = ''; for (const w of String(t).split(' ')) { const cc = l ? l + ' ' + w : w; if (x.measureText(cc).width > mx && l) { o.push(l); l = w; } else l = cc; } if (l) o.push(l); return o.slice(0, 4); };
  const title = wrap(P.t || '이벤트 이름', 118), [, mm, dd] = (P.d || TODAY).split('-').map(Number), wd = E.WD[E.wdOf(...(P.d || TODAY).split('-').map(Number))];
  // [글꼴, 색, 글, 글자 크기, 아래 여백] — 글자 크기만큼 내려서 그려야 줄이 안 겹침
  const lines = [[F(40, 800), ac, (S.store?.name || '').toUpperCase(), 40, 34], ...title.map((l, i) => [F(118), T.fg, l, 118, i === title.length - 1 ? 46 : 14]), [F(76, 900), ac, `${mm}/${dd} (${wd})  ${P.s || ''}`, 76, 40], ...(P.fee ? [[F(52, 700), T.fg, `참가비 ${P.fee}`, 52, 24]] : []), ...(P.sub ? [[F(42, 500), T.sub, P.sub, 42, 0]] : [])];
  const h = lines.reduce((a, l) => a + (l[3] + l[4]) * sc, 0), y0 = (T.pos === 'top' ? 190 : T.pos === 'bottom' ? H - h - 190 : (H - h) / 2) + (P.dy || 0);
  let y = y0; lines.forEach(([f, col, t, z, gap], i) => { y += z * sc; x.font = f; x.fillStyle = col; if (T.deco === 'glow' && i > 0) { x.shadowColor = ac; x.shadowBlur = 24; } x.fillText(t, X, y); x.shadowBlur = 0; y += gap * sc; });
  x.textAlign = 'center'; x.font = F(34, 600); x.fillStyle = T.sub; x.fillText(`📍 ${S.store?.name || ''}${S.store?.area ? ' · ' + S.store.area : ''}`, W / 2, H - 90);
}
function pSet(k, v) { pState()[k] = v; posterDraw(); }
document.addEventListener('input', e => { const f = e.target.closest?.('#poster-form'); if (!f) return; const n = e.target.name; if (!n) return; pSet(n, ['scale', 'dim'].includes(n) ? +e.target.value : e.target.value); if (n === 'scale') { const el = $('#p-sc'); if (el) el.textContent = Math.round(e.target.value * 100) + '%'; } });
document.addEventListener('change', e => {
  if (e.target.name === 'font' && e.target.closest?.('#poster-form')) { pSet('font', e.target.value); document.fonts?.load(`40px "${e.target.value}"`).then(posterDraw); }
  if (e.target.id === 'p-bg' && e.target.files[0]) { const fl = e.target.files[0]; e.target.value = ''; const im = new Image(); im.onload = () => { const P = pState(); P.imgEl = im; P.img = 1; if (P.tpl !== 'photo' && !P.picked) P.tpl = 'photo'; posterOpen(); }; im.src = URL.createObjectURL(fl); }
});
{ let drag = null; // 미리보기에서 글자 덩어리 끌어서 옮기기
  document.addEventListener('pointerdown', e => { if (e.target.id !== 'poster-cv') return; const c = e.target, k = c.width / c.clientWidth, P = pState(); drag = { x: e.clientX, y: e.clientY, k, dx: P.dx || 0, dy: P.dy || 0 }; c.setPointerCapture(e.pointerId); });
  document.addEventListener('pointermove', e => { if (!drag || e.target.id !== 'poster-cv') return; const P = pState(); P.dx = drag.dx + (e.clientX - drag.x) * drag.k; P.dy = drag.dy + (e.clientY - drag.y) * drag.k; posterDraw(); });
  document.addEventListener('pointerup', () => { drag = null; }); }
F68['poster-form'] = async () => {
  posterDraw(); const c = $('#poster-cv'), blob = await new Promise(r => c.toBlob(r, 'image/png')), file = new File([blob], 'event-poster.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: pState().t || '이벤트 포스터' }); return; } catch { } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'event-poster.png'; a.click(); toast('이미지를 저장했어요');
};

// 사진 마감: POS 영수증·금고·장부 사진 여러 장 → AI가 마감 칸을 채움 (확인은 사장이)
async function closePhotos(files) {
  const thumbs = files.map(f => URL.createObjectURL(f));
  openSheet(`<h2>📸 사진으로 마감</h2><div class="scan-list">${thumbs.map((u, i) => `<div class="scan-it on"><div class="scan-th"><img src="${u}" alt=""><i class="scan-line"></i></div><div class="scan-tx"><b>${esc(files[i].name || '사진 ' + (i + 1))}</b><small class="scan-msg">스캔 중입니다… 조금만 기다려 주세요</small><div class="scan-bar"><i></i></div></div></div>`).join('')}</div><p class="note">POS 마감 영수증 · 금고 현금 · 장부를 같이 읽고 있어요</p>`);
  const imgs = await Promise.all(files.slice(0, 4).map(async f => { const im = await createImageBitmap(f), z = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = im.width * z; c.height = im.height * z; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .82); }));
  const { data, error } = await sb.functions.invoke('ai', { body: { store_id: S.store.id, mode: 'close', images: imgs } });
  closeSheet(); if (error || !data?.ok) return toast(data?.msg || '사진을 못 읽었어요. 숫자를 직접 넣어 주세요');
  const f = $('#report-form'); if (!f) return; const set = (n, v) => { const el = f.elements[n]; if (v != null && el && v !== '') { el.value = el.dataset.fx === 'money' ? fmtMoney(String(v)) : v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  set('sales', data.sales); set('card', data.card); set('transfer', data.transfer); set('entries', data.entries); if (data.date && data.date <= TODAY) set('date', data.date);
  let nb = 0; Object.entries(data.bills || {}).forEach(([b, n]) => { if (+n > 0) { set('b' + b, +n); nb++; } });
  const memo = [data.memo, data.expense ? `사진 속 현금 지출 ₩${E.won(data.expense)} (항목에 나눠 넣어주세요)` : ''].filter(Boolean).join(' · '); if (memo) set('memo', memo);
  if (data.card || data.transfer || nb) f.querySelector('details.more')?.setAttribute('open', ''); closeCalc();
  toast(`사진 ${files.length}장에서 읽었어요${nb ? ' · 지폐 장수도 넣었어요' : ''}. 숫자 확인하고 마감하세요`);
}
document.addEventListener('change', e => { if (e.target.id !== 'close-photos' || !e.target.files.length) return; const F = [...e.target.files].slice(0, 4); e.target.value = ''; busy(() => closePhotos(F)); });

// 매장 공지 + 읽음 확인 (직원 단톡방 대신)
async function noticesLoad(force) {
  const st = S.store?.id || S.my?.[S.mi || 0]?.store_id; if (!st || S.ntcBusy || (!force && S.ntcAt && Date.now() - S.ntcAt < 60000)) return; S.ntcBusy = 1;
  try { S.ntc = (await sb.from('staff_notices').select('*').eq('store_id', st).order('created_at', { ascending: false }).limit(10)).data || []; S.ntcAt = Date.now(); } finally { S.ntcBusy = 0; } render();
}
function noticeCard() {
  if (S.mode !== 'store' || !S.ntcAt) return '';
  const staff = S.members.filter(p => p.role !== 'owner' && p.user_id);
  return `<div class="card"><h3>📢 매장 공지 <small>직원 앱에 바로 알림 · 누가 읽었는지 보여요</small></h3><form class="f" id="ntc-form"><textarea name="body" rows="2" required maxlength="1000" placeholder="예: 이번 주 토요일 대청소 있어요. 18시까지 와주세요"></textarea><button class="btn sm pri">공지 올리기</button></form>
  ${(S.ntc || []).slice(0, 3).map(n => { const rd = staff.filter(p => n.reads?.[p.id]), un = staff.filter(p => !n.reads?.[p.id]); return `<div class="li" style="align-items:flex-start"><span style="min-width:0"><small class="mut">${fmtDT(n.created_at)}</small><br>${esc(n.body).slice(0, 80)}${un.length ? `<br><small class="down">안 읽음: ${un.slice(0, 6).map(p => esc(p.nick)).join(', ')}${un.length > 6 ? ` 외 ${un.length - 6}명` : ''}</small>` : ''}</span><b class="num ${un.length ? '' : 'up'}" style="white-space:nowrap">읽음 ${rd.length}/${staff.length}</b></div>`; }).join('')}</div>`;
}
function staffNotice() {
  if (S.mode !== 'staff') return ''; const me = S.my?.[S.mi || 0]; if (!me) return '';
  const L = (S.ntc || []).filter(n => !n.reads?.[me.id]); if (!L.length) return '';
  return L.slice(0, 2).map(n => `<div class="card warnc"><small class="mut">📢 매장 공지 · ${fmtDT(n.created_at)}</small><p style="margin:6px 0 10px;white-space:pre-wrap">${esc(n.body)}</p><button class="btn sm pri" data-act="ntc-ok" data-v="${n.id}">확인했어요</button></div>`).join('');
}
F68['ntc-form'] = async (f, v) => { await q(sb.rpc('notice_post', { p_store: S.store.id, p_body: v.body })); f.reset(); toast('공지를 올렸어요. 직원들에게 알림이 갔어요'); await noticesLoad(true); };

// 보기 전용 링크: 동업자·투자자가 로그인 없이 숫자만 봄
async function shareSheet() {
  const L = (await sb.from('store_shares').select('*').eq('store_id', S.store.id).eq('revoked', false).order('created_at', { ascending: false })).data || [];
  const url = t => `${location.origin}/?share=${t}`;
  openSheet(`<h2>👀 보기 전용 링크</h2><p class="sub">동업자·투자자에게 보내면 <b>로그인 없이 월별 매출·인건비·이익만</b> 볼 수 있어요. 직원 정보·급여 명세는 안 보여요. 언제든 끊을 수 있어요.</p>
  <form class="f" id="share-form"><div class="row" style="gap:6px"><input name="label" placeholder="누구에게? 예: 동업자 김OO" style="flex:1;min-width:0"><button class="btn pri">링크 만들기</button></div></form>
  ${L.map(x => `<div class="li"><span style="min-width:0"><b>${esc(x.label || '이름 없음')}</b><br><small class="mut" style="word-break:break-all">${url(x.token)}</small></span><span class="row" style="gap:4px"><button class="btn sm" data-act="copy" data-v="${url(x.token)}">복사</button><button class="btn sm" data-act="share-off" data-v="${x.token}">끊기</button></span></div>`).join('') || '<p class="note">아직 만든 링크가 없어요</p>'}`);
}
F68['share-form'] = async (f, v) => { const t = await q(sb.rpc('share_create', { p_store: S.store.id, p_label: v.label || '' })); const u = `${location.origin}/?share=${t}`; navigator.clipboard?.writeText(u).then(() => toast('링크를 만들고 복사했어요'), () => toast('링크를 만들었어요')); await shareSheet(); };
async function shareView(token) {
  const { data } = await sb.rpc('share_view', { p_token: token }); $('#tabs').hidden = true;
  const v = $('#view'); if (!data) { v.innerHTML = '<div class="card empty">링크가 끊겼거나 잘못된 주소예요</div>'; return; }
  const M = data.months || [], mx = Math.max(1, ...M.map(m => m.sales || 0));
  v.innerHTML = `<h1>${esc(data.store)}</h1><p class="sub">보기 전용 · ${esc(data.label || '')} · +EV에서 자동 집계</p>
  <div class="card"><h3>이번 달 지금까지</h3><div class="fc-row"><div><small>매출</small><b class="num">₩${man(data.now?.sales || 0)}</b></div><div><small>마감한 날</small><b class="num">${data.now?.days || 0}일</b></div><div><small>하루 평균</small><b class="num">₩${man(data.now?.days ? data.now.sales / data.now.days : 0)}</b></div></div></div>
  <div class="card"><h3>월별 <small>최근 ${M.length}개월</small></h3>${M.map(m => `<div class="li" style="display:block"><div class="row between"><b>${m.m}</b><span class="num">매출 ₩${man(m.sales || 0)}</span></div><div class="sh-bar"><i style="width:${Math.round((m.sales || 0) / mx * 100)}%"></i></div><small class="mut">인건비 ₩${man(m.labor || 0)} · 이익 ₩${man(m.profit || 0)} · 마감 ${m.days || 0}일</small></div>`).join('') || '<div class="empty">아직 집계된 달이 없어요</div>'}</div>
  <p class="note">이번 달 이익은 월말 예상치가 섞여 있을 수 있어요.</p>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'poster') return posterOpen();
  if (a === 'pt') { const P = pState(); P.tpl = b.dataset.v; P.ac = null; P.al = null; P.picked = 1; return posterOpen(); }
  if (a === 'psize') { pState().size = b.dataset.v; return posterOpen(); }
  if (a === 'palign') { pState().al = b.dataset.v; pState().dx = 0; return posterOpen(); }
  if (a === 'preset') { Object.assign(pState(), { dx: 0, dy: 0 }); return posterDraw(); }
  if (a === 'pbg-off') { Object.assign(pState(), { imgEl: null, img: 0 }); return posterOpen(); }
  if (a === 'psave') { const { imgEl, img, box, t, d, fee, sub, ...keep } = pState(); try { localStorage.setItem('ev-poster', JSON.stringify(keep)); } catch { } if (isOwner()) busy(() => cfgSave({ poster: keep })); return toast('내 템플릿으로 저장했어요 · 다음엔 글자만 바꾸면 돼요'); }
  if (a === 'ntc-ok') return busy(async () => { await q(sb.rpc('notice_read', { p_id: +b.dataset.v })); const n = (S.ntc || []).find(x => x.id === +b.dataset.v), me = S.my?.[S.mi || 0]; if (n && me) n.reads = { ...(n.reads || {}), [me.id]: new Date().toISOString() }; render(); toast('확인했어요'); });
  if (a === 'reorder') { const o = S.orders?.[0]; if (!o) return; S.cart = {}; o.items.forEach(i => { if (item(i.id)) S.cart[i.id] = i.q; }); render(); return toast('지난 주문을 그대로 담았어요. 수량 확인하고 주문하세요'); }
  if (a === 'share-open') return busy(shareSheet);
  if (a === 'share-off') return busy(async () => { await q(sb.rpc('share_revoke', { p_token: b.dataset.v })); toast('링크를 끊었어요'); await shareSheet(); });
});

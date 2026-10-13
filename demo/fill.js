// 데모 데이터 채우기: db-home.json 위에 6개월치 매출·비용·출퇴근·손님·노트 등을 만들어 얹음. 같은 결과가 나오게 고정 시드.
export function fill(d) {
  let sd = 7; const R = () => { sd |= 0; sd = sd + 0x6D2B79F5 | 0; let t = Math.imul(sd ^ sd >>> 15, 1 | sd); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)], uni = (a, b) => a + R() * (b - a);
  const sample = (a, n) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c.slice(0, n); };
  const db = d.db, L = new Date(Date.UTC(2026, 8, 28)), OWN = 'u7jk6mukn4', A = 'utvdgpr19h', B = 'uwajq6jnog', CO = 'ux83pgosyy';
  const day = n => new Date(+L - n * 864e5), ds = x => x.toISOString().slice(0, 10);
  const ts = (x, h = 12, m = 0) => `${ds(x)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
  const mon = x => ds(x).slice(0, 8) + '01', monBack = k => new Date(Date.UTC(L.getUTCFullYear(), L.getUTCMonth() - k, 1));
  const uid = (p, i) => `${p}${String(i).padStart(4, '0')}demo`, tel = () => `010-${ri(2000, 9899)}-${ri(1000, 9999)}`;

  for (const s of db.stores) {
    if (s.id === B) Object.assign(s, { area: '서울 마포', pyeong: 45, tables: 9, address: '서울 마포구 와우산로 21', night_start: '22:00', night_end: '06:00' });
    if (s.id === A) s.address = '서울 강남구 테헤란로 152';
  }
  const BANK = ['KB국민', '신한', '카카오뱅크', '토스뱅크', '우리', '하나', 'NH농협'];
  const NA = [['블라인드', '김민준'], ['리버', '이서준'], ['민지', '박민지'], ['에이스', '최지훈'], ['헬퍼 민수', '정민수'], ['스트릿', '한도윤'], ['플랍', '윤서연'], ['턴', '강예린'], ['올인', '조하준'], ['칩스', '임수아'], ['콜', '오지호'], ['폴드', '신유나'], ['버튼', '장시우'], ['스플래시', '배은우'], ['넛츠', '권다은'], ['킥커', '송현우'], ['세트', '홍채원'], ['러너', '문태윤'], ['블러프', '양서아'], ['하이카드', '노건우'], ['팟', '구하린'], ['딜', '남준서']];
  const RN = Object.fromEntries(NA);
  for (const m of db.members) if (m.role === 'staff') { m.real_name = m.real_name || RN[m.nick] || null; m.phone = m.phone || tel(); m.joined_on = m.joined_on || ds(day(ri(60, 400))); }
  const ROLES = [['딜러', 13000], ['딜러', 14000], ['딜러', 12500], ['플로어', 12000], ['매니저', 16000], ['딜러', 13500], ['캐셔', 11000], ['딜러', 15000]];
  NA.slice(5).forEach(([nick, rn], i) => { const [jr, rate] = ROLES[i % ROLES.length]; db.members.push({ id: uid('m', i), company_id: CO, store_id: i < 9 ? A : B, user_id: null, role: 'staff', nick, real_name: rn, job_role: jr, contract: pick(['3.3', '3.3', '4대']), hourly_rate: rate, joined_on: ds(day(ri(20, 520))), night_pay: true, labor_law: false, bank_name: pick(BANK), bank_acct: `${ri(100, 999)}-${ri(10, 99)}-${ri(100000, 999999)}`, bank_holder: rn, emp_type: pick(['파트타임', '파트타임', '정규', '대타']), phone: tel(), active: true, created_at: ts(day(30)) }); });
  const staff = db.members.filter(m => m.role === 'staff');

  // 주간 고정 근무 (주 3~5일)
  db.shift_templates = []; const tpl = {};
  const END = { '18:00': '02:00', '19:00': '03:00', '20:00': '04:00', '22:00': '06:00' };
  for (const m of staff) { const s0 = pick(Object.keys(END)); for (const w of sample([0, 1, 2, 3, 4, 5, 6], pick([4, 4, 5, 5, 3])).sort()) { const t = { member_id: m.id, weekday: w, start_t: s0, end_t: END[s0], break_min: 30 }; db.shift_templates.push(t); (tpl[m.id] = tpl[m.id] || {})[w] = t; } }
  db.shift_overrides = sample(staff, 6).map(m => ({ member_id: m.id, work_date: ds(day(-ri(1, 10))), off: true, start_t: null, end_t: null, break_min: null }));

  // 6개월 매출 (요일 패턴 + 성장)
  const WD = [1.3, 0.78, 0.72, 0.8, 0.95, 1.25, 1.55]; // 일~토 (JS getUTCDay)
  db.daily_reports = [];
  for (const [st, base] of [[A, 2900000], [B, 2300000]]) for (let n = 0; n <= 180; n++) {
    const x = day(n); if (n && R() < 0.03) continue;
    const sales = Math.floor(base * WD[x.getUTCDay()] * (1 + (180 - n) / 180 * 0.22) * uni(0.82, 1.18) / 1000) * 1000, card = Math.floor(sales * uni(0.62, 0.74) / 1000) * 1000, tr = Math.floor(sales * uni(0.04, 0.1) / 1000) * 1000;
    db.daily_reports.push({ store_id: st, report_date: ds(x), sales, entries: Math.floor(sales / uni(42000, 52000)), card, cash: sales - card - tr, transfer: tr, expense: pick([0, 0, 15000, 32000, 48000, 12000]), cash_diff: pick([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -10000, 5000, -3000]), memo: pick([null, null, null, null, null, null, null, null, '토너먼트 진행', '단체 손님 3팀', '비 와서 한산', '신규 손님 많음', '이벤트 데이']), reported_by: OWN, created_at: ts(day(n - 1), 21, 10) });
  }

  // 비용: 월 고정 + 소모품
  db.expenses = []; let eid = 0;
  const ex = (st, x, category, amount, source = 'bill', memo = null) => db.expenses.push({ id: uid('e', ++eid), store_id: st, spent_on: ds(x), category, amount, source, memo, active: true, created_at: ts(x) });
  const dOf = (m0, dd) => new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth(), dd));
  for (const [st, rent] of [[A, 4800000], [B, 3900000]]) {
    for (let k = 0; k < 6; k++) { const m0 = monBack(k); ex(st, dOf(m0, 5), 'rent', rent, 'bill', '월세'); ex(st, dOf(m0, 10), 'mgmt', ri(38, 52) * 1e4); ex(st, dOf(m0, 18), 'elec', ri(42, 78) * 1e4); ex(st, dOf(m0, 18), 'water', ri(4, 9) * 1e4); ex(st, dOf(m0, 25), 'net', 89000, 'bill', '인터넷·CCTV'); ex(st, dOf(m0, 27), 'card', ri(55, 80) * 1e4, 'bill', '카드 수수료'); }
    for (let n = 0; n < 180; n += 4) ex(st, day(n), 'goods', ri(8, 30) * 1e4, 'receipt', pick(['음료 박스', '과자·안주', '칩 세척제', '카드 덱', '물·얼음', '휴지·소모품']));
    for (let n = 3; n < 180; n += 23) ex(st, day(n), 'etc', ri(3, 25) * 1e4, 'receipt', pick(['테이블 펠트 교체', '조명 수리', '청소 업체', '전단 인쇄']));
  }

  // 최근 45일 출퇴근
  db.attendance = []; let aid = 0;
  for (const m of staff) for (let n = 0; n <= 45; n++) {
    const x = day(n), t = tpl[m.id]?.[x.getUTCDay()]; if (!t || R() < 0.06) continue;
    const inn = new Date(+x + ((+t.start_t.slice(0, 2) - 9 + 24) % 24) * 36e5 + pick([-6, -3, 0, 0, 2, 5, 12]) * 6e4 + (+t.start_t.slice(0, 2) < 9 ? 864e5 : 0)), out = new Date(+inn + 8 * 36e5 + ri(-10, 25) * 6e4);
    for (const [kind, at] of [['in', inn], ['out', out]]) db.attendance.push({ id: ++aid, member_id: m.id, store_id: m.store_id, kind, at: at.toISOString(), method: pick(['qr', 'qr', 'gps']) });
  }

  // 급여: 인센티브·가불·지급 표시
  db.incentives = []; db.advances = []; db.pay_marks = [];
  for (let k = 0; k < 4; k++) {
    const mm = ds(monBack(k));
    for (const m of sample(staff, 7)) db.incentives.push({ id: uid('i', db.incentives.length), member_id: m.id, month: mm, amount: pick([20000, 30000, 50000, 100000]), reason: pick(['토너먼트 진행', '마감 정리 우수', '손님 칭찬', '대타 출근', '개근']), active: true, created_at: ts(L) });
    for (const m of sample(staff, 3)) db.advances.push({ id: db.advances.length + 1, member_id: m.id, month: mm, amount: pick([100000, 200000, 300000]), memo: '가불', given_on: mm.slice(0, 8) + '12', created_at: ts(L) });
    if (k) for (const m of staff) db.pay_marks.push({ member_id: m.id, month: mm, paid_at: ts(new Date(+new Date(mm) + 40 * 864e5)), seen_at: null });
  }
  db.store_goals = []; db.store_fixed = [];
  for (let k = 0; k < 6; k++) { const mm = ds(monBack(k)); db.store_goals.push({ store_id: A, month: mm, goal: 90000000 }, { store_id: B, month: mm, goal: 70000000 }); db.store_fixed.push({ store_id: A, month: mm, fixed: { rent: 4800000, mgmt: 450000, net: 89000 } }, { store_id: B, month: mm, fixed: { rent: 3900000, mgmt: 380000, net: 89000 } }); }

  // 손님 (단골 관리)
  const FN = '김이박최정강조윤장임한오서신권황안송류홍', GN = ['민수', '지훈', '서연', '도윤', '하은', '준호', '유진', '현우', '수빈', '태민', '지민', '세훈', '예린', '성민', '다현', '건우', '나연', '동현', '소희', '재원'];
  db.store_guests = [];
  for (let k = 0; k < 80; k++) { const v = Math.min(60, Math.floor(2 * Math.pow(1 - R(), -1 / 1.3))); db.store_guests.push({ id: k + 1, store_id: k < 50 ? A : B, name: pick([...FN]) + pick(GN), phone: tel(), bday: `${String(ri(1, 12)).padStart(2, '0')}-${String(ri(1, 28)).padStart(2, '0')}`, visits: v, last_at: ds(day(ri(0, 50))), memo: pick([null, null, '토너먼트 선호', '주말 단골', '친구 소개', '음료 콜라 제로', '늦게 옴']), tag: v >= 20 ? 'VIP' : v >= 8 ? '단골' : v <= 2 ? '신규' : null, created_at: ts(day(ri(10, 170))) }); }
  db.store_guests.slice(0, 3).forEach((g, i) => { g.bday = new Date(Date.now() + 9 * 36e5 + (i * 2 + 1) * 864e5).toISOString().slice(5, 10); }); // 이번 주 생일 손님 (생일은 날짜 이동 안 함)

  // 매장 노트
  db.store_notes = [];
  const note = (store_id, kind, title, body, n, o = {}) => db.store_notes.push({ id: db.store_notes.length + 1, store_id, kind, title, body, data: null, status: null, pinned: false, target: null, created_by: OWN, created_at: ts(day(n), 14), done_at: null, ...o });
  note(A, 'notice', '이번 주 토요일 토너먼트', '토요일 20시 메인 토너먼트. 딜러 6명 필요, 19시까지 출근 부탁해요.', 1, { pinned: true });
  note(A, 'notice', '칩 정리 규칙 변경', '마감 때 칩은 색깔별 20개씩 묶어서 보관해요.', 6);
  note(A, 'praise', '리버 칭찬', '손님이 딜링 깔끔하다고 칭찬 남겼어요.', 2);
  note(A, 'vote', '회식 날짜', '다음 주 월 / 화 중 골라 주세요.', 3, { data: { opts: ['월요일', '화요일'] } });
  note(A, 'vendor', '음료 업체 연락처', '생수 대리점 010-2234-5566 (매주 화요일 배송)', 20);
  note(A, 'expiry', '소방 점검', '소방 안전 점검 만료 10월 말', 9);
  note(A, 'broken', '7번 테이블 펠트 찢어짐', '모서리 5cm. 교체 주문 필요', 1);
  note(A, 'lost', '검은 지갑 습득', '3번 테이블 아래. 카운터 금고 보관 중', 2);
  note(A, 'incident', '손님 언쟁', '23시경 팟 계산 문제로 언쟁, 매니저가 정리함', 4, { status: 'done' });
  note(A, 'key', '열쇠 인계', '마감 키 → 블라인드가 보관', 0);
  [['블라인드', '금고 시재 30만 원 맞음. 7번 테이블 펠트 확인 필요'], ['리버', '콜라 2박스 남음. 내일 발주 부탁'], ['플랍', '토너먼트 칩 세트 정리 완료'], ['에이스', '단골 김민수님 생일 다음 주']].forEach(([by, body], n) => note(A, 'handover', null, body, n, { data: { by } }));
  note(B, 'notice', '홍대점 오픈 시간 변경', '평일 18시 → 17시 오픈', 5, { pinned: true });
  note(B, 'handover', null, '마감 정산 완료. 현금 차이 없음', 0, { data: { by: '버튼' } });
  note(B, 'broken', '에어컨 소음', '2번 실외기 소리 큼. 기사 예약', 3);
  db.staff_notices = [{ id: 1, store_id: A, body: '이번 달 급여는 10일에 들어가요.', created_by: OWN, created_at: ts(day(2)), reads: {} }, { id: 2, store_id: A, body: '토요일 토너먼트 복장: 검정 셔츠', created_by: OWN, created_at: ts(day(1)), reads: {} }];

  // 재고·발주
  db.stock = [{ store_id: A, item_id: 1, qty: 3, min: 4, use_per_day: 0.6 }, { store_id: A, item_id: 2, qty: 6, min: 3, use_per_day: 0.4 }, { store_id: A, item_id: 8, qty: 2, min: 3, use_per_day: 0.3 }, { store_id: A, item_id: 11, qty: 5, min: 2, use_per_day: 0.05 }];
  db.orders = [['done', 40], ['done', 26], ['done', 12], ['shipped', 2], ['paid', 0]].map(([status, n], k) => {
    const items = [{ id: 1, name: '캔 콜라 245ml', qty: ri(2, 5), price: 18900 }, { id: 8, name: '감자칩 대용량', qty: ri(1, 3), price: 24500 }];
    const o = { id: `o${k}demo-0000-0000-0000-000000000000`, store_id: A, items, total: items.reduce((a, i) => a + i.qty * i.price, 0), tax_invoice: true, status, created_by: OWN, created_at: ts(day(n)), eta: ds(day(n - 2)) };
    if (status !== 'paid') Object.assign(o, { courier: 'CJ대한통운', tracking: '6' + ri(1e9, 9e9) + ri(0, 9), shipped_at: ts(day(n - 1)) });
    if (status === 'done') o.done_at = ts(day(n - 2));
    return o;
  });

  // 구인 공고
  [['주말 토너먼트 딜러 3명', 'normal', 3], ['평일 야간 고정 딜러', 'normal', 1], ['오늘 밤 플로어 급구', 'urgent', 1]].forEach(([title, kind, heads], k) => db.job_posts.push({ id: uid('p', k), store_id: k === 1 ? B : A, kind, job_role: k < 2 ? '딜러' : '플로어', title, body: '경력 우대. 교육 가능', pay_text: '시급 15,000원', work_time: '20:00~04:00', heads, taxi_amt: 10000, flash: kind === 'urgent', top: k === 0, ad_days: 7, jump_per_day: 0, incentive: '토너먼트 1회당 1만 원', prefer: '경력 6개월 이상', status: 'open', expires_at: ts(day(-5)), created_at: ts(day(k + 1)) }));

  // 알림
  db.notifications = ['어제 마감이 입력됐어요 · 매출 4,120,000원', '새 지원자가 있어요 · 주말 토너먼트 딜러', '리버님이 출근했어요', '7번 테이블 고장 접수', '콜라 재고가 최소 수량보다 적어요', '이번 달 매출 목표 82% 달성', '플랍님 대타 요청', '계약 만료 30일 전 · 한도윤', '단골 김민수님 생일이 3일 남았어요', '발주 상품이 출발했어요 · CJ대한통운'].map((body, k) => ({ id: k + 1, user_id: OWN, body, read: k > 4, created_at: ts(day(k >> 1), 15 - k) }));

  // 대표 확인 대기 (근무 바꾸기·출퇴근 수정)
  db.shift_swaps = [{ id: 1, from_member: staff[6].id, to_member: staff[7].id, work_date: ds(day(-2)), note: '개인 일정', status: 'pending', created_at: ts(day(0)) }];
  db.att_fix = [{ id: 1, member_id: staff[2].id, kind: 'out', at: ts(day(1), 19, 5), note: '퇴근 찍는 걸 깜빡했어요', status: 'pending', created_at: ts(day(0)), decided_at: null }];

  // 매장 설정: 계약 만료, 교육, 딜러 레벨, 빠른 지출
  const ids = staff.filter(m => m.store_id === A).map(m => m.id), a = db.stores.find(s => s.id === A);
  a.cfg = { ...(a.cfg || {}), contracts: [{ n: '임대차 계약', end: ds(day(-75)), memo: '보증금 5천만 원' }, { n: '음료 공급 계약', end: ds(day(-20)) }, { n: 'CCTV 보안', end: ds(day(-160)) }], trainDone: Object.fromEntries(ids.map(m => [m, sample([0, 1, 2, 3, 4, 5, 6, 7], ri(3, 8))])), skill: Object.fromEntries(ids.slice(0, -2).map(m => [m, { s: ri(2, 5), a: ri(2, 5), c: ri(3, 5) }])), qexp: [['얼음', 'goods', 15000], ['음료 박스', 'goods', 56000], ['택시비', 'etc', 20000]] };
  return d;
}

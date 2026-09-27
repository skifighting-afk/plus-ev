// +EV 계산 엔진 — 급여·스케줄·요금. 화면과 분리해 테스트 가능하게 둠.
export const won = n => Math.round(n || 0).toLocaleString('ko-KR');
export const toMin = t => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const floor10 = n => Math.floor(n / 10) * 10;

// 근무 시간을 낮/밤(분)으로 나눔. 밤 = 야간 시간대(기본 22~06)
export function splitMinutes(s, e, night = ['22:00', '06:00']) {
  const a = toMin(s); let b = toMin(e); if (b <= a) b += 1440;
  const ns = toMin(night[0]), ne = toMin(night[1]); let day = 0, nt = 0;
  for (let t = a; t < b; t++) { const m = t % 1440, inN = ns > ne ? (m >= ns || m < ne) : (m >= ns && m < ne); inN ? nt++ : day++; }
  return { day, night: nt };
}
// 근로기준법 54조: 4시간 이상 30분, 8시간 이상 1시간
export const brkDefault = min => (min >= 480 ? 60 : min >= 240 ? 30 : 0);

// 날짜 도우미 (문자열 'YYYY-MM-DD', 월=0)
export const pad = n => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const daysIn = (y, m) => new Date(y, m, 0).getDate();
export const wdOf = (y, m, d) => (new Date(y, m - 1, d).getDay() + 6) % 7;
export const WD = ['월', '화', '수', '목', '금', '토', '일'];

// 그날 근무: 날짜 예외(ov) > 요일 기본(tpl). off=true면 휴무
export function shiftOn(memberId, y, m, d, tpl, ov) {
  const k = ymd(y, m, d), o = ov.find(x => x.member_id === memberId && x.work_date === k);
  if (o) return o.off ? null : { s: o.start_t, e: o.end_t, brk: o.break_min, ov: true };
  const t = tpl.find(x => x.member_id === memberId && x.weekday === wdOf(y, m, d));
  return t ? { s: t.start_t, e: t.end_t, brk: t.break_min, ov: false } : null;
}

const lawOn = p => p.labor_law ?? p.contract === '4대';

// 한 달 근무 목록 + 일급
export function shiftsOf(p, y, m, tpl, ov, today, night) {
  const out = [], law = lawOn(p);
  for (let d = 1; d <= daysIn(y, m); d++) {
    const t = shiftOn(p.id, y, m, d, tpl, ov); if (!t) continue;
    const sm = splitMinutes(t.s, t.e, night), tot = sm.day + sm.night, brk = Math.min(t.brk ?? brkDefault(tot), tot), k = tot ? (tot - brk) / tot : 0;
    // 휴게를 낮·밤에 비율로 나눠 뺌 (휴게 시작 시각 기록은 다음 단계)
    const hours = (tot - brk) / 60, nightH = sm.night * k / 60, ot = law ? Math.max(0, hours - 8) : 0;
    const base = hours * p.hourly_rate, nightPay = p.night_pay ? nightH * p.hourly_rate * 0.5 : 0, otPay = ot * p.hourly_rate * 0.5;
    out.push({ d, date: ymd(y, m, d), s: t.s, e: t.e, brk, hours, nightH, ot, base, nightPay, otPay, gross: Math.round(base + nightPay + otPay), done: ymd(y, m, d) < today, ov: t.ov });
  }
  return out;
}
// 주휴수당: 월~일 한 주 15시간 이상이면 (주 시간/40 × 8 × 시급), 40시간 상한. 달 경계 주는 그 달 날짜만 셈
export function juhuOf(p, y, m, sh, today) {
  if (!lawOn(p)) return { done: 0, full: 0 };
  const wk = {};
  sh.forEach(x => { const k = x.d - wdOf(y, m, x.d); (wk[k] = wk[k] || { h: 0, end: k + 6 }).h += x.hours; });
  let done = 0, full = 0;
  Object.values(wk).forEach(w => { if (w.h < 15) return; const v = Math.round(Math.min(w.h, 40) / 40 * 8 * p.hourly_rate); full += v; if (ymd(y, m, Math.min(w.end, daysIn(y, m))) < today) done += v; });
  return { done, full };
}
export function tax33(g) { const it = floor10(g * 0.03), lt = floor10(it * 0.1); return it + lt; }
export function ins4(g) { const hp = floor10(g * 0.03595); return floor10(g * 0.0475) + hp + floor10(hp * 0.1314) + floor10(g * 0.009); }
export const dedOf = (g, c) => (c === '4대' ? ins4(g) : tax33(g));

export function payroll(p, y, m, tpl, ov, inc, today, night) {
  const sh = shiftsOf(p, y, m, tpl, ov, today, night), d = sh.filter(x => x.done), r = k => Math.round(d.reduce((a, x) => a + x[k], 0));
  const jh = juhuOf(p, y, m, sh, today), base = r('base'), np = r('nightPay'), otp = r('otPay'), gross = base + np + otp + jh.done + inc, ded = dedOf(gross, p.contract);
  const full = Math.round(sh.reduce((a, x) => a + x.gross, 0)) + jh.full + inc;
  return { days: d.length, hours: d.reduce((a, x) => a + x.hours, 0), brk: d.reduce((a, x) => a + x.brk, 0), base, np, otp, juhu: jh.done, inc, gross, ded, net: gross - ded, fullGross: full, fullNet: full - dedOf(full, p.contract), shifts: sh };
}

// 공고 요금 (알바몬 가격 수준, 부가세 포함)
export const FEES = { FLASH_DAY: 3300, TOP_DAY: 12000, URGENT_POST: 10000, MATCH: 0.05, JUMP: { 0: 0, 2: 3000, 5: 5000, 8: 7000 }, DISC: { 3: 0, 5: 0, 7: 0.1, 15: 0.15, 30: 0.2 } };
// 결제 계산서 한 줄씩 [항목, 금액]. 서버 post_fee와 같은 식이어야 함
export function feeLines(kind, { pay = 0, heads = 1, flash, top, jump = 0, days = 7 }) {
  heads = Math.max(1, heads);
  if (kind === 'urgent') return [[`일당 ${won(pay)}원 × ${heads}명 (딜러에게 지급)`, pay * heads], ['긴급 공고비', FEES.URGENT_POST], [`매칭 수수료 5% × ${heads}명 (구했을 때만)`, heads * floor10(pay * FEES.MATCH)], ...(flash ? [['✨ 반짝 강조', FEES.FLASH_DAY]] : [])];
  const daily = top ? FEES.TOP_DAY : FEES.JUMP[jump] || 0, ad = (daily + (flash ? FEES.FLASH_DAY : 0)) * days, disc = Math.round(ad * (1 - (FEES.DISC[days] || 0)) / 100) * 100 - ad;
  return [[`공고 게시 ${days}일`, 0], ...(top ? [[`📌 상단 고정 ${won(FEES.TOP_DAY)}원 × ${days}일 (끌올 포함)`, FEES.TOP_DAY * days]] : daily ? [[`⬆ 자동 끌올 하루 ${jump}회 ${won(daily)}원 × ${days}일`, daily * days]] : []),
    ...(flash ? [[`✨ 반짝 ${won(FEES.FLASH_DAY)}원 × ${days}일`, FEES.FLASH_DAY * days]] : []), ...(disc ? [[`${days}일 묶음 할인 ${FEES.DISC[days] * 100}%`, disc]] : [])];
}
const sumL = L => L.reduce((a, x) => a + x[1], 0);
export const urgentFee = o => sumL(feeLines('urgent', o));
export const hireFee = o => sumL(feeLines('hire', o));

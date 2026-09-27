// 가격은 여기 한 곳. 서버(public.pricing 테이블)와 같은 키를 쓰고, 부팅 때 서버 값으로 덮어쓴다.
// 운영자가 나중에 HQ 화면에서 pricing 테이블만 고치면 앱·서버 요금이 같이 바뀐다.
export const PRICING = {
  proMonthly: 35000, storeAdd: 35000, trialDays: 14,
  jobs: { base: { 14: 8800, 30: 16500 }, jump: { 0: 0, 2: 3000, 5: 5000, 8: 7000 }, topDay: 12000, flashDay: 3300, urgent: 10000, matchPct: 5, disc: { 14: 0.1, 30: 0.2 } },
  used: { top: 4900, urgent: 9900 },
  franchise: { postingMonthly: 300000, qualifiedLead: 50000 },
  academy: 159000,
  dealer: { tickets: { 1: 5500, 5: 24900, 10: 44000 }, pro: 9900, instantFee: 1500 },
  transfer: { basic: 1500000, fast: 3000000, successPct: 10 }
};
// 서버 키 → PRICING 위치
const MAP = {
  pro_monthly: ['proMonthly'], store_add: ['storeAdd'], trial_days: ['trialDays'], academy: ['academy'],
  dealer_pro: ['dealer', 'pro'], instant_fee: ['dealer', 'instantFee'], ticket_1: ['dealer', 'tickets', 1], ticket_5: ['dealer', 'tickets', 5], ticket_10: ['dealer', 'tickets', 10],
  post_base_14: ['jobs', 'base', 14], post_base_30: ['jobs', 'base', 30], jump_2: ['jobs', 'jump', 2], jump_5: ['jobs', 'jump', 5], jump_8: ['jobs', 'jump', 8],
  top_day: ['jobs', 'topDay'], flash_day: ['jobs', 'flashDay'], urgent_post: ['jobs', 'urgent'], match_pct: ['jobs', 'matchPct'],
  used_top: ['used', 'top'], used_urgent: ['used', 'urgent'], franchise_posting: ['franchise', 'postingMonthly'], franchise_lead: ['franchise', 'qualifiedLead']
};
export function applyPricing(rows) {
  for (const { key, amount } of rows || []) { const p = MAP[key]; if (!p) continue; let o = PRICING; for (const k of p.slice(0, -1)) o = o[k]; o[p.at(-1)] = amount; }
}

import { PRICING } from './pricing.js';

// 회사 생성일의 한국 날짜부터 6개월. 만료일 당일부터 정상 요금이며 월말은 마지막 날로 맞춘다.
// 결제/권한 서버에도 동일 정책을 적용한 후 화면에 연결해야 한다.
export function companyOffer(company, today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)) {
  const standard = { active: false, endsOn: null, basic: PRICING.basicMonthly, pro: PRICING.proMonthly };
  const created = company?.created_at;
  if (typeof created !== 'string') return standard;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(created);
  const stamp = new Date(created);
  if (!Number.isFinite(+stamp)) return standard;
  const start = dateOnly ? created : new Date(+stamp + 9 * 3600e3).toISOString().slice(0, 10);
  if (dateOnly && stamp.toISOString().slice(0, 10) !== created) return standard;
  const [y, m, d] = start.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + 6, 1));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(d, lastDay));
  const endsOn = end.toISOString().slice(0, 10), active = today >= start && today < endsOn;
  return { active, endsOn, basic: active ? 0 : standard.basic, pro: active ? 9900 : standard.pro };
}

export const initialHomeView = saved => saved === 'detail' ? 'detail' : 'simple';
export const ownerNavigation = () => [
  {key:'home',label:'홈'}, {key:'sales',label:'매출'}, {key:'sched',label:'근무'},
  {key:'staff',label:'직원'}, {key:'more',label:'더보기'}
];
export function cashSales({sales=0,card=0,transfer=0}) {
  for (const v of [sales,card,transfer]) if (!Number.isSafeInteger(v) || v<0) throw new Error('매출은 0 이상의 정수 금액으로 입력해 주세요');
  const cash=sales-card-transfer;
  if (cash<0) throw new Error('카드·이체 합계가 총매출보다 커요');
  return cash;
}
export const reportPatch = (input,previous={}) => ({...input, entries:previous?.entries ?? null});

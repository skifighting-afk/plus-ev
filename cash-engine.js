export function expectedCash({opening=0,cashSales=0,cashExpenses=0,movements=[]}) {
  for(const n of [opening,cashSales,cashExpenses]) if(!Number.isSafeInteger(n)||n<0)throw Error('금고 금액을 확인해 주세요');
  let total=opening+cashSales-cashExpenses;const seen=new Set();
  for(const m of movements) {
    if(m.method==='transfer'||m.already_in_expenses)continue;
    if(m.id!=null&&seen.has(m.id))continue;if(m.id!=null)seen.add(m.id);
    if(!Number.isSafeInteger(m.amount)||m.amount<=0||!['in','out'].includes(m.direction))throw Error('입출금 금액을 확인해 주세요');
    total+=(m.direction==='in'?1:-1)*m.amount;
  }
  return total;
}
export function withdrawalDelta(previous=0,next=0) {
  for(const amount of [previous,next])if(!Number.isSafeInteger(amount)||amount<0||amount>2147483647)throw Error('대표 인출은 0 이상의 정수 금액으로 입력해 주세요');
  return next-previous;
}
export function closingCash({date,ownerWithdrawal=0,movements=[],...cash}) {
  withdrawalDelta(0,ownerWithdrawal);
  return expectedCash({...cash,movements:movements.filter(m=>m.business_date===date&&m.closing_report_date!==date)})-ownerWithdrawal;
}

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

import * as E from './engine.js';
const kst = at => new Date(Date.parse(at)+9*3600e3).toISOString();
export const workDay = at => new Date(Date.parse(at)+(9-8)*3600e3).toISOString().slice(0,10);
export function reconcileWork({memberId,storeId,attendance=[],manualRecords=[]}) {
  const confirmed=[],open=[],conflicts=[], seen=new Set(); let pending;
  for(const a of attendance.filter(a=>a.member_id===memberId&&a.store_id===storeId).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}))) {
    if(seen.has(a.id)) continue;seen.add(a.id);
    if(a.kind==='in') { if(pending) open.push({...pending,status:'conflict'});pending={id:'qr:'+a.id,member_id:memberId,store_id:storeId,work_date:workDay(a.at),start_at:a.at,end_at:null,attendance_in_id:a.id,source:'qr',status:'open'}; }
    else if(pending) {const end=Date.parse(a.at);if(end<=Date.parse(pending.start_at)||end-Date.parse(pending.start_at)>24*3600e3){conflicts.push(pending);pending=null;continue;} confirmed.push({...pending,end_at:a.at,attendance_out_id:a.id,status:'confirmed',break_min:null});pending=null;}
    else conflicts.push({id:'orphan:'+a.id,member_id:memberId,store_id:storeId,work_date:workDay(a.at),end_at:a.at,status:'conflict',source:'qr'});
  }
  if(pending)open.push(pending);
  for(const r of manualRecords.filter(r=>r.member_id===memberId&&r.store_id===storeId&&r.status!=='void')) {
    if(r.source==='qr'&&confirmed.some(x=>String(x.attendance_in_id)===String(r.attendance_in_id))) continue;
    if(!r.end_at||r.status==='open')open.push(r);else if(r.status==='conflict')conflicts.push(r);else confirmed.push(r);
  }
  const bad=new Set();
  for(let i=0;i<confirmed.length;i++) for(let j=i+1;j<confirmed.length;j++) {
    const a=confirmed[i],b=confirmed[j];
    if(Date.parse(a.start_at)<Date.parse(b.end_at)&&Date.parse(b.start_at)<Date.parse(a.end_at)){bad.add(i);bad.add(j);}
  }
  confirmed.forEach((r,i)=>{if(bad.has(i))conflicts.push({...r,status:'conflict'});});
  return {confirmed:confirmed.filter((_,i)=>!bad.has(i)),open,conflicts};
}
export function calculateActualPayroll({member,records=[],previousWeekRecords=[],period,nightWindow=['22:00','06:00']}) {
  const shifts=[], weeks=new Map();let incomplete=0;
  for(const r of [...previousWeekRecords,...records]) {
    if(r.member_id!==member.id||r.status==='void')continue;
    if(r.status!=='confirmed'||!r.end_at){if(r.work_date?.startsWith(period))incomplete++;continue;}
    const elapsed=(Date.parse(r.end_at)-Date.parse(r.start_at))/60000;
    if(!(elapsed>0&&elapsed<=1440))throw Error('근무 시작·종료 시간을 확인해 주세요');
    const brk=r.break_min??E.brkDefault(elapsed);
    if(!Number.isInteger(brk)||brk<0||brk>=elapsed)throw Error('휴게시간은 근무시간보다 짧아야 해요');
    const p={...member,...r.pay_snapshot},rate=+(r.base_rate??p.hourly_rate),hours=(elapsed-brk)/60;
    if(!Number.isSafeInteger(rate)||rate<0)throw Error('급여 금액을 확인해 주세요');
    const start=kst(r.start_at).slice(11,16),end=kst(r.end_at).slice(11,16),sm=E.splitMinutes(start,end,[p.night_start||nightWindow[0],p.night_end||nightWindow[1]]),nightH=sm.night*(elapsed-brk)/elapsed/60,law=p.labor_law??p.contract==='4대';
    const base=r.pay_basis==='daily'?rate:rate*hours, hourly=r.pay_basis==='daily'?base/hours:rate;
    const nightPay=p.night_pay?nightH*hourly*.5:0,ot=law?Math.max(0,hours-8):0,otPay=ot*hourly*.5;
    const hol=law&&p.five&&p.is_holiday?Math.min(8,hours)*hourly*.5+Math.max(0,hours-8)*hourly:0;
    const sh={...r,hours,brk,nightH,ot,base,nightPay,otPay,hol,gross:Math.round(base+nightPay+otPay+hol),date:r.work_date,d:+r.work_date.slice(8),s:start,e:end,done:true,ov:true};
    if(r.work_date.startsWith(period))shifts.push(sh);
    if(law){const date=new Date(r.work_date+'T00:00:00Z'),day=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()+6-day);const key=date.toISOString().slice(0,10);const w=weeks.get(key)||{hours:0,base:0};w.hours+=hours;w.base+=base;weeks.set(key,w);}
  }
  const sum=k=>Math.round(shifts.reduce((n,s)=>n+s[k],0));
  const juhu=Math.round([...weeks].filter(([d])=>d.startsWith(period)).reduce((n,[,w])=>n+(w.hours>=15?Math.min(w.hours,40)/40*8*w.base/w.hours:0),0));
  const contract=[...shifts].sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at))[0]?.pay_snapshot?.contract||member.contract;
  if(new Set(shifts.map(r=>r.pay_snapshot?.contract||member.contract)).size>1)incomplete++;
  const base=sum('base'),np=sum('nightPay'),otp=sum('otPay'),hol=sum('hol'),gross=base+np+otp+juhu+hol,ded=E.dedOf(gross,contract);
  return {contract,days:shifts.length,hours:shifts.reduce((n,s)=>n+s.hours,0),brk:sum('brk'),base,np,otp,hol,juhu,inc:0,gross,ded,net:gross-ded,fullGross:gross,fullNet:gross-ded,shifts,incomplete,basis:'actual'};
}
export function projectLabor({actual=[],scheduled=[],actualFrom,period}) {
  const done=actual.filter(x=>x.status==='confirmed'&&x.work_date?.startsWith(period)),keys=new Set(done.map(x=>x.member_id+':'+x.work_date));
  const future=scheduled.filter(x=>x.work_date?.startsWith(period)&&!keys.has(x.member_id+':'+x.work_date));
  return {actualGross:done.reduce((n,x)=>n+(x.gross||0),0),projectedGross:[...done,...future].reduce((n,x)=>n+(x.gross||0),0),incompleteCount:actual.filter(x=>x.status!=='confirmed'&&x.status!=='void').length,actualFrom};
}

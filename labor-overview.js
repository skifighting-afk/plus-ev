export function laborTotals({members=[],payroll={members:[]},sales=0,scheduled={}}) {
 const names=new Map(members.map(m=>[m.id,m]));
 const rows=(payroll?.members||[]).map(r=>{const m=names.get(r.member_id)||{},plan=scheduled[r.member_id]||{},gross=Number(r.gross)||0,projected=Number(r.projected_gross??gross),contract=r.contract||m.contract,employer=contract==='4대'?Math.round(gross*.105):0;return {...r,id:r.member_id,name:m.nick||'퇴사 직원',active:m.active!==false,gross,cost:gross+employer,employer,hours:Number(r.hours)||0,plannedHours:Number(plan.hours)||0,plannedBreak:Number(plan.brk)||0,projectedCost:Math.round(projected*(contract==='4대'?1.105:1))};});
 const sum=k=>rows.reduce((n,r)=>n+r[k],0),cost=sum('cost');
 return {rows,gross:sum('gross'),employer:sum('employer'),cost,projected:sum('projectedCost'),hours:sum('hours'),ratio:sales>0?cost/sales*100:null,sales,incomplete:Number(payroll?.incomplete)||rows.reduce((n,r)=>n+(Number(r.incomplete)||0),0)};
}

export function scheduleTotals(shifts,records,month){
 const valid=records.filter(r=>r.status!=='void'&&r.status!=='conflict'&&r.work_date?.startsWith(month)&&r.end_at&&Date.parse(r.end_at)>Date.parse(r.start_at));
 const replaced=new Set(valid.map(r=>r.work_date));
 const template=shifts.filter(r=>!replaced.has(r.date));
 return {hours:template.reduce((n,r)=>n+r.hours,0)+valid.reduce((n,r)=>n+Math.max(0,(Date.parse(r.end_at)-Date.parse(r.start_at))/36e5-(r.break_min??30)/60),0),brk:template.reduce((n,r)=>n+r.brk,0)+valid.reduce((n,r)=>n+(r.break_min??30),0)};
}

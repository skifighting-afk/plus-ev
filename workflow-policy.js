const add=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
export function weekCopyPlan({sourceWeek,targetWeek,memberIds,existing,locked}) {
  if(locked)throw Error('급여 마감된 기간은 복사할 수 없어요');
  const rows=[],conflicts=[];
  for(const r of existing.filter(r=>memberIds.includes(r.member_id)&&r.work_date>=sourceWeek&&r.work_date<=add(sourceWeek,6)&&!r.off)) {
    const date=add(targetWeek,(Date.parse(r.work_date)-Date.parse(sourceWeek))/864e5),copy={...r,work_date:date};
    if(existing.some(x=>x.member_id===r.member_id&&x.work_date===date))conflicts.push(copy);else rows.push(copy);
  }
  return {rows,conflicts};
}
export const jobDefaults=({store,shift={}})=>({store_id:store.id,address:store.address||'',start:shift.s||'18:00',end:shift.e||'02:00',flash:false,top:false,jump:0});

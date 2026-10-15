const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const read=async p=>{const {data,error}=await p;if(error)throw error;return data||[]};
export async function loadHQStore({sb,isHQ,storeId,month}) {
 if(!isHQ)throw Error('운영사만 볼 수 있어요');
 if(!/^\d{4}-\d{2}-01$/.test(month)||+month.slice(5,7)<1||+month.slice(5,7)>12)throw Error('월을 확인해 주세요');
 const [year,m]=month.split('-').map(Number),last=`${month.slice(0,7)}-${new Date(Date.UTC(year,m,0)).getUTCDate()}`;
 const stores=await read(sb.from('stores').select('id,company_id,name,area,night_start,night_end,labor_actual_from').eq('id',storeId));
 if(!stores[0])throw Error('매장을 찾지 못했어요');
 const [members,reports,expenses,records,payroll]=await Promise.all([
  read(sb.from('members').select('id,nick,role,job_role,active').eq('store_id',storeId)),
  read(sb.from('daily_reports').select('report_date,sales,card,transfer,cash_diff,expense_cash').eq('store_id',storeId).gte('report_date',month).lte('report_date',last).order('report_date',{ascending:false})),
  read(sb.from('expenses').select('spent_on,amount').eq('store_id',storeId).gte('spent_on',month).lte('spent_on',last)),
  read(sb.from('work_records').select('member_id,work_date,start_at,end_at,break_min,status,source').eq('store_id',storeId).gte('work_date',month).lte('work_date',last)),
  read(sb.rpc('actual_payroll',{p_store:storeId,p_month:month}))]);
 const ids=members.map(x=>x.id),[templates,overrides]=ids.length?await Promise.all([
  read(sb.from('shift_templates').select('member_id,weekday,start_t,end_t,break_min').in('member_id',ids)),
  read(sb.from('shift_overrides').select('member_id,work_date,start_t,end_t,break_min,off').in('member_id',ids).gte('work_date',month).lte('work_date',last))]):[[],[]];
 return {store:stores[0],members,reports,expenses,records,payroll,templates,overrides};
}
export function hqStoreHTML(d,month,E) {
 const sum=(a,k)=>a.reduce((n,x)=>n+(+x[k]||0),0),p=d.payroll||{},names=Object.fromEntries(d.members.map(m=>[m.id,m.nick||'직원']));
 const status={confirmed:'완료',planned:'예정',open:'퇴근 확인 필요',conflict:'확인 필요'};
 const time=t=>t?new Date(t).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}):'미입력';
 let shifts=[];
 if(E){const [y,m]=month.split('-').map(Number);for(const worker of d.members.filter(x=>x.role!=='owner'))for(let day=1;day<=E.daysIn(y,m);day++){
  const date=E.ymd(y,m,day),t=E.shiftOn(worker.id,y,m,day,d.templates,d.overrides);
  if(t&&!d.records.some(r=>r.member_id===worker.id&&r.work_date===date&&r.status!=='void'))shifts.push({date,name:names[worker.id],s:String(t.s).slice(0,5),e:String(t.e).slice(0,5),label:'스케줄'});
 }}
 shifts.push(...d.records.filter(r=>r.status!=='void').map(r=>({date:r.work_date,name:names[r.member_id]||'퇴사 직원',s:time(r.start_at),e:time(r.end_at),label:status[r.status]||r.status})));
 shifts.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
 return `<h2>${esc(d.store.name)} <span class="pill y">조회 전용</span></h2><p class="sub">운영사 매장 조회 · ${esc(d.store.area||'')} · ${esc(month.slice(0,7))}</p>
 <div class="row between"><button class="btn sm" data-act="hq-view-month" data-v="-1">◀ 이전 달</button><b>${esc(month.slice(0,7))}</b><button class="btn sm" data-act="hq-view-month" data-v="1">다음 달 ▶</button></div>
 <div class="grid2" style="margin-top:14px"><div class="card"><small>입력된 매출</small><h3>₩${won(sum(d.reports,'sales'))}</h3><small>마감 ${d.reports.length}일</small></div><div class="card"><small>누적 인건비</small><h3>₩${won(p.gross)}</h3><small>예정 포함 ₩${won(p.projected_gross??sum(p.members||[],'projected_gross'))}</small></div></div>
 <p class="note">${d.store.labor_actual_from?'실제 근무 기준 · 전환일 전은 스케줄 기준':'스케줄 기준 인건비'} · 확인 필요한 근무 ${won(p.incomplete)}건 · 당일 지출 합계 ₩${won(sum(d.expenses,'amount'))}</p>
 <details class="card" open><summary>일별 매출</summary>${d.reports.map(r=>`<div class="li"><span>${esc(r.report_date)}</span><b>₩${won(r.sales)}</b></div>`).join('')||'<p class="empty">이 달 마감 기록이 없어요</p>'}</details>
 <details class="card"><summary>직원별 인건비</summary>${(p.members||[]).map(r=>`<div class="li"><div>${esc(names[r.member_id]||'퇴사 직원')}<small>예정 포함 ₩${won(r.projected_gross??r.gross)}</small></div><b>₩${won(r.gross)}</b></div>`).join('')||'<p class="empty">직원 기록이 없어요</p>'}</details>
 <details class="card"><summary>월 근무표 · ${shifts.length}건</summary>${shifts.map(r=>`<div class="li"><div>${esc(r.date)} · ${esc(r.name)}<small>${esc(r.s)}–${esc(r.e)}</small></div><span class="pill">${esc(r.label)}</span></div>`).join('')||'<p class="empty">이 달 근무 기록이 없어요</p>'}</details>
 <p class="note">조회 화면에서는 매출·근무·급여 기록을 수정할 수 없어요.</p><button class="btn full" data-act="close">닫기</button>`;
}
export function installHQStoreView({S,sb,A,openSheet,busy,E}) {
 let token=0,current=null;
 async function show(storeId,month){if(!S.prof?.is_hq)throw Error('운영사만 볼 수 있어요');const mine=++token;const d=await loadHQStore({sb,isHQ:true,storeId,month});if(mine!==token||!S.prof?.is_hq)return;current={storeId,month};openSheet(hqStoreHTML(d,month,E));}
 A['hq-store-view']=(b,d)=>busy(()=>show(d.v,`${S.y}-${String(S.m).padStart(2,'0')}-01`));
 A['hq-view-month']=(b,d)=>busy(()=>{if(!current)return;const [y,m]=current.month.split('-').map(Number),next=new Date(Date.UTC(y,m-1+Number(d.v),1));return show(current.storeId,`${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-01`)});
}

import {withdrawalDelta} from '../cash-engine.js?v=105';
import {calculateActualPayroll,workDay,reconcileWork} from '../labor-engine.js';
import * as E from '../engine.js';
export function installERP({DB,RPC,me,canManage,uid}) {
  Object.assign(DB,{work_records:DB.work_records||[],work_payments:DB.work_payments||[],cash_movements:DB.cash_movements||[]});
  const attend=RPC.attend;
  RPC.attend=a=>{const result=attend(a),event=DB.attendance.at(-1),st=DB.stores.find(s=>s.id===event.store_id);if(!st?.labor_actual_from||workDay(event.at)<st.labor_actual_from)return result;
    const m=DB.members.find(m=>m.id===event.member_id),snapshot={contract:m.contract,night_pay:m.night_pay,labor_law:m.labor_law??m.contract==='4대',meal:m.checks?.meal||0,night_start:st.night_start,night_end:st.night_end};
    if(result==='in')DB.work_records.push({id:uid(),request_id:uid(),store_id:st.id,member_id:m.id,work_date:workDay(event.at),start_at:event.at,end_at:null,source:'qr',status:'open',attendance_in_id:event.id,base_rate:m.checks?.pay_basis==='daily'?m.checks.daily_rate:m.hourly_rate,pay_basis:m.checks?.pay_basis||'hourly',pay_snapshot:snapshot,revision:1});
    else {const r=DB.work_records.findLast(r=>r.member_id===m.id&&r.status==='open'&&r.source==='qr');if(r){r.end_at=event.at;r.attendance_out_id=event.id;r.status=Date.parse(r.end_at)-Date.parse(r.start_at)>864e5?'conflict':'confirmed';r.revision++;}}
    return result;};
  const fail=message=>{throw {message};}, now=()=>new Date().toISOString();
  const access=store=>{const s=DB.stores.find(x=>x.id===store);if(!s||!canManage(store))return false;return DB.members.some(m=>m.user_id===me()&&m.company_id===s.company_id&&m.role==='owner')||!DB.members.some(m=>m.user_id===me()&&m.store_id===store&&m.perms?.pay===false);};
  const guard=(store,member,date)=>{if(!access(store))fail('급여 관리 권한이 없어요');if(!DB.members.some(m=>m.id===member&&m.store_id===store&&m.role!=='owner'))fail('이 매장의 직원을 선택해 주세요');if(DB.pay_locks?.some(x=>x.store_id===store&&x.month===date.slice(0,7)+'-01'&&x.on_))fail('급여 마감된 달이에요');};
  const baseArgs=a=>({member_id:a.p_member,store_id:a.p_store,work_date:a.p_date,start_at:a.p_start,end_at:a.p_end,break_min:a.p_break});
  RPC.record_work=a=>{
    guard(a.p_store,a.p_member,a.p_date);
    const old=DB.work_records.find(x=>x.request_id===a.p_request);
    if(old){if(Object.entries(baseArgs(a)).some(([k,v])=>old[k]!==v))fail('다른 내용으로 사용한 요청이에요');return old.id;}
    const elapsed=(Date.parse(a.p_end)-Date.parse(a.p_start))/60000;
    if(!a.p_request||!a.p_date||!Number.isInteger(a.p_break)||a.p_break<0||!(elapsed>0&&elapsed<=1440)||a.p_break>=elapsed)fail('날짜·근무시간·휴게시간을 확인해 주세요');
    if(DB.work_records.some(x=>x.member_id===a.p_member&&x.status!=='void'&&Date.parse(x.start_at)<Date.parse(a.p_end)&&(!x.end_at||Date.parse(x.end_at)>Date.parse(a.p_start)))||DB.attendance.some(x=>x.member_id===a.p_member&&Date.parse(x.at)>=Date.parse(a.p_start)&&Date.parse(x.at)<=Date.parse(a.p_end)))fail('겹치는 출퇴근·근무 기록이 있어요');
    const m=DB.members.find(x=>x.id===a.p_member),s=DB.stores.find(x=>x.id===a.p_store),r={id:uid(),request_id:a.p_request,...baseArgs(a),source:'manual',status:Date.parse(a.p_end)>Date.now()?'planned':'confirmed',pay_basis:m.checks?.pay_basis||'hourly',base_rate:m.checks?.pay_basis==='daily'?m.checks.daily_rate:m.hourly_rate,pay_snapshot:{contract:m.contract,hourly_rate:m.hourly_rate,night_pay:m.night_pay,labor_law:m.labor_law??m.contract==='4대',night_start:s.night_start||'22:00',night_end:s.night_end||'06:00',meal:m.checks?.meal||0,five:!!s.equip?.five,is_holiday:E.KR_HOL?.includes?.(a.p_date)||false},revision:1,created_by:me(),created_at:now()};
    DB.work_records.push(r);return r.id;
  };
  RPC.register_helper_work=a=>{
    if(!access(a.p_store))fail('급여 관리 권한이 없어요');const old=DB.work_records.find(x=>x.request_id===a.p_request);if(old)return old.id;
    if(!['hourly','daily'].includes(a.p_basis)||!Number.isSafeInteger(a.p_amount)||a.p_amount<=0||!a.p_nick?.trim()||a.p_nick.trim().length>20)fail('이름과 시급·일당 금액을 확인해 주세요');
    let m=DB.members.find(x=>x.id===a.p_member&&x.store_id===a.p_store&&x.emp_type==='헬퍼');let created=false;
    if(a.p_member&&!m)fail('이 매장의 헬퍼를 선택해 주세요');
    if(!m){m={id:uid(),company_id:DB.stores.find(s=>s.id===a.p_store).company_id,store_id:a.p_store,role:'staff',nick:a.p_nick.trim(),emp_type:'헬퍼',contract:'3.3',hourly_rate:a.p_basis==='hourly'?a.p_amount:0,night_pay:a.p_basis==='hourly',labor_law:false,active:true,joined_on:a.p_date,checks:{pay_basis:a.p_basis,daily_rate:a.p_basis==='daily'?a.p_amount:0}};DB.members.push(m);created=true;}
    try {const id=RPC.record_work({...a,p_member:m.id});Object.assign(DB.work_records.find(x=>x.id===id),{pay_basis:a.p_basis,base_rate:a.p_amount});return id;}
    catch(e){if(created)DB.members.splice(DB.members.indexOf(m),1);throw e;}
  };
  RPC.erp_enable_actual=a=>{if(!access(a.p_store)||!DB.members.some(m=>m.user_id===me()&&m.role==='owner'&&m.company_id===DB.stores.find(s=>s.id===a.p_store).company_id))fail('대표님만 가능해요');const s=DB.stores.find(s=>s.id===a.p_store);return s.labor_actual_from=s.labor_actual_from||new Date(Date.now()+9*3600e3).toISOString().slice(0,10);};
  RPC.actual_payroll=a=>{
    const hq=!!DB.profiles.find(p=>p.id===me())?.is_hq,managed=access(a.p_store)||hq,members=DB.members.filter(m=>m.store_id===a.p_store&&m.role!=='owner'&&(managed||m.user_id===me()));if(!members.length&&!managed)fail('급여를 볼 권한이 없어요');
    const st=DB.stores.find(x=>x.id===a.p_store),period=a.p_month.slice(0,7),[y,month]=period.split('-').map(Number),today=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
    const rows=members.map(m=>{
      const all=DB.work_records.filter(r=>r.member_id===m.id&&r.store_id===a.p_store),done=all.filter(r=>r.end_at&&Date.parse(r.end_at)<=Date.now()&&r.status==='confirmed');
      const actual=calculateActualPayroll({member:m,records:done.filter(r=>r.work_date.startsWith(period)),previousWeekRecords:done.filter(r=>r.work_date<period+'-01'),period,nightWindow:[st.night_start||'22:00',st.night_end||'06:00']});
      let legacy={base:0,np:0,otp:0,juhu:0,gross:0,hours:0};
      if(st.labor_actual_from||hq){const ov=[...DB.shift_overrides.filter(o=>o.member_id===m.id)];for(let d=1;d<=E.daysIn(y,month);d++)if(E.ymd(y,month,d)>=st.labor_actual_from||all.some(r=>r.status!=='void'&&r.work_date===E.ymd(y,month,d)))ov.push({member_id:m.id,work_date:E.ymd(y,month,d),off:true});legacy=E.payroll(m,y,month,DB.shift_templates,ov,0,today,[st.night_start||'22:00',st.night_end||'06:00']);}
      const inc=DB.incentives.filter(i=>i.member_id===m.id&&i.month===period+'-01').reduce((n,i)=>n+i.amount,0),meal=actual.contract==='4대'?Math.min(200000,done[0]?.pay_snapshot?.meal??m.checks?.meal??0):0,adv=DB.advances.filter(i=>i.member_id===m.id&&i.month===period+'-01').reduce((n,i)=>n+i.amount,0),gross=actual.gross+legacy.gross+inc+meal,ded=E.dedOf(gross-meal,actual.contract),incomplete=all.filter(r=>r.work_date.startsWith(period)&&r.status!=='void'&&(r.status==='open'||r.status==='conflict'||(r.status==='planned'&&Date.parse(r.end_at)<=Date.now())||(Date.parse(r.start_at)<=Date.now()&&Date.parse(r.end_at)>Date.now()))).length;
      const future=all.filter(r=>['planned','confirmed'].includes(r.status)&&Date.parse(r.end_at)>Date.now()).map(r=>({...r,status:'confirmed'}));
      const projected=calculateActualPayroll({member:m,records:[...done,...future].filter(r=>r.work_date.startsWith(period)),previousWeekRecords:[...done,...future].filter(r=>r.work_date<period+'-01'),period,nightWindow:[st.night_start||'22:00',st.night_end||'06:00']});
      const forecastOv=[...DB.shift_overrides.filter(o=>o.member_id===m.id)];for(let d=1;d<=E.daysIn(y,month);d++){const date=E.ymd(y,month,d);if(date<workDay(now())||date<st.labor_actual_from||all.some(r=>r.status!=='void'&&r.work_date===date))forecastOv.push({member_id:m.id,work_date:date,off:true});}
      const schedule=st.labor_actual_from?E.payroll(m,y,month,DB.shift_templates,forecastOv,0,today,[st.night_start||'22:00',st.night_end||'06:00']).fullGross:0;
      return {...actual,member_id:m.id,ledger_count:all.filter(r=>r.status!=='void'&&r.work_date.startsWith(period)).length,base:actual.base+legacy.base,np:actual.np+legacy.np,otp:actual.otp+legacy.otp,juhu:actual.juhu+legacy.juhu,gross,inc,meal,adv,ded,net:gross-ded,xfer:Math.max(0,gross-ded-adv),projected_gross:legacy.gross+projected.gross+schedule+inc+meal,incomplete,today_gross:actual.shifts.filter(r=>r.work_date===workDay(now())).reduce((n,r)=>n+r.gross,0)};
    });
    return {members:rows,gross:rows.reduce((n,r)=>n+r.gross,0),today_gross:rows.reduce((n,r)=>n+r.today_gross,0),incomplete:rows.reduce((n,r)=>n+r.incomplete,0)};
  };
  RPC.record_cash=a=>{if(!access(a.p_store))fail('금고 관리 권한이 없어요');const old=DB.cash_movements.find(x=>x.request_id===a.p_request);if(old)return old.id;if(!['in','out'].includes(a.p_direction)||!Number.isSafeInteger(a.p_amount)||a.p_amount<=0||!a.p_reason?.trim())fail('입출금 날짜·금액·사유를 확인해 주세요');const r={id:uid(),request_id:a.p_request,store_id:a.p_store,business_date:a.p_date,direction:a.p_direction,amount:a.p_amount,reason:a.p_reason,source:'owner',created_by:me(),created_at:now()};DB.cash_movements.push(r);return r.id;};
  RPC.record_pay=a=>{
    if(!access(a.p_store))fail('급여 관리 권한이 없어요');const old=DB.work_payments.find(x=>x.request_id===a.p_request);if(old)return old.id;
    if(!['cash','transfer'].includes(a.p_method)||!a.p_work_ids||(!a.p_work_ids.length&&(!a.p_member||!a.p_month)))fail('지급할 근무와 지급 수단을 확인해 주세요');
    const records=a.p_work_ids.map(id=>DB.work_records.find(r=>r.id===id)),r=records[0]||{member_id:a.p_member,store_id:a.p_store,work_date:a.p_month};if(!r.member_id||records.some(x=>!x||x.store_id!==a.p_store||x.member_id!==r.member_id||x.work_date.slice(0,7)!==r.work_date.slice(0,7)))fail('다른 매장·직원의 근무예요');guard(a.p_store,r.member_id,r.work_date);
    if(DB.work_payments.some(p=>p.status==='paid'&&p.work_ids.some(id=>a.p_work_ids.includes(id))))fail('이미 지급한 근무예요');
    if(records.some(r=>r.status!=='confirmed'||Date.parse(r.end_at)>Date.now()))fail('미완료 근무를 확인해 주세요');
    if(DB.pay_marks.some(p=>p.member_id===r.member_id&&p.month===r.work_date.slice(0,7)+'-01'&&p.paid_at))fail('기존 지급 완료 표시를 확인해 주세요');if(DB.work_records.some(w=>w.member_id===r.member_id&&w.work_date.slice(0,7)===r.work_date.slice(0,7)&&w.status==='confirmed'&&Date.parse(w.end_at)<=Date.now()&&!a.p_work_ids.includes(w.id)&&!DB.work_payments.some(p=>p.status==='paid'&&p.work_ids.includes(w.id))))fail('같은 달의 미지급 근무를 함께 선택해 주세요');const amount=RPC.actual_payroll({p_store:a.p_store,p_month:r.work_date.slice(0,7)+'-01'}).members.find(x=>x.member_id===r.member_id),prev=DB.work_payments.filter(p=>p.status==='paid'&&p.member_id===r.member_id&&p.period_month===r.work_date.slice(0,7)+'-01');
    if(amount.incomplete)fail('미완료 근무를 먼저 확인해 주세요');const sum=k=>prev.reduce((n,r)=>n+r[k],0),p={id:uid(),request_id:a.p_request,store_id:a.p_store,member_id:r.member_id,work_ids:a.p_work_ids,period_month:r.work_date.slice(0,7)+'-01',work_date:a.p_business_date,amount_gross:amount.gross-sum('amount_gross'),amount_deduction:amount.ded-sum('amount_deduction'),amount_net:amount.xfer-sum('amount_net'),method:a.p_method,status:'paid',created_at:now()};if(p.amount_net<=0)fail('지급 금액을 확인해 주세요');
    DB.work_payments.push(p);if(p.method==='cash')DB.cash_movements.push({id:uid(),request_id:a.p_request,store_id:a.p_store,business_date:a.p_business_date,direction:'out',amount:p.amount_net,reason:'급여 현금 지급',source:'payroll',payment_id:p.id,created_at:now()});return p.id;
  };
  RPC.reverse_pay=a=>{const p=DB.work_payments.find(p=>p.id===a.p_payment);if(!p||!access(p.store_id))fail('급여 관리 권한이 없어요');guard(p.store_id,p.member_id,p.period_month);if(p.status==='reversed')return p.reversed_by_id;if(!a.p_reason?.trim())fail('취소 사유를 입력해 주세요');const id=uid();if(p.method==='cash')DB.cash_movements.push({id,request_id:a.p_request,store_id:p.store_id,business_date:workDay(now()),direction:'in',amount:p.amount_net,reason:a.p_reason,source:'reversal',reverses_id:DB.cash_movements.find(x=>x.payment_id===p.id)?.id,created_at:now()});p.status='reversed';p.reversed_by_id=id;return id;};
  RPC.reverse_cash=a=>{const c=DB.cash_movements.find(x=>x.id===a.p_movement);if(!c||!access(c.store_id))fail('금고 관리 권한이 없어요');const old=DB.cash_movements.find(x=>x.reverses_id===c.id);if(old)return old.id;if(c.closing_report_date)fail('마감 화면의 대표 인출 금액에서 수정해 주세요');if(['payroll','reversal'].includes(c.source))fail('급여 기록에서 취소해 주세요');const id=RPC.record_cash({p_request:a.p_request,p_store:c.store_id,p_date:workDay(now()),p_direction:c.direction==='in'?'out':'in',p_amount:c.amount,p_reason:a.p_reason});Object.assign(DB.cash_movements.find(x=>x.id===id),{source:'reversal',reverses_id:c.id});return id;};
  RPC.erp_confirm_work=a=>{const r=DB.work_records.find(x=>x.id===a.p_work);if(!r)fail('근무를 찾지 못했어요');guard(r.store_id,r.member_id,r.work_date);if(r.status==='confirmed'&&r.pay_snapshot.confirm_request===a.p_request)return r.id;if(r.status!=='planned'||r.revision!==a.p_revision||Date.parse(r.end_at)>Date.now())fail('근무가 끝난 뒤 완료를 확인해 주세요');r.status='confirmed';r.revision++;r.pay_snapshot.confirm_request=a.p_request;return r.id;};
  RPC.erp_copy_week=a=>{if(!canManage(a.p_store))fail('매장 관리 권한이 없어요');const pending=[];for(const mid of a.p_members){if(!DB.members.some(m=>m.id===mid&&m.store_id===a.p_store&&m.active))fail('이 매장의 직원을 선택해 주세요');for(let d=0;d<7;d++){const day=x=>new Date(Date.parse(x+'T00:00:00Z')+d*864e5).toISOString().slice(0,10),source=day(a.p_source),target=day(a.p_target);if(DB.pay_locks.some(x=>x.store_id===a.p_store&&x.month===target.slice(0,7)+'-01'&&x.on_))fail('급여 마감된 기간이에요');const ov=DB.shift_overrides.find(x=>x.member_id===mid&&x.work_date===source),t=ov||DB.shift_templates.find(x=>x.member_id===mid&&x.weekday===(new Date(source).getUTCDay()+6)%7);if(!t||t.off)continue;const old=DB.shift_overrides.find(x=>x.member_id===mid&&x.work_date===target);if(old){if(old.start_t===t.start_t&&old.end_t===t.end_t&&old.break_min===t.break_min&&!old.off)continue;fail('기존 근무를 덮어쓰지 않아요');}pending.push({member_id:mid,work_date:target,start_t:t.start_t,end_t:t.end_t,break_min:t.break_min,off:false});}}DB.shift_overrides.push(...pending);return pending.length;};
  RPC.erp_void_work=a=>{const r=DB.work_records.find(x=>x.id===a.p_work);if(!r)fail('근무를 찾지 못했어요');guard(r.store_id,r.member_id,r.work_date);if(DB.work_payments.some(p=>p.status==='paid'&&p.work_ids.includes(r.id)))fail('지급을 먼저 취소해 주세요');if(r.revision!==a.p_revision)fail('근무 기록이 바뀌었어요');r.status='void';r.revision++;return r.id;};
  function syncClosingReport(previous,next) {
    if(next)next={...next,detail:{...(next.detail||{})}};
    const before=previous?.detail?.owner_withdrawal??0;
    if(next&&!Object.hasOwn(next.detail,'owner_withdrawal')&&previous?.detail&&Object.hasOwn(previous.detail,'owner_withdrawal'))next.detail.owner_withdrawal=before;
    const after=next?.detail?.owner_withdrawal??0,delta=withdrawalDelta(before,after),row=next||previous;
    if(previous&&next&&(previous.store_id!==next.store_id||previous.report_date!==next.report_date)&&(before||after))fail('대표 인출이 연결된 마감의 매장·날짜는 바꿀 수 없어요');
    if(delta){if(!access(row.store_id))fail('금고 관리 권한이 없어요');DB.cash_movements.push({id:uid(),request_id:uid(),store_id:row.store_id,business_date:row.report_date,closing_report_date:row.report_date,direction:delta>0?'out':'in',amount:Math.abs(delta),reason:next?(delta>0?'마감 대표 인출':'마감 대표 인출 정정 · 금고 복구'):'마감 삭제 · 대표 인출 복구',source:'owner',created_by:me(),created_at:now()});}
    return next;
  }
  return {syncClosingReport};

}

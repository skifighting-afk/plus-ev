const fail=()=>{throw Error('운영사 조회 전용 화면에서는 변경할 수 없어요')};
const reads=new Set(['actual_payroll','dealer_count','job_board','academy_board','my_academy','my_quiz','hq_store_stats']);
export function readOnlyClient(client,active){
 const wrap=(obj,blocked=new Set())=>new Proxy(obj,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return (...args)=>{if(active()&&blocked.has(key))return fail();const result=value.apply(target,args);return result&&typeof result==='object'?wrapChain(result):result}}});
 const mutations=new Set(['insert','update','upsert','delete','upload','remove','move','copy','createSignedUploadUrl','updateUser','signUp','signInWithPassword','signInWithOAuth','signOut','resetPasswordForEmail']);
 const wrapChain=obj=>new Proxy(obj,{get(target,key){const value=target[key];if(typeof value!=='function')return value;if(key==='then'||key==='catch'||key==='finally')return value.bind(target);return (...args)=>{if(active()&&mutations.has(key))return fail();const result=value.apply(target,args);return result&&typeof result==='object'?wrapChain(result):result}}});
 return new Proxy(client,{get(target,key){if(key==='rpc')return (name,args)=>{if(active()&&!reads.has(name))return fail();return target.rpc(name,args)};if(key==='from')return (...args)=>wrapChain(target.from(...args));if(key==='functions')return new Proxy(target.functions,{get(t,k){if(k==='invoke')return (...args)=>active()?fail():t.invoke(...args);return t[k]}});if(key==='storage')return wrap(target.storage);if(key==='auth')return wrap(target.auth,mutations);const v=target[key];return typeof v==='function'?v.bind(target):v}});
}
const actions=new Set(['close','sub','mon','stab','empf','sview','wk','day-open','day-go','day-rep','sales-mode','staff-edit','cash-open','refresh','print','audit','slip-preview','home-view','goto','erp-more','erp-fixed','fixed','notice-open','pnl','sales-filter']);
const subs=new Set(['settings','pnl','daily','order','notice','edu','used','board','pricing']);
export function allowedInspectionAction(d){if(d.tab)return ['home','sched','sales','staff','jobs','market','more','improve'].includes(d.tab);if(!actions.has(d.act))return false;if(d.act==='sub')return !d.v||subs.has(d.v);if(d.act==='goto')return !d.s||subs.has(d.s);return true;}
export function installInspectionGuard({active,storeName,toast}){
 const block=e=>{e.preventDefault();e.stopImmediatePropagation();toast('운영사 조회 전용입니다')};
 document.addEventListener('click',e=>{if(!active())return;const b=e.target.closest?.('[data-act],[data-tab]');if(b&&!allowedInspectionAction(b.dataset)){block(e);return;}const link=e.target.closest?.('a[href]');if(link){const u=new URL(link.href,location.href);if(u.origin!==location.origin||!['/','/legal.html','/guide.html'].includes(u.pathname))block(e);}},true);
 document.addEventListener('submit',e=>{if(active())block(e)},true);
 for(const type of ['dragstart','drop'])document.addEventListener(type,e=>{if(active())block(e)},true);
 document.addEventListener('change',e=>{if(active()&&e.target.id!=='store-sel'&&!e.target.matches('[data-inspection-filter]'))block(e)},true);
 
 const update=()=>{if(!active())return;
  if(!document.getElementById('hq-inspection-bar')){const bar=document.createElement('div');bar.id='hq-inspection-bar';bar.className='card';bar.style.cssText='position:sticky;top:0;z-index:90;margin:0;padding:12px 20px;border-radius:0;border-color:#e8bf65';const text=document.createElement('b');text.dataset.inspectionLabel='';bar.append(text);const back=document.createElement('a');back.href='/';back.className='btn sm';back.style.marginLeft='12px';back.textContent='운영사로 돌아가기';bar.append(back);document.querySelector('header')?.after(bar);}
  const label=document.querySelector('[data-inspection-label]'),name=`${storeName()||'매장'} · 운영사 조회 전용`;if(label&&label.textContent!==name)label.textContent=name;
  document.querySelectorAll('#view input,#view textarea,#sheet input,#sheet textarea').forEach(el=>{if(!el.disabled)el.disabled=true});
  document.querySelectorAll('#view select,#sheet select').forEach(el=>{if(el.id!=='store-sel'&&!el.disabled)el.disabled=true});
  document.querySelectorAll('#view button,#sheet button,#top-r button').forEach(el=>{if(el.dataset.tab||el.dataset.act){if(!allowedInspectionAction(el.dataset)&&!el.disabled){el.disabled=true;el.title='운영사 조회 전용'}}else if(el.type==='submit'&&!el.disabled)el.disabled=true;});
  document.querySelectorAll('[draggable="true"]').forEach(el=>el.draggable=false);
 };
 setInterval(update,350);update();
}

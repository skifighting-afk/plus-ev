// Provider credentials and decrypted billing keys stay inside this server module.
export function createBillingService({repo,provider,encrypt,decrypt,config}) {
 const db=(action,user,args={})=>repo.command(action,user,args,config.test);
 const publicStatus=s=>s ? Object.fromEntries(['status','plan','card','period_end','next_charge_at','test'].filter(k=>k in s).map(k=>[k,s[k]])) : null;
 async function charge(id) {
  const i=await db('claim_invoice',null,{id});
  if(!i) return {processing:true};
  let payment;
  try {
   payment=await provider.lookup(i.order_id);
   if(!payment) {
    if(i.reconcile_only||!await db('authorize_charge',null,{invoice:i.id})){await db('void_invoice',null,{invoice:i.id});return {canceled:true};}
    payment=await provider.charge(await decrypt(i.key_cipher),{customerKey:i.customer_key,amount:i.amount,orderId:i.order_id,orderName:`+EV ${i.plan==='basic'?'베이직':'프로'} 30일`},i.id);
   }
   if(payment.status!=='DONE'||payment.type!=='BILLING'||payment.orderId!==i.order_id||payment.totalAmount!==i.amount||payment.currency!=='KRW'||!payment.card||!payment.paymentKey) throw Error('결제 확인이 필요해요. 운영사에 문의해 주세요');
   await db('settle',null,{invoice:i.id,payment_key:payment.paymentKey});
   return {paid:true,test:config.test};
  } catch(e) {
   await db(e.status>=400&&e.status<500&&e.status!==409?'charge_failed':'charge_error',null,{invoice:i.id}).catch(()=>{});
   throw Error('결제 확인이 필요해요. 잠시 후 다시 확인하거나 운영사에 문의해 주세요');
  }
 }
 async function remove(s) {
  if(s?.has_open_invoice||s?.has_pending_registration)return false;
  if(!s?.key_cipher) return true;
  try {await provider.remove(await decrypt(s.key_cipher));await db('deleted',null,{id:s.id});return true;}catch{return false;}
 }
 async function finishRegistration(s,session) {
  const issued=await provider.issue({authKey:await decrypt(s.auth_cipher),customerKey:s.customer_key},session);
  if(issued.customerKey!==s.customer_key||!issued.billingKey)throw Error('카드 등록 정보가 일치하지 않아요');
  const card=String(issued.card?.number||'').replace(/\D/g,'').slice(-4);
  // A durable, encrypted authorization job exists before issuance. If encryption
  // or persistence fails, the scheduler replays exactly this provider request/key.
  let saved;
  try {saved=await db('save_key',null,{session,key_cipher:await encrypt(issued.billingKey),card:card?`****${card}`:''});}
  catch(e) {
   const state=await db('registration_state',null,{session}).catch(()=>null);
   if(state?.state==='registered')return charge(state.id);
   throw e;
  }
  if(saved?.saved===false) {
   const pending=await db('resume_checkout',null,{session});
   if(pending?.key_cipher){await provider.remove(await decrypt(pending.key_cipher));await db('orphan_deleted',null,{session});}
   return {canceled:true};
  }
  return charge(s.id);
 }
 return async function billing(action,user,args={},scheduler=false) {
  if(action==='run') {
   if(!scheduler) throw Error('권한이 없어요');
   const rows=await db('due',null);let charged=0,failed=0;
   for(const s of rows){try{
    if(s.status==='issuing'||s.status==='orphan'){
     const job=await db('resume_checkout',null,{session:s.id});if(!job)continue;
     if(job.state==='review')throw Error('카드 등록 결과의 수동 확인이 필요해요');
     if(job.state==='cleanup'){await provider.remove(await decrypt(job.key_cipher));await db('orphan_deleted',null,{session:s.id});}
     else await finishRegistration(job,s.id);
    }else if(s.status==='canceled'){await charge(s.id);if(!await remove(await db('cleanup',null,{id:s.id})))failed++;}
    else{await charge(s.id);charged++;}
   }catch{failed++;}}
   return {charged,failed};
  }
  if(!user) throw Error('로그인이 필요해요');
  if(action==='status') return {enabled:true,clientKey:config.clientKey,test:config.test,subscription:publicStatus(await db('status',user,{company:args.company}))};
  if(action==='quote') return db('quote',user,{company:args.company,plan:args.plan});
  if(action==='begin') {
   if(args.consent!=='billing-v1') throw Error('정기결제 동의가 필요해요');
   if(!['basic','pro'].includes(args.plan)) throw Error('없는 요금제예요');
   const s=await db('begin',user,{company:args.company,plan:args.plan,consent:args.consent,expected_amount:args.expected_amount,expected_normal:args.expected_normal});
   return {...s,clientKey:config.clientKey,test:config.test};
  }
  if(action==='complete') {
   if(typeof args.authKey!=='string'||!args.authKey||args.authKey.length>300) throw Error('카드 등록 정보가 올바르지 않아요');
   const s=await db('claim_checkout',user,{session:args.session,customer_key:args.customerKey,auth_cipher:await encrypt(args.authKey)});
   if(!s.registered)return finishRegistration(s,args.session);
   return charge(s.id);
  }
  if(action==='cancel') {
   const s=await db('cancel',user,{company:args.company});
   return {status:'canceled',cardDeletionPending:!await remove(s)};
  }
  if(action==='retry') {const s=await db('status',user,{company:args.company});if(!s||s.status!=='active')throw Error('활성 구독이 없어요');return charge(s.id);}
  throw Error('지원하지 않는 요청이에요');
 };
}

export function createTossProvider(secret,fetcher=fetch) {
 async function call(route,method='GET',body,key) {
  const r=await fetcher(`https://api.tosspayments.com/v1/${route}`,{method,headers:{Authorization:`Basic ${btoa(secret+':')}`,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=Error('결제 제공사 응답 확인이 필요해요');e.code=data.code;e.status=r.status;throw e;}return data;
 }
 return {
  issue:(body,key)=>call('billing/authorizations/issue','POST',body,key),
  charge:(key,body,id)=>call(`billing/${encodeURIComponent(key)}`,'POST',body,id),
  lookup:async id=>{try{return await call(`payments/orders/${encodeURIComponent(id)}`);}catch(e){if(e.status===404&&e.code==='NOT_FOUND_PAYMENT')return null;throw e;}},
  remove:async key=>{try{return await call(`billing/${encodeURIComponent(key)}`,'DELETE');}catch(e){if(e.code==='NOT_FOUND_BILLING_KEY')return;throw e;}}
 };
}

export async function createKeyCipher(encoded,cryptoApi=crypto) {
 const bytes=Uint8Array.from(atob(encoded||''),c=>c.charCodeAt(0));
 if(bytes.length!==32)throw Error('BILLING_ENCRYPTION_KEY must encode 32 bytes');
 const key=await cryptoApi.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
 return {
  encrypt:async value=>{const iv=cryptoApi.getRandomValues(new Uint8Array(12));const cipher=new Uint8Array(await cryptoApi.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...cipher));},
  decrypt:async value=>{const [a,b]=value.split('.');return new TextDecoder().decode(await cryptoApi.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(a),c=>c.charCodeAt(0))},key,Uint8Array.from(atob(b),c=>c.charCodeAt(0))));}
 };
}

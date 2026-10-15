import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createBillingService,createKeyCipher} from '../supabase/functions/billing/core.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
create table public.companies(id uuid primary key,created_at timestamptz default now(),plan text,paid_until timestamptz,trial_ends date,diag_until timestamptz);
create table public.members(company_id uuid,user_id uuid,role text,active boolean);
create function public.price(text) returns int language sql as $$ select case when $1='basic_monthly' then 25000 else 35000 end $$;
create function public.company_plan_price(uuid,text) returns int language sql as $$ select case when $2 not in ('basic','pro') then null else public.price(case when $2='basic' then 'basic_monthly' else 'pro_monthly' end) end $$;
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into companies(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into members values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner',true),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner',true);`);
await db.exec(await fs.readFile(new URL('../migrations/toss-billing.sql',import.meta.url),'utf8'));
const user='11111111-1111-4111-8111-111111111111',company='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function command(action,args={},test=true,uid=user){if(action==='claim_checkout')args={auth_cipher:'encrypted-auth-key-for-test-123456',...args};const r=await db.query('select public.billing_command($1,$2::uuid,$3::jsonb,$4) as result',[action,uid,JSON.stringify(args),test]);return r.rows[0].result;}
test('SQL privilege, ownership, consent price, claims, test isolation and cancellation',async()=>{
 await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
 await assert.rejects(command('status',{company}),/권한/);
 await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
 await assert.rejects(command('status',{company:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}),/대표님/);
 await assert.rejects(command('begin',{company,plan:'pro',consent:'billing-v1',expected_amount:1,expected_normal:35000}),/변경/);
 const session=await command('begin',{company,plan:'pro',consent:'billing-v1',expected_amount:35000,expected_normal:35000});
 await assert.rejects(command('claim_checkout',{session:session.session,customer_key:'wrong'}),/일치/);
 const sub=await command('claim_checkout',{session:session.session,customer_key:session.customer_key});
 await assert.rejects(command('claim_checkout',{session:session.session,customer_key:session.customer_key}),/처리 중/);
 await command('save_key',{session:session.session,key_cipher:'encrypted-not-a-real-key-1234567890',card:'****1234'});
 const invoice=await command('claim_invoice',{id:sub.id},true,null);
 assert.equal(invoice.amount,35000);
 assert.equal(await command('claim_invoice',{id:sub.id},true,null),null);
 const canceled=await command('cancel',{company});assert.equal(canceled.has_open_invoice,true);
 await command('settle',{invoice:invoice.id,payment_key:'test-payment'},true,null);
 await command('settle',{invoice:invoice.id,payment_key:'test-payment'},true,null);
 const c=(await db.query('select paid_until,plan from companies where id=$1',[company])).rows[0];
 assert.equal(c.paid_until,null);assert.equal(c.plan,null);
 assert.equal(await command('claim_invoice',{id:sub.id},true,null),null);
 const status=await command('status',{company});assert.equal(status.status,'canceled');assert.equal(status.next_charge_at,null);assert.equal(status.card,'****1234');assert.equal(status.key_cipher,undefined);
 await command('cancel',{company});assert.equal((await command('status',{company})).status,'canceled');
 await command('deleted',{id:sub.id},true,null);
 assert.equal((await db.query('select key_cipher from billing_subscriptions where id=$1',[sub.id])).rows[0].key_cipher,null);
});
test('live payment extends entitlement exactly once and cannot replace prepaid plans',async()=>{
 const session=await command('begin',{company,plan:'pro',consent:'billing-v1',expected_amount:35000,expected_normal:35000},false);
 const sub=await command('claim_checkout',{session:session.session,customer_key:session.customer_key},false);
 await command('save_key',{session:session.session,key_cipher:'encrypted-not-a-real-key-1234567890',card:'****1234'},false);
 const invoice=await command('claim_invoice',{id:sub.id},false,null);
 await command('settle',{invoice:invoice.id,payment_key:'live-payment'},false,null);
 const first=(await db.query('select paid_until from companies where id=$1',[company])).rows[0].paid_until;
 await command('settle',{invoice:invoice.id,payment_key:'live-payment'},false,null);
 assert.equal(+(await db.query('select paid_until from companies where id=$1',[company])).rows[0].paid_until,+first);
 await command('cancel',{company},false);await command('deleted',{id:sub.id},false,null);
 await assert.rejects(command('begin',{company,plan:'pro',consent:'billing-v1',expected_amount:35000,expected_normal:35000},false),/기존 유료/);
});
test('unresolved invoices stop before the provider idempotency window expires',async()=>{
 const session=await command('begin',{company,plan:'pro',consent:'billing-v1',expected_amount:35000,expected_normal:35000});
 const sub=await command('claim_checkout',{session:session.session,customer_key:session.customer_key});
 await command('save_key',{session:session.session,key_cipher:'encrypted-not-a-real-key-1234567890',card:'****1234'});
 const invoice=await command('claim_invoice',{id:sub.id},true,null);
 await db.query("update billing_invoices set created_at=now()-interval '15 days',lease_until=null where id=$1",[invoice.id]);
 assert.equal(await command('claim_invoice',{id:sub.id},true,null),null);
 assert.equal((await command('status',{company})).status,'review');
 await command('cancel',{company});
 assert.equal((await command('status',{company})).status,'canceled');
});
test('initial charge retains the accepted promotion quote even after promotion expiry',async()=>{
 const c='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 await db.query('insert into companies(id) values($1)',[c]);await db.query("insert into members values($1,$2,'owner',true)",[c,user]);
 await db.exec('create or replace function public.company_plan_price(uuid,text) returns int language sql as $$ select 9900 $$');
 const session=await command('begin',{company:c,plan:'pro',consent:'billing-v1',expected_amount:9900,expected_normal:35000});
 await db.exec('create or replace function public.company_plan_price(uuid,text) returns int language sql as $$ select 35000 $$');
 const sub=await command('claim_checkout',{session:session.session,customer_key:session.customer_key});
 await command('save_key',{session:session.session,key_cipher:'encrypted-not-a-real-key-1234567890',card:'****1234'});
 const invoice=await command('claim_invoice',{id:sub.id},true,null);assert.equal(invoice.amount,9900);
});
test('retry backoff prevents the first 25 subscriptions from starving later subscriptions',async()=>{
 for(let n=0;n<26;n++){
  // Explicit UUIDs are generated by the database for the isolated fixture.
  const id=(await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query('insert into companies(id) values($1)',[id]);
  await db.query("insert into billing_subscriptions(company_id,test,plan,normal_amount,initial_amount,status,key_cipher,next_charge_at,retry_after) values($1,true,'pro',35000,35000,'active','encrypted-key',now()-interval '30 days',now()-interval '1 hour')",[id]);
 }
 const first=(await command('due',{},true,null)).filter(s=>s.status==='active');
 assert.equal(first.length,25);
 for(const s of first)await command('claim_invoice',{id:s.id},true,null);
 const second=await command('due',{},true,null);
 assert.ok(second.some(s=>s.status==='active'&&!first.some(x=>x.id===s.id)));
});
async function serviceFixture(companyId,hook){
 await db.query('insert into companies(id) values($1)',[companyId]);await db.query("insert into members values($1,$2,'owner',true)",[companyId,user]);
 const cipher=await createKeyCipher(btoa('t'.repeat(32)));let charges=0,deletes=0;
 const repo={command:(a,u,v,t)=>command(a,v,t,u)};
 const provider={issue:async body=>{if(hook)await hook();return {customerKey:body.customerKey,billingKey:'private-issued-key',card:{number:'123456******1234'}};},lookup:async()=>null,charge:async(k,b)=>{charges++;return {status:'DONE',type:'BILLING',orderId:b.orderId,totalAmount:b.amount,currency:'KRW',card:{},paymentKey:'fixture-'+companyId};},remove:async()=>{deletes++;}};
 const svc=createBillingService({repo,provider,...cipher,config:{test:true,clientKey:'test_ck_fixture'}});
 return {svc,repo,stats:()=>({charges,deletes})};
}
test('cancellation during provider issuance deletes the issued card and never charges',async()=>{
 const c='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const f=await serviceFixture(c,async()=>{const r=await command('cancel',{company:c});assert.equal(r.has_pending_registration,true);});
 const s=await f.svc('begin',user,{company:c,plan:'pro',consent:'billing-v1',expected_amount:35000,expected_normal:35000});
 assert.deepEqual(await f.svc('complete',user,{session:s.session,customerKey:s.customer_key,authKey:'auth'}),{canceled:true});
 assert.deepEqual(f.stats(),{charges:0,deletes:1});
 assert.equal((await db.query('select key_cipher from billing_checkouts where id=$1',[s.session])).rows[0].key_cipher,null);
});
test('ambiguous successful save is reconciled instead of deleting a committed card',async()=>{
 const c='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';const f=await serviceFixture(c);const original=f.repo.command;
 f.repo.command=async(a,u,v,t)=>{const result=await original(a,u,v,t);if(a==='save_key')throw Error('response lost');return result;};
 const s=await f.svc('begin',user,{company:c,plan:'pro',consent:'billing-v1',expected_amount:35000,expected_normal:35000});
 assert.equal((await f.svc('complete',user,{session:s.session,customerKey:s.customer_key,authKey:'auth'})).paid,true);
 assert.deepEqual(f.stats(),{charges:1,deletes:0});
});
test('failed pre-commit save retains an encrypted issuance job that scheduler can resume',async()=>{
 const c='ffffffff-ffff-4fff-8fff-ffffffffffff';const f=await serviceFixture(c);const original=f.repo.command;let fail=true;
 f.repo.command=async(a,u,v,t)=>{if(a==='save_key'&&fail){fail=false;throw Error('database unavailable');}return original(a,u,v,t);};
 const s=await f.svc('begin',user,{company:c,plan:'pro',consent:'billing-v1',expected_amount:35000,expected_normal:35000});
 await assert.rejects(f.svc('complete',user,{session:s.session,customerKey:s.customer_key,authKey:'auth'}),/unavailable/);
 const job=(await db.query('select auth_cipher,state from billing_checkouts where id=$1',[s.session])).rows[0];
 assert.equal(job.state,'processing');assert.ok(job.auth_cipher);assert.equal(job.auth_cipher.includes('auth'),false);
 await db.query("update billing_checkouts set retry_after=now()-interval '1 second',lease_until=null where id=$1",[s.session]);
 // Isolate this job from unrelated scheduler fairness fixtures.
 f.repo.command=(a,u,v,t)=>a==='due'?[{id:s.session,status:'issuing'}]:original(a,u,v,t);
 assert.equal((await f.svc('run',null,{},true)).failed,0);
 assert.deepEqual(f.stats(),{charges:1,deletes:0});
});

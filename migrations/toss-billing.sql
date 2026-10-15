-- Apply only after company-six-month-offer.sql. All payment secrets are service-role-only.
begin;
create table if not exists public.billing_subscriptions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 test boolean not null, plan text not null check(plan in ('basic','pro')),
 customer_key text not null default gen_random_uuid()::text,
 status text not null default 'pending' check(status in ('pending','active','canceled','review')),
 key_cipher text, card text not null default '', normal_amount integer not null check(normal_amount>0),
 initial_amount integer not null check(initial_amount>0), retry_after timestamptz not null default now(),
 period_end timestamptz, next_charge_at timestamptz, consent_at timestamptz not null default now(),
 created_at timestamptz not null default now(), unique(company_id,test)
);
create table if not exists public.billing_checkouts (
 id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.billing_subscriptions(id),
 user_id uuid not null references auth.users(id), customer_key text not null,
 state text not null default 'pending' check(state in ('pending','processing','registered','expired','cleanup','review')),
 auth_cipher text, key_cipher text, created_at timestamptz not null default now(), retry_after timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '20 minutes', lease_until timestamptz
);
create table if not exists public.billing_invoices (
 id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.billing_subscriptions(id),
 due_at timestamptz not null, period_end timestamptz not null,
 order_id text not null unique default 'EVB_'||replace(gen_random_uuid()::text,'-',''),
 amount integer not null check(amount>0), plan text not null,
 state text not null default 'open' check(state in ('open','done','review','void')),
 lease_until timestamptz, payment_key text unique, created_at timestamptz not null default now(),
 unique(subscription_id,due_at)
);
alter table public.billing_subscriptions enable row level security;
alter table public.billing_checkouts enable row level security;
alter table public.billing_invoices enable row level security;
revoke all on public.billing_subscriptions,public.billing_checkouts,public.billing_invoices from public,anon,authenticated;
grant all on public.billing_subscriptions,public.billing_checkouts,public.billing_invoices to service_role;

create or replace function public.billing_command(p_action text,p_user uuid,p_args jsonb,p_test boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 s public.billing_subscriptions; ch public.billing_checkouts; i public.billing_invoices;
 comp uuid; amt integer; normal integer; result jsonb; ends timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception '권한이 없어요'; end if;
 if p_action='due' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status)),'[]'::jsonb) into result
   from (select id,status,retry_after,created_at from billing_subscriptions where test=p_test and retry_after<=now() and
    ((status='active' and next_charge_at<=now()) or (status='canceled' and key_cipher is not null))
    union all select jobs.id,case when jobs.state='cleanup' then 'orphan' else 'issuing' end,jobs.retry_after,jobs.created_at
    from billing_checkouts jobs join billing_subscriptions bs on bs.id=jobs.subscription_id
    where bs.test=p_test and jobs.state in ('processing','cleanup') and jobs.retry_after<=now() and (jobs.lease_until is null or jobs.lease_until<=now())
    order by retry_after,created_at,id limit 25) t;
  return result;
 end if;
 if p_action in ('status','quote','begin','cancel') then
  comp:=(p_args->>'company')::uuid;
  if p_user is null or not exists(select 1 from members where company_id=comp and user_id=p_user and role='owner' and active) then raise exception '대표님만 정기결제를 관리할 수 있어요'; end if;
  -- Serialize all owner actions, including concurrent first registrations.
  perform 1 from companies where id=comp for update;
  select * into s from billing_subscriptions where company_id=comp and test=p_test for update;
 elsif p_action in ('claim_checkout','save_key','resume_checkout','orphan_deleted','registration_state') then
  select * into ch from billing_checkouts where id=(p_args->>'session')::uuid for update;
  if ch.id is null or (p_action='claim_checkout' and ch.user_id is distinct from p_user) then raise exception '카드 등록 정보가 일치하지 않아요'; end if;
  select * into s from billing_subscriptions where id=ch.subscription_id and test=p_test for update;
  if s.id is null or (p_action='claim_checkout' and not exists(select 1 from members where company_id=s.company_id and user_id=p_user and role='owner' and active)) then raise exception '대표님만 정기결제를 관리할 수 있어요'; end if;
 else
  if p_action in ('settle','charge_error','charge_failed','void_invoice','authorize_charge') then
   select subscription_id into comp from billing_invoices where id=(p_args->>'invoice')::uuid;
   select * into s from billing_subscriptions where id=comp and test=p_test for update;
   select * into i from billing_invoices where id=(p_args->>'invoice')::uuid for update;
  else
   select * into s from billing_subscriptions where id=(p_args->>'id')::uuid and test=p_test for update;
  end if;
  if s.id is null then raise exception '구독을 찾을 수 없어요'; end if;
 end if;

 if p_action='status' then
  if s.id is null then return null; end if;
  return jsonb_build_object('id',s.id,'status',s.status,'plan',s.plan,'card',s.card,'period_end',s.period_end,'next_charge_at',s.next_charge_at,'test',s.test);
 elsif p_action in ('quote','begin') then
  if p_action='quote' then
   if p_args->>'plan' not in ('basic','pro') then raise exception '없는 요금제예요'; end if;
   return jsonb_build_object('amount',public.company_plan_price(comp,p_args->>'plan'),'normal_amount',public.price(case when p_args->>'plan'='basic' then 'basic_monthly' else 'pro_monthly' end),'plan',p_args->>'plan');
  end if;
  if p_args->>'consent' is distinct from 'billing-v1' then raise exception '정기결제 동의가 필요해요'; end if;
  if p_args->>'plan' not in ('basic','pro') then raise exception '없는 요금제예요'; end if;
  if s.id is not null and (s.status in ('active','review') or s.key_cipher is not null) then raise exception '기존 정기결제를 해지하고 카드 삭제를 완료한 뒤 다시 등록해 주세요'; end if;
  if not p_test and exists(select 1 from companies where id=comp and paid_until>now() and plan in ('basic','pro')) then raise exception '기존 유료 이용 기간이 끝난 뒤 정기결제를 시작해 주세요'; end if;
  amt:=public.company_plan_price(comp,p_args->>'plan');
  normal:=public.price(case when p_args->>'plan'='basic' then 'basic_monthly' else 'pro_monthly' end);
  if amt is null or amt<=0 or normal is null or normal<amt then raise exception '무료 기간에는 베이직 카드 등록 없이 이용해 주세요'; end if;
  if (p_args->>'expected_amount')::int is distinct from amt or (p_args->>'expected_normal')::int is distinct from normal then raise exception '요금이 변경됐어요. 요금과 동의를 다시 확인해 주세요'; end if;
  if s.id is null then
   insert into billing_subscriptions(company_id,test,plan,normal_amount,initial_amount) values(comp,p_test,p_args->>'plan',normal,amt) returning * into s;
  else
   update billing_subscriptions set plan=p_args->>'plan',normal_amount=normal,initial_amount=amt,status='pending',customer_key=gen_random_uuid()::text,period_end=null,next_charge_at=null,consent_at=now(),retry_after=now() where id=s.id returning * into s;
  end if;
  update billing_checkouts set state='expired' where subscription_id=s.id and state='pending';
  insert into billing_checkouts(subscription_id,user_id,customer_key) values(s.id,p_user,s.customer_key) returning * into ch;
  return jsonb_build_object('session',ch.id,'customer_key',s.customer_key,'amount',amt,'normal_amount',normal,'plan',s.plan);
 elsif p_action='claim_checkout' then
  if ch.customer_key is distinct from p_args->>'customer_key' or ch.customer_key is distinct from s.customer_key then raise exception '카드 등록 정보가 일치하지 않아요'; end if;
  if ch.state='registered' and s.key_cipher is not null and s.status='active' then return jsonb_build_object('id',s.id,'registered',true); end if;
  if ch.expires_at<=now() or ch.state='expired' or s.status<>'pending' then raise exception '카드 등록 시간이 지났어요. 다시 시작해 주세요'; end if;
  if ch.lease_until>now() then raise exception '카드 등록을 처리 중이에요. 잠시 후 확인해 주세요'; end if;
  if length(coalesce(p_args->>'auth_cipher',''))<20 then raise exception '카드 인증 암호화 정보가 없어요'; end if;
  update billing_checkouts set state='processing',lease_until=now()+interval '2 minutes',retry_after=now()+interval '15 minutes',auth_cipher=coalesce(auth_cipher,p_args->>'auth_cipher') where id=ch.id returning * into ch;
  return jsonb_build_object('id',s.id,'customer_key',ch.customer_key,'auth_cipher',ch.auth_cipher,'registered',false);
 elsif p_action='resume_checkout' then
  if ch.lease_until>now() then return null; end if;
  if ch.created_at<now()-interval '14 days' then update billing_checkouts set state='review' where id=ch.id;return jsonb_build_object('state','review');end if;
  update billing_checkouts set lease_until=now()+interval '2 minutes',retry_after=now()+interval '15 minutes' where id=ch.id;
  return jsonb_build_object('id',s.id,'session',ch.id,'customer_key',ch.customer_key,'auth_cipher',ch.auth_cipher,'key_cipher',ch.key_cipher,'state',ch.state);
 elsif p_action='registration_state' then
  return jsonb_build_object('state',ch.state,'id',s.id);
 elsif p_action='orphan_deleted' then
  if ch.state='cleanup' then update billing_checkouts set state='expired',key_cipher=null,auth_cipher=null,lease_until=null where id=ch.id; end if;
  return jsonb_build_object('deleted',true);
 elsif p_action='save_key' then
  if length(coalesce(p_args->>'key_cipher',''))<20 then raise exception '카드 암호화 정보가 없어요'; end if;
  if ch.state='registered' then return jsonb_build_object('id',s.id,'saved',true); end if;
  if ch.state<>'processing' then raise exception '카드 등록 정보가 일치하지 않아요'; end if;
  if ch.customer_key<>s.customer_key or s.status<>'pending' or not exists(select 1 from members where company_id=s.company_id and user_id=ch.user_id and role='owner' and active) then
   update billing_checkouts set state='cleanup',key_cipher=p_args->>'key_cipher',auth_cipher=null,lease_until=null,retry_after=now() where id=ch.id;
   return jsonb_build_object('id',s.id,'saved',false);
  end if;
  update billing_subscriptions set key_cipher=p_args->>'key_cipher',card=p_args->>'card',status='active',next_charge_at=now() where id=s.id;
  update billing_checkouts set state='registered',lease_until=null,auth_cipher=null where id=ch.id;
  return jsonb_build_object('id',s.id,'saved',true);
 elsif p_action='claim_invoice' then
  if s.key_cipher is null then return null; end if;
  if s.status='canceled' then
   select * into i from billing_invoices where subscription_id=s.id and state='open' order by created_at desc limit 1 for update;
   if i.id is null then return null; end if;
  else
   if s.status<>'active' or s.next_charge_at>now() then return null; end if;
   select * into i from billing_invoices where subscription_id=s.id and due_at=s.next_charge_at for update;
  end if;
  if i.id is null then
   amt:=case when s.period_end is null then s.initial_amount else public.company_plan_price(s.company_id,s.plan) end;
   if amt is null or amt<=0 or amt>s.normal_amount then
    update billing_subscriptions set status='review' where id=s.id;return null;
   end if;
   -- Anchor service to now after a delayed scheduler; never batch-charge missed periods.
   ends:=greatest(now(),s.next_charge_at)+interval '30 days';
   insert into billing_invoices(subscription_id,due_at,period_end,amount,plan) values(s.id,s.next_charge_at,ends,amt,s.plan) returning * into i;
  end if;
  if i.state<>'open' or i.lease_until>now() then return null; end if;
  if i.created_at<now()-interval '14 days' then
   update billing_invoices set state='review' where id=i.id;
   update billing_subscriptions set status=case when status='canceled' then 'canceled' else 'review' end where id=s.id;return null;
  end if;
  update billing_invoices set lease_until=now()+interval '2 minutes' where id=i.id;
  update billing_subscriptions set retry_after=now()+interval '15 minutes' where id=s.id;
  return jsonb_build_object('id',i.id,'order_id',i.order_id,'amount',i.amount,'plan',i.plan,'customer_key',s.customer_key,'key_cipher',s.key_cipher,'created_at',i.created_at,'test',s.test,'reconcile_only',s.status='canceled');
 elsif p_action='authorize_charge' then
  return to_jsonb(s.status='active' and i.state='open');
 elsif p_action='void_invoice' then
  if s.status<>'canceled' then raise exception '해지 상태를 확인해 주세요'; end if;
  update billing_invoices set state='void',lease_until=null where id=i.id and state='open';
  return jsonb_build_object('status','canceled');
 elsif p_action='cleanup' then
  if s.status<>'canceled' then raise exception '해지 상태를 확인해 주세요'; end if;
  update billing_subscriptions set retry_after=now()+interval '15 minutes' where id=s.id;
  return jsonb_build_object('id',s.id,'key_cipher',s.key_cipher,'has_open_invoice',exists(select 1 from billing_invoices where subscription_id=s.id and state='open'),'has_pending_registration',exists(select 1 from billing_checkouts where subscription_id=s.id and state in ('processing','cleanup')));
 elsif p_action='settle' then
  if i.state='done' then return jsonb_build_object('status',s.status); end if;
  if i.state<>'open' then raise exception '결제 확인이 필요해요'; end if;
  update billing_invoices set state='done',payment_key=p_args->>'payment_key',lease_until=null where id=i.id;
  update billing_subscriptions set period_end=i.period_end,next_charge_at=case when status='canceled' then null else i.period_end end,retry_after=case when status='canceled' then now() else i.period_end end where id=s.id;
  if not p_test then update companies set plan=s.plan,paid_until=greatest(coalesce(paid_until,i.period_end),i.period_end) where id=s.company_id; end if;
  return jsonb_build_object('status',s.status);
 elsif p_action='charge_error' then
  -- Keep the lease and same invoice/order for reconciliation. No new order on a timeout.
  return jsonb_build_object('status','pending_confirmation');
 elsif p_action='charge_failed' then
  if i.state='open' then
   update billing_invoices set state='review',lease_until=null where id=i.id;
   update billing_subscriptions set status=case when status='canceled' then 'canceled' else 'review' end,next_charge_at=null where id=s.id;
  end if;
  return jsonb_build_object('status','review');
 elsif p_action='cancel' then
  if s.id is null then return null; end if;
  update billing_subscriptions set status='canceled',next_charge_at=null,retry_after=now() where id=s.id;
  return jsonb_build_object('id',s.id,'key_cipher',s.key_cipher,'has_open_invoice',exists(select 1 from billing_invoices where subscription_id=s.id and state='open'),'has_pending_registration',exists(select 1 from billing_checkouts where subscription_id=s.id and state in ('processing','cleanup')));
 elsif p_action='deleted' then
  if s.status<>'canceled' then raise exception '해지 상태를 확인해 주세요'; end if;
  update billing_subscriptions set key_cipher=null,card='' where id=s.id;
  return jsonb_build_object('status','canceled');
 end if;
 raise exception '지원하지 않는 요청이에요';
end $$;
revoke all on function public.billing_command(text,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.billing_command(text,uuid,jsonb,boolean) to service_role;
commit;

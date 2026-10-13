begin;
CREATE OR REPLACE FUNCTION public.expire_posts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  update job_posts set status = 'expired' where status in ('open', 'unpaid') and expires_at < now();
  with u as (update job_slots j set status = 'REFUND' from job_posts p where p.id = j.post_id and p.kind = 'urgent' and p.status = 'expired' and j.status = 'OPEN' returning j.post_id, j.pay)
  update payments pm set refund_due = pm.refund_due + x.amt from (select post_id, sum(pay + floor(pay * public.price('match_pct') / 100.0 / 10) * 10)::int amt from u group by post_id) x
  where pm.kind = 'post' and pm.status = 'done' and (pm.arg->>'post')::uuid = x.post_id;
  with x as (update applications a set status = 'expired' from job_posts p where p.id = a.post_id and p.status <> 'open' and a.status = 'applied' returning a.id, a.user_id)
  insert into ticket_ledger(user_id, delta, reason, ref) select user_id, lock_of(id), 'unlock', id from x where lock_of(id) > 0;
  get diagnostics n = row_count; return n;
end $function$;
CREATE OR REPLACE FUNCTION public.pay_start(p_kind text, p_arg jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(order_id text, amount integer, order_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare amt int; nm text; comp uuid; oid text := 'EV' || to_char(now(), 'YYMMDDHH24MISS') || substr(md5(random()::text), 1, 10); p job_posts;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if p_kind = 'fr_bill' then
    update payments set status = 'ready' where payments.order_id = p_arg->>'order' and user_id = auth.uid() and status = 'due' returning payments.order_id, payments.amount, payments.order_name into oid, amt, nm;
    if oid is null then raise exception '결제할 청구서가 없어요'; end if;
    return query select oid, amt, nm; return;
  end if;
  if p_kind = 'tickets' then
    amt := public.price('ticket_' || (case (p_arg->>'pack')::int when 1 then 1 when 2 then 5 else 10 end)); nm := '지원권 ' || (case (p_arg->>'pack')::int when 1 then 1 when 2 then 5 else 10 end) || '장';
  elsif p_kind = 'pro' then amt := public.price('dealer_pro'); nm := '딜러 PRO 패스 30일';
  elsif p_kind in ('academy', 'plan') then
    select company_id into comp from members where user_id = auth.uid() and role = 'owner' and active limit 1;
    if comp is null then raise exception '대표님만 결제할 수 있어요'; end if;
    if p_kind = 'academy' then
      if (select academy_at from companies where id = comp) is not null then raise exception '이미 이용 중이에요'; end if;
      amt := public.price('academy'); nm := '+EV 딜러 교육 (매장 패키지)';
    else
      if p_arg->>'plan' not in ('pro', 'basic') then raise exception '없는 요금제예요'; end if;
      amt := public.company_plan_price(comp, p_arg->>'plan'); if amt = 0 then raise exception '가입일 기준 6개월 동안 베이직은 무료예요. 무료 시작을 선택해 주세요'; end if;
      nm := case when p_arg->>'plan' = 'basic' then '+EV 베이직 요금제 30일' else '+EV 프로 요금제 30일' end;
    end if;
  elsif p_kind = 'clock' then amt := public.price('clock_monthly'); nm := '+EV 포커 클락 30일 이용권';
  elsif p_kind = 'franchise' then
    if not exists (select 1 from franchise_postings where id = (p_arg->>'post')::uuid and owner_user = auth.uid()) then raise exception '내 가맹 공고만 결제할 수 있어요'; end if;
    amt := public.price('franchise_posting'); nm := '가맹 모집 공고 30일: ' || (select left(brand, 20) from franchise_postings where id = (p_arg->>'post')::uuid);
  elsif p_kind = 'used_boost' then
    if not exists (select 1 from used_items where id = (p_arg->>'item')::uuid and seller = auth.uid() and status <> '판매완료') then raise exception '내 판매 글만 올릴 수 있어요'; end if;
    if p_arg->>'type' = 'urgent' then amt := public.price('used_urgent'); nm := '중고장터 급매 7일'; else amt := public.price('used_top'); nm := '중고장터 상단 노출 3일'; end if;
  elsif p_kind = 'post_extra' then
    select * into p from job_posts where id = (p_arg->>'post')::uuid;
    if p.id is null or not public.can_manage_store(p.store_id) then raise exception '권한이 없어요'; end if;
    if p.kind <> 'hire' or p.status not in ('open', 'closed', 'expired') then raise exception '늘릴 수 없는 공고예요'; end if;
    select company_id into comp from stores where id = p.store_id;
    amt := public.post_extra_fee(p.id, coalesce((p_arg->>'days')::int, 0), coalesce((p_arg->>'top')::boolean, false), coalesce((p_arg->>'jump')::int, 0), coalesce((p_arg->>'flash')::boolean, false));
    nm := '공고 연장·옵션: ' || left(p.title, 30);
  elsif p_kind = 'post' then
    select * into p from job_posts where id = (p_arg->>'post')::uuid;
    if p.id is null or not public.can_manage_store(p.store_id) then raise exception '권한이 없어요'; end if;
    if p.status <> 'unpaid' then raise exception '이미 결제된 공고예요'; end if;
    select company_id into comp from stores where id = p.store_id;
    amt := public.post_fee(p.id); nm := case when p.kind = 'urgent' then '긴급 구인: ' else '구인 공고: ' end || left(p.title, 30);
  end if;
  if amt is null or amt <= 0 then raise exception '없는 상품이에요'; end if;
  insert into payments(order_id, company_id, kind, arg, amount, order_name, tax_invoice) values (oid, comp, p_kind, coalesce(p_arg, '{}'), amt, nm, coalesce((select tax_auto from companies where id = comp), false));
  return query select oid, amt, nm;
end $function$;
CREATE OR REPLACE FUNCTION public.post_fee(p_post uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when p.kind = 'urgent' then tp + fee + public.price('urgent_post') * greatest(p.heads, 1) + case when p.flash then public.price('flash_day') else 0 end
    else public.post_base(p.ad_days) + public.opt_fee(p.top, p.jump_per_day, p.flash, p.ad_days) end
  from job_posts p cross join lateral (select coalesce(sum(pay), 0)::int tp, coalesce(sum(floor(pay * public.price('match_pct') / 100.0 / 10) * 10), 0)::int fee from job_slots where post_id = p.id) t where p.id = p_post $function$;
commit;

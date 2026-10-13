begin;
CREATE OR REPLACE FUNCTION public.apply_job(p_post uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a uuid; st uuid; po job_posts; d date; clash text;
begin
  if exists (select 1 from profiles where id = auth.uid() and (banned_until > now() or deleted_at is not null)) then raise exception '지금은 지원할 수 없는 계정이에요. 운영사에 문의해 주세요'; end if;
  select * into po from job_posts where id=p_post and status='open' and expires_at > now(); st := po.store_id;
  if st is null then raise exception '마감된 공고예요'; end if;
  if public.blocked(st, auth.uid()) then raise exception '이 매장 공고에는 지원할 수 없어요'; end if;
  if po.kind = 'urgent' then
    d := (po.created_at at time zone 'Asia/Seoul')::date;
    select s2.name into clash from job_slots mine join job_posts p2 on p2.id = mine.post_id join stores s2 on s2.id = p2.store_id, job_slots want
    where mine.dealer_id = auth.uid() and mine.status in ('MATCHED','WORKING') and (p2.created_at at time zone 'Asia/Seoul')::date = d and want.post_id = p_post
      and (extract(epoch from mine.start_t)/60) < (extract(epoch from want.end_t)/60 + case when want.end_t <= want.start_t then 1440 else 0 end)
      and (extract(epoch from want.start_t)/60) < (extract(epoch from mine.end_t)/60 + case when mine.end_t <= mine.start_t then 1440 else 0 end) limit 1;
    if clash is not null then raise exception '같은 시간에 % 근무가 잡혀 있어요', clash; end if;
  end if;
  insert into applications(post_id,user_id) values (p_post,auth.uid()) returning id into a;
  
  insert into notifications(user_id,body) select m.user_id, '새 지원자가 있어요' from members m
    join stores s on s.company_id=m.company_id where s.id=st and m.user_id is not null and (m.role='owner' or (m.role='manager' and m.store_id=st));
  return a;
end $function$;
CREATE OR REPLACE FUNCTION public.hire(p_app uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ap applications; po job_posts; sl uuid; msg text;
begin
  select * into ap from applications where id=p_app; select * into po from job_posts where id=ap.post_id;
  if not public.can_manage_store(po.store_id) then raise exception '권한이 없어요'; end if;
  if ap.status <> 'applied' then raise exception '이미 처리된 지원이에요'; end if;
  if public.blocked(po.store_id, ap.user_id) then raise exception '차단한 딜러예요'; end if;
  if po.kind='urgent' then
    select id into sl from job_slots where post_id=po.id and status='OPEN' order by idx limit 1;
    if sl is null then raise exception '남은 자리가 없어요'; end if;
    update job_slots set status='MATCHED', dealer_id=ap.user_id where id=sl;
  end if;
  update applications set status='hired' where id=p_app;
  
  select hire_msg into msg from stores where id = po.store_id;
  insert into notifications(user_id,body) values (ap.user_id,'채용됐어요! 매장 연락처가 열렸어요' || coalesce(' · ' || nullif(trim(msg), ''), ''));
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
  if p_kind = 'tickets' then raise exception '지원권 없이 무료로 무제한 지원할 수 있어요'; end if;
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
    p_arg := p_arg || jsonb_build_object('urgent_match_pct', case when p.kind = 'urgent' and public.company_offer_active(comp) then 0 else public.price('match_pct') end); amt := public.post_fee(p.id); nm := case when p.kind = 'urgent' then '긴급 구인: ' else '구인 공고: ' end || left(p.title, 30);
  end if;
  if amt is null or amt <= 0 then raise exception '없는 상품이에요'; end if;
  insert into payments(order_id, company_id, kind, arg, amount, order_name, tax_invoice) values (oid, comp, p_kind, coalesce(p_arg, '{}'), amt, nm, coalesce((select tax_auto from companies where id = comp), false));
  return query select oid, amt, nm;
end $function$;
do $$ begin
 if pg_get_functiondef('public.apply_job(uuid)'::regprocedure) like '%ticket_ledger%' or pg_get_functiondef('public.apply_job(uuid)'::regprocedure) like '%ticket_balance%' then raise exception '지원권 제한 제거 검증 실패'; end if;
 if pg_get_functiondef('public.pay_start(text,jsonb)'::regprocedure) not like '%지원권 없이 무료로 무제한 지원%' then raise exception '지원권 판매 중단 검증 실패'; end if;
end $$;
commit;
select 'unlimited applications applied and verified' as result;

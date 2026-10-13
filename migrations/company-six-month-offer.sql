-- 가입일의 한국 날짜부터 6개월. 정상 가격표와 이미 결제한 기간은 유지.
begin;
create or replace function public.company_offer_end(joined_at timestamptz)
returns date language sql immutable set search_path = public as $$
  select ((joined_at at time zone 'Asia/Seoul')::date + interval '6 months')::date
$$;
create or replace function public.company_offer_active(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (now() at time zone 'Asia/Seoul')::date >= (created_at at time zone 'Asia/Seoul')::date
    and (now() at time zone 'Asia/Seoul')::date < public.company_offer_end(created_at)
    from companies where id = c), false)
$$;
create or replace function public.company_plan_price(c uuid, requested_plan text)
returns integer language sql stable security definer set search_path = public as $$
  select case when requested_plan not in ('basic', 'pro') then null
    when public.company_offer_active(c) then case when requested_plan = 'basic' then 0 else 9900 end
    else public.price(case when requested_plan = 'basic' then 'basic_monthly' else 'pro_monthly' end) end
$$;
create or replace function public.company_active(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.company_offer_active(c) or coalesce((select
    (plan in ('pro','basic') and coalesce(paid_until + interval '7 days' > now(), false))
    or coalesce(trial_ends >= current_date, false) or coalesce(diag_until > now(), false)
    from companies where id = c), false)
$$;
-- 기존 인증·소유권·다른 상품 처리는 유지하고 회사 플랜 금액만 교체.
do $$
declare body text; old_amount text := 'amt := case when p_arg->>''plan'' = ''basic'' then public.price(''basic_monthly'') else public.price(''pro_monthly'') end;';
begin
  select pg_get_functiondef('public.pay_start(text,jsonb)'::regprocedure) into body;
  if position('amt := public.company_plan_price(comp, p_arg->>''plan'');' in body) = 0 then
    if position(old_amount in body) = 0 then raise exception 'pay_start amount expression changed; migration stopped'; end if;
    body := replace(body, old_amount, 'amt := public.company_plan_price(comp, p_arg->>''plan''); if amt = 0 then raise exception ''가입일 기준 6개월 동안 베이직은 무료예요. 무료 시작을 선택해 주세요''; end if;');
    execute body;
  end if;
end $$;
do $$
begin
  if public.company_offer_end('2026-10-13T00:00:00Z') <> date '2027-04-13'
    or public.company_offer_end('2026-08-31T00:00:00Z') <> date '2027-02-28'
    or public.company_offer_end('2023-08-31T00:00:00Z') <> date '2024-02-29'
    or public.company_offer_end('2026-10-13T16:00:00Z') <> date '2027-04-14' then
    raise exception '가입일/월말/한국 날짜 검증 실패';
  end if;
  if exists(select 1 from companies c where public.company_offer_active(c.id)
    and (not public.company_active(c.id) or public.company_plan_price(c.id, 'basic') <> 0 or public.company_plan_price(c.id, 'pro') <> 9900)) then
    raise exception '회사 혜택 검증 실패';
  end if;
  if exists(select 1 from companies c where not public.company_offer_active(c.id)
    and (public.company_plan_price(c.id, 'basic') <> public.price('basic_monthly') or public.company_plan_price(c.id, 'pro') <> public.price('pro_monthly'))) then
    raise exception '정상 요금 복원 검증 실패';
  end if;
end $$;
commit;
select 'company six-month offer applied and verified' as result;

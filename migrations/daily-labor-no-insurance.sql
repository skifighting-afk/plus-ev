-- 2026-10-23 매장 요청: 인건비는 근무시간 × 시급. 날짜별 인건비(cost)에서 4대보험 사업주분 추정(×1.105) 제거.
DO $m$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.operating_payroll(uuid,date)'::regprocedure) INTO d;
 IF position('*CASE WHEN coalesce(a.pay_snapshot->>''contract'',m.contract::text)=''4대'' THEN 1.105 ELSE 1 END' in d)=0 THEN RAISE EXCEPTION 'pattern not found'; END IF;
 d:=replace(d,'*CASE WHEN coalesce(a.pay_snapshot->>''contract'',m.contract::text)=''4대'' THEN 1.105 ELSE 1 END','');
 EXECUTE d;
END $m$;

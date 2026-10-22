-- 2026-10-23 매장 요청(A안): 식대는 급여 '안에서' 떼는 비과세분. 300 벌면 20 식대 + 280에만 4대보험.
-- 이전: 시급분 + 식대를 더해 지급총액이 커졌음 → 지급총액 = 시급분, 공제 = (지급총액 − 식대)에만. 식대 입력한 직원만 영향.
DO $m$
DECLARE f text; d text;
BEGIN
 FOREACH f IN ARRAY ARRAY['public.actual_payroll(uuid,date)','public.operating_payroll(uuid,date)'] LOOP
  SELECT pg_get_functiondef(f::regprocedure) INTO d;
  IF position('base+np+otp+juhu+hol+inc+meal gross' in d)=0 OR position('erp_deduction(gross-meal,contract)' in d)=0 OR position('+inc+meal projected_gross' in d)=0 THEN RAISE EXCEPTION 'pattern not found in %',f; END IF;
  d:=replace(d,'base+np+otp+juhu+hol+inc+meal gross','base+np+otp+juhu+hol+inc gross');
  d:=replace(d,'erp_deduction(gross-meal,contract)','erp_deduction(greatest(0,gross-meal),contract)');
  d:=replace(d,'+inc+meal projected_gross','+inc projected_gross');
  EXECUTE d;
 END LOOP;
END $m$;

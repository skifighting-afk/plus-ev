-- 2026-10-23 노량진: 직원 정보에서 세금(3.3%→없음)·식대를 바꿔도 근무 입력 당시 기록의 값이 계속 쓰이던 문제.
-- 세금·식대는 매장이 직원 정보에서 고른 '현재 값'을 따른다. 근무 기록(원본)은 그대로 둔다.
DO $m$
DECLARE f text; d text;
 c1 text := $q$coalesce((SELECT w.pay_snapshot->>'contract' FROM records w WHERE w.member_id=m.id AND w.source<>'legacy' AND w.status<>'void' AND date_trunc('month',w.work_date)=date_trunc('month',p_month) ORDER BY w.start_at LIMIT 1),m.contract::text) contract$q$;
 c2 text := $q$ + CASE WHEN count(DISTINCT a.pay_snapshot->>'contract') FILTER(WHERE a.source<>'legacy' AND a.status='confirmed')>1 THEN 1 ELSE 0 END incomplete$q$;
 m1 text := $q$coalesce(coalesce((SELECT (w.pay_snapshot->>'meal')::integer FROM records w WHERE w.member_id=sums.member_id AND w.source<>'legacy' AND w.status<>'void' AND date_trunc('month',w.work_date)=date_trunc('month',p_month) ORDER BY w.start_at LIMIT 1),(SELECT (checks->>'meal')::integer FROM members WHERE id=sums.member_id)),0)$q$;
BEGIN
 FOREACH f IN ARRAY ARRAY['public.actual_payroll(uuid,date)','public.operating_payroll(uuid,date)'] LOOP
  SELECT pg_get_functiondef(f::regprocedure) INTO d;
  IF position(c1 in d)=0 OR position(c2 in d)=0 OR position(m1 in d)=0 THEN RAISE EXCEPTION 'pattern not found in %',f; END IF;
  d:=replace(d,c1,'m.contract::text contract');
  d:=replace(d,c2,' incomplete');
  d:=replace(d,m1,$q$coalesce((SELECT (checks->>'meal')::integer FROM members WHERE id=sums.member_id),0)$q$);
  EXECUTE d;
 END LOOP;
END $m$;

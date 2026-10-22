-- 2026-10-23 노량진: 급여 대장(actual_payroll)이 실제 근무 집계 시작일 이후 '스케줄만 넣은 날'을 빼서
-- 누적 근무 표(operating_payroll)와 시간이 달랐음 (168h vs 99h). 매장 요청("달력에 넣으면 확정")대로
-- 지난 스케줄은 급여에 포함(스케줄만 있는 날을 '미입력'으로 세던 것도 해제). 근무 기록이 있는 날(취소 포함)은 기록을 따른다. 데이터 변경 없음.
DO $m$
DECLARE d text; n int;
 pairs text[][] := ARRAY[
  [$q$ AND d::date<coalesce(st.labor_actual_from,'infinity'::date)$q$, ''],
  [$q$AND w.work_date=d::date AND w.status<>'void')$q$, 'AND w.work_date=d::date)'],
  [$q$UNION ALL SELECT * FROM virtual WHERE start_at IS NOT NULL)$q$, $q$UNION ALL SELECT * FROM virtual WHERE start_at IS NOT NULL AND end_at<=now())$q$],
  [$q$ AND d::date>=coalesce(st.labor_actual_from,'infinity'::date)$q$, ''],
  [$q$AND w.work_date=d::date AND w.status IN ('confirmed','planned') AND w.end_at IS NOT NULL)$q$, 'AND w.work_date=d::date)'],
  [$q$SELECT * FROM future_plans WHERE start_at IS NOT NULL$q$, $q$SELECT * FROM future_plans WHERE start_at IS NOT NULL AND end_at>now()$q$],
  [$q$coalesce((SELECT n FROM missing WHERE member_id=sums.member_id),0) missing_count$q$, '0 missing_count']];
 i int;
BEGIN
 SELECT pg_get_functiondef('public.actual_payroll(uuid,date)'::regprocedure) INTO d;
 FOR i IN 1..array_length(pairs,1) LOOP
  n := (length(d)-length(replace(d,pairs[i][1],'')))/length(pairs[i][1]);
  IF n<1 OR (n>1 AND i<>2) THEN RAISE EXCEPTION 'pattern % found % times',i,n; END IF;
  d := replace(d,pairs[i][1],pairs[i][2]);
 END LOOP;
 EXECUTE d;
END $m$;

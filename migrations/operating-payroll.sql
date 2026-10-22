-- Reporting only: schedule accrual never creates payable work or changes record_pay.
-- Based on actual_payroll (including HQ read authorization), using its pay engine.
-- Explicit ledger records, even void records, suppress the same-day schedule fallback.
CREATE OR REPLACE FUNCTION public.operating_payroll(p_store uuid,p_month date) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요해요'; END IF;
 IF NOT (public.erp_pay_access(p_store) OR public.is_hq()) AND NOT EXISTS(SELECT 1 FROM members WHERE user_id=auth.uid() AND store_id=p_store AND active) THEN RAISE EXCEPTION '급여를 볼 권한이 없어요'; END IF;
 WITH virtual AS (
 SELECT (public.erp_schedule_record(m.id,d::date)).* FROM members m JOIN stores st ON st.id=m.store_id
 CROSS JOIN generate_series(date_trunc('month',p_month)-interval '7 days',date_trunc('month',p_month)+interval '1 month'-interval '1 day',interval '1 day') d
 WHERE m.store_id=p_store AND m.role<>'owner'
 AND NOT EXISTS(SELECT 1 FROM work_records w WHERE w.member_id=m.id AND w.work_date=d::date)
 AND (m.active OR coalesce((m.checks->'out'->>'at')::date,'-infinity'::date)>=d::date)
 ), records AS (SELECT * FROM work_records WHERE store_id=p_store
 UNION ALL SELECT * FROM virtual WHERE start_at IS NOT NULL AND end_at<=now()), future_plans AS (
 SELECT (public.erp_schedule_record(m.id,d::date)).* FROM members m JOIN stores st ON st.id=m.store_id
 CROSS JOIN generate_series(greatest(date_trunc('month',p_month)::date-7,((now() AT TIME ZONE 'Asia/Seoul')-interval '8 hours')::date),date_trunc('month',p_month)+interval '1 month'-interval '1 day',interval '1 day') d
 WHERE m.store_id=p_store AND m.role<>'owner' AND m.active
 AND ((public.erp_pay_access(p_store) OR public.is_hq()) OR m.user_id=auth.uid())
 AND NOT EXISTS(SELECT 1 FROM work_records w WHERE w.member_id=m.id AND w.work_date=d::date)
 ), forecast_records AS (
 SELECT * FROM records UNION ALL SELECT * FROM future_plans WHERE start_at IS NOT NULL AND end_at>now()
 ), forecast_amounts AS (
 SELECT r.*,public.erp_work_amount(r,true) a FROM forecast_records r JOIN members m ON m.id=r.member_id
 WHERE r.work_date>=date_trunc('month',p_month)::date-7 AND r.work_date<(date_trunc('month',p_month)+interval '1 month')::date
 AND ((public.erp_pay_access(p_store) OR public.is_hq()) OR m.user_id=auth.uid())
 ), forecast_week AS (
 SELECT member_id,date_trunc('week',work_date::timestamp)::date+6 ending,sum((a->>'hours')::numeric) h,sum((a->>'base')::numeric) b
 FROM forecast_amounts WHERE coalesce((pay_snapshot->>'labor_law')::boolean,false) GROUP BY member_id,date_trunc('week',work_date::timestamp)
 ), forecast_jh AS (
 SELECT member_id,round(sum(CASE WHEN h>=15 THEN least(h,40)/40*8*b/nullif(h,0) ELSE 0 END)) val FROM forecast_week
 WHERE ending>=date_trunc('month',p_month)::date AND ending<(date_trunc('month',p_month)+interval '1 month')::date GROUP BY member_id
 ), forecasts AS (
 SELECT f.member_id,coalesce(round(sum((f.a->>'base')::numeric)),0)+coalesce(round(sum((f.a->>'np')::numeric)),0)+coalesce(round(sum((f.a->>'otp')::numeric)),0)+coalesce(round(sum((f.a->>'hol')::numeric)),0)+coalesce(max(j.val),0) forecast_base
 FROM forecast_amounts f LEFT JOIN forecast_jh j ON j.member_id=f.member_id WHERE f.work_date>=date_trunc('month',p_month)::date GROUP BY f.member_id
 ), amounts AS (
 SELECT r.*,CASE WHEN r.end_at<=now() THEN public.erp_work_amount(r) ELSE jsonb_build_object('gross',0,'base',0,'np',0,'otp',0,'hol',0,'hours',0) END a FROM records r JOIN members m ON m.id=r.member_id
 WHERE r.store_id=p_store AND r.work_date>=date_trunc('month',p_month)::date-7
 AND r.work_date<(date_trunc('month',p_month)+interval '1 month')::date AND r.status<>'void'
 AND ((public.erp_pay_access(p_store) OR public.is_hq()) OR m.user_id=auth.uid())
 ), week AS (
 SELECT member_id,(date_trunc('week',work_date::timestamp)::date+6) ending,sum((a->>'hours')::numeric) h,sum((a->>'base')::numeric) b
 FROM amounts WHERE status='confirmed' AND end_at<=now() AND coalesce((pay_snapshot->>'labor_law')::boolean,false)
 GROUP BY member_id,date_trunc('week',work_date::timestamp)
 ), jh AS (
 SELECT member_id,round(sum(CASE WHEN h>=15 THEN least(h,40)/40*8*b/nullif(h,0) ELSE 0 END))::integer val
 FROM week WHERE ending>=date_trunc('month',p_month)::date AND ending<(date_trunc('month',p_month)+interval '1 month')::date
 AND ending<=(now() AT TIME ZONE 'Asia/Seoul')::date GROUP BY member_id
 ), sums AS (
 SELECT m.id member_id,coalesce((SELECT w.pay_snapshot->>'contract' FROM records w WHERE w.member_id=m.id AND w.source<>'legacy' AND w.status<>'void' AND date_trunc('month',w.work_date)=date_trunc('month',p_month) ORDER BY w.start_at LIMIT 1),m.contract::text) contract,
 coalesce(round(sum((a.a->>'base')::numeric)),0)::integer base,coalesce(round(sum((a.a->>'np')::numeric)),0)::integer np,
 coalesce(round(sum((a.a->>'otp')::numeric)),0)::integer otp,coalesce(max(jh.val),0) juhu,coalesce(round(sum((a.a->>'hol')::numeric)),0)::integer hol,
 count(a.member_id) FILTER(WHERE a.source<>'legacy') ledger_count,coalesce(sum((a.a->>'hours')::numeric),0) hours,count(a.member_id) FILTER(WHERE coalesce((a.a->>'gross')::numeric,0)>0) days,coalesce(sum(a.break_min),0) brk,
 count(a.member_id) FILTER(WHERE a.status IN ('open','conflict') OR (a.status='planned' AND a.end_at<=now()) OR (a.status='confirmed' AND a.start_at<=now() AND a.end_at>now())) + CASE WHEN count(DISTINCT a.pay_snapshot->>'contract') FILTER(WHERE a.source<>'legacy' AND a.status='confirmed')>1 THEN 1 ELSE 0 END incomplete,
 coalesce(round(sum((a.a->>'gross')::numeric) FILTER(WHERE a.work_date=((now() AT TIME ZONE 'Asia/Seoul')-interval '8 hours')::date)),0)::integer today_gross
 FROM members m LEFT JOIN amounts a ON a.member_id=m.id AND a.work_date>=date_trunc('month',p_month)::date
 LEFT JOIN jh ON jh.member_id=m.id WHERE m.store_id=p_store AND m.role<>'owner'
 AND ((public.erp_pay_access(p_store) OR public.is_hq()) OR m.user_id=auth.uid()) GROUP BY m.id,m.contract
 ), extras AS (
 SELECT sums.*,0 missing_count,coalesce((SELECT sum(amount) FROM incentives WHERE member_id=sums.member_id AND month=date_trunc('month',p_month)::date),0)::integer inc,
 CASE WHEN contract='4대' THEN least(200000,coalesce(coalesce((SELECT (w.pay_snapshot->>'meal')::integer FROM records w WHERE w.member_id=sums.member_id AND w.source<>'legacy' AND w.status<>'void' AND date_trunc('month',w.work_date)=date_trunc('month',p_month) ORDER BY w.start_at LIMIT 1),(SELECT (checks->>'meal')::integer FROM members WHERE id=sums.member_id)),0)) ELSE 0 END meal,
 coalesce((SELECT sum(amount) FROM advances WHERE member_id=sums.member_id AND month=date_trunc('month',p_month)::date),0)::integer adv
 FROM sums), totals AS (SELECT *,base+np+otp+juhu+hol+inc gross FROM extras), net AS (
 SELECT totals.*,public.erp_deduction(greatest(0,gross-meal),contract) ded,coalesce(f.forecast_base,base+np+otp+juhu+hol)+inc projected_gross FROM totals LEFT JOIN forecasts f ON f.member_id=totals.member_id)
 SELECT jsonb_build_object('members',coalesce(jsonb_agg(to_jsonb(net)||jsonb_build_object('incomplete',incomplete+missing_count,'net',gross-ded,'xfer',greatest(0,gross-ded-adv))),'[]'::jsonb),
 'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.date) FROM (
 SELECT a.work_date date,sum((a.a->>'hours')::numeric) hours,round(sum((a.a->>'gross')::numeric)) gross,
 round(sum((a.a->>'gross')::numeric*1)) cost
 FROM amounts a JOIN members m ON m.id=a.member_id
 WHERE a.work_date>=date_trunc('month',p_month)::date AND a.status='confirmed' AND a.end_at<=now()
 GROUP BY a.work_date) d),'[]'::jsonb),
 'gross',coalesce(sum(gross),0),'today_gross',coalesce(sum(today_gross),0),'incomplete',coalesce(sum(incomplete+missing_count),0),'projected_gross',coalesce(sum(projected_gross),0)) INTO result FROM net;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.operating_payroll(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.operating_payroll(uuid,date) TO authenticated;

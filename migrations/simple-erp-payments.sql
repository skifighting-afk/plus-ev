CREATE OR REPLACE FUNCTION public.erp_holiday(p_store uuid,p_date date) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_date::text=ANY(ARRAY['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-03-02','2026-05-05','2026-05-24','2026-05-25','2026-06-03','2026-06-06','2026-08-15','2026-08-17','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-05','2026-10-09','2026-12-25','2027-01-01','2027-02-06','2027-02-07','2027-02-08','2027-02-09','2027-03-01','2027-05-05','2027-05-13','2027-06-06','2027-08-15','2027-08-16','2027-09-14','2027-09-15','2027-09-16','2027-10-03','2027-10-04','2027-10-09','2027-10-11','2027-12-25','2027-12-27']::text[]) OR coalesce((SELECT holidays ? p_date::text FROM stores WHERE id=p_store),false);
$$;
CREATE OR REPLACE FUNCTION public.erp_schedule_record(p_member uuid,p_date date) RETURNS public.work_records
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m members;st stores;t shift_templates;o shift_overrides;r work_records;start_t time;end_t time;br integer;
BEGIN
 SELECT * INTO m FROM members WHERE id=p_member;SELECT * INTO st FROM stores WHERE id=m.store_id;
 SELECT * INTO o FROM shift_overrides WHERE member_id=p_member AND work_date=p_date;
 IF FOUND THEN IF o.off THEN RETURN NULL;END IF;start_t:=o.start_t;end_t:=o.end_t;br:=o.break_min;
 ELSE SELECT * INTO t FROM shift_templates WHERE member_id=p_member AND weekday=(extract(isodow FROM p_date)::integer-1);
 IF NOT FOUND THEN RETURN NULL;END IF;start_t:=t.start_t;end_t:=t.end_t;br:=t.break_min;END IF;
 r.member_id:=p_member;r.store_id:=m.store_id;r.work_date:=p_date;
 IF p_date>=st.labor_actual_from AND start_t<'08:00'::time THEN p_date:=p_date+1;END IF;
 r.start_at:=(p_date+start_t) AT TIME ZONE 'Asia/Seoul';
 r.end_at:=(p_date+end_t+CASE WHEN end_t<=start_t THEN interval '1 day' ELSE interval '0 days' END) AT TIME ZONE 'Asia/Seoul';
 r.break_min:=br;r.source:='legacy';r.status:='confirmed';r.pay_basis:=coalesce(m.checks->>'pay_basis','hourly');
 r.base_rate:=CASE WHEN r.pay_basis='daily' THEN (m.checks->>'daily_rate')::integer ELSE m.hourly_rate END;
 r.pay_snapshot:=jsonb_build_object('contract',m.contract,'night_pay',m.night_pay,'labor_law',coalesce(m.labor_law,m.contract='4대'),'night_start',st.night_start,'night_end',st.night_end);
 RETURN r;
END $$;
-- Server-authoritative actual-work amounts, never supplied by the browser.
CREATE OR REPLACE FUNCTION public.erp_work_amount(r public.work_records,p_include_future boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE mins numeric; br numeric; hrs numeric; nh numeric; rate numeric; base numeric; np numeric; ot numeric; ns time; ne time; hp numeric:=0;
BEGIN
 IF (r.status<>'confirmed' AND NOT(p_include_future AND r.status='planned')) OR r.end_at IS NULL OR (r.end_at>now() AND r.source<>'legacy' AND NOT p_include_future) THEN RETURN jsonb_build_object('gross',0,'base',0,'np',0,'otp',0,'hours',0,'incomplete',1); END IF;
 mins:=extract(epoch FROM(r.end_at-r.start_at))/60;
 br:=coalesce(r.break_min,CASE WHEN mins>=480 THEN 60 WHEN mins>=240 THEN 30 ELSE 0 END);
 IF mins<=0 OR mins>1440 OR br<0 OR br>=mins THEN RAISE EXCEPTION '근무·휴게시간을 확인해 주세요'; END IF;
 hrs:=(mins-br)/60;ns:=coalesce((r.pay_snapshot->>'night_start')::time,'22:00');ne:=coalesce((r.pay_snapshot->>'night_end')::time,'06:00');
 SELECT count(*) INTO nh FROM generate_series(date_trunc('minute',r.start_at),date_trunc('minute',r.end_at)-interval '1 minute',interval '1 minute') t
 WHERE CASE WHEN ns>ne THEN (t AT TIME ZONE 'Asia/Seoul')::time>=ns OR (t AT TIME ZONE 'Asia/Seoul')::time<ne
 ELSE (t AT TIME ZONE 'Asia/Seoul')::time>=ns AND (t AT TIME ZONE 'Asia/Seoul')::time<ne END;
 nh:=nh*(mins-br)/mins/60;
 base:=CASE WHEN r.pay_basis='daily' THEN r.base_rate ELSE hrs*r.base_rate END;
 rate:=CASE WHEN r.pay_basis='daily' THEN base/hrs ELSE r.base_rate END;
 np:=CASE WHEN coalesce((r.pay_snapshot->>'night_pay')::boolean,false) THEN nh*rate*.5 ELSE 0 END;
 ot:=CASE WHEN coalesce((r.pay_snapshot->>'labor_law')::boolean,false) THEN greatest(0,hrs-8)*rate*.5 ELSE 0 END;
 IF coalesce((r.pay_snapshot->>'labor_law')::boolean,false) AND coalesce((r.pay_snapshot->>'five')::boolean,(SELECT (equip->>'five')::boolean FROM stores WHERE id=r.store_id),false) AND coalesce((r.pay_snapshot->>'is_holiday')::boolean,public.erp_holiday(r.store_id,r.work_date)) THEN hp:=least(8,hrs)*rate*.5+greatest(0,hrs-8)*rate; END IF;
 RETURN jsonb_build_object('hol',hp,'base',base,'np',np,'otp',ot,'hours',hrs,'gross',round(base+np+ot+hp),'incomplete',0);
END $$;
CREATE OR REPLACE FUNCTION public.erp_deduction(g numeric,c text) RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN c='4대' THEN (floor(g*.0475/10)*10+floor(g*.03595/10)*10+floor(floor(g*.03595/10)*10*.1314/10)*10+floor(g*.009/10)*10)::integer
 ELSE (floor(g*.03/10)*10+floor(floor(g*.03/10)*10*.1/10)*10)::integer END;
$$;

CREATE OR REPLACE FUNCTION public.actual_payroll(p_store uuid,p_month date) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.erp_pay_access(p_store) AND NOT EXISTS(SELECT 1 FROM members WHERE user_id=auth.uid() AND store_id=p_store AND active) THEN RAISE EXCEPTION '급여를 볼 권한이 없어요'; END IF;
 WITH virtual AS (
 SELECT (public.erp_schedule_record(m.id,d::date)).* FROM members m JOIN stores st ON st.id=m.store_id
 CROSS JOIN generate_series(date_trunc('month',p_month)-interval '7 days',date_trunc('month',p_month)+interval '1 month'-interval '1 day',interval '1 day') d
 WHERE m.store_id=p_store AND m.role<>'owner' AND d::date<coalesce(st.labor_actual_from,'infinity'::date)
 AND NOT EXISTS(SELECT 1 FROM work_records w WHERE w.member_id=m.id AND w.work_date=d::date AND w.status<>'void')
 AND (m.active OR coalesce((m.checks->'out'->>'at')::date,'-infinity'::date)>=d::date)
 ), records AS (SELECT * FROM work_records WHERE store_id=p_store
 UNION ALL SELECT * FROM virtual WHERE start_at IS NOT NULL), future_plans AS (
 SELECT (public.erp_schedule_record(m.id,d::date)).* FROM members m JOIN stores st ON st.id=m.store_id
 CROSS JOIN generate_series(greatest(date_trunc('month',p_month)::date-7,((now() AT TIME ZONE 'Asia/Seoul')-interval '8 hours')::date),date_trunc('month',p_month)+interval '1 month'-interval '1 day',interval '1 day') d
 WHERE m.store_id=p_store AND m.role<>'owner' AND m.active AND d::date>=coalesce(st.labor_actual_from,'infinity'::date)
 AND (public.erp_pay_access(p_store) OR m.user_id=auth.uid())
 AND NOT EXISTS(SELECT 1 FROM work_records w WHERE w.member_id=m.id AND w.work_date=d::date AND w.status IN ('confirmed','planned') AND w.end_at IS NOT NULL)
 ), forecast_records AS (
 SELECT * FROM records UNION ALL SELECT * FROM future_plans WHERE start_at IS NOT NULL
 ), forecast_amounts AS (
 SELECT r.*,public.erp_work_amount(r,true) a FROM forecast_records r JOIN members m ON m.id=r.member_id
 WHERE r.work_date>=date_trunc('month',p_month)::date-7 AND r.work_date<(date_trunc('month',p_month)+interval '1 month')::date
 AND (public.erp_pay_access(p_store) OR m.user_id=auth.uid())
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
 SELECT r.*,public.erp_work_amount(r) a FROM records r JOIN members m ON m.id=r.member_id
 WHERE r.store_id=p_store AND r.work_date>=date_trunc('month',p_month)::date-7
 AND r.work_date<(date_trunc('month',p_month)+interval '1 month')::date AND r.status<>'void'
 AND (public.erp_pay_access(p_store) OR m.user_id=auth.uid())
 ), week AS (
 SELECT member_id,(date_trunc('week',work_date::timestamp)::date+6) ending,sum((a->>'hours')::numeric) h,sum((a->>'base')::numeric) b
 FROM amounts WHERE status='confirmed' AND (end_at<=now() OR source='legacy') AND coalesce((pay_snapshot->>'labor_law')::boolean,false)
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
 AND (public.erp_pay_access(p_store) OR m.user_id=auth.uid()) GROUP BY m.id,m.contract
 ), missing AS (
 SELECT m.id member_id,count(*) n FROM members m JOIN stores st ON st.id=m.store_id
 CROSS JOIN generate_series(date_trunc('month',p_month),least(date_trunc('month',p_month)+interval '1 month'-interval '1 day',now() AT TIME ZONE 'Asia/Seoul'),interval '1 day') d
 CROSS JOIN LATERAL public.erp_schedule_record(m.id,d::date) r
 WHERE m.store_id=p_store AND m.role<>'owner' AND m.active AND d::date>=st.labor_actual_from AND r.start_at<=now()
 AND NOT EXISTS(SELECT 1 FROM work_records w WHERE w.member_id=m.id AND w.work_date=d::date AND w.status<>'void')
 GROUP BY m.id
 ), extras AS (
 SELECT sums.*,coalesce((SELECT n FROM missing WHERE member_id=sums.member_id),0) missing_count,coalesce((SELECT sum(amount) FROM incentives WHERE member_id=sums.member_id AND month=date_trunc('month',p_month)::date),0)::integer inc,
 CASE WHEN contract='4대' THEN least(200000,coalesce(coalesce((SELECT (w.pay_snapshot->>'meal')::integer FROM records w WHERE w.member_id=sums.member_id AND w.source<>'legacy' AND w.status<>'void' AND date_trunc('month',w.work_date)=date_trunc('month',p_month) ORDER BY w.start_at LIMIT 1),(SELECT (checks->>'meal')::integer FROM members WHERE id=sums.member_id)),0)) ELSE 0 END meal,
 coalesce((SELECT sum(amount) FROM advances WHERE member_id=sums.member_id AND month=date_trunc('month',p_month)::date),0)::integer adv
 FROM sums), totals AS (SELECT *,base+np+otp+juhu+hol+inc+meal gross FROM extras), net AS (
 SELECT totals.*,public.erp_deduction(gross-meal,contract) ded,coalesce(f.forecast_base,base+np+otp+juhu+hol)+inc+meal projected_gross FROM totals LEFT JOIN forecasts f ON f.member_id=totals.member_id)
 SELECT jsonb_build_object('members',coalesce(jsonb_agg(to_jsonb(net)||jsonb_build_object('incomplete',incomplete+missing_count,'net',gross-ded,'xfer',greatest(0,gross-ded-adv))),'[]'::jsonb),
 'gross',coalesce(sum(gross),0),'today_gross',coalesce(sum(today_gross),0),'incomplete',coalesce(sum(incomplete+missing_count),0),'projected_gross',coalesce(sum(projected_gross),0)) INTO result FROM net;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.record_pay(p_request uuid,p_store uuid,p_work_ids uuid[],p_method text,p_business_date date,p_member uuid DEFAULT NULL,p_month date DEFAULT NULL) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r work_records; payment work_payments; pid uuid; summary jsonb; gross integer; ded integer; net integer; prev_g integer;prev_d integer;prev_n integer;
BEGIN
 IF NOT public.erp_pay_access(p_store) THEN RAISE EXCEPTION '급여 관리 권한이 없어요'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('erp:'||p_store::text));
 SELECT * INTO payment FROM work_payments WHERE request_id=p_request;
 IF FOUND THEN
 IF payment.store_id<>p_store OR payment.work_ids<>p_work_ids OR payment.method<>p_method OR (p_member IS NOT NULL AND payment.member_id<>p_member) OR (p_month IS NOT NULL AND payment.period_month<>date_trunc('month',p_month)::date) THEN RAISE EXCEPTION '다른 내용으로 사용한 요청이에요'; END IF;
 RETURN payment.id; END IF;
 IF p_request IS NULL OR p_method IS NULL OR p_method NOT IN ('cash','transfer') OR p_business_date IS NULL OR p_work_ids IS NULL OR (cardinality(p_work_ids)=0 AND (p_member IS NULL OR p_month IS NULL)) THEN RAISE EXCEPTION '지급할 근무와 지급 수단을 확인해 주세요'; END IF;
 IF cardinality(p_work_ids)>0 THEN
 SELECT * INTO r FROM work_records WHERE id=p_work_ids[1] AND store_id=p_store;
 IF NOT FOUND THEN RAISE EXCEPTION '근무 기록을 찾지 못했어요'; END IF;
 IF (p_member IS NOT NULL AND p_member<>r.member_id) OR (p_month IS NOT NULL AND date_trunc('month',p_month)<>date_trunc('month',r.work_date)) THEN RAISE EXCEPTION '직원·정산 월을 확인해 주세요';END IF;
 ELSE r.member_id:=p_member;r.store_id:=p_store;r.work_date:=date_trunc('month',p_month)::date;END IF;
 PERFORM public.erp_work_guard(p_store,r.member_id,r.work_date,true);
 IF EXISTS(SELECT 1 FROM pay_marks WHERE member_id=r.member_id AND month=date_trunc('month',r.work_date)::date AND paid_at IS NOT NULL) THEN RAISE EXCEPTION '기존 급여 대장에 지급 완료 표시가 있어요. 중복 지급 여부를 확인해 주세요'; END IF;
 IF EXISTS(SELECT 1 FROM work_records WHERE id=ANY(p_work_ids) AND (store_id<>p_store OR member_id<>r.member_id OR date_trunc('month',work_date)<>date_trunc('month',r.work_date)))
 OR EXISTS(SELECT 1 FROM work_records WHERE id=ANY(p_work_ids) AND (status<>'confirmed' OR end_at IS NULL OR end_at>now()))
 OR (SELECT count(*) FROM work_records WHERE id=ANY(p_work_ids))<>cardinality(p_work_ids)
 OR EXISTS(SELECT 1 FROM work_payments WHERE status='paid' AND work_ids&&p_work_ids) THEN RAISE EXCEPTION '다른 매장·달·직원이거나 이미 지급한 근무가 있어요'; END IF;
 IF EXISTS(SELECT 1 FROM work_records w WHERE w.member_id=r.member_id AND date_trunc('month',w.work_date)=date_trunc('month',r.work_date) AND w.status<>'void'
 AND (w.status IN ('open','conflict') OR (w.status='planned' AND w.end_at<=now()) OR w.end_at IS NULL OR (w.start_at<=now() AND w.end_at>now()))) THEN RAISE EXCEPTION '미완료·겹침 근무를 먼저 확인해 주세요'; END IF;
 IF EXISTS(SELECT 1 FROM work_records w WHERE w.member_id=r.member_id AND date_trunc('month',w.work_date)=date_trunc('month',r.work_date) AND w.status='confirmed' AND w.end_at<=now()
 AND NOT w.id=ANY(p_work_ids) AND NOT EXISTS(SELECT 1 FROM work_payments p WHERE p.status='paid' AND w.id=ANY(p.work_ids))) THEN RAISE EXCEPTION '같은 달의 미지급 근무를 함께 선택해 주세요'; END IF;
 summary:=public.actual_payroll(p_store,r.work_date);
 SELECT x INTO summary FROM jsonb_array_elements(summary->'members') x WHERE x->>'member_id'=r.member_id::text;
 SELECT coalesce(sum(amount_gross),0),coalesce(sum(amount_deduction),0),coalesce(sum(amount_net),0) INTO prev_g,prev_d,prev_n FROM work_payments
 WHERE store_id=p_store AND member_id=r.member_id AND period_month=date_trunc('month',r.work_date)::date AND status='paid';
 IF coalesce((summary->>'incomplete')::integer,0)>0 THEN RAISE EXCEPTION '누락 근무·계약 기준을 먼저 확인해 주세요';END IF;
 gross:=(summary->>'gross')::integer-prev_g;ded:=(summary->>'ded')::integer-prev_d;net:=(summary->>'xfer')::integer-prev_n;
 IF gross<0 OR ded<0 OR net<=0 THEN RAISE EXCEPTION '기존 지급액과 근무 금액을 대조해 주세요'; END IF;
 INSERT INTO work_payments(request_id,store_id,member_id,work_ids,work_date,period_month,amount_gross,amount_deduction,amount_net,method,status,created_by)
 VALUES(p_request,p_store,r.member_id,p_work_ids,p_business_date,date_trunc('month',r.work_date)::date,gross,ded,net,p_method,'paid',auth.uid()) RETURNING id INTO pid;
 IF p_method='cash' THEN INSERT INTO cash_movements(request_id,store_id,business_date,direction,amount,reason,source,payment_id,created_by)
 VALUES(p_request,p_store,p_business_date,'out',net,'급여 현금 지급','payroll',pid,auth.uid());END IF;
 RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_pay(p_request uuid,p_payment uuid,p_reason text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p work_payments; c cash_movements; result uuid;
BEGIN
 SELECT * INTO p FROM work_payments WHERE id=p_payment;
 IF NOT FOUND OR NOT public.erp_pay_access(p.store_id) THEN RAISE EXCEPTION '급여 관리 권한이 없어요'; END IF;
 PERFORM public.erp_work_guard(p.store_id,p.member_id,p.period_month,true);
 SELECT * INTO p FROM work_payments WHERE id=p_payment FOR UPDATE;
 IF p.status='reversed' THEN RETURN p.reversed_by_id;END IF;
 IF p_request IS NULL OR coalesce(length(trim(p_reason)),0)=0 THEN RAISE EXCEPTION '취소 사유를 입력해 주세요';END IF;
 result:=gen_random_uuid();
 SELECT * INTO c FROM cash_movements WHERE payment_id=p_payment;
 IF FOUND THEN INSERT INTO cash_movements(id,request_id,store_id,business_date,direction,amount,reason,source,reverses_id,created_by)
 VALUES(result,p_request,p.store_id,((now() AT TIME ZONE 'Asia/Seoul')-interval '8 hours')::date,'in',p.amount_net,p_reason,'reversal',c.id,auth.uid());END IF;
 UPDATE work_payments SET status='reversed',reversed_by_id=result,reason=p_reason,reversed_by=auth.uid(),reversed_at=now() WHERE id=p_payment;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.record_cash(p_request uuid,p_store uuid,p_date date,p_direction text,p_amount integer,p_reason text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior cash_movements; result uuid;
BEGIN
 IF NOT public.erp_pay_access(p_store) THEN RAISE EXCEPTION '금고 관리 권한이 없어요';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('erp:'||p_store::text));
 IF NOT public.company_active((SELECT company_id FROM stores WHERE id=p_store)) THEN RAISE EXCEPTION '매장 이용 상태를 확인해 주세요';END IF;
 SELECT * INTO prior FROM cash_movements WHERE request_id=p_request;
 IF FOUND THEN IF prior.store_id<>p_store OR prior.business_date<>p_date OR prior.amount<>p_amount OR prior.direction<>p_direction OR prior.reason<>p_reason THEN RAISE EXCEPTION '다른 내용으로 사용한 요청이에요';END IF; RETURN prior.id;END IF;
 IF p_request IS NULL OR p_date IS NULL OR p_direction IS NULL OR p_direction NOT IN ('in','out') OR p_amount IS NULL OR p_amount<=0 OR coalesce(length(trim(p_reason)),0)=0 THEN RAISE EXCEPTION '입출금 날짜·금액·사유를 확인해 주세요';END IF;
 INSERT INTO cash_movements(request_id,store_id,business_date,direction,amount,reason,source,created_by)
 VALUES(p_request,p_store,p_date,p_direction,p_amount,trim(p_reason),'owner',auth.uid()) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.reverse_cash(p_request uuid,p_movement uuid,p_reason text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c cash_movements; result uuid;
BEGIN
 SELECT * INTO c FROM cash_movements WHERE id=p_movement;
 IF NOT FOUND OR NOT public.erp_pay_access(c.store_id) THEN RAISE EXCEPTION '금고 관리 권한이 없어요';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('erp:'||c.store_id::text));
 SELECT id INTO result FROM cash_movements WHERE reverses_id=p_movement;
 IF FOUND THEN RETURN result;END IF;
 IF c.source IN ('payroll','reversal') THEN RAISE EXCEPTION '급여 취소는 지급 기록에서 진행해 주세요';END IF;
 IF p_request IS NULL OR coalesce(length(trim(p_reason)),0)=0 THEN RAISE EXCEPTION '취소 사유를 입력해 주세요';END IF;
 INSERT INTO cash_movements(request_id,store_id,business_date,direction,amount,reason,source,reverses_id,created_by)
 VALUES(p_request,c.store_id,((now() AT TIME ZONE 'Asia/Seoul')-interval '8 hours')::date,CASE WHEN c.direction='in' THEN 'out' ELSE 'in' END,c.amount,p_reason,'reversal',c.id,auth.uid()) RETURNING id INTO result;
 RETURN result;
END $$;

DO $permissions$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('erp_work_amount','erp_deduction','erp_holiday','erp_schedule_record','actual_payroll','record_pay','reverse_pay','record_cash','reverse_cash') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
 IF f.proname NOT IN ('erp_work_amount','erp_deduction','erp_holiday','erp_schedule_record') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END IF;
 END LOOP;
END $permissions$;

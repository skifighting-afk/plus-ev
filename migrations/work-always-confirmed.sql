-- 2026-10-23 노량진 요청: '예정/확정' 단계 없애기. 달력·근무 추가로 넣은 근무는 바로 확정.
-- 미래 근무는 erp_work_amount가 시간이 지나기 전까지 0으로 계산하므로 미리 잡히지 않는다. 기존 기록은 건드리지 않는다.
CREATE OR REPLACE FUNCTION public.record_work(p_request uuid, p_store uuid, p_member uuid, p_date date, p_start timestamp with time zone, p_end timestamp with time zone, p_break integer, p_revision integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE m members; prior work_records; result uuid; snap jsonb;
BEGIN
 PERFORM public.erp_work_guard(p_store,p_member,p_date,p_end<=now());
 IF NOT public.company_active((SELECT company_id FROM stores WHERE id=p_store)) THEN RAISE EXCEPTION '매장 이용 상태를 확인해 주세요';END IF;
 IF p_request IS NULL OR p_date IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end>p_start+interval '24 hours'
 OR p_break IS NULL OR p_break<0 OR p_break>=extract(epoch FROM(p_end-p_start))/60 THEN RAISE EXCEPTION '날짜·근무시간·휴게시간을 확인해 주세요'; END IF;
 IF abs(p_date-(p_start AT TIME ZONE 'Asia/Seoul')::date)>1 THEN RAISE EXCEPTION '근무일과 출근 날짜를 확인해 주세요'; END IF;
 SELECT * INTO prior FROM work_records WHERE request_id=p_request;
 IF FOUND THEN
   IF prior.store_id<>p_store OR prior.member_id<>p_member OR prior.start_at<>p_start OR prior.end_at<>p_end OR prior.break_min<>p_break THEN RAISE EXCEPTION '다른 내용으로 사용한 요청이에요'; END IF;
   RETURN prior.id;
 END IF;
 IF p_revision IS NOT NULL THEN RAISE EXCEPTION '기존 근무 보정은 기록을 확인한 뒤 진행해 주세요'; END IF;
 IF EXISTS(SELECT 1 FROM work_records WHERE member_id=p_member AND status<>'void' AND start_at<p_end AND coalesce(end_at,'infinity'::timestamptz)>p_start)
 OR EXISTS(SELECT 1 FROM attendance a WHERE a.member_id=p_member AND a.at>=p_start AND a.at<=p_end AND NOT EXISTS(SELECT 1 FROM work_records w WHERE w.status='void' AND w.member_id=p_member AND a.id IN(w.attendance_in_id,w.attendance_out_id))) THEN RAISE EXCEPTION '겹치는 출퇴근·근무 기록이 있어요. 기존 기록을 확인해 주세요'; END IF;
 SELECT * INTO m FROM members WHERE id=p_member;
 snap:=jsonb_build_object('contract',m.contract,'night_pay',m.night_pay,'labor_law',coalesce(m.labor_law,m.contract='4대'),
 'hourly_rate',m.hourly_rate,'meal',coalesce((m.checks->>'meal')::integer,0),'five',coalesce((SELECT (equip->>'five')::boolean FROM stores WHERE id=p_store),false),'is_holiday',public.erp_holiday(p_store,p_date),'night_start',(SELECT night_start FROM stores WHERE id=p_store),'night_end',(SELECT night_end FROM stores WHERE id=p_store));
 INSERT INTO work_records(request_id,store_id,member_id,work_date,start_at,end_at,break_min,source,status,pay_basis,base_rate,pay_snapshot,created_by)
 VALUES(p_request,p_store,p_member,p_date,p_start,p_end,p_break,'manual','confirmed',coalesce(m.checks->>'pay_basis','hourly'),
 CASE WHEN m.checks->>'pay_basis'='daily' THEN (m.checks->>'daily_rate')::integer ELSE m.hourly_rate END,snap,auth.uid()) RETURNING id INTO result;
 RETURN result;
END $function$;

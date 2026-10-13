CREATE OR REPLACE FUNCTION public.erp_capture_attendance() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m members; st stores; r work_records; day date; snap jsonb; state text; overlap boolean;
BEGIN
 SELECT * INTO m FROM members WHERE id=NEW.member_id;
 SELECT * INTO st FROM stores WHERE id=NEW.store_id;
 IF st.labor_actual_from IS NULL THEN RETURN NEW;END IF;
 day:=((NEW.at AT TIME ZONE 'Asia/Seoul')-interval '8 hours')::date;
 IF day<st.labor_actual_from THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtext('erp:'||NEW.store_id::text));
 snap:=jsonb_build_object('contract',m.contract,'hourly_rate',m.hourly_rate,'night_pay',m.night_pay,
 'labor_law',coalesce(m.labor_law,m.contract='4대'),'meal',coalesce((m.checks->>'meal')::integer,0),'five',coalesce((st.equip->>'five')::boolean,false),'is_holiday',public.erp_holiday(NEW.store_id,day),'night_start',st.night_start,'night_end',st.night_end);
 IF NEW.kind='in' THEN
 INSERT INTO work_records(request_id,store_id,member_id,work_date,start_at,source,status,attendance_in_id,pay_basis,base_rate,pay_snapshot,created_by)
 VALUES(gen_random_uuid(),NEW.store_id,NEW.member_id,day,date_trunc('minute',NEW.at),'qr','open',NEW.id,
 coalesce(m.checks->>'pay_basis','hourly'),CASE WHEN m.checks->>'pay_basis'='daily' THEN (m.checks->>'daily_rate')::integer ELSE m.hourly_rate END,snap,coalesce(auth.uid(),m.user_id))
 ON CONFLICT(attendance_in_id) DO NOTHING;
 ELSE
 SELECT * INTO r FROM work_records WHERE member_id=NEW.member_id AND store_id=NEW.store_id AND source='qr' AND status='open' AND end_at IS NULL AND start_at<NEW.at ORDER BY start_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
 overlap:=EXISTS(SELECT 1 FROM work_records w WHERE w.id<>r.id AND w.member_id=r.member_id AND w.status<>'void' AND w.start_at<NEW.at AND coalesce(w.end_at,'infinity'::timestamptz)>r.start_at);
 state:=CASE WHEN overlap OR date_trunc('minute',NEW.at)<=r.start_at OR NEW.at>r.start_at+interval '24 hours'
 OR EXISTS(SELECT 1 FROM pay_locks WHERE store_id=r.store_id AND month=date_trunc('month',r.work_date)::date AND on_) THEN 'conflict' ELSE 'confirmed' END;
 IF NEW.at<=r.start_at+interval '24 hours' AND date_trunc('minute',NEW.at)>r.start_at THEN
 UPDATE work_records SET end_at=date_trunc('minute',NEW.at),attendance_out_id=NEW.id,status=state,revision=revision+1 WHERE id=r.id;
 ELSE UPDATE work_records SET status='conflict',attendance_out_id=NEW.id,revision=revision+1 WHERE id=r.id;END IF;
 END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.erp_capture_attendance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER erp_attendance_ledger AFTER INSERT ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.erp_capture_attendance();

CREATE OR REPLACE FUNCTION public.erp_enable_actual(p_store uuid) RETURNS date
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE day date;
BEGIN
 IF NOT public.is_company_owner((SELECT company_id FROM stores WHERE id=p_store)) THEN RAISE EXCEPTION '대표님만 실제 근무 집계를 시작할 수 있어요';END IF;
 day:=(now() AT TIME ZONE 'Asia/Seoul')::date;
 UPDATE stores SET labor_actual_from=coalesce(labor_actual_from,day) WHERE id=p_store RETURNING labor_actual_from INTO day;
 RETURN day;
END $$;
REVOKE ALL ON FUNCTION public.erp_enable_actual(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_enable_actual(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_void_work(p_request uuid,p_work uuid,p_reason text,p_revision integer) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r work_records;
BEGIN
 SELECT * INTO r FROM work_records WHERE id=p_work;
 IF NOT FOUND THEN RAISE EXCEPTION '근무를 찾지 못했어요';END IF;
 PERFORM public.erp_work_guard(r.store_id,r.member_id,r.work_date,true);
 SELECT * INTO r FROM work_records WHERE id=p_work FOR UPDATE;
 IF r.status='void' AND r.pay_snapshot->>'void_request'=p_request::text THEN RETURN r.id;END IF;
 IF r.revision<>p_revision OR r.status='void' THEN RAISE EXCEPTION '근무 기록이 바뀌었어요. 새로고침 후 확인해 주세요';END IF;
 IF coalesce(length(trim(p_reason)),0)=0 OR p_request IS NULL THEN RAISE EXCEPTION '취소 사유를 입력해 주세요';END IF;
 IF EXISTS(SELECT 1 FROM work_payments WHERE status='paid' AND r.id=ANY(work_ids)) THEN RAISE EXCEPTION '지급을 먼저 취소한 뒤 근무를 수정해 주세요';END IF;
 UPDATE work_records SET status='void',revision=revision+1,pay_snapshot=pay_snapshot||jsonb_build_object('void_reason',p_reason,'void_by',auth.uid(),'void_at',now(),'void_request',p_request)
 WHERE id=r.id;
 RETURN r.id;
END $$;
REVOKE ALL ON FUNCTION public.erp_void_work(uuid,uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_void_work(uuid,uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_copy_week(p_store uuid,p_source date,p_target date,p_members uuid[]) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE mid uuid;d integer;r work_records;o shift_overrides;target date;n integer:=0;
BEGIN
 IF NOT public.can_manage_store(p_store) THEN RAISE EXCEPTION '매장 관리 권한이 없어요';END IF;
 IF p_source IS NULL OR p_target IS NULL OR p_source=p_target OR coalesce(cardinality(p_members),0)=0 THEN RAISE EXCEPTION '복사할 주와 직원을 확인해 주세요';END IF;
 IF NOT public.company_active((SELECT company_id FROM stores WHERE id=p_store)) THEN RAISE EXCEPTION '매장 이용 상태를 확인해 주세요';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('erp:'||p_store::text));
 FOREACH mid IN ARRAY p_members LOOP
 IF NOT EXISTS(SELECT 1 FROM members WHERE id=mid AND store_id=p_store AND active AND role<>'owner') THEN RAISE EXCEPTION '다른 매장의 직원이 있어요';END IF;
 FOR d IN 0..6 LOOP
 target:=p_target+d;
 IF EXISTS(SELECT 1 FROM pay_locks WHERE store_id=p_store AND month=date_trunc('month',target)::date AND on_) THEN RAISE EXCEPTION '급여 마감된 기간이에요';END IF;
 r:=public.erp_schedule_record(mid,p_source+d);IF r.start_at IS NULL THEN CONTINUE;END IF;
 SELECT * INTO o FROM shift_overrides WHERE member_id=mid AND work_date=target;
 IF FOUND THEN
 IF NOT o.off AND o.start_t=(r.start_at AT TIME ZONE 'Asia/Seoul')::time AND o.end_t=(r.end_at AT TIME ZONE 'Asia/Seoul')::time AND o.break_min IS NOT DISTINCT FROM r.break_min THEN CONTINUE;END IF;
 RAISE EXCEPTION '기존 근무가 있는 날짜는 덮어쓰지 않아요: %',target;
 END IF;
 INSERT INTO shift_overrides(member_id,work_date,start_t,end_t,break_min,off)
 VALUES(mid,target,(r.start_at AT TIME ZONE 'Asia/Seoul')::time,(r.end_at AT TIME ZONE 'Asia/Seoul')::time,r.break_min,false);
 n:=n+1;
 END LOOP;END LOOP;RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.erp_copy_week(uuid,date,date,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_copy_week(uuid,date,date,uuid[]) TO authenticated;

-- Direct legacy pay-lock writes participate in the same transaction serialization.
CREATE OR REPLACE FUNCTION public.erp_lock_pay_period() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('erp:'||CASE WHEN TG_OP='DELETE' THEN OLD.store_id ELSE NEW.store_id END::text));
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.erp_lock_pay_period() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER erp_pay_lock_serial BEFORE INSERT OR UPDATE OR DELETE ON public.pay_locks FOR EACH ROW EXECUTE FUNCTION public.erp_lock_pay_period();

CREATE OR REPLACE FUNCTION public.erp_confirm_work(p_request uuid,p_work uuid,p_revision integer) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r work_records;
BEGIN
 SELECT * INTO r FROM work_records WHERE id=p_work;
 IF NOT FOUND THEN RAISE EXCEPTION '근무를 찾지 못했어요';END IF;
 PERFORM public.erp_work_guard(r.store_id,r.member_id,r.work_date,true);
 SELECT * INTO r FROM work_records WHERE id=p_work FOR UPDATE;
 IF r.status='confirmed' AND r.pay_snapshot->>'confirm_request'=p_request::text THEN RETURN r.id;END IF;
 IF r.status<>'planned' OR r.revision<>p_revision OR r.end_at>now() THEN RAISE EXCEPTION '근무가 끝난 뒤 완료를 확인해 주세요';END IF;
 IF EXISTS(SELECT 1 FROM work_records w WHERE w.id<>r.id AND w.member_id=r.member_id AND w.status<>'void' AND w.start_at<r.end_at AND coalesce(w.end_at,'infinity'::timestamptz)>r.start_at) THEN RAISE EXCEPTION '겹치는 실제 근무를 먼저 확인해 주세요';END IF;
 UPDATE work_records SET status='confirmed',revision=revision+1,pay_snapshot=pay_snapshot||jsonb_build_object('confirmed_by',auth.uid(),'confirmed_at',now(),'confirm_request',p_request) WHERE id=r.id;
 RETURN r.id;
END $$;
REVOKE ALL ON FUNCTION public.erp_confirm_work(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_confirm_work(uuid,uuid,integer) TO authenticated;

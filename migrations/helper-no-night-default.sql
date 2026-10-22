-- 2026-10-23 파이널나인 요청: '근무 추가 › 새 헬퍼'로 만든 헬퍼에 야간수당(1.5배)이 화면 표시 없이 켜지던 문제.
-- 헬퍼(3.3)는 근무시간 × 시급이 기본. 야간수당이 필요하면 직원 화면에서 직접 켠다.
-- 기존 직원·근무 기록은 건드리지 않는다 (새로 만드는 헬퍼부터 적용).
CREATE OR REPLACE FUNCTION public.register_helper_work(p_request uuid, p_store uuid, p_member uuid, p_nick text, p_basis text, p_amount integer, p_date date, p_start timestamp with time zone, p_end timestamp with time zone, p_break integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE mid uuid; result uuid; old work_records;
BEGIN
 IF NOT public.erp_pay_access(p_store) THEN RAISE EXCEPTION '급여 관리 권한이 없어요'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('erp:'||p_store::text));
 SELECT * INTO old FROM work_records WHERE request_id=p_request;
 IF FOUND THEN
 IF old.store_id<>p_store OR (p_member IS NOT NULL AND old.member_id<>p_member) OR old.pay_basis<>p_basis OR old.base_rate<>p_amount OR old.work_date<>p_date OR old.start_at<>p_start OR old.end_at<>p_end OR old.break_min<>p_break THEN RAISE EXCEPTION '다른 요청이에요'; END IF;
 RETURN old.id; END IF;
 IF p_basis IS NULL OR p_basis NOT IN ('hourly','daily') OR p_amount IS NULL OR p_amount<=0 OR length(trim(p_nick)) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION '이름과 시급·일당 금액을 확인해 주세요'; END IF;
 IF p_member IS NULL THEN
 INSERT INTO members(company_id,store_id,role,nick,emp_type,contract,hourly_rate,night_pay,labor_law,active,joined_on,checks)
 SELECT company_id,id,'staff',trim(p_nick),'헬퍼','3.3',CASE WHEN p_basis='hourly' THEN p_amount ELSE 0 END,false,false,true,p_date,
 jsonb_build_object('pay_basis',p_basis,'daily_rate',CASE WHEN p_basis='daily' THEN p_amount ELSE 0 END) FROM stores WHERE id=p_store RETURNING id INTO mid;
 ELSE
 SELECT id INTO mid FROM members WHERE id=p_member AND store_id=p_store AND emp_type='헬퍼' AND active;
 IF mid IS NULL THEN RAISE EXCEPTION '이 매장의 헬퍼를 선택해 주세요'; END IF;
 END IF;
 result:=public.record_work(p_request,p_store,mid,p_date,p_start,p_end,p_break,NULL);
 UPDATE work_records SET pay_basis=p_basis,base_rate=p_amount WHERE id=result;
 RETURN result;
END $function$;

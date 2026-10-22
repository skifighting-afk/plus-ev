-- 2026-10-23 파이널나인 요청: 잘못 취소한 근무 기록을 되돌리기.
-- 취소(void)는 원본을 보존하므로, 상태만 원래대로 돌리고 취소 이력은 pay_snapshot에 남긴다.
CREATE OR REPLACE FUNCTION public.erp_restore_work(p_work uuid, p_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r work_records;
BEGIN
 SELECT * INTO r FROM work_records WHERE id=p_work;
 IF NOT FOUND THEN RAISE EXCEPTION '근무를 찾지 못했어요';END IF;
 PERFORM public.erp_work_guard(r.store_id,r.member_id,r.work_date,true);
 SELECT * INTO r FROM work_records WHERE id=p_work FOR UPDATE;
 IF r.status<>'void' THEN RETURN r.id;END IF;
 IF r.revision<>p_revision THEN RAISE EXCEPTION '근무 기록이 바뀌었어요. 새로고침 후 확인해 주세요';END IF;
 IF EXISTS(SELECT 1 FROM work_records w WHERE w.member_id=r.member_id AND w.id<>r.id AND w.status<>'void'
   AND w.start_at<coalesce(r.end_at,'infinity'::timestamptz) AND coalesce(w.end_at,'infinity'::timestamptz)>r.start_at)
   THEN RAISE EXCEPTION '같은 시간에 다른 근무 기록이 있어요. 그 기록을 먼저 확인해 주세요';END IF;
 UPDATE work_records SET status=CASE WHEN r.end_at IS NULL THEN 'open' WHEN r.end_at>now() THEN 'planned' ELSE 'confirmed' END,
   revision=revision+1,pay_snapshot=pay_snapshot||jsonb_build_object('restored_by',auth.uid(),'restored_at',now())
 WHERE id=r.id;
 RETURN r.id;
END $function$;
REVOKE ALL ON FUNCTION public.erp_restore_work(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_restore_work(uuid,integer) TO authenticated;

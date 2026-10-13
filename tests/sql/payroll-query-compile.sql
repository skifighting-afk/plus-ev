-- Only NULL store is admitted in this uncommitted transaction, so no real store becomes accessible.
CREATE OR REPLACE FUNCTION public.erp_pay_access(p_store uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT p_store IS NULL $$;
DO $$ DECLARE result jsonb;BEGIN
 result:=public.actual_payroll(NULL,'2026-10-01');
 IF result->'members'<>'[]'::jsonb THEN RAISE EXCEPTION 'empty-store query returned members';END IF;
 PERFORM public.erp_schedule_record(NULL,'2026-10-13');
END $$;
-- Caller MUST ROLLBACK; never commit this test replacement.

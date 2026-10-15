-- Extend existing HQ read access only. No owner/manager or write authorization changes.
CREATE POLICY hq_view_templates ON public.shift_templates FOR SELECT TO authenticated USING ((SELECT public.is_hq()));
CREATE POLICY hq_view_overrides ON public.shift_overrides FOR SELECT TO authenticated USING ((SELECT public.is_hq()));
CREATE POLICY hq_view_work_records ON public.work_records FOR SELECT TO authenticated USING ((SELECT public.is_hq()));
-- Reuse the existing authoritative payroll calculation; only its read predicate changes.
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('public.actual_payroll(uuid,date)'::regprocedure);
 IF position('public.erp_pay_access(p_store)' in body)=0 THEN RAISE EXCEPTION 'Unexpected payroll function; review required'; END IF;
 EXECUTE replace(body,'public.erp_pay_access(p_store)','(public.erp_pay_access(p_store) OR public.is_hq())');
END $$;

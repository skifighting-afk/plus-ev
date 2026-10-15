-- HQ reads the existing owner screens, without any new mutation permission.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['attendance','incentives','pay_marks','advances','contracts','day_opens','cash_movements','work_payments','report_log','sched_rounds','sched_avail','pay_locks','shift_reqs','shift_offers','att_fix','shift_swaps','store_notes','stock','store_quests','job_posts','store_items','staff_notices','member_notes'] LOOP
  EXECUTE format('CREATE POLICY hq_owner_view_read ON public.%I FOR SELECT TO authenticated USING ((SELECT public.is_hq()))',t);
 END LOOP;
END $$;

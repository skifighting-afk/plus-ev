DO $$ DECLARE h uuid;s uuid;result jsonb;before_claim text:=current_setting('request.jwt.claim.sub',true);BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname IN ('hq_view_templates','hq_view_overrides','hq_view_work_records') AND cmd='SELECT')<>3 THEN RAISE EXCEPTION 'HQ SELECT policies missing';END IF;
 SELECT id INTO h FROM public.profiles WHERE is_hq LIMIT 1;
 IF h IS NULL THEN RAISE EXCEPTION 'HQ account missing';END IF;
 PERFORM set_config('request.jwt.claim.sub',h::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM 1 FROM public.shift_templates LIMIT 1;PERFORM 1 FROM public.shift_overrides LIMIT 1;PERFORM 1 FROM public.work_records LIMIT 1;
 FOR s IN SELECT id FROM public.stores LOOP
  result:=public.actual_payroll(s,date_trunc('month',current_date)::date);
  IF NOT result ? 'members' THEN RAISE EXCEPTION 'Payroll response missing';END IF;
 END LOOP;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub','',true);
 SELECT id INTO s FROM public.stores LIMIT 1;
 IF s IS NOT NULL THEN BEGIN PERFORM public.actual_payroll(s,current_date);RAISE EXCEPTION 'Anonymous payroll allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM='Anonymous payroll allowed' THEN RAISE;END IF;END;END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(before_claim,''),true);
END $$;

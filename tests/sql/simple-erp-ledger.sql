-- Run in a rollback transaction; never create real attendance or payments.
DO $$ BEGIN
  IF public.erp_pay_access(NULL) THEN RAISE EXCEPTION 'null store access granted'; END IF;
  BEGIN
    PERFORM public.record_work(gen_random_uuid(),NULL,NULL,current_date,now(),now(),0,NULL);
    RAISE EXCEPTION 'unauthorized mutation succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%권한%' AND SQLERRM NOT LIKE '%로그인%' THEN RAISE; END IF;
  END;
END $$;

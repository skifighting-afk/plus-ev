DO $$ BEGIN
 IF has_table_privilege('anon','public.work_records','TRUNCATE') OR has_table_privilege('authenticated','public.work_payments','TRUNCATE') THEN RAISE EXCEPTION 'ledger truncate permission granted';END IF;
 BEGIN PERFORM public.record_cash(gen_random_uuid(),NULL,current_date,'out',100,'test');RAISE EXCEPTION 'anonymous cash write succeeded';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%권한%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.record_pay(gen_random_uuid(),NULL,ARRAY[]::uuid[],'cash',current_date);RAISE EXCEPTION 'anonymous pay succeeded';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%권한%' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('work_records','work_payments','cash_movements') AND cmd IN ('ALL','INSERT','UPDATE','DELETE')) THEN RAISE EXCEPTION 'direct mutation policy exists';END IF;
 IF has_function_privilege('anon','public.record_pay(uuid,uuid,uuid[],text,date,uuid,date)','EXECUTE') THEN RAISE EXCEPTION 'anonymous pay execution granted';END IF;
END $$;

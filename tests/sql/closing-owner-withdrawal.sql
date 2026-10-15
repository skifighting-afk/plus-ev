DO $$ BEGIN
 IF public.erp_closing_withdrawal(NULL)<>0 OR public.erp_closing_withdrawal('{}')<>0 OR public.erp_closing_withdrawal('{"owner_withdrawal":150000}')<>150000 THEN RAISE EXCEPTION 'withdrawal parser failed';END IF;
 BEGIN PERFORM public.erp_closing_withdrawal('{"owner_withdrawal":-1}');RAISE EXCEPTION 'accepted negative';EXCEPTION WHEN OTHERS THEN IF SQLERRM='accepted negative' THEN RAISE;END IF;END;
 BEGIN PERFORM public.erp_closing_withdrawal('{"owner_withdrawal":1.5}');RAISE EXCEPTION 'accepted fractional';EXCEPTION WHEN OTHERS THEN IF SQLERRM='accepted fractional' THEN RAISE;END IF;END;
 IF has_function_privilege('authenticated','public.erp_sync_closing_withdrawal()','EXECUTE') THEN RAISE EXCEPTION 'internal cash writer exposed';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='erp_closing_withdrawal_sync' AND (tgtype::integer & 2)=0) THEN RAISE EXCEPTION 'closing sync must run AFTER conflict resolution';END IF;
END $$;

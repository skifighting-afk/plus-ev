DO $$ DECLARE t text;h uuid;before_claim text:=current_setting('request.jwt.claim.sub',true);fingerprint text;BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='hq_owner_view_read' AND cmd='SELECT')<>23 THEN RAISE EXCEPTION 'HQ read policies incomplete';END IF;
 SELECT md5(string_agg(policyname||tablename||cmd||coalesce(qual,'')||coalesce(with_check,''),'' ORDER BY tablename,policyname)) INTO fingerprint FROM pg_policies WHERE schemaname='public' AND cmd<>'SELECT';
 IF fingerprint IS DISTINCT FROM current_setting('app.hq_write_policies',true) THEN RAISE EXCEPTION 'Write policies unexpectedly changed';END IF;
 SELECT id INTO h FROM profiles WHERE is_hq LIMIT 1;IF h IS NULL THEN RAISE EXCEPTION 'HQ account missing';END IF;
 PERFORM set_config('request.jwt.claim.sub',h::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 FOR t IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='hq_owner_view_read' LOOP EXECUTE format('SELECT 1 FROM public.%I LIMIT 1',t);END LOOP;
 EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',coalesce(before_claim,''),true);
END $$;

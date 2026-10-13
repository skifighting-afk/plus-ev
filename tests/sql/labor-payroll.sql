DO $$ DECLARE r public.work_records;a jsonb;BEGIN
 r:=jsonb_populate_record(NULL::public.work_records,'{"member_id":"11111111-1111-1111-1111-111111111111","work_date":"2026-10-13","start_at":"2026-10-13T09:00:00Z","end_at":"2026-10-13T13:00:00Z","break_min":30,"status":"confirmed","pay_basis":"hourly","base_rate":12000,"pay_snapshot":{"night_pay":false,"labor_law":false}}');
 a:=public.erp_work_amount(r);
 IF (a->>'gross')::integer<>42000 OR (a->>'hours')::numeric<>3.5 THEN RAISE EXCEPTION 'hourly parity failed: %',a;END IF;
 IF public.erp_deduction(42000,'3.3')<>1380 THEN RAISE EXCEPTION 'deduction parity failed';END IF;
 r.pay_basis:='daily';r.base_rate:=120000;a:=public.erp_work_amount(r);
 IF (a->>'gross')::integer<>120000 THEN RAISE EXCEPTION 'daily parity failed: %',a;END IF;
 r.end_at:=NULL;r.status:='open';a:=public.erp_work_amount(r);
 IF (a->>'gross')::integer<>0 OR (a->>'incomplete')::integer<>1 THEN RAISE EXCEPTION 'incomplete parity failed';END IF;
END $$;

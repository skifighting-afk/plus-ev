-- Closing and its owner withdrawal share one database transaction.
ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS closing_report_date date;
CREATE INDEX IF NOT EXISTS cash_closing_date ON public.cash_movements(store_id,closing_report_date) WHERE closing_report_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.erp_closing_withdrawal(p_detail jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE amount text:=coalesce(p_detail->>'owner_withdrawal','0');
BEGIN
 IF amount !~ '^[0-9]+$' OR length(amount)>10 OR amount::numeric>2147483647 THEN RAISE EXCEPTION '대표 인출은 0 이상의 정수 금액으로 입력해 주세요';END IF;
 RETURN amount::integer;
END $$;

CREATE OR REPLACE FUNCTION public.erp_guard_closing_withdrawal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous integer:=0;current_amount integer:=0;sid uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN previous:=public.erp_closing_withdrawal(OLD.detail);sid:=OLD.store_id;END IF;
 IF TG_OP<>'DELETE' THEN
  sid:=NEW.store_id;
  -- An older app editing other report fields must not erase an existing withdrawal.
  IF TG_OP='UPDATE' AND NOT coalesce(NEW.detail ? 'owner_withdrawal',false) AND coalesce(OLD.detail ? 'owner_withdrawal',false) THEN
   NEW.detail:=coalesce(NEW.detail,'{}'::jsonb)||jsonb_build_object('owner_withdrawal',previous);
  END IF;
  current_amount:=public.erp_closing_withdrawal(NEW.detail);
 END IF;
 IF TG_OP='UPDATE' AND (NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.report_date IS DISTINCT FROM OLD.report_date) AND (previous>0 OR current_amount>0) THEN
  RAISE EXCEPTION '대표 인출이 연결된 마감의 매장·날짜는 바꿀 수 없어요';
 END IF;
 IF current_amount<>previous AND NOT public.erp_pay_access(sid) THEN RAISE EXCEPTION '금고 관리 권한이 없어요';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.erp_sync_closing_withdrawal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous integer:=0;current_amount integer:=0;delta integer;sid uuid;day date;
BEGIN
 IF TG_OP<>'INSERT' THEN previous:=public.erp_closing_withdrawal(OLD.detail);sid:=OLD.store_id;day:=OLD.report_date;END IF;
 IF TG_OP<>'DELETE' THEN current_amount:=public.erp_closing_withdrawal(NEW.detail);sid:=NEW.store_id;day:=NEW.report_date;END IF;
 delta:=current_amount-previous;
 IF delta<>0 THEN
  IF NOT public.erp_pay_access(sid) THEN RAISE EXCEPTION '금고 관리 권한이 없어요';END IF;
  PERFORM pg_advisory_xact_lock(hashtext('erp:'||sid::text));
  INSERT INTO public.cash_movements(request_id,store_id,business_date,direction,amount,reason,source,closing_report_date,created_by)
  VALUES(gen_random_uuid(),sid,day,CASE WHEN delta>0 THEN 'out' ELSE 'in' END,abs(delta),
   CASE WHEN TG_OP='DELETE' THEN '마감 삭제 · 대표 인출 복구' WHEN delta<0 THEN '마감 대표 인출 정정 · 금고 복구' ELSE '마감 대표 인출' END,'owner',day,auth.uid());
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.erp_guard_closing_cash_reversal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.reverses_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.cash_movements WHERE id=NEW.reverses_id AND closing_report_date IS NOT NULL) THEN
  RAISE EXCEPTION '마감 화면의 대표 인출 금액에서 수정해 주세요';
 END IF;RETURN NEW;
END $$;

CREATE TRIGGER erp_closing_withdrawal_guard BEFORE INSERT OR UPDATE OR DELETE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION public.erp_guard_closing_withdrawal();
-- AFTER is essential: an INSERT ... ON CONFLICT UPDATE must emit only the committed delta.
CREATE TRIGGER erp_closing_withdrawal_sync AFTER INSERT OR UPDATE OR DELETE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION public.erp_sync_closing_withdrawal();
CREATE TRIGGER erp_closing_cash_reversal_guard BEFORE INSERT ON public.cash_movements FOR EACH ROW EXECUTE FUNCTION public.erp_guard_closing_cash_reversal();
REVOKE ALL ON FUNCTION public.erp_closing_withdrawal(jsonb),public.erp_guard_closing_withdrawal(),public.erp_sync_closing_withdrawal(),public.erp_guard_closing_cash_reversal() FROM PUBLIC,anon,authenticated;

-- Additive ledger. Do not delete historical schedule/payroll data.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS labor_actual_from date;
CREATE TABLE IF NOT EXISTS public.work_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid UNIQUE NOT NULL,
 store_id uuid NOT NULL REFERENCES public.stores(id),member_id uuid NOT NULL REFERENCES public.members(id),
 work_date date NOT NULL,start_at timestamptz NOT NULL,end_at timestamptz,break_min integer,
 source text NOT NULL CHECK(source IN ('qr','manual')),
 status text NOT NULL CHECK(status IN ('open','planned','confirmed','conflict','void')),
 attendance_in_id bigint UNIQUE REFERENCES public.attendance(id),attendance_out_id bigint UNIQUE REFERENCES public.attendance(id),
 pay_basis text NOT NULL DEFAULT 'hourly' CHECK(pay_basis IN ('hourly','daily')),
 base_rate integer NOT NULL CHECK(base_rate>=0),pay_snapshot jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_at IS NULL OR (end_at>start_at AND end_at<=start_at+interval '24 hours')),
 CHECK(break_min IS NULL OR (break_min>=0 AND (end_at IS NULL OR break_min<extract(epoch FROM(end_at-start_at))/60)))
);
CREATE INDEX IF NOT EXISTS work_records_period ON public.work_records(store_id,work_date,member_id);
CREATE TABLE IF NOT EXISTS public.work_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid UNIQUE NOT NULL,
 store_id uuid NOT NULL REFERENCES public.stores(id),member_id uuid NOT NULL REFERENCES public.members(id),
 work_ids uuid[] NOT NULL,work_date date NOT NULL,period_month date NOT NULL,
 amount_gross integer NOT NULL CHECK(amount_gross>=0),amount_deduction integer NOT NULL CHECK(amount_deduction>=0),
 amount_net integer NOT NULL CHECK(amount_net>=0),method text NOT NULL CHECK(method IN ('cash','transfer')),
 status text NOT NULL CHECK(status IN ('paid','reversed')),created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 reversed_by_id uuid,reversed_by uuid,reversed_at timestamptz,reason text
);
CREATE TABLE IF NOT EXISTS public.cash_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid UNIQUE NOT NULL,
 store_id uuid NOT NULL REFERENCES public.stores(id),business_date date NOT NULL,
 direction text NOT NULL CHECK(direction IN ('in','out')),amount integer NOT NULL CHECK(amount>0),reason text NOT NULL,
 source text NOT NULL CHECK(source IN ('owner','expense','payroll','other','reversal')),
 payment_id uuid UNIQUE REFERENCES public.work_payments(id),reverses_id uuid UNIQUE REFERENCES public.cash_movements(id),
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.erp_pay_access(p_store uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM stores st JOIN members m ON m.company_id=st.company_id
 WHERE st.id=p_store AND m.user_id=auth.uid() AND m.active
 AND (m.role='owner' OR (m.role='manager' AND m.store_id=p_store AND coalesce((m.perms->>'pay')::boolean,true))));
$$;
CREATE POLICY erp_work_read ON public.work_records FOR SELECT TO authenticated USING(
 public.erp_pay_access(store_id) OR EXISTS(SELECT 1 FROM public.members m WHERE m.id=member_id AND m.user_id=auth.uid() AND m.active));
CREATE POLICY erp_payment_read ON public.work_payments FOR SELECT TO authenticated USING(
 public.erp_pay_access(store_id) OR EXISTS(SELECT 1 FROM public.members m WHERE m.id=member_id AND m.user_id=auth.uid() AND m.active));
CREATE POLICY erp_cash_read ON public.cash_movements FOR SELECT TO authenticated USING(public.erp_pay_access(store_id));
REVOKE ALL ON public.work_records,public.work_payments,public.cash_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.work_records,public.work_payments,public.cash_movements TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_work_guard(p_store uuid,p_member uuid,p_date date,p_historical boolean DEFAULT false) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.erp_pay_access(p_store) THEN RAISE EXCEPTION '급여 관리 권한이 없어요'; END IF;
 IF NOT EXISTS(SELECT 1 FROM members WHERE id=p_member AND store_id=p_store AND (active OR p_historical) AND role<>'owner') THEN RAISE EXCEPTION '이 매장의 직원을 선택해 주세요'; END IF;
 IF NOT p_historical AND NOT public.company_active((SELECT company_id FROM stores WHERE id=p_store)) THEN RAISE EXCEPTION '매장 이용 상태를 확인해 주세요'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('erp:'||p_store::text));
 IF EXISTS(SELECT 1 FROM pay_locks WHERE store_id=p_store AND month=date_trunc('month',p_date)::date AND on_) THEN RAISE EXCEPTION '급여 마감된 달이에요'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_work(p_request uuid,p_store uuid,p_member uuid,p_date date,
 p_start timestamptz,p_end timestamptz,p_break integer,p_revision integer DEFAULT NULL) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m members; prior work_records; result uuid; snap jsonb;
BEGIN
 PERFORM public.erp_work_guard(p_store,p_member,p_date,p_end<=now());
 IF NOT public.company_active((SELECT company_id FROM stores WHERE id=p_store)) THEN RAISE EXCEPTION '매장 이용 상태를 확인해 주세요';END IF;
 IF p_request IS NULL OR p_date IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end>p_start+interval '24 hours'
 OR p_break IS NULL OR p_break<0 OR p_break>=extract(epoch FROM(p_end-p_start))/60 THEN RAISE EXCEPTION '날짜·근무시간·휴게시간을 확인해 주세요'; END IF;
 IF abs(p_date-(p_start AT TIME ZONE 'Asia/Seoul')::date)>1 THEN RAISE EXCEPTION '근무일과 출근 날짜를 확인해 주세요'; END IF;
 SELECT * INTO prior FROM work_records WHERE request_id=p_request;
 IF FOUND THEN
   IF prior.store_id<>p_store OR prior.member_id<>p_member OR prior.start_at<>p_start OR prior.end_at<>p_end OR prior.break_min<>p_break THEN RAISE EXCEPTION '다른 내용으로 사용한 요청이에요'; END IF;
   RETURN prior.id;
 END IF;
 IF p_revision IS NOT NULL THEN RAISE EXCEPTION '기존 근무 보정은 기록을 확인한 뒤 진행해 주세요'; END IF;
 IF EXISTS(SELECT 1 FROM work_records WHERE member_id=p_member AND status<>'void' AND start_at<p_end AND coalesce(end_at,'infinity'::timestamptz)>p_start)
 OR EXISTS(SELECT 1 FROM attendance a WHERE a.member_id=p_member AND a.at>=p_start AND a.at<=p_end AND NOT EXISTS(SELECT 1 FROM work_records w WHERE w.status='void' AND w.member_id=p_member AND a.id IN(w.attendance_in_id,w.attendance_out_id))) THEN RAISE EXCEPTION '겹치는 출퇴근·근무 기록이 있어요. 기존 기록을 확인해 주세요'; END IF;
 SELECT * INTO m FROM members WHERE id=p_member;
 snap:=jsonb_build_object('contract',m.contract,'night_pay',m.night_pay,'labor_law',coalesce(m.labor_law,m.contract='4대'),
 'hourly_rate',m.hourly_rate,'meal',coalesce((m.checks->>'meal')::integer,0),'five',coalesce((SELECT (equip->>'five')::boolean FROM stores WHERE id=p_store),false),'is_holiday',public.erp_holiday(p_store,p_date),'night_start',(SELECT night_start FROM stores WHERE id=p_store),'night_end',(SELECT night_end FROM stores WHERE id=p_store));
 INSERT INTO work_records(request_id,store_id,member_id,work_date,start_at,end_at,break_min,source,status,pay_basis,base_rate,pay_snapshot,created_by)
 VALUES(p_request,p_store,p_member,p_date,p_start,p_end,p_break,'manual',CASE WHEN p_end>now() THEN 'planned' ELSE 'confirmed' END,coalesce(m.checks->>'pay_basis','hourly'),
 CASE WHEN m.checks->>'pay_basis'='daily' THEN (m.checks->>'daily_rate')::integer ELSE m.hourly_rate END,snap,auth.uid()) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.register_helper_work(p_request uuid,p_store uuid,p_member uuid,p_nick text,p_basis text,p_amount integer,
 p_date date,p_start timestamptz,p_end timestamptz,p_break integer) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE mid uuid; result uuid; old work_records;
BEGIN
 IF NOT public.erp_pay_access(p_store) THEN RAISE EXCEPTION '급여 관리 권한이 없어요'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('erp:'||p_store::text));
 SELECT * INTO old FROM work_records WHERE request_id=p_request;
 IF FOUND THEN
 IF old.store_id<>p_store OR (p_member IS NOT NULL AND old.member_id<>p_member) OR old.pay_basis<>p_basis OR old.base_rate<>p_amount OR old.work_date<>p_date OR old.start_at<>p_start OR old.end_at<>p_end OR old.break_min<>p_break THEN RAISE EXCEPTION '다른 요청이에요'; END IF;
 RETURN old.id; END IF;
 IF p_basis IS NULL OR p_basis NOT IN ('hourly','daily') OR p_amount IS NULL OR p_amount<=0 OR length(trim(p_nick)) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION '이름과 시급·일당 금액을 확인해 주세요'; END IF;
 IF p_member IS NULL THEN
 INSERT INTO members(company_id,store_id,role,nick,emp_type,contract,hourly_rate,night_pay,labor_law,active,joined_on,checks)
 SELECT company_id,id,'staff',trim(p_nick),'헬퍼','3.3',CASE WHEN p_basis='hourly' THEN p_amount ELSE 0 END,(p_basis='hourly'),false,true,p_date,
 jsonb_build_object('pay_basis',p_basis,'daily_rate',CASE WHEN p_basis='daily' THEN p_amount ELSE 0 END) FROM stores WHERE id=p_store RETURNING id INTO mid;
 ELSE
 SELECT id INTO mid FROM members WHERE id=p_member AND store_id=p_store AND emp_type='헬퍼' AND active;
 IF mid IS NULL THEN RAISE EXCEPTION '이 매장의 헬퍼를 선택해 주세요'; END IF;
 END IF;
 result:=public.record_work(p_request,p_store,mid,p_date,p_start,p_end,p_break,NULL);
 UPDATE work_records SET pay_basis=p_basis,base_rate=p_amount WHERE id=result;
 RETURN result;
END $$;

-- Internal helpers stay inaccessible to anonymous and direct employee calls.
REVOKE ALL ON FUNCTION public.erp_work_guard(uuid,uuid,date,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_pay_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_pay_access(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.record_work(uuid,uuid,uuid,date,timestamptz,timestamptz,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.register_helper_work(uuid,uuid,uuid,text,text,integer,date,timestamptz,timestamptz,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_work(uuid,uuid,uuid,date,timestamptz,timestamptz,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_helper_work(uuid,uuid,uuid,text,text,integer,date,timestamptz,timestamptz,integer) TO authenticated;

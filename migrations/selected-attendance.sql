-- Serialize both legacy and explicit QR requests for each signed-in employee.
DO $migration$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('public.attend(text,double precision,double precision)'::regprocedure) INTO src;
  IF position('pg_advisory_xact_lock' in src) = 0 THEN
    IF position(E'begin\n' in src) = 0 THEN RAISE EXCEPTION 'Unexpected attend source; migration stopped'; END IF;
    src := replace(src, E'begin\n', E'begin\n  perform pg_advisory_xact_lock(hashtext(''attend:'' || auth.uid()::text));\n');
    EXECUTE src;
  END IF;
END $migration$;

DROP FUNCTION IF EXISTS public.attend_selected(text,text,double precision,double precision);
CREATE OR REPLACE FUNCTION public.attend_selected(p_code text, p_kind text, p_store uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare mm members; sec text; w bigint := floor(extract(epoch from now())/30); last text; k text; st stores; d int;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if p_kind is null or p_kind not in ('in','out') then raise exception '출근 또는 퇴근을 선택해 주세요'; end if;
  perform pg_advisory_xact_lock(hashtext('attend:' || auth.uid()::text));
  for mm in select * from members where user_id=auth.uid() and active and store_id = p_store loop
    select qr_secret into sec from store_secrets where store_id=mm.store_id;
    if p_code in (public.code_at(sec,w), public.code_at(sec,w-1)) then
      select * into st from stores where id = mm.store_id;
      if st.geo_lat is not null then
        if p_lat is null or p_lng is null then raise exception '[GEO] 위치를 확인해야 출퇴근할 수 있어요'; end if;
        d := round(6371000 * 2 * asin(sqrt(power(sin(radians(p_lat - st.geo_lat) / 2), 2) + cos(radians(st.geo_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - st.geo_lng) / 2), 2))));
        if d > st.geo_m then raise exception '매장에서 약 %m 떨어져 있어요. 매장 안에서 다시 눌러주세요', d; end if;
      end if;
      select kind into last from attendance where member_id=mm.id order by at desc limit 1;
      k := case when last='in' then 'out' else 'in' end;
      if k <> p_kind then
        if p_kind='in' then raise exception '이미 출근한 상태예요. 퇴근을 선택해 주세요';
        else raise exception '출근 기록이 없어요. 출근을 먼저 선택해 주세요'; end if;
      end if;
      insert into attendance(member_id,store_id,kind,dist_m) values (mm.id,mm.store_id,k,d);
      return k;
    end if;
  end loop;
  raise exception '코드가 맞지 않아요. 매장 화면의 새 코드를 넣어주세요';
end $function$
  ;

REVOKE ALL ON FUNCTION public.attend_selected(text,text,uuid,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attend_selected(text,text,uuid,double precision,double precision) TO authenticated;

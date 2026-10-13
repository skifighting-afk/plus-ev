CREATE OR REPLACE FUNCTION public.attend(p_code text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare mm members; sec text; w bigint := floor(extract(epoch from now())/30); last text; k text; st stores; d int;
begin
  for mm in select * from members where user_id=auth.uid() and active and store_id is not null loop
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
      insert into attendance(member_id,store_id,kind,dist_m) values (mm.id,mm.store_id,k,d);
      return k;
    end if;
  end loop;
  raise exception '코드가 맞지 않아요. 매장 화면의 새 코드를 넣어주세요';
end $function$
  ;

DROP FUNCTION IF EXISTS public.attend_selected(text,text,uuid,double precision,double precision);

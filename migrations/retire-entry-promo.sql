-- Retire the entry cash promotion; preserve historical signup_log rows.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_company(p_name text, p_brand text, p_biz_no text, p_store text, p_area text, p_nick text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c uuid; s uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if coalesce(regexp_replace(p_biz_no,'[^0-9]','','g'),'') !~ '^[0-9]{10}$' then raise exception '사업자등록번호 10자리를 넣어주세요'; end if;
  insert into companies(name,brand,biz_no) values (p_name,p_brand,regexp_replace(p_biz_no,'[^0-9]','','g')) returning id into c;
  insert into stores(company_id,name,area) values (c,p_store,p_area) returning id into s;
  insert into members(company_id,store_id,user_id,role,nick) values (c,null,auth.uid(),'owner',p_nick);
  return c;
end $function$;
COMMIT;

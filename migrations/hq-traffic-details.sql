CREATE OR REPLACE FUNCTION public.hq_traffic_details(p_from date,p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;BEGIN
 IF auth.uid() IS NULL OR NOT public.is_hq() THEN RAISE EXCEPTION '운영사만 방문 통계를 볼 수 있어요';END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>89 OR p_to>(now() AT TIME ZONE 'Asia/Seoul')::date THEN RAISE EXCEPTION '조회 기간은 오늘까지 최대 90일입니다';END IF;
 WITH v AS MATERIALIZED(SELECT day,vid,uid,mode,path,ref,ua,at FROM public.visits WHERE day BETWEEN p_from AND p_to)
 SELECT jsonb_build_object(
 'unique_visitors',(SELECT count(DISTINCT vid) FROM v),'logged_users',(SELECT count(DISTINCT uid) FROM v),
 'daily',(SELECT coalesce(jsonb_agg(to_jsonb(daily_row) ORDER BY daily_row.d DESC),'[]'::jsonb) FROM(SELECT g::date d,count(DISTINCT v.vid) visitors,count(DISTINCT v.uid) users,(SELECT count(*) FROM auth.users u WHERE (u.created_at AT TIME ZONE 'Asia/Seoul')::date=g::date) signups FROM generate_series(p_from,p_to,interval '1 day') g LEFT JOIN v ON v.day=g::date GROUP BY g) daily_row),
 'by_ref',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.n DESC),'[]'::jsonb) FROM(SELECT coalesce(nullif(ref,''),'직접 방문') ref,count(*) n FROM v GROUP BY 1 ORDER BY 2 DESC LIMIT 20) f),
 'devices',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.n DESC),'[]'::jsonb) FROM(SELECT coalesce(ua,'?') ua,count(*) n FROM v GROUP BY 1) f),
 'modes',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.n DESC),'[]'::jsonb) FROM(SELECT coalesce(mode,'guest') mode,count(*) n FROM v GROUP BY 1) f),
 'pages',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.n DESC),'[]'::jsonb) FROM(SELECT coalesce(path,'/') path,count(*) n FROM v GROUP BY 1 ORDER BY 2 DESC LIMIT 30) f),
 'people',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.last_day DESC),'[]'::jsonb) FROM(SELECT p.name,count(DISTINCT v.day) days,max(v.day) last_day,(array_agg(v.mode ORDER BY v.at DESC))[1] mode FROM v JOIN public.profiles p ON p.id=v.uid WHERE v.uid IS NOT NULL GROUP BY p.id,p.name ORDER BY max(v.day) DESC LIMIT 50) f)
 ) INTO result;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.hq_traffic_details(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hq_traffic_details(date,date) TO authenticated;

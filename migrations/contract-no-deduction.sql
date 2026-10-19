-- Opt-in contract choice only; existing members and pay snapshots are unchanged.
ALTER TYPE public.contract_type ADD VALUE IF NOT EXISTS '없음';
CREATE OR REPLACE FUNCTION public.erp_deduction(g numeric,c text) RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN c='없음' THEN 0 WHEN c='4대' THEN (floor(g*.0475/10)*10+floor(g*.03595/10)*10+floor(floor(g*.03595/10)*10*.1314/10)*10+floor(g*.009/10)*10)::integer
 ELSE (floor(g*.03/10)*10+floor(floor(g*.03/10)*10*.1/10)*10)::integer END;
$$;

-- CREATE OR REPLACE preserves the existing helper execution ACL.

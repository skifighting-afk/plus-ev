-- Start at the next unopened business day; preserve all existing schedule payroll.
-- Configuration only: no attendance, salary, payment or cash records are rewritten.
UPDATE public.stores SET labor_actual_from=(((now() AT TIME ZONE 'Asia/Seoul')-interval '8 hours')::date+1)
WHERE labor_actual_from IS NULL;
ALTER TABLE public.stores ALTER COLUMN labor_actual_from SET DEFAULT (((now() AT TIME ZONE 'Asia/Seoul')-interval '8 hours')::date+1);

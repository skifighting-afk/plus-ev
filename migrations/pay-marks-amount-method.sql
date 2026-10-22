-- 2026-10-23 매장 요청: 급여 대장에 '얼마를 어떻게 지급했는지' 기록 (선택 입력)
ALTER TABLE public.pay_marks ADD COLUMN IF NOT EXISTS paid_amount integer CHECK (paid_amount IS NULL OR paid_amount >= 0);
ALTER TABLE public.pay_marks ADD COLUMN IF NOT EXISTS method text CHECK (method IS NULL OR char_length(method) <= 20);
ALTER TABLE public.pay_marks ADD COLUMN IF NOT EXISTS memo text CHECK (memo IS NULL OR char_length(memo) <= 80);

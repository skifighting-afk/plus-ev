-- Preserve all work/payment/cash rows. Disable capture and the new feature flag only.
DROP TRIGGER IF EXISTS erp_attendance_ledger ON public.attendance;
-- Select affected stores explicitly before clearing labor_actual_from.
-- Do not DROP ledger tables, erase payments, or silently switch already-paid payroll.
-- Restore source using the verified backup and reconcile new records before switching calculation basis.

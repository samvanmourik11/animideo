-- 023_trial_flag.sql
-- Trial-flow marker on pending_checkouts (7-day €1 trial naar Starter).

ALTER TABLE public.pending_checkouts
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false;

-- 046_achterstand_antwoord.sql
-- Antwoordt een klant op een terugboekingsmail, dan stoppen de automatische
-- herinneringen en neemt de klantenservice het met de hand over.

ALTER TABLE public.chargebacks
  ADD COLUMN IF NOT EXISTS gereageerd_op TIMESTAMPTZ;

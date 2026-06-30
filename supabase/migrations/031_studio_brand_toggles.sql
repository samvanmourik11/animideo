-- Twee per-project schakelaars voor de Creator Studio merk-features:
--  * logo_on_scenes : subtiel hoek-logo op AI-scènes (client-side gecomposit)
--  * hq_brand_verify: GPT-4o vision-check + 1x hergeneren per merk-scène
-- Beide standaard uit; de gebruiker zet ze per project aan.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS logo_on_scenes  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hq_brand_verify boolean NOT NULL DEFAULT false;

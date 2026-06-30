-- Kwaliteitskeuze + seed voor de Creator Studio.
--  * quality : 'standard' (Nano Banana / Seedance Lite) of 'pro' (Nano Banana Pro
--    / Seedance 1.5 Pro) — Pro kost evenredig meer credits.
--  * gen_seed: optionele vaste seed voor reproduceerbare/consistente look.
-- Beide kolommen worden defensief gelezen; de code werkt ook zonder deze migratie.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS quality  text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS gen_seed integer;

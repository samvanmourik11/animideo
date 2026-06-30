-- Infographics-modus: zakelijke infographics die deterministisch uit een
-- gestructureerde spec worden gerenderd (geen AI-pixels). De spec leeft in JSONB.

alter table public.projects
  add column if not exists infographic_spec jsonb;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_mode_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_mode_check
  CHECK (mode IN ('wizard', 'free', 'photo', 't2v', 'studio', 'playground', 'infographics'));

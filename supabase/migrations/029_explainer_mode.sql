-- Explainer-modus: flat animated explainer-video's (CargoView-stijl) die uit een
-- script/info worden gegenereerd en deterministisch geanimeerd. De spec leeft in
-- JSONB; de gerenderde video komt in video_url.

alter table public.projects
  add column if not exists explainer_spec jsonb;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_mode_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_mode_check
  CHECK (mode IN ('wizard', 'free', 'photo', 't2v', 'studio', 'playground', 'infographics', 'explainer'));

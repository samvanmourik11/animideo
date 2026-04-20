ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_mode_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_mode_check
  CHECK (mode IN ('wizard', 'free', 'photo', 't2v'));

-- Karakter Studio: extends projects with style/character anchor uploads
-- and adds 'studio' as a valid project mode.

alter table public.projects
  add column if not exists style_reference_url text,
  add column if not exists character_reference_urls text[] not null default '{}'::text[];

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_mode_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_mode_check
  CHECK (mode IN ('wizard', 'free', 'photo', 't2v', 'studio'));

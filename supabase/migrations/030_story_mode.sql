-- Storytelling-infographic-modus: een AI-geschreven verhaalboog van scenes met
-- per scene een platte illustratie en SVG-tekstoverlay. De volledige story-spec
-- (scenes, briefings, voice-over- en beeld-URLs, merkkleuren) leeft in JSONB.
--
-- Eigen modus 'story', los van 'infographics' (de statische, deterministisch
-- gerenderde tool), zodat beide hun eigen wizard/route houden.

alter table public.projects
  add column if not exists story_spec jsonb;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_mode_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_mode_check
  CHECK (mode IN ('wizard', 'free', 'photo', 't2v', 'studio', 'playground', 'infographics', 'explainer', 'story'));

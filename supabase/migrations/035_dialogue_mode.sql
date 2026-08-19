-- Dialoogmodus: personages die elkaar zelf aanspreken, met eigen stemmen en
-- lip-sync (Kling AI Avatar). De volledige dialoog-spec (cast, scenes, regels,
-- portret-/audio-/video-URLs) leeft in dezelfde story_spec JSONB-kolom.
--
-- Eigen modus 'dialogue', los van 'story' (de explainer met één verteller), zodat
-- beide hun eigen wizard/route en projectoverzicht houden.

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_mode_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_mode_check
  CHECK (mode IN ('wizard', 'free', 'photo', 't2v', 'studio', 'playground', 'infographics', 'explainer', 'story', 'dialogue'));

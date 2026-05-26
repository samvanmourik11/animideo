-- Playground fase 3: video-opbouw kaart + AI-regisseur.
-- Per shot in de eindmontage willen we voiceover-tekst, een duur in seconden
-- en een overgang naar het volgende shot. Project-niveau velden voor stem,
-- muziek en outro hergebruiken we uit de bestaande `projects`-tabel
-- (selected_voice, bg_music_url, outro_contact).

alter table public.playground_nodes
  add column if not exists voiceover_text text,
  add column if not exists duration_sec   numeric,
  add column if not exists transition_out text;

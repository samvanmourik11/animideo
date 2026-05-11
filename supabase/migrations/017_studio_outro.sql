-- Karakter Studio: outro/eind-scene velden voor logo + contactgegevens.
-- outro_contact bevat losse velden zodat het script-prompt en de eind-scene
-- ze gericht kan inzetten (bedrijfsnaam, website, email, telefoon, socials).

alter table public.projects
  add column if not exists outro_logo_url text,
  add column if not exists outro_contact jsonb default '{}'::jsonb;

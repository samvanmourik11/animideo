-- Nieuwe app, Social-studio: kanalen van klanten die niet meer betalen automatisch
-- ontkoppelen (Sam, 23-10-2026). Zernio rekent per gekoppeld account per maand, ook als
-- de klant al weg is. Dag 0 een waarschuwing, na 14 dagen ontkoppelen.
--
-- Alleen kolommen erbij op social_profielen (migratie 108, alleen de nieuwe app). Opnieuw te draaien.

alter table public.social_profielen add column if not exists niet_betalend_sinds timestamptz;
alter table public.social_profielen add column if not exists ontkoppeld_op timestamptz;

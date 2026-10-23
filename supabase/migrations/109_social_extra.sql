-- Nieuwe app, Social-studio ronde 2 (Sam, 23-10-2026):
--  - eigen foto's (product, logo, winkel) bij een kalender, als voorbeeld voor de beelden;
--  - video-posts met voice-over, muziek en een eindkaart (montage na de clip);
--  - één mail als er posts klaarstaan om te keuren.
--
-- Alleen kolommen erbij op de tabellen van migratie 108 (die alleen de nieuwe app gebruikt).
-- Opnieuw te draaien.

alter table public.content_kalenders add column if not exists fotos jsonb not null default '[]';   -- [{ url, naam }]
alter table public.content_kalenders add column if not exists eindkaart text;                      -- bv. de website

alter table public.content_posts add column if not exists referenties text[] not null default '{}'; -- foto-adressen voor dit beeld
alter table public.content_posts add column if not exists voiceover text;
alter table public.content_posts add column if not exists muziek text;
alter table public.content_posts add column if not exists montage_id uuid;                          -- creatie
alter table public.content_posts add column if not exists gemeld boolean not null default false;    -- keur-mail verstuurd

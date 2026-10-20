-- Nieuwe app, fase 5 (deel 1): je werk delen met een link.
--
-- Een creatie krijgt pas een deelcode als de klant op "Delen" klikt; zonder code is er
-- geen openbare pagina. "Stop met delen" haalt de code weer weg, dan werkt de oude link
-- niet meer. De openbare pagina (/d/<code>) leest via de server, dus er komt géén
-- leesregel voor anonieme bezoekers bij: de rest van de bibliotheek blijft dicht.
--
-- Alleen toevoegend, en alleen op creaties (een tabel van de nieuwe app zelf).
-- Opnieuw te draaien.

alter table public.creaties add column if not exists deel_code text;
-- Video's hebben voor WhatsApp en LinkedIn een stilstaand voorbeeld nodig; dat maken we
-- bij het delen één keer uit de video.
alter table public.creaties add column if not exists deel_poster text;
alter table public.creaties add column if not exists gedeeld_op timestamptz;

create unique index if not exists creaties_deel_code_idx on public.creaties(deel_code) where deel_code is not null;

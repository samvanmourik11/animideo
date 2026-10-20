-- Nieuwe app, fase 5 (deel 2 en 3): profielen en de voorpagina.
--
-- Profiel: een openbare pagina per klant (animideo.nl/@bakkerijjansen) met het werk
-- dat hij zelf op zijn profiel zet. Niets komt er vanzelf op.
--
-- Voorpagina: een klant kan werk insturen; Sam keurt het goed voordat het op Ontdek
-- komt (regels vooraf, geen scan achteraf). Bezoekers geven hartjes; het populairste
-- staat bovenaan.
--
-- Alleen toevoegend: nieuwe tabellen en kolommen op creaties (een tabel van de nieuwe
-- app zelf). Opnieuw te draaien.

create table if not exists public.maker_profielen (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  -- De naam achter de @: kleine letters, cijfers en streepjes. Uniek, ook los van
  -- hoofdletters (zie de index hieronder).
  handle      text not null,
  naam        text not null,
  bio         text,
  website     text,
  logo_url    text,
  created_at  timestamptz not null default now()
);

create unique index if not exists maker_profielen_handle_idx on public.maker_profielen(lower(handle));

-- Op het eigen profiel zetten. Wie iets op zijn profiel zet, deelt het ook (deel_code),
-- zodat elk werk zijn eigen link heeft.
alter table public.creaties add column if not exists op_profiel boolean not null default false;

-- Insturen voor de voorpagina: null = niet ingestuurd, 'ingestuurd' = wacht op Sam,
-- 'goedgekeurd' = staat op Ontdek, 'afgewezen' = niet.
alter table public.creaties add column if not exists voorpagina text;
alter table public.creaties add column if not exists voorpagina_op timestamptz;
alter table public.creaties add column if not exists hartjes integer not null default 0;

create index if not exists creaties_voorpagina_idx on public.creaties(voorpagina, hartjes desc) where voorpagina is not null;
create index if not exists creaties_op_profiel_idx on public.creaties(user_id, created_at desc) where op_profiel;

-- Wie gaf een hartje. Eén per persoon per werk; het totaal staat ook op creaties.hartjes
-- zodat de voorpagina niet bij elke bezoeker hoeft te tellen.
create table if not exists public.creatie_hartjes (
  creatie_id  uuid not null references public.creaties(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (creatie_id, user_id)
);

alter table public.maker_profielen enable row level security;
alter table public.creatie_hartjes enable row level security;

-- Alles via de server (service-client): de openbare pagina's lezen alleen wat gedeeld
-- of goedgekeurd is, en schrijven controleert wie het mag. Geen regels voor gebruikers
-- nodig; zonder regels kan een gebruiker er rechtstreeks niets mee.

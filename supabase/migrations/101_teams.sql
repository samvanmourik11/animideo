-- Nieuwe app, fase 4: werken met je team.
--
-- Een Pro- of Agency-klant nodigt collega's uit (Pro 3, Agency 10). Het team maakt op
-- één gedeelde pot credits: die van de eigenaar. Iedereen ziet de bibliotheek van het
-- hele team, en de eigenaar ziet wie hoeveel verbruikte.
--
-- Alleen toevoegend: nieuwe tabellen, plus één kolom op creaties (een tabel van de
-- nieuwe app zelf, die de live-site niet gebruikt). Niets aan profiles of
-- credit_transactions.
--
-- Opnieuw te draaien: alles met IF NOT EXISTS / DROP ... IF EXISTS.

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null unique references auth.users(id) on delete cascade,
  naam        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.team_leden (
  team_id     uuid not null references public.teams(id) on delete cascade,
  -- Unique: iemand zit in hooguit één team. Anders is niet duidelijk van wiens pot
  -- een klik afgaat.
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  -- 'eigenaar' | 'lid'
  rol         text not null default 'lid',
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_uitnodigingen (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  email           text not null,
  token           text not null unique,
  uitgenodigd_door uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  verloopt_op     timestamptz not null default (now() + interval '14 days'),
  geaccepteerd_op timestamptz
);

create index if not exists team_uitnodigingen_team_idx on public.team_uitnodigingen(team_id);

-- Wie in het team wat verbruikte. credit_transactions staat op naam van de eigenaar
-- (van zijn saldo gaat het af); hier staat welke collega op de knop drukte.
create table if not exists public.team_verbruik (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  credits     integer not null,
  omschrijving text,
  created_at  timestamptz not null default now()
);

create index if not exists team_verbruik_team_created_idx on public.team_verbruik(team_id, created_at desc);

-- Van wiens saldo een creatie betaald is. Leeg = van de maker zelf (alles van vóór
-- teams). Nodig om bij een mislukte creatie de credits naar de juiste pot terug te zetten.
alter table public.creaties add column if not exists betaald_door uuid references auth.users(id) on delete set null;

alter table public.teams enable row level security;
alter table public.team_leden enable row level security;
alter table public.team_uitnodigingen enable row level security;
alter table public.team_verbruik enable row level security;

-- Lezen: alleen je eigen team. Schrijven gaat uitsluitend via de server (service-client):
-- daar wordt gecontroleerd of je eigenaar bent en of het plan nog ruimte heeft.
drop policy if exists "Leden lezen hun team" on public.teams;
create policy "Leden lezen hun team"
  on public.teams for select to authenticated
  using (id in (select team_id from public.team_leden where user_id = auth.uid()));

-- Alleen je eigen lidmaatschap. Een regel die naar team_leden zelf verwijst ("leden van
-- mijn team") laat Postgres oneindig rondzoeken; de teamgenoten leest de server.
drop policy if exists "Leden lezen hun teamgenoten" on public.team_leden;
drop policy if exists "Leden lezen hun eigen lidmaatschap" on public.team_leden;
create policy "Leden lezen hun eigen lidmaatschap"
  on public.team_leden for select to authenticated
  using (user_id = auth.uid());

-- Uitnodigingen en verbruik: geen policies, dus alleen de server leest ze.

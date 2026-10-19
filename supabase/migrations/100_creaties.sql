-- Nieuwe app ("de Nederlandse Higgsfield"), fase 1: de bibliotheek en de wachtrij.
--
-- Tot nu toe bestond werk alleen binnen een project: een los gemaakt beeld of een losse
-- clip had geen eigen plek. In de nieuwe app is elk gemaakt bestand een eigen "creatie"
-- met de opdracht, het model en de vervolgknoppen (maak video, nog eens …). Dezelfde rij
-- is ook de wachtrij: status 'bezig' + het fal-verzoek, tot het resultaat binnen is.
--
-- Bewust nummer 100 en niet 047: deze lijn (nieuwe-app) loopt weken naast het dagelijkse
-- werk, dat zijn eigen migraties blijft nummeren. Zo botsen de nummers niet.
--
-- Alleen toevoegend: nieuwe tabellen, niets aan bestaande tabellen. De database is
-- gedeeld met de live-site.
--
-- Opnieuw te draaien: alles met IF NOT EXISTS / DROP ... IF EXISTS.

create table if not exists public.creatie_mappen (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  naam        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists creatie_mappen_user_id_idx on public.creatie_mappen(user_id);

create table if not exists public.creaties (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- 'beeld' | 'video' | 'audio'
  soort           text not null,
  -- 'bezig' | 'klaar' | 'mislukt'
  status          text not null default 'bezig',
  -- Welke maker het was (lib/creaties/makers.ts), bv. 'beeld' of 'beeld-naar-video'.
  maker           text not null,
  -- Het model bij de leverancier, voor in de detailweergave en het nadenken over kosten.
  model           text,
  prompt          text,
  -- Alle keuzes van de gebruiker (formaat, kwaliteit, bronbeeld …), zodat "Nog eens"
  -- precies hetzelfde opnieuw kan starten.
  invoer          jsonb not null default '{}'::jsonb,
  url             text,
  credits         integer not null default 0,
  fal_endpoint    text,
  fal_request_id  text,
  foutmelding     text,
  -- Waar deze creatie uit voortkwam (bv. de video uit een beeld): de keten blijft zichtbaar.
  ouder_id        uuid references public.creaties(id) on delete set null,
  map_id          uuid references public.creatie_mappen(id) on delete set null,
  favoriet        boolean not null default false,
  created_at      timestamptz not null default now(),
  klaar_op        timestamptz
);

create index if not exists creaties_user_created_idx on public.creaties(user_id, created_at desc);
create index if not exists creaties_user_status_idx on public.creaties(user_id, status);

alter table public.creaties enable row level security;
alter table public.creatie_mappen enable row level security;

-- Lezen en weggooien mag de gebruiker zelf. Aanmaken en wijzigen gaat alléén via de
-- server (service-client): met status en fal_request_id hangt het terugboeken van
-- credits samen. Mocht een gebruiker zelf 'bezig' terugzetten, dan zou elke mislukte
-- controle hem opnieuw credits teruggeven.
drop policy if exists "Users can read own creaties" on public.creaties;
create policy "Users can read own creaties"
  on public.creaties for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can delete own creaties" on public.creaties;
create policy "Users can delete own creaties"
  on public.creaties for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can manage own creatie_mappen" on public.creatie_mappen;
create policy "Users can manage own creatie_mappen"
  on public.creatie_mappen for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

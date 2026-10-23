-- Nieuwe app: vaste taken van de Regisseur. "Maak elke maandag om 8 uur 3 Instagram-posts
-- voor mijn bakkerij": de Regisseur start dan zelf een project en maakt het, zonder dat er
-- iemand meekijkt. Daarom per taak een plafond aan credits (Sam, 23-10-2026); kost een
-- uitvoering meer, dan wacht hij op een 'ja' van de gebruiker en krijgt die een mail.
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.regie_taken (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  titel           text not null,
  -- De volledige opdracht, zo geschreven dat hij zonder het oorspronkelijke gesprek werkt.
  opdracht        text not null,
  ritme           text not null check (ritme in ('dag', 'week', 'maand')),
  weekdag         int check (weekdag between 0 and 6),   -- 0 = zondag, alleen bij 'week'
  maanddag        int check (maanddag between 1 and 28), -- alleen bij 'maand'
  uur             int not null default 8 check (uur between 0 and 23), -- Nederlandse tijd
  max_credits     int not null check (max_credits between 1 and 500),
  actief          boolean not null default true,
  volgende_op     timestamptz not null,
  laatst_op       timestamptz,
  laatste_project uuid,
  bron_project    uuid,
  created_at      timestamptz not null default now()
);

create index if not exists regie_taken_volgende on public.regie_taken (volgende_op) where actief;
create index if not exists regie_taken_user on public.regie_taken (user_id);

-- Eén rij per uitvoering: het project dat hij startte, het plafond en wat er al uitging.
create table if not exists public.regie_taak_runs (
  project_id   uuid primary key references public.regie_projecten(id) on delete cascade,
  taak_id      uuid not null references public.regie_taken(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  max_credits  int not null,
  uitgegeven   int not null default 0,
  -- De laatste stand waarover we gemaild hebben, zodat elke stand maar één mail geeft.
  gemeld       text,
  created_at   timestamptz not null default now()
);

create index if not exists regie_taak_runs_taak on public.regie_taak_runs (taak_id);

alter table public.regie_taken enable row level security;
alter table public.regie_taak_runs enable row level security;

-- Lezen mag de gebruiker zelf; schrijven gaat via de server.
drop policy if exists "Eigen taken lezen" on public.regie_taken;
create policy "Eigen taken lezen"
  on public.regie_taken for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Eigen taakuitvoeringen lezen" on public.regie_taak_runs;
create policy "Eigen taakuitvoeringen lezen"
  on public.regie_taak_runs for select to authenticated
  using (user_id = auth.uid());

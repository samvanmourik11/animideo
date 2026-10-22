-- Nieuwe app: de filmstudio. Een film wordt samen met de Regisseur gebouwd: verhaal,
-- personages (met portret en vaste stem), scènes met shots. De Regisseur stuurt per scène
-- een gemonteerde versie ter keuring; goedgekeurde scènes worden samen de film.
--
-- Eén rij per film, gekoppeld aan het regieproject waarin hij gemaakt wordt. Het script
-- zelf staat als jsonb in `data` (zie lib/film/types.ts): dat verandert vaak en in z'n
-- geheel, en wordt alleen door de server geschreven.
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.films (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  regie_project_id  uuid references public.regie_projecten(id) on delete set null,
  titel             text not null default 'Nieuwe film',
  data              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists films_user_idx on public.films(user_id, updated_at desc);
create unique index if not exists films_project_idx on public.films(regie_project_id) where regie_project_id is not null;

alter table public.films enable row level security;

-- Lezen mag de eigenaar; schrijven alleen de server (script, credits en scènes horen bij elkaar).
drop policy if exists "Eigen films lezen" on public.films;
create policy "Eigen films lezen"
  on public.films for select to authenticated
  using (user_id = auth.uid());

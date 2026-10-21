-- Nieuwe app: het geheugen van de Regisseur. Wat hij blijvend over een gebruiker weet
-- (bedrijfsnaam, huisstijl, doelgroep, voorkeuren), voor alle projecten. Eén tekst per
-- gebruiker, korte regels; de gebruiker kan hem zelf inzien en aanpassen.
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.regie_geheugen (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  tekst       text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.regie_geheugen enable row level security;

-- Lezen mag de gebruiker zelf; schrijven gaat via de server.
drop policy if exists "Eigen geheugen lezen" on public.regie_geheugen;
create policy "Eigen geheugen lezen"
  on public.regie_geheugen for select to authenticated
  using (user_id = auth.uid());

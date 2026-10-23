-- Nieuwe app: persoonlijke sleutels voor de MCP-koppeling (Animideo in Claude Code e.d.,
-- Sam 24-10-2026). We bewaren alleen een hash; de sleutel zelf ziet de klant één keer.
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.api_sleutels (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  naam            text not null,
  hash            text not null unique,      -- sha256 van de sleutel
  begin           text not null,             -- eerste tekens, om hem te herkennen ("anm_3fK9…")
  laatst_gebruikt timestamptz,
  ingetrokken_op  timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists api_sleutels_user on public.api_sleutels (user_id);

alter table public.api_sleutels enable row level security;

-- Lezen mag de gebruiker zelf (zonder hash: die vraagt de server nooit op voor het scherm);
-- aanmaken en intrekken gaat via de server.
drop policy if exists "Eigen sleutels lezen" on public.api_sleutels;
create policy "Eigen sleutels lezen"
  on public.api_sleutels for select to authenticated
  using (user_id = auth.uid());

-- Nieuwe app: feedback op eindresultaten, beloond met credits (Sam, 24-10-2026). Klanten
-- voelen inspraak, en de feedback gaat mee in de wekelijkse leerronde van het regieboek.
-- Eén feedback per creatie; de beloning is begrensd per maand (zie lib/creaties/feedback.ts).
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.creatie_feedback (
  id          uuid primary key default gen_random_uuid(),
  creatie_id  uuid not null unique references public.creaties(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- wie de credits kreeg (in een team de eigenaar van de pot)
  beloond_aan uuid,
  sterren     int not null check (sterren between 1 and 5),
  tekst       text not null,
  beloond     int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists creatie_feedback_tijd on public.creatie_feedback (created_at);
create index if not exists creatie_feedback_beloond on public.creatie_feedback (beloond_aan, created_at);

alter table public.creatie_feedback enable row level security;

drop policy if exists "Eigen feedback lezen" on public.creatie_feedback;
create policy "Eigen feedback lezen"
  on public.creatie_feedback for select to authenticated
  using (user_id = auth.uid());

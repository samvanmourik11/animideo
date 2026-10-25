-- Nieuwe app: de Academy (Sam, 25-10-2026). Welke lessen iemand bekeken heeft. Of een
-- opdracht gedaan is, lezen we af aan wat hij echt maakte (creaties, personages, enz.);
-- daarvoor is geen tabel nodig. Alleen 'zelf afgevinkt' bewaren we hier, voor opdrachten
-- die we niet kunnen zien (bijvoorbeeld je saldo bekijken).
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.academy_voortgang (
  user_id      uuid not null references auth.users(id) on delete cascade,
  les          text not null,
  bekeken_op   timestamptz,
  afgevinkt_op timestamptz,
  primary key (user_id, les)
);

alter table public.academy_voortgang enable row level security;

drop policy if exists "academy_eigen_lezen" on public.academy_voortgang;
create policy "academy_eigen_lezen" on public.academy_voortgang
  for select using (user_id = auth.uid());

drop policy if exists "academy_eigen_schrijven" on public.academy_voortgang;
create policy "academy_eigen_schrijven" on public.academy_voortgang
  for insert with check (user_id = auth.uid());

drop policy if exists "academy_eigen_bijwerken" on public.academy_voortgang;
create policy "academy_eigen_bijwerken" on public.academy_voortgang
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

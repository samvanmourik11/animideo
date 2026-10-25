-- Nieuwe app: trends eerst zelf testen (Sam, 25-10-2026: "doe eerst zelf een test om te kijken
-- of het goed is; liever 1 goed dan 10 slecht"). Een gevonden trend staat op 'proef' terwijl
-- hij met een verzonnen testpersoon wordt nagemaakt; Claude beoordeelt het resultaat. Pas als
-- dat goed is, gaat hij naar 'voorstel' (Sam keurt). Mislukt hij twee keer: 'afgewezen'.
--
-- Alleen toevoegend; opnieuw te draaien.

alter table public.trends add column if not exists proef jsonb not null default '{"pogingen": []}';

alter table public.trends drop constraint if exists trends_status_check;
alter table public.trends add constraint trends_status_check
  check (status in ('proef', 'voorstel', 'live', 'afgewezen', 'archief'));

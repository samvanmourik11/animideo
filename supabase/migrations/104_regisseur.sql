-- Nieuwe app: de Regisseur. Eén chat waarin Claude zelf plant en de gereedschappen van
-- de app aanstuurt (beeld, video, apps, montage), met vragen en bevestigingen tussendoor.
--
-- Eén rij per project: het hele gesprek zoals Claude het ziet (berichten, alleen
-- aanvullen, nooit herschrijven: dat eist de API voor het meedenken van het model), waar
-- hij op wacht (een antwoord, een bevestiging, of creaties die nog gemaakt worden), en de
-- galerij met alles wat er in dit project gemaakt is.
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.regie_projecten (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  titel         text not null default 'Nieuw project',
  -- Anthropic MessageParam[]: precies zoals het naar Claude gaat.
  berichten     jsonb not null default '[]'::jsonb,
  -- 'klaar' | 'denkt' | 'wacht_op_antwoord' | 'wacht_op_bevestiging' | 'wacht_op_maken' | 'fout'
  status        text not null default 'klaar',
  -- Wat er openstaat bij een pauze (de vraag, de te bevestigen stappen, de creaties).
  wachtend      jsonb,
  foutmelding   text,
  -- Creaties (bibliotheek) die in dit project zijn gemaakt, oudste eerst.
  galerij       uuid[] not null default '{}',
  -- Alles meteen uitvoeren zonder bevestiging per stap.
  automatisch   boolean not null default false,
  -- Tekstverbruik van Claude: tokens en geschatte dollars.
  gebruik       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists regie_projecten_user_idx on public.regie_projecten(user_id, updated_at desc);

alter table public.regie_projecten enable row level security;

-- Lezen mag de eigenaar; schrijven alleen de server (het gesprek en de credits horen bij elkaar).
drop policy if exists "Eigen regieprojecten lezen" on public.regie_projecten;
create policy "Eigen regieprojecten lezen"
  on public.regie_projecten for select to authenticated
  using (user_id = auth.uid());

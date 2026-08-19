-- Op-log en checkpoints voor de editor.
--
-- Vanaf nu muteert niets het Timeline Document rechtstreeks: elke wijziging —
-- of hij nu van de muis of van de AI-chat komt — is één op-object dat door
-- EditorCore is gevalideerd (lib/editor/core/ops.ts). Die ops leggen we hier
-- vast. Daarmee krijg je drie dingen tegelijk:
--
--   1. een versiegeschiedenis die een refresh overleeft (nu leeft undo alleen
--      in het geheugen van de browser en is hij na herladen weg);
--   2. herhaalbaarheid: de ops opnieuw afspelen vanaf een leeg document moet
--      exact hetzelfde document opleveren als wat er in editor_projects staat;
--   3. transparantie: per AI-beurt is precies terug te zien wat er is gebeurd,
--      en één regel is los terug te draaien.
--
-- `editor_projects.timeline` blijft de huidige staat (materialized), zodat het
-- laden van een project geen replay hoeft te doen.

create table if not exists public.editor_ops_log (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.editor_projects(id) on delete cascade,
  -- Versie ná het toepassen van deze op. Loopt per project met 1 op.
  version     int  not null,
  -- Wie de wijziging deed. Bepaalt hoe de activiteitenfeed hem toont, en of de
  -- AI hem mag overschrijven zonder te vragen.
  source      text not null check (source in ('ai', 'user')),
  -- Alle ops uit één chat-beurt delen dit id, zodat "maak de intro korter"
  -- (die meerdere ops oplevert) in één keer terug te draaien is.
  turn_id     uuid,
  op          jsonb not null,
  -- Nederlandse samenvatting uit EditorCore ("Clip ingekort met 2,0s").
  summary     text,
  created_at  timestamptz not null default now(),
  unique (project_id, version)
);

create index if not exists editor_ops_log_project_idx
  on public.editor_ops_log(project_id, version desc);
create index if not exists editor_ops_log_turn_idx
  on public.editor_ops_log(turn_id);

create table if not exists public.editor_checkpoints (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.editor_projects(id) on delete cascade,
  version     int  not null,
  label       text,
  -- Automatisch gezet vóór elke AI-beurt; handmatige checkpoints zet de
  -- gebruiker zelf ("hier was het nog goed").
  auto        bool not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists editor_checkpoints_project_idx
  on public.editor_checkpoints(project_id, version desc);

-- RLS: je komt alleen bij de geschiedenis van je eigen projecten. Zelfde
-- patroon als 027_editor_projects.sql, maar via een subquery omdat de
-- eigenaar op het project staat, niet op de regel.
alter table public.editor_ops_log     enable row level security;
alter table public.editor_checkpoints enable row level security;

drop policy if exists "Users can manage own editor ops" on public.editor_ops_log;
create policy "Users can manage own editor ops"
  on public.editor_ops_log
  for all
  to authenticated
  using (
    exists (
      select 1 from public.editor_projects p
      where p.id = editor_ops_log.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.editor_projects p
      where p.id = editor_ops_log.project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage own editor checkpoints" on public.editor_checkpoints;
create policy "Users can manage own editor checkpoints"
  on public.editor_checkpoints
  for all
  to authenticated
  using (
    exists (
      select 1 from public.editor_projects p
      where p.id = editor_checkpoints.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.editor_projects p
      where p.id = editor_checkpoints.project_id and p.user_id = auth.uid()
    )
  );

-- Huidige versie van een project = de hoogste versie in de log (0 als er nog
-- niets is gelogd). EditorCore gebruikt dit als `baseVersion`-controle, zodat
-- twee tabbladen elkaars werk niet stilzwijgend overschrijven.
create or replace function public.editor_current_version(p_project_id uuid)
returns int
language sql
stable
as $$
  select coalesce(max(version), 0) from public.editor_ops_log where project_id = p_project_id;
$$;

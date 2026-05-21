-- Playground: een vrij, niet-lineair werkvlak (Flow-stijl).
-- Een playground-project is een gewoon project met mode='playground'.
-- De losse, vertakkende beeldgeschiedenis leeft in playground_nodes:
-- elke node is een beeld (of clip) met een verwijzing naar de node
-- waaruit hij voortkwam (parent_id), zodat varianten en terugspringen werken.

-- 1. 'playground' toevoegen als geldige project-mode
alter table public.projects
  drop constraint if exists projects_mode_check;

alter table public.projects
  add constraint projects_mode_check
  check (mode in ('wizard', 'free', 'photo', 't2v', 'studio', 'playground'));

-- 2. Tabel voor de losse beeld-/clip-nodes op het canvas
create table if not exists public.playground_nodes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references public.playground_nodes(id) on delete set null,
  kind        text not null default 'image' check (kind in ('image', 'video')),
  prompt      text,                            -- generatie-prompt of bewerk-instructie
  image_url   text,
  video_url   text,
  in_video    boolean not null default false,  -- zit deze node in de eindmontage
  sort_order  int,                             -- volgorde binnen de eindmontage
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists playground_nodes_project_idx on public.playground_nodes(project_id);
create index if not exists playground_nodes_parent_idx  on public.playground_nodes(parent_id);

alter table public.playground_nodes enable row level security;

drop policy if exists "Users can manage own playground nodes" on public.playground_nodes;
create policy "Users can manage own playground nodes"
  on public.playground_nodes
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Nieuwe video-editor (Canva/CapCut-niveau), bewust LOS van de bestaande
-- `projects`-tabel die productie draait. Een editor-project staat volledig op
-- zichzelf, zodat de bouw de huidige wizard/studio/playground-flows niet raakt.
--
-- De volledige compositie leeft als JSON in `timeline` (zie lib/editor/timeline.ts:
-- het Timeline Document). Zowel de live preview als de server-render lezen dat
-- ene document, zodat preview en export gegarandeerd gelijk zijn.

create table if not exists public.editor_projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null default 'Naamloos project',
  ratio         text not null default '16:9' check (ratio in ('16:9', '9:16', '1:1')),
  width         int  not null default 1920,
  height        int  not null default 1080,
  fps           int  not null default 30,
  timeline      jsonb not null default '{}'::jsonb,   -- het Timeline Document
  thumbnail_url text,
  export_url    text,                                  -- laatste gerenderde MP4
  status        text not null default 'draft'
                  check (status in ('draft', 'rendering', 'done', 'error')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists editor_projects_user_idx on public.editor_projects(user_id);

-- updated_at automatisch bijwerken bij elke wijziging
create or replace function public.editor_projects_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists editor_projects_set_updated_at on public.editor_projects;
create trigger editor_projects_set_updated_at
  before update on public.editor_projects
  for each row execute function public.editor_projects_touch_updated_at();

-- RLS: iedere gebruiker beheert uitsluitend de eigen editor-projecten.
alter table public.editor_projects enable row level security;

drop policy if exists "Users can manage own editor projects" on public.editor_projects;
create policy "Users can manage own editor projects"
  on public.editor_projects
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

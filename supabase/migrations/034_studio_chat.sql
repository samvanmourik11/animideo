-- AI-buddy chat in de Creator Studio: gesprek per project, append-only.
-- Losse tabel (niet in projects.jsonb) zodat chat-writes buiten het autosave/
-- _merge-pad van de scenes blijven en de payload niet opblazen.

create table if not exists public.studio_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null default '',
  actions     jsonb not null default '[]'::jsonb,  -- voorgestelde edits (audit/herlaad)
  created_at  timestamptz not null default now()
);

create index if not exists studio_chat_project_idx
  on public.studio_chat_messages(project_id, created_at);

alter table public.studio_chat_messages enable row level security;

drop policy if exists "Users manage own studio chat" on public.studio_chat_messages;
create policy "Users manage own studio chat"
  on public.studio_chat_messages
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

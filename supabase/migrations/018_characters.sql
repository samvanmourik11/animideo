-- Karakter Studio: persistent character library + per-project role mapping.
-- Een character is een herbruikbare persoon (foto + beschrijving + stijl) die
-- in meerdere studio-projecten als hoofd- of bijpersoon kan worden gebruikt.

create table if not exists public.characters (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  image_url       text,
  source_type     text not null check (source_type in ('uploaded', 'generated')),
  gender          text,
  age_range       text,
  style           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists characters_user_id_idx on public.characters(user_id);

alter table public.characters enable row level security;

create policy "Users can manage own characters"
  on public.characters
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.projects
  add column if not exists main_character_id        uuid references public.characters(id) on delete set null,
  add column if not exists supporting_character_id  uuid references public.characters(id) on delete set null;

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Projects table
create table if not exists public.projects (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null default 'Untitled Project',
  goal            text,
  target_audience text,
  language        text not null default 'English',
  format          text not null default '16:9' check (format in ('16:9', '9:16')),
  notes           text,
  script_text     text,
  storyboard_text text,
  selected_voice  text,
  voice_audio_url text,
  video_url       text,
  status          text not null default 'Draft'
                    check (status in ('Draft','ScriptReady','StoryboardReady','VoiceReady','Rendering','Done','Error')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Row-level security
alter table public.projects enable row level security;

create policy "Users can manage their own projects"
  on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at
  before update on public.projects
  for each row execute procedure public.set_updated_at();

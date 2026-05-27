-- 024_lessons.sql
-- E-learning omgeving: lesson catalogus + per-user watched-state.

create table if not exists public.lessons (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  description     text,
  dailymotion_id  text not null,
  category        text not null check (category in ('aan-de-slag', 'brand-setup', 'pro-tools')),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists lessons_category_sort_idx on public.lessons (category, sort_order);

create table if not exists public.lesson_progress (
  user_id     uuid not null references auth.users(id) on delete cascade,
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  watched_at  timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- RLS
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;

-- Iedere authenticated user mag de catalogus lezen
drop policy if exists "Authenticated can read lessons" on public.lessons;
create policy "Authenticated can read lessons"
  on public.lessons
  for select
  to authenticated
  using (true);

-- Eigen progressie beheren
drop policy if exists "Users manage own lesson progress" on public.lesson_progress;
create policy "Users manage own lesson progress"
  on public.lesson_progress
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Seed: 7 trainingsvideo's (Dailymotion)
insert into public.lessons (slug, title, description, dailymotion_id, category, sort_order) values
  ('ai-wizard', 'AI Wizard', 'Maak je eerste animatievideo via de 6-staps wizard.', 'xabepxs', 'aan-de-slag', 10),
  ('text-to-video', 'Text to Video', 'Genereer een video direct vanuit een tekstprompt.', 'xabeq1a', 'aan-de-slag', 20),
  ('upload-eigen-afbeelding', 'Upload je eigen afbeelding', 'Gebruik je eigen beeldmateriaal als startpunt voor een video.', 'xabeq1e', 'aan-de-slag', 30),
  ('huisstijl', 'Huisstijl', 'Stel je huisstijl (kleuren, fonts, tone of voice) in.', 'xabeq18', 'brand-setup', 10),
  ('personage', 'Personage', 'Maak en hergebruik vaste personages in je video''s.', 'xaber7a', 'brand-setup', 20),
  ('creator-studio', 'Creator Studio', 'Bewerk scenes, voice-over en timing in de Creator Studio.', 'xabeq1c', 'pro-tools', 10),
  ('playground', 'Playground', 'Vrij experimenteren met beeld- en videogeneratie.', 'xabeq16', 'pro-tools', 20)
on conflict (slug) do nothing;

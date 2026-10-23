-- Nieuwe app: de Social-studio. Klanten koppelen hun Instagram, TikTok, Facebook, YouTube
-- en X (via Zernio, een koppeldienst die de keuringen van die platformen al heeft — Sam,
-- 23-10-2026), maken een contentkalender (eerst ideeën in tekst, dan per week vooruit de
-- beelden/video's) en laten het automatisch plaatsen, of eerst zelf keuren.
--
-- Alleen toevoegend; opnieuw te draaien.

-- Eén Zernio-profiel per gebruiker; daaronder hangen zijn gekoppelde accounts.
create table if not exists public.social_profielen (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  zernio_profiel text not null,
  created_at     timestamptz not null default now()
);

create table if not exists public.content_kalenders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  titel         text not null,
  briefing      text not null,
  -- [{ platform, accountId, naam }]: de accounts waarop deze kalender plaatst.
  kanalen       jsonb not null default '[]',
  -- 'controleren': elke post eerst keuren; 'plaatsen': meteen inplannen zodra hij af is.
  modus         text not null default 'controleren' check (modus in ('controleren', 'plaatsen')),
  start_datum   date not null,
  weken         int not null check (weken between 1 and 6),
  per_week      int not null check (per_week between 1 and 7),
  -- ideeen_maken → ideeen (keuren/aanpassen) → actief; fout als het bedenken misging.
  status        text not null default 'ideeen_maken',
  foutmelding   text,
  created_at    timestamptz not null default now()
);

create index if not exists content_kalenders_user on public.content_kalenders (user_id);

create table if not exists public.content_posts (
  id            uuid primary key default gen_random_uuid(),
  kalender_id   uuid not null references public.content_kalenders(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  gepland_op    timestamptz not null,
  platforms     text[] not null,
  soort         text not null check (soort in ('beeld', 'video')),
  idee          text not null,
  tekst         text not null default '',
  tekst_kort    text,          -- voor X (max 280 tekens)
  titel         text,          -- voor YouTube
  beeld_prompt  text not null,
  beweging      text,          -- bij video: wat er beweegt
  beeld_id      uuid,          -- creatie
  video_id      uuid,          -- creatie
  -- idee → gepland → maken → te_keuren / ingepland → geplaatst; of mislukt
  status        text not null default 'idee',
  zernio_post   text,
  links         jsonb not null default '{}',  -- { platform: url van de echte post }
  foutmelding   text,
  created_at    timestamptz not null default now()
);

create index if not exists content_posts_kalender on public.content_posts (kalender_id, gepland_op);
create index if not exists content_posts_werk on public.content_posts (status, gepland_op);

alter table public.social_profielen enable row level security;
alter table public.content_kalenders enable row level security;
alter table public.content_posts enable row level security;

-- Lezen mag de gebruiker zelf; schrijven gaat via de server.
drop policy if exists "Eigen social-profiel lezen" on public.social_profielen;
create policy "Eigen social-profiel lezen"
  on public.social_profielen for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Eigen kalenders lezen" on public.content_kalenders;
create policy "Eigen kalenders lezen"
  on public.content_kalenders for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Eigen posts lezen" on public.content_posts;
create policy "Eigen posts lezen"
  on public.content_posts for select to authenticated
  using (user_id = auth.uid());

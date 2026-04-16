-- Brand kits table
create table if not exists public.brand_kits (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  description       text,
  tone_of_voice     text,
  brand_values      text[] default '{}',
  colors            jsonb default '{}'::jsonb,
  fonts             jsonb default '{}'::jsonb,
  environment       text,
  do_nots           text,
  default_language  text default 'Dutch',
  default_format    text default '16:9',
  logo_url          text,
  reference_images  jsonb default '[]'::jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- RLS
alter table public.brand_kits enable row level security;

create policy "Users can manage own brand kits"
  on public.brand_kits
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- brand_kit_id op projects
alter table public.projects
  add column if not exists brand_kit_id uuid references public.brand_kits(id) on delete set null;

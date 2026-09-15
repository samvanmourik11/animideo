-- Voorwerpenbibliotheek: voorwerpen die in élke video hetzelfde horen te zijn, zoals
-- personages in de personagebibliotheek (018_characters).
--
-- Binnen één video hield een getekend blad de Wonderwagen al gelijk, maar na die
-- video was hij weg: een nieuw verhaal met de Wonderwagen verzon hem opnieuw. Hier
-- bewaart de gebruiker hem. Per tekenstijl een eigen blad, want een zachte 3D-wagen
-- past niet tussen platte tekeningen.
--
-- Opnieuw te draaien: alles met IF NOT EXISTS / DROP ... IF EXISTS.

create table if not exists public.voorwerpen (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  naam        text not null,
  -- Engelse beschrijving, gaat rechtstreeks naar het beeldmodel.
  uiterlijk   text not null,
  -- Per tekenstijl (styleId) de URL van het getekende blad: {"soft-3d": "https://…"}.
  bladen      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists voorwerpen_user_id_idx on public.voorwerpen(user_id);

alter table public.voorwerpen enable row level security;

drop policy if exists "Users can manage own voorwerpen" on public.voorwerpen;
create policy "Users can manage own voorwerpen"
  on public.voorwerpen
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

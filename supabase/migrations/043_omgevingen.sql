-- Omgevingenbibliotheek: plekken die in élke video dezelfde plek horen te zijn, naast
-- de personagebibliotheek (018_characters) en de voorwerpenbibliotheek (041_voorwerpen).
--
-- Tot nu toe had de plek als enige geen vast plaatje: elk beeld werd opnieuw getekend
-- vanaf een geschreven omschrijving ("een voetbalveld in het park"), en dat is elke keer
-- een ander veld. In "Leo de Leeuw leert voetballen" stonden er in het ene shot platte
-- lollybomen zonder doel en in het volgende een dicht bos mét doel.
--
-- Per tekenstijl meerdere varianten van dezelfde plek (van veraf, halverwege, een hoekje
-- van dichtbij), zodat de camera kan variëren zonder dat de plek verandert.
--
-- Opnieuw te draaien: alles met IF NOT EXISTS / DROP ... IF EXISTS.

create table if not exists public.omgevingen (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  naam          text not null,
  -- Engelse beschrijving, gaat rechtstreeks naar het beeldmodel.
  beschrijving  text not null,
  -- Wat deze plek herkenbaar maakt, afgelezen van het eerste getekende beeld:
  -- ["a white football goal on the right", "tall oak trees along the left side"].
  -- Hiermee wordt later gecontroleerd of een beeld nog op deze plek speelt.
  kenmerken     jsonb not null default '[]'::jsonb,
  -- Per tekenstijl (styleId) de varianten:
  -- {"soft-3d": {"totaal": "https://…", "medium": "https://…", "detail": "https://…"}}
  varianten     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists omgevingen_user_id_idx on public.omgevingen(user_id);

alter table public.omgevingen enable row level security;

drop policy if exists "Users can manage own omgevingen" on public.omgevingen;
create policy "Users can manage own omgevingen"
  on public.omgevingen
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

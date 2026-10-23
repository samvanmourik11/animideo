-- Nieuwe app: persoonlijke sleutels voor de MCP-koppeling (Animideo in Claude Code e.d.,
-- Sam 24-10-2026). We bewaren alleen een hash; de sleutel zelf ziet de klant één keer.
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.api_sleutels (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  naam            text not null,
  hash            text not null unique,      -- sha256 van de sleutel
  begin           text not null,             -- eerste tekens, om hem te herkennen ("anm_3fK9…")
  laatst_gebruikt timestamptz,
  ingetrokken_op  timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists api_sleutels_user on public.api_sleutels (user_id);

alter table public.api_sleutels enable row level security;

-- Lezen mag de gebruiker zelf (zonder hash: die vraagt de server nooit op voor het scherm);
-- aanmaken en intrekken gaat via de server.
drop policy if exists "Eigen sleutels lezen" on public.api_sleutels;
create policy "Eigen sleutels lezen"
  on public.api_sleutels for select to authenticated
  using (user_id = auth.uid());

-- ── Inloggen vanuit de Claude-app (OAuth 2.1, 24-10-2026) ──
-- De klant klikt in claude.ai op "Verbinden", logt in bij Animideo en geeft toestemming.
-- Dat levert een toegangssleutel op die een uur geldig is (soort 'oauth'), plus een
-- vernieuwsleutel om een nieuwe te halen. Ook die bewaren we alleen als hash.

alter table public.api_sleutels add column if not exists soort text not null default 'sleutel';
alter table public.api_sleutels add column if not exists client_id text;
alter table public.api_sleutels add column if not exists verloopt_op timestamptz;
alter table public.api_sleutels add column if not exists vernieuw_hash text unique;
alter table public.api_sleutels add column if not exists vernieuw_verloopt_op timestamptz;

-- Programma's die zich zelf aanmelden (Claude doet dat automatisch: "dynamic client registration").
create table if not exists public.oauth_clients (
  client_id      text primary key,
  naam           text not null,
  redirect_uris  text[] not null,
  created_at     timestamptz not null default now()
);

-- Eenmalige codes tussen "Toestaan" en het ophalen van de sleutel (10 minuten geldig).
create table if not exists public.oauth_codes (
  code_hash       text primary key,
  client_id       text not null references public.oauth_clients(client_id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  redirect_uri    text not null,
  code_challenge  text not null,
  resource        text,
  verloopt_op     timestamptz not null,
  gebruikt_op     timestamptz,
  created_at      timestamptz not null default now()
);

-- Alleen de server leest en schrijft hierin.
alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;

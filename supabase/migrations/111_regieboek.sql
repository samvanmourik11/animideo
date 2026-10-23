-- Nieuwe app: het regieboek van de Regisseur. Vaste regels voor beeld, video, verhaal en
-- montage; een wekelijkse leerronde bekijkt gemaakte beelden en feedback van klanten en
-- stelt nieuwe regels voor. Pas als Sam een regel aanzet, gebruikt de Regisseur hem
-- (Sam, 24-10-2026: fouten voorkomen met regels, een slechte regel mag niet vanzelf live).
--
-- Alleen toevoegend; opnieuw te draaien.

create table if not exists public.regieboek_regels (
  id            uuid primary key default gen_random_uuid(),
  categorie     text not null check (categorie in ('beeld', 'video', 'verhaal', 'stem', 'montage')),
  regel         text not null,
  waarom        text,
  -- [{ id, url, prompt }]: de beelden waarop de regel gebaseerd is
  voorbeelden   jsonb not null default '[]',
  status        text not null default 'voorstel' check (status in ('voorstel', 'actief', 'afgewezen')),
  bron          text not null default 'leerronde',
  beoordeeld_op timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists regieboek_regels_status on public.regieboek_regels (status);

-- Alleen de server (beheer en de Regisseur) leest en schrijft; geen policies voor gebruikers.
alter table public.regieboek_regels enable row level security;
